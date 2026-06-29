/**
 * Unit tests for AnalysisService pure methods.
 * All tests use useMock:true or private-method casting to avoid AI/network calls.
 */

import { describe, it, expect } from "vitest";
import {
  AnalysisService,
  createAnalysisService,
  type SegmentWithContext,
} from "@/lib/ai/analyze";
import type { SegmentAnalysis } from "@/lib/db/schema";

// Access private methods via type casting.
// Use a standalone interface (not an intersection with AnalysisService) because
// all the target methods are private on the class — an intersection collapses to
// `never` when private members appear in multiple constituents.
interface AnalysisServicePrivate {
  validateAndNormalizeAnalysis(
    analysis: Partial<SegmentAnalysis>
  ): SegmentAnalysis;
  generateMockAnalysis(segment: SegmentWithContext): SegmentAnalysis;
  buildAnalysisPrompt(segment: SegmentWithContext): string;
  clamp(value: number, min: number, max: number): number;
  extractMockTopic(text: string): string;
}

function makeService(useMock = true): AnalysisServicePrivate {
  return new AnalysisService({ useMock }) as unknown as AnalysisServicePrivate;
}

function makeSegment(
  overrides: Partial<SegmentWithContext> = {}
): SegmentWithContext {
  return {
    text: "This is a normal segment.",
    startTime: 0,
    endTime: 10,
    ...overrides,
  };
}

// ─── clamp ────────────────────────────────────────────────────────────────────

describe("AnalysisService.clamp", () => {
  const svc = makeService();

  it("returns value when within range", () => {
    expect(svc.clamp(50, 0, 100)).toBe(50);
  });

  it("clamps to min when below range", () => {
    expect(svc.clamp(-10, 0, 100)).toBe(0);
  });

  it("clamps to max when above range", () => {
    expect(svc.clamp(150, 0, 100)).toBe(100);
  });

  it("accepts boundary values", () => {
    expect(svc.clamp(0, 0, 100)).toBe(0);
    expect(svc.clamp(100, 0, 100)).toBe(100);
  });
});

// ─── extractMockTopic ─────────────────────────────────────────────────────────

describe("AnalysisService.extractMockTopic", () => {
  const svc = makeService();

  it("returns first three words longer than 3 chars", () => {
    const topic = svc.extractMockTopic(
      "This is about machine learning algorithms"
    );
    // words > 3 chars: "This", "about", "machine", "learning", "algorithms"
    expect(topic).toBe("This about machine");
  });

  it("falls back to 'General discussion' for empty or all-short-word text", () => {
    expect(svc.extractMockTopic("a b c")).toBe("General discussion");
    expect(svc.extractMockTopic("")).toBe("General discussion");
  });

  it("returns fewer than 3 words when text has fewer than 3 long words", () => {
    const topic = svc.extractMockTopic("I love cats");
    // "love", "cats" are >3 chars; "I" is not
    expect(topic).toBe("love cats");
  });
});

// ─── validateAndNormalizeAnalysis ─────────────────────────────────────────────

describe("AnalysisService.validateAndNormalizeAnalysis", () => {
  const svc = makeService(false);

  it("applies defaults for all missing fields on empty input", () => {
    const result = svc.validateAndNormalizeAnalysis({});
    expect(result.topic).toBe("Unknown");
    expect(result.interestScore).toBe(50);
    expect(result.clarityScore).toBe(50);
    expect(result.isTangent).toBe(false);
    expect(result.isRepetition).toBe(false);
    expect(result.keyInsight).toBe("");
    expect(result.dependsOn).toEqual([]);
    expect(result.standalone).toBe(true);
    expect(result.hasFactualError).toBe(false);
    expect(result.hasContradiction).toBe(false);
    expect(result.isConfusing).toBe(false);
    expect(result.isIncomplete).toBe(false);
    expect(result.needsRerecord).toBe(false);
  });

  it("preserves provided values", () => {
    const result = svc.validateAndNormalizeAnalysis({
      topic: "AI trends",
      interestScore: 80,
      clarityScore: 90,
      isTangent: true,
      keyInsight: "Big insights here",
      dependsOn: ["topic-a"],
      standalone: false,
    });
    expect(result.topic).toBe("AI trends");
    expect(result.interestScore).toBe(80);
    expect(result.clarityScore).toBe(90);
    expect(result.isTangent).toBe(true);
    expect(result.keyInsight).toBe("Big insights here");
    expect(result.dependsOn).toEqual(["topic-a"]);
    expect(result.standalone).toBe(false);
  });

  it("clamps interestScore and clarityScore to 0–100", () => {
    const result = svc.validateAndNormalizeAnalysis({
      interestScore: -5,
      clarityScore: 120,
    });
    expect(result.interestScore).toBe(0);
    expect(result.clarityScore).toBe(100);
  });

  it("passes through optional detail fields", () => {
    const result = svc.validateAndNormalizeAnalysis({
      hasFactualError: true,
      factualErrorDetail: "Incorrect date cited",
      hasContradiction: true,
      contradictionDetail: "Contradicts segment 2",
    });
    expect(result.factualErrorDetail).toBe("Incorrect date cited");
    expect(result.contradictionDetail).toBe("Contradicts segment 2");
  });
});

// ─── generateMockAnalysis / analyzeSegment (mock) ─────────────────────────────

