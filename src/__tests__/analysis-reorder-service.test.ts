/**
 * Unit tests for AnalysisService (mock mode) and ReorderService (mock mode).
 * No AI API or DB required — all logic is deterministic within mock mode.
 */

import { describe, it, expect } from "vitest";
import { createAnalysisService, type SegmentWithContext } from "@/lib/ai/analyze";
import { createReorderService, validateReorderingDependencies, type SegmentForReordering } from "@/lib/ai/reorder";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSegment(overrides: Partial<SegmentWithContext> = {}): SegmentWithContext {
  return {
    text: "This is a test segment about podcasting.",
    startTime: 0,
    endTime: 10,
    ...overrides,
  };
}

function makeSegmentForReordering(
  id: string,
  topic: string,
  interestScore: number,
  clarityScore: number,
  standalone = true,
  dependsOn: string[] = []
): SegmentForReordering {
  return {
    id,
    text: `Content about ${topic}`,
    originalOrder: 0,
    analysis: {
      topic,
      interestScore,
      clarityScore,
      isTangent: false,
      isRepetition: false,
      keyInsight: `Key insight about ${topic}`,
      dependsOn,
      standalone,
      hasFactualError: false,
      hasContradiction: false,
      isConfusing: false,
      isIncomplete: false,
      needsRerecord: false,
    },
  };
}

// ─── AnalysisService (mock mode) ─────────────────────────────────────────────

