/**
 * Unit tests for pure utility functions in src/services/deepgram.ts:
 *   - isDeepgramConfigured
 *   - getFillerStats
 *
 * No API calls are made — all tests are purely deterministic.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isDeepgramConfigured, getFillerStats, type DeepgramResult } from "@/services/deepgram";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeResult(
  fillers: Array<{ word: string; start: number; end: number; confidence: number }>
): DeepgramResult {
  return {
    success: true,
    text: "sample text",
    segments: [],
    words: [],
    fillers,
    filler_count: fillers.length,
    language: "pt-BR",
    duration: 60,
  };
}

// ─── isDeepgramConfigured ────────────────────────────────────────────────────

describe("isDeepgramConfigured", () => {
  const originalEnv = process.env.DEEPGRAM_API_KEY;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.DEEPGRAM_API_KEY;
    } else {
      process.env.DEEPGRAM_API_KEY = originalEnv;
    }
  });

  it("returns true when DEEPGRAM_API_KEY is set", () => {
    process.env.DEEPGRAM_API_KEY = "test-key-123";
    expect(isDeepgramConfigured()).toBe(true);
  });

  it("returns false when DEEPGRAM_API_KEY is an empty string", () => {
    process.env.DEEPGRAM_API_KEY = "";
    expect(isDeepgramConfigured()).toBe(false);
  });

  it("returns false when DEEPGRAM_API_KEY is not set", () => {
    delete process.env.DEEPGRAM_API_KEY;
    expect(isDeepgramConfigured()).toBe(false);
  });
});

// ─── getFillerStats ──────────────────────────────────────────────────────────

describe("getFillerStats", () => {
  it("returns zeros for a result with no fillers", () => {
    const result = makeResult([]);
    const stats = getFillerStats(result);
    expect(stats.totalCount).toBe(0);
    expect(stats.totalDuration).toBe(0);
    expect(stats.byType).toEqual({});
  });

  it("returns zeros when fillers array is undefined", () => {
    const result: DeepgramResult = { success: true };
    const stats = getFillerStats(result);
    expect(stats.totalCount).toBe(0);
    expect(stats.totalDuration).toBe(0);
    expect(stats.byType).toEqual({});
  });

  it("counts a single filler correctly", () => {
    const result = makeResult([{ word: "um", start: 1.0, end: 1.3, confidence: 0.9 }]);
    const stats = getFillerStats(result);
    expect(stats.totalCount).toBe(1);
    expect(stats.totalDuration).toBeCloseTo(0.3);
    expect(stats.byType["um"]).toEqual({ count: 1, duration: expect.closeTo(0.3) });
  });

  it("groups multiple occurrences of the same filler word", () => {
    const result = makeResult([
      { word: "uh", start: 0.5, end: 0.8, confidence: 0.95 },
      { word: "uh", start: 5.0, end: 5.4, confidence: 0.88 },
    ]);
    const stats = getFillerStats(result);
    expect(stats.totalCount).toBe(2);
    expect(stats.byType["uh"].count).toBe(2);
    expect(stats.byType["uh"].duration).toBeCloseTo(0.3 + 0.4);
  });

  it("sums totalDuration across all fillers regardless of type", () => {
    const result = makeResult([
      { word: "um", start: 1.0, end: 1.5, confidence: 0.9 },
      { word: "ah", start: 3.0, end: 3.2, confidence: 0.8 },
      { word: "um", start: 7.0, end: 7.3, confidence: 0.85 },
    ]);
    const stats = getFillerStats(result);
    expect(stats.totalCount).toBe(3);
    // 0.5 + 0.2 + 0.3
    expect(stats.totalDuration).toBeCloseTo(1.0);
  });

  it("groups multiple distinct filler words into separate byType entries", () => {
    const result = makeResult([
      { word: "um", start: 0.0, end: 0.2, confidence: 0.9 },
      { word: "ah", start: 1.0, end: 1.1, confidence: 0.85 },
      { word: "uh", start: 2.0, end: 2.3, confidence: 0.8 },
    ]);
    const stats = getFillerStats(result);
    expect(Object.keys(stats.byType)).toHaveLength(3);
    expect(stats.byType["um"].count).toBe(1);
    expect(stats.byType["ah"].count).toBe(1);
    expect(stats.byType["uh"].count).toBe(1);
  });

  it("normalizes word keys to lowercase before grouping", () => {
    const result = makeResult([
      { word: "Um", start: 0.0, end: 0.3, confidence: 0.9 },
      { word: "UM", start: 1.0, end: 1.2, confidence: 0.85 },
    ]);
    const stats = getFillerStats(result);
    // Both "Um" and "UM" should be folded into "um"
    expect(Object.keys(stats.byType)).toHaveLength(1);
    expect(stats.byType["um"].count).toBe(2);
  });

  it("returns totalCount equal to the number of filler entries", () => {
    const fillers = Array.from({ length: 10 }, (_, i) => ({
      word: "like",
      start: i * 2,
      end: i * 2 + 0.1,
      confidence: 0.9,
    }));
    const result = makeResult(fillers);
    const stats = getFillerStats(result);
    expect(stats.totalCount).toBe(10);
    expect(stats.byType["like"].count).toBe(10);
  });

  it("handles a filler with zero duration (start === end)", () => {
    const result = makeResult([{ word: "hmm", start: 3.0, end: 3.0, confidence: 0.7 }]);
    const stats = getFillerStats(result);
    expect(stats.totalCount).toBe(1);
    expect(stats.totalDuration).toBe(0);
    expect(stats.byType["hmm"].duration).toBe(0);
  });

  it("totalDuration and byType durations are consistent", () => {
    const result = makeResult([
      { word: "um", start: 0.0, end: 0.5, confidence: 0.9 },
      { word: "ah", start: 1.0, end: 1.3, confidence: 0.8 },
      { word: "um", start: 2.0, end: 2.6, confidence: 0.85 },
      { word: "uh", start: 3.0, end: 3.2, confidence: 0.75 },
    ]);
    const stats = getFillerStats(result);

    // Verify that the sum of byType durations equals totalDuration
    const sumByType = Object.values(stats.byType).reduce(
      (acc, { duration }) => acc + duration,
      0
    );
    expect(sumByType).toBeCloseTo(stats.totalDuration);
  });

  it("does not mutate the original result object", () => {
    const fillers = [{ word: "um", start: 1.0, end: 1.3, confidence: 0.9 }];
    const result = makeResult(fillers);
    const originalFillersLength = result.fillers!.length;
    getFillerStats(result);
    expect(result.fillers!.length).toBe(originalFillersLength);
  });
});
