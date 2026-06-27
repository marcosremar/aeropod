import { describe, it, expect } from "vitest";
import {
  selectBestSegments,
  estimateCompressionRatio,
  suggestTargetDuration,
  type SegmentWithAnalysis,
} from "@/lib/ai/selection";
import { validateReorderingDependencies } from "@/lib/ai/reorder";

function makeSegment(
  id: string,
  startTime: number,
  endTime: number,
  overrides: Partial<SegmentWithAnalysis["analysis"]> = {}
): SegmentWithAnalysis {
  return {
    id,
    startTime,
    endTime,
    text: `Segment ${id}`,
    analysis: {
      topic: "General",
      interestScore: 70,
      clarityScore: 70,
      isTangent: false,
      isRepetition: false,
      keyInsight: "",
      dependsOn: [],
      standalone: true,
      hasFactualError: false,
      hasContradiction: false,
      isConfusing: false,
      isIncomplete: false,
      needsRerecord: false,
      ...overrides,
    },
  };
}

// ─── selectBestSegments ────────────────────────────────────────────────────

describe("selectBestSegments", () => {
  it("returns segments sorted by time order, not score order", () => {
    const segments = [
      makeSegment("a", 20, 30, { interestScore: 90, clarityScore: 90 }),
      makeSegment("b", 0, 10, { interestScore: 80, clarityScore: 80 }),
      makeSegment("c", 10, 20, { interestScore: 85, clarityScore: 85 }),
    ];
    const result = selectBestSegments(segments, 60);
    expect(result.selectedSegments.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("filters out segments below the minimum score threshold", () => {
    const segments = [
      makeSegment("low", 0, 10, { interestScore: 30, clarityScore: 30 }),
      makeSegment("high", 10, 20, { interestScore: 80, clarityScore: 80 }),
    ];
    const result = selectBestSegments(segments, 30);
    expect(result.selectedSegments.map((s) => s.id)).toEqual(["high"]);
    expect(result.removedReasons.low_score).toBe(1);
  });

  it("filters out tangent segments by default", () => {
    const segments = [
      makeSegment("tangent", 0, 10, { isTangent: true }),
      makeSegment("main", 10, 20),
    ];
    const result = selectBestSegments(segments, 30);
    expect(result.selectedSegments.map((s) => s.id)).toEqual(["main"]);
    expect(result.removedReasons.tangent).toBe(1);
  });

  it("includes tangent segments when allowTangents is true", () => {
    const segments = [
      makeSegment("tangent", 0, 10, { isTangent: true }),
      makeSegment("main", 10, 20),
    ];
    const result = selectBestSegments(segments, 30, { allowTangents: true });
    expect(result.selectedSegments).toHaveLength(2);
  });

  it("filters out repetition segments by default", () => {
    const segments = [
      makeSegment("rep", 0, 10, { isRepetition: true }),
      makeSegment("orig", 10, 20),
    ];
    const result = selectBestSegments(segments, 30);
    expect(result.selectedSegments.map((s) => s.id)).toEqual(["orig"]);
    expect(result.removedReasons.repetition).toBe(1);
  });

  it("filters out segments that need rerecord", () => {
    const segments = [
      makeSegment("bad", 0, 10, { needsRerecord: true }),
      makeSegment("good", 10, 20),
    ];
    const result = selectBestSegments(segments, 30);
    expect(result.selectedSegments.map((s) => s.id)).toEqual(["good"]);
    expect(result.removedReasons.needs_rerecord).toBe(1);
  });

  it("filters out segments with factual errors", () => {
    const segments = [
      makeSegment("wrong", 0, 10, { hasFactualError: true }),
      makeSegment("correct", 10, 20),
    ];
    const result = selectBestSegments(segments, 30);
    expect(result.selectedSegments.map((s) => s.id)).toEqual(["correct"]);
    expect(result.removedReasons.factual_error).toBe(1);
  });

  it("stops selecting when target duration is reached", () => {
    const segments = [
      makeSegment("a", 0, 10),
      makeSegment("b", 10, 20),
      makeSegment("c", 20, 30),
      makeSegment("d", 30, 40),
    ];
    const result = selectBestSegments(segments, 20);
    expect(result.totalDuration).toBeLessThanOrEqual(20);
  });

  it("computes removedCount correctly", () => {
    const segments = [
      makeSegment("a", 0, 10, { interestScore: 10, clarityScore: 10 }),
      makeSegment("b", 10, 20),
      makeSegment("c", 20, 30, { isTangent: true }),
    ];
    const result = selectBestSegments(segments, 60);
    expect(result.removedCount).toBe(2);
  });

  it("computes average scores from selected segments", () => {
    const segments = [
      makeSegment("a", 0, 10, { interestScore: 80, clarityScore: 60 }),
      makeSegment("b", 10, 20, { interestScore: 60, clarityScore: 80 }),
    ];
    const result = selectBestSegments(segments, 60);
    expect(result.averageInterestScore).toBe(70);
    expect(result.averageClarityScore).toBe(70);
  });

  it("returns empty selection when all segments are below threshold", () => {
    const segments = [
      makeSegment("a", 0, 10, { interestScore: 20, clarityScore: 20 }),
    ];
    const result = selectBestSegments(segments, 60);
    expect(result.selectedSegments).toHaveLength(0);
    expect(result.totalDuration).toBe(0);
  });

  it("returns empty selection for empty input", () => {
    const result = selectBestSegments([], 60);
    expect(result.selectedSegments).toHaveLength(0);
    expect(result.removedCount).toBe(0);
  });

  it("includes dependency segments even when they fall below threshold", () => {
    const lowScore = makeSegment("dep", 0, 5, {
      interestScore: 20,
      clarityScore: 20,
      topic: "Intro",
    });
    const highScore = makeSegment("main", 5, 15, {
      interestScore: 80,
      clarityScore: 80,
      dependsOn: ["Intro"],
    });
    const result = selectBestSegments([lowScore, highScore], 60);
    const ids = result.selectedSegments.map((s) => s.id);
    expect(ids).toContain("dep");
    expect(ids).toContain("main");
  });
});

// ─── estimateCompressionRatio ──────────────────────────────────────────────

describe("estimateCompressionRatio", () => {
  it("returns 1 for an empty segment list", () => {
    expect(estimateCompressionRatio([])).toBe(1);
  });

  it("returns 1 when all segments are high quality", () => {
    const segments = [
      makeSegment("a", 0, 10),
      makeSegment("b", 10, 20),
    ];
    expect(estimateCompressionRatio(segments)).toBe(1);
  });

  it("returns < 1 when low-value segments exist", () => {
    const segments = [
      makeSegment("good", 0, 10),
      makeSegment("tangent", 10, 20, { isTangent: true }),
    ];
    const ratio = estimateCompressionRatio(segments);
    expect(ratio).toBeLessThan(1);
    expect(ratio).toBeGreaterThan(0);
  });

  it("returns 0.5 when half the segments are low value", () => {
    const segments = [
      makeSegment("good", 0, 10),
      makeSegment("bad", 10, 20, { interestScore: 30, clarityScore: 30 }),
    ];
    expect(estimateCompressionRatio(segments)).toBe(0.5);
  });

  it("treats repetition as low value", () => {
    const segments = [
      makeSegment("a", 0, 10),
      makeSegment("b", 10, 20, { isRepetition: true }),
    ];
    expect(estimateCompressionRatio(segments)).toBeLessThan(1);
  });
});

// ─── suggestTargetDuration ─────────────────────────────────────────────────

describe("suggestTargetDuration", () => {
  it("returns 0 for empty segments", () => {
    expect(suggestTargetDuration([])).toBe(0);
  });

  it("clamps result to minCompressionRatio", () => {
    const segments = [
      makeSegment("a", 0, 10, { isTangent: true }),
      makeSegment("b", 10, 20, { isTangent: true }),
      makeSegment("c", 20, 30, { isTangent: true }),
      makeSegment("d", 30, 40, { isTangent: true }),
    ];
    const result = suggestTargetDuration(segments, { minCompressionRatio: 0.5 });
    expect(result).toBeGreaterThanOrEqual(20); // 40s * 0.5 = 20
  });

  it("clamps result to maxCompressionRatio for high quality content", () => {
    const segments = [
      makeSegment("a", 0, 10),
      makeSegment("b", 10, 20),
    ];
    const result = suggestTargetDuration(segments, { maxCompressionRatio: 0.8 });
    expect(result).toBeLessThanOrEqual(16); // 20s * 0.8 = 16
  });

  it("returns a number in seconds (integer)", () => {
    const segments = [makeSegment("a", 0, 30)];
    const result = suggestTargetDuration(segments);
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ─── validateReorderingDependencies ───────────────────────────────────────

describe("validateReorderingDependencies", () => {
  it("returns valid for an empty list", () => {
    const result = validateReorderingDependencies([], []);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns valid when order respects dependencies", () => {
    const segments = [
      makeSegment("intro", 0, 5, { topic: "Introduction" }),
      makeSegment("main", 5, 15, { topic: "Main", dependsOn: ["Introduction"] }),
    ];
    const result = validateReorderingDependencies(segments, ["intro", "main"]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns error when dependency comes after dependent", () => {
    const segments = [
      makeSegment("intro", 0, 5, { topic: "Introduction" }),
      makeSegment("main", 5, 15, { topic: "Main", dependsOn: ["Introduction"] }),
    ];
    // main comes before intro — violates dependency
    const result = validateReorderingDependencies(segments, ["main", "intro"]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns error for unknown segment ID in proposed order", () => {
    const segments = [makeSegment("a", 0, 10)];
    const result = validateReorderingDependencies(segments, ["a", "ghost"]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("ghost"))).toBe(true);
  });

  it("is valid when there are no dependencies regardless of order", () => {
    const segments = [
      makeSegment("a", 0, 10, { topic: "A" }),
      makeSegment("b", 10, 20, { topic: "B" }),
      makeSegment("c", 20, 30, { topic: "C" }),
    ];
    const reversed = validateReorderingDependencies(segments, ["c", "b", "a"]);
    expect(reversed.valid).toBe(true);
  });
});