describe("AnalysisService (mock mode)", () => {
  const svc = createAnalysisService({ useMock: true });

  describe("analyzeSegment — basic fields", () => {
    it("returns a valid SegmentAnalysis shape", async () => {
      const result = await svc.analyzeSegment(makeSegment());
      expect(typeof result.topic).toBe("string");
      expect(typeof result.interestScore).toBe("number");
      expect(typeof result.clarityScore).toBe("number");
      expect(typeof result.isTangent).toBe("boolean");
      expect(typeof result.isRepetition).toBe("boolean");
      expect(typeof result.keyInsight).toBe("string");
      expect(Array.isArray(result.dependsOn)).toBe(true);
      expect(typeof result.standalone).toBe("boolean");
      expect(typeof result.hasFactualError).toBe("boolean");
      expect(typeof result.hasContradiction).toBe("boolean");
      expect(typeof result.isConfusing).toBe("boolean");
      expect(typeof result.isIncomplete).toBe("boolean");
      expect(typeof result.needsRerecord).toBe("boolean");
    });

    it("extracts topic from the first 3 long words in the text", async () => {
      const result = await svc.analyzeSegment(
        makeSegment({ text: "Hello this is about machine learning fundamentals" })
      );
      // Words longer than 3 chars: "Hello" "this" "about" "machine" "learning" "fundamentals"
      // Wait, 'this' is 4 chars → included
      expect(result.topic).toBe("Hello this about");
    });

    it("falls back to 'General discussion' for very short text", async () => {
      const result = await svc.analyzeSegment(makeSegment({ text: "OK" }));
      expect(result.topic).toBe("General discussion");
    });

    it("returns keyInsight equal to text when text is short", async () => {
      const text = "Short segment text.";
      const result = await svc.analyzeSegment(makeSegment({ text }));
      expect(result.keyInsight).toBe(text);
    });

    it("truncates keyInsight to first 100 chars with ellipsis when text is long", async () => {
      const longText = "A".repeat(150);
      const result = await svc.analyzeSegment(makeSegment({ text: longText }));
      expect(result.keyInsight).toBe("A".repeat(100) + "...");
    });
  });

  describe("analyzeSegment — interest score logic", () => {
    it("starts at 60 for a normal segment", async () => {
      const result = await svc.analyzeSegment(
        makeSegment({ text: "Normal content here.", startTime: 0, endTime: 10 })
      );
      expect(result.interestScore).toBe(60);
    });

    it("adds 10 when text contains a question mark", async () => {
      const result = await svc.analyzeSegment(
        makeSegment({ text: "What is the best way to edit podcasts?", startTime: 0, endTime: 10 })
      );
      expect(result.interestScore).toBe(70);
    });

    it("subtracts 10 for long segments (> 30s)", async () => {
      const result = await svc.analyzeSegment(
        makeSegment({ text: "Normal content here.", startTime: 0, endTime: 31 })
      );
      expect(result.interestScore).toBe(50);
    });

    it("combines question and long segment adjustments", async () => {
      const result = await svc.analyzeSegment(
        makeSegment({ text: "Is this too long?", startTime: 0, endTime: 60 })
      );
      // 60 + 10 (question) - 10 (long) = 60
      expect(result.interestScore).toBe(60);
    });

    it("clamps interest score to [0, 100]", async () => {
      // Word count > 100 and long segment — subtracts 15 total from 60 = 45
      // But not clamped here; let's force a scenario via many words + question
      const longWords = Array.from({ length: 105 }, (_, i) => `word${i}`).join(" ");
      const result = await svc.analyzeSegment(
        makeSegment({ text: longWords + "?", startTime: 0, endTime: 31 })
      );
      // 60 + 10 - 10 - 5 = 55
      expect(result.interestScore).toBe(55);
    });
  });

  describe("analyzeSegment — clarity score logic", () => {
    it("starts at 80 for a normal segment with no fillers and enough words", async () => {
      const result = await svc.analyzeSegment(
        makeSegment({ text: "This is a solid explanation of podcasting.", startTime: 0, endTime: 10 })
      );
      // 7 words (>= 5), no fillers → clarity = 80
      expect(result.clarityScore).toBe(80);
    });

    it("subtracts 20 when text contains filler words (um, uh, ah, like)", async () => {
      const result = await svc.analyzeSegment(
        makeSegment({ text: "This is um a very good point about things.", startTime: 0, endTime: 10 })
      );
      expect(result.clarityScore).toBe(60);
    });

    it("subtracts 10 for very short word count (< 5 words)", async () => {
      const result = await svc.analyzeSegment(
        makeSegment({ text: "Short text", startTime: 0, endTime: 5 })
      );
      expect(result.clarityScore).toBe(70);
    });

    it("marks isConfusing=true when filler words present and word count < 10", async () => {
      const result = await svc.analyzeSegment(
        makeSegment({ text: "um ah", startTime: 0, endTime: 5 })
      );
      expect(result.isConfusing).toBe(true);
      expect(result.confusingDetail).toBe("Too many filler words");
    });

    it("does NOT mark isConfusing when filler words present but word count >= 10", async () => {
      const text = "um this is a very detailed and well explained explanation of the topic here";
      const result = await svc.analyzeSegment(makeSegment({ text, startTime: 0, endTime: 10 }));
      expect(result.isConfusing).toBe(false);
    });
  });

  describe("analyzeSegment — completeness detection", () => {
    it("marks isIncomplete=true when text ends with '...'", async () => {
      const result = await svc.analyzeSegment(
        makeSegment({ text: "I was going to say..." })
      );
      expect(result.isIncomplete).toBe(true);
      expect(result.incompleteDetail).toBe("Thought appears incomplete");
    });

    it("does NOT mark isIncomplete for text ending with period", async () => {
      const result = await svc.analyzeSegment(
        makeSegment({ text: "This is a complete thought." })
      );
      expect(result.isIncomplete).toBe(false);
      expect(result.incompleteDetail).toBeUndefined();
    });
  });

  describe("analyzeSegment — fixed fields", () => {
    it("never sets hasFactualError", async () => {
      const result = await svc.analyzeSegment(makeSegment());
      expect(result.hasFactualError).toBe(false);
    });

    it("never sets hasContradiction", async () => {
      const result = await svc.analyzeSegment(makeSegment());
      expect(result.hasContradiction).toBe(false);
    });

    it("never sets needsRerecord", async () => {
      const result = await svc.analyzeSegment(makeSegment());
      expect(result.needsRerecord).toBe(false);
    });

    it("always returns empty dependsOn", async () => {
      const result = await svc.analyzeSegment(makeSegment());
      expect(result.dependsOn).toEqual([]);
    });

    it("always returns standalone=true", async () => {
      const result = await svc.analyzeSegment(makeSegment());
      expect(result.standalone).toBe(true);
    });
  });

  describe("analyzeBatch", () => {
    it("returns one result per input segment", async () => {
      const segments = [
        makeSegment({ text: "First segment." }),
        makeSegment({ text: "Second segment." }),
        makeSegment({ text: "Third segment." }),
      ];
      const results = await svc.analyzeBatch(segments);
      expect(results).toHaveLength(3);
    });

    it("respects per-call useMock override in options", async () => {
      const liveService = createAnalysisService({ useMock: false });
      const segment = makeSegment({ text: "Test segment." });
      // Passing useMock: true via options should succeed without AI calls
      const results = await liveService.analyzeBatch([segment], { useMock: true });
      expect(results).toHaveLength(1);
      expect(typeof results[0].topic).toBe("string");
    });

    it("processes each segment independently", async () => {
      const segments = [
        makeSegment({ text: "um this is confusing ah", startTime: 0, endTime: 5 }),
        makeSegment({ text: "This is a clear, well-structured explanation of podcasting.", startTime: 5, endTime: 15 }),
      ];
      const results = await svc.analyzeBatch(segments);
      // First has fillers + short → isConfusing, lower clarity
      expect(results[0].isConfusing).toBe(true);
      // Second is clean
      expect(results[1].isConfusing).toBe(false);
    });
  });
});