describe("AnalysisService.generateMockAnalysis", () => {
  const svc = makeService();

  it("adds 10 to interestScore when text contains a question mark", () => {
    // base 60 + question bonus 10 = 70
    const result = svc.generateMockAnalysis(
      makeSegment({ text: "Is this working?" })
    );
    expect(result.interestScore).toBe(70);
  });

  it("subtracts 10 from interestScore for duration > 30 seconds", () => {
    // base 60 - long 10 = 50
    const result = svc.generateMockAnalysis(
      makeSegment({ text: "Short text.", startTime: 0, endTime: 31 })
    );
    expect(result.interestScore).toBe(50);
  });

  it("subtracts 5 from interestScore when word count > 100", () => {
    const longText = Array(101).fill("word").join(" ");
    const result = svc.generateMockAnalysis(makeSegment({ text: longText }));
    // base 60 - many-words 5 = 55
    expect(result.interestScore).toBe(55);
  });

  it("subtracts 20 from clarityScore for filler words (um/uh/ah/like)", () => {
    // clarityScore base 80 - filler 20 = 60
    const result = svc.generateMockAnalysis(
      makeSegment({ text: "Um so this is some um filler you know" })
    );
    expect(result.clarityScore).toBe(60);
  });

  it("subtracts 10 from clarityScore for fewer than 5 words", () => {
    // base 80 - short 10 = 70
    const result = svc.generateMockAnalysis(
      makeSegment({ text: "Yes" })
    );
    expect(result.clarityScore).toBe(70);
  });

  it("sets isIncomplete=true when text ends with '...'", () => {
    const result = svc.generateMockAnalysis(
      makeSegment({ text: "I was going to say..." })
    );
    expect(result.isIncomplete).toBe(true);
    expect(result.incompleteDetail).toBe("Thought appears incomplete");
  });

  it("sets isIncomplete=false when text does not end with '...'", () => {
    const result = svc.generateMockAnalysis(
      makeSegment({ text: "Complete sentence." })
    );
    expect(result.isIncomplete).toBe(false);
    expect(result.incompleteDetail).toBeUndefined();
  });

  it("sets isConfusing=true only when there are filler words AND word count < 10", () => {
    // "um" is filler AND only 2 words → isConfusing
    const confusing = svc.generateMockAnalysis(
      makeSegment({ text: "Um yeah" })
    );
    expect(confusing.isConfusing).toBe(true);
    expect(confusing.confusingDetail).toBe("Too many filler words");

    // "um" is filler but >10 words → not confusing
    const notConfusing = svc.generateMockAnalysis(
      makeSegment({
        text: "Um this is a much longer sentence that has filler but enough context",
      })
    );
    expect(notConfusing.isConfusing).toBe(false);
    expect(notConfusing.confusingDetail).toBeUndefined();
  });

  it("truncates keyInsight to 103 chars (100 text + '...')", () => {
    const longText = "A".repeat(200);
    const result = svc.generateMockAnalysis(makeSegment({ text: longText }));
    // 100 chars + "..."
    expect(result.keyInsight.length).toBe(103);
    expect(result.keyInsight.endsWith("...")).toBe(true);
  });

  it("does not append '...' to keyInsight when text is 100 chars or fewer", () => {
    const shortText = "Hello world";
    const result = svc.generateMockAnalysis(makeSegment({ text: shortText }));
    expect(result.keyInsight).toBe(shortText);
  });
});

// ─── analyzeBatch (mock) ──────────────────────────────────────────────────────

describe("AnalysisService.analyzeBatch (useMock=true)", () => {
  const svc = new AnalysisService({ useMock: true });

  it("returns empty array for empty input", async () => {
    const results = await svc.analyzeBatch([]);
    expect(results).toHaveLength(0);
  });

  it("returns one result per input segment", async () => {
    const segments = [
      makeSegment({ text: "First segment." }),
      makeSegment({ text: "Second segment." }),
      makeSegment({ text: "Third segment." }),
    ];
    const results = await svc.analyzeBatch(segments);
    expect(results).toHaveLength(3);
  });

  it("overrides useMock via options parameter", async () => {
    // Even with instance useMock=false, passing options.useMock=true should use mock
    const svcNoMock = new AnalysisService({ useMock: false });
    const segments = [makeSegment({ text: "Test." })];
    const results = await svcNoMock.analyzeBatch(segments, { useMock: true });
    expect(results).toHaveLength(1);
    expect(results[0]).toHaveProperty("topic");
  });
});

// ─── buildAnalysisPrompt ──────────────────────────────────────────────────────

describe("AnalysisService.buildAnalysisPrompt", () => {
  const svc = makeService(false);

  it("includes segment text and duration in the prompt", () => {
    const segment = makeSegment({ text: "Hello world.", startTime: 0, endTime: 10 });
    const prompt = svc.buildAnalysisPrompt(segment);
    expect(prompt).toContain("Hello world.");
    expect(prompt).toContain("10.0 seconds");
  });

  it("includes previous context section when previousSegments provided", () => {
    const segment = makeSegment({
      text: "Follow-up content.",
      previousSegments: [{ text: "Earlier segment.", topic: "Intro" }],
    });
    const prompt = svc.buildAnalysisPrompt(segment);
    expect(prompt).toContain("Previous Context");
    expect(prompt).toContain("Earlier segment.");
    expect(prompt).toContain("Intro");
  });

  it("omits previous context section when no previousSegments", () => {
    const segment = makeSegment({ text: "Standalone." });
    const prompt = svc.buildAnalysisPrompt(segment);
    expect(prompt).not.toContain("Previous Context");
  });
});

// ─── createAnalysisService factory ───────────────────────────────────────────

describe("createAnalysisService", () => {
  it("returns an AnalysisService instance", () => {
    const svc = createAnalysisService();
    expect(svc).toBeInstanceOf(AnalysisService);
  });

  it("creates a mock-enabled service when useMock=true", async () => {
    const svc = createAnalysisService({ useMock: true });
    const result = await svc.analyzeSegment(makeSegment({ text: "Test." }));
    expect(result).toHaveProperty("topic");
    expect(result).toHaveProperty("interestScore");
  });
});