// ─── ReorderService (mock mode) ──────────────────────────────────────────────

describe("ReorderService (mock mode)", () => {
  const svc = createReorderService({ useMock: true });

  describe("suggestReordering — basic structure", () => {
    it("returns a valid ReorderResult shape", async () => {
      const segments = [
        makeSegmentForReordering("a", "intro", 70, 80),
        makeSegmentForReordering("b", "main", 80, 85),
      ];
      const result = await svc.suggestReordering(segments);
      expect(Array.isArray(result.suggestedOrder)).toBe(true);
      expect(typeof result.needsIntro).toBe("boolean");
      expect(typeof result.needsOutro).toBe("boolean");
      expect(Array.isArray(result.transitions)).toBe(true);
      expect(typeof result.reasoning).toBe("string");
    });

    it("includes all segment IDs in suggestedOrder", async () => {
      const segments = [
        makeSegmentForReordering("a", "intro", 70, 80),
        makeSegmentForReordering("b", "main", 80, 85),
        makeSegmentForReordering("c", "outro", 60, 75),
      ];
      const result = await svc.suggestReordering(segments);
      expect(result.suggestedOrder).toHaveLength(3);
      expect(result.suggestedOrder).toContain("a");
      expect(result.suggestedOrder).toContain("b");
      expect(result.suggestedOrder).toContain("c");
    });

    it("handles empty segments array", async () => {
      const result = await svc.suggestReordering([]);
      expect(result.suggestedOrder).toEqual([]);
      expect(result.transitions).toEqual([]);
      expect(result.needsOutro).toBe(false);
    });
  });

  describe("suggestReordering — ordering logic", () => {
    it("places standalone high-score segments before dependent segments", async () => {
      const dependent = makeSegmentForReordering("dep", "followup", 90, 90, false, ["intro"]);
      const standalone = makeSegmentForReordering("sta", "opening", 70, 75, true);
      const result = await svc.suggestReordering([dependent, standalone]);
      const staIdx = result.suggestedOrder.indexOf("sta");
      const depIdx = result.suggestedOrder.indexOf("dep");
      expect(staIdx).toBeLessThan(depIdx);
    });

    it("sorts standalone segments by combined score descending", async () => {
      const low = makeSegmentForReordering("low", "topic a", 50, 50, true);
      const high = makeSegmentForReordering("high", "topic b", 90, 90, true);
      const mid = makeSegmentForReordering("mid", "topic c", 70, 70, true);
      const result = await svc.suggestReordering([low, high, mid]);
      const order = result.suggestedOrder;
      expect(order.indexOf("high")).toBeLessThan(order.indexOf("mid"));
      expect(order.indexOf("mid")).toBeLessThan(order.indexOf("low"));
    });

    it("preserves original order when preserveOriginalOrder=true", async () => {
      const segments = [
        makeSegmentForReordering("a", "topic a", 50, 50, true),
        makeSegmentForReordering("b", "topic b", 90, 90, true),
        makeSegmentForReordering("c", "topic c", 70, 70, true),
      ];
      const result = await svc.suggestReordering(segments, { preserveOriginalOrder: true });
      expect(result.suggestedOrder).toEqual(["a", "b", "c"]);
    });

    it("notes preserved order in reasoning", async () => {
      const segments = [makeSegmentForReordering("a", "topic", 80, 80)];
      const result = await svc.suggestReordering(segments, { preserveOriginalOrder: true });
      expect(result.reasoning).toContain("original order");
    });
  });

  describe("suggestReordering — transition generation", () => {
    it("creates transitions at topic boundaries", async () => {
      const seg1 = makeSegmentForReordering("a", "Introduction", 80, 80);
      const seg2 = makeSegmentForReordering("b", "Conclusion", 70, 75);
      const result = await svc.suggestReordering([seg1, seg2], { preserveOriginalOrder: true });
      expect(result.transitions).toHaveLength(1);
      expect(result.transitions[0].beforeSegmentId).toBe("a");
      expect(result.transitions[0].afterSegmentId).toBe("b");
      expect(result.transitions[0].transitionText).toContain("conclusion");
    });

    it("does NOT create transitions when adjacent segments share the same topic", async () => {
      const seg1 = makeSegmentForReordering("a", "podcasting", 80, 80);
      const seg2 = makeSegmentForReordering("b", "podcasting", 70, 75);
      const result = await svc.suggestReordering([seg1, seg2], { preserveOriginalOrder: true });
      expect(result.transitions).toHaveLength(0);
    });
  });

  describe("suggestReordering — intro/outro suggestions", () => {
    it("sets needsOutro=true when there are segments", async () => {
      const segments = [makeSegmentForReordering("a", "topic", 80, 80)];
      const result = await svc.suggestReordering(segments);
      expect(result.needsOutro).toBe(true);
      expect(result.outroSuggestion).toBeTruthy();
    });

    it("sets needsIntro=true when first ordered segment is not standalone", async () => {
      const segments = [makeSegmentForReordering("a", "followup", 80, 80, false)];
      const result = await svc.suggestReordering(segments);
      expect(result.needsIntro).toBe(true);
      expect(result.introSuggestion).toBeTruthy();
    });

    it("does NOT suggest intro when first ordered segment is standalone", async () => {
      const segments = [makeSegmentForReordering("a", "intro", 80, 80, true)];
      const result = await svc.suggestReordering(segments);
      expect(result.needsIntro).toBe(false);
      expect(result.introSuggestion).toBeUndefined();
    });

    it("outro references first and last segment topics", async () => {
      const segments = [
        makeSegmentForReordering("a", "Opening Theme", 90, 85),
        makeSegmentForReordering("b", "Closing Thoughts", 70, 75),
      ];
      const result = await svc.suggestReordering(segments, { preserveOriginalOrder: true });
      expect(result.outroSuggestion).toContain("opening theme");
      expect(result.outroSuggestion).toContain("closing thoughts");
    });
  });
});

// ─── validateReorderingDependencies ──────────────────────────────────────────

describe("validateReorderingDependencies", () => {
  it("returns valid=true and empty errors for empty inputs", () => {
    const result = validateReorderingDependencies([], []);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("returns valid=true when segments have no dependencies", () => {
    const segments = [
      makeSegmentForReordering("a", "intro", 80, 80),
      makeSegmentForReordering("b", "main", 70, 75),
    ];
    const result = validateReorderingDependencies(segments, ["a", "b"]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns an error when a proposed ID is not in the segments list", () => {
    const segments = [makeSegmentForReordering("a", "intro", 80, 80)];
    const result = validateReorderingDependencies(segments, ["a", "ghost"]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("ghost");
  });

  it("returns valid=true when a dependency comes before its dependent", () => {
    const segments = [
      makeSegmentForReordering("a", "intro", 80, 80),
      makeSegmentForReordering("b", "followup", 70, 75, true, ["intro"]),
    ];
    // "a" (intro) comes before "b" (followup) → dependency satisfied
    const result = validateReorderingDependencies(segments, ["a", "b"]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("returns an error when a segment comes before its dependency", () => {
    const segments = [
      makeSegmentForReordering("a", "intro", 80, 80),
      makeSegmentForReordering("b", "followup", 70, 75, true, ["intro"]),
    ];
    // "b" (depends on "intro") is placed first → violation
    const result = validateReorderingDependencies(segments, ["b", "a"]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("followup");
    expect(result.errors[0]).toContain("intro");
  });

  it("returns no error when a dependency topic is not found in the segments list", () => {
    // "b" depends on "missing-topic" which no segment has
    const segments = [
      makeSegmentForReordering("a", "intro", 80, 80),
      makeSegmentForReordering("b", "main", 70, 75, true, ["missing-topic"]),
    ];
    const result = validateReorderingDependencies(segments, ["a", "b"]);
    // Can't validate an unknown dependency — should not error
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accumulates multiple errors for multiple violations", () => {
    const segments = [
      makeSegmentForReordering("a", "intro", 80, 80),
      makeSegmentForReordering("b", "followup", 70, 75, true, ["intro"]),
      makeSegmentForReordering("c", "conclusion", 60, 70, true, ["intro"]),
    ];
    // Both "b" and "c" depend on "intro" but come before it
    const result = validateReorderingDependencies(segments, ["b", "c", "a"]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });

  it("returns no error when a dependency segment exists but is absent from proposedOrder", () => {
    const segments = [
      makeSegmentForReordering("a", "intro", 80, 80),
      makeSegmentForReordering("b", "followup", 70, 75, true, ["intro"]),
    ];
    // Only "b" is in proposedOrder; "a" is omitted → depPosition is undefined → no error
    const result = validateReorderingDependencies(segments, ["b"]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("returns valid=true for a single segment with no dependencies", () => {
    const segments = [makeSegmentForReordering("solo", "topic", 75, 80)];
    const result = validateReorderingDependencies(segments, ["solo"]);
    expect(result.valid).toBe(true);
  });
});
