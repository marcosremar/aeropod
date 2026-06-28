/**
 * Unit tests for pyannote pure utility functions:
 *   - alignWithTranscript
 *   - getSpeakerDisplayNames
 *   - formatSpeakerStats
 *
 * No API calls or DB access — all logic is deterministic.
 */

import { describe, it, expect } from "vitest";
import {
  alignWithTranscript,
  getSpeakerDisplayNames,
  formatSpeakerStats,
  type DiarizationSegment,
  type TranscriptSegment,
  type SpeakerStats,
} from "@/services/pyannote";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeDiarSeg(
  speaker: string,
  start: number,
  end: number
): DiarizationSegment {
  return { speaker, start, end, duration: end - start };
}

function makeTransSeg(text: string, start: number, end: number): TranscriptSegment {
  return { text, start, end };
}

// ─── alignWithTranscript ──────────────────────────────────────────────────────

describe("alignWithTranscript", () => {
  it("returns empty array for empty transcript", () => {
    const diar = [makeDiarSeg("SPEAKER_0", 0, 10)];
    expect(alignWithTranscript(diar, [])).toEqual([]);
  });

  it("labels all segments UNKNOWN when no diarization segments provided", () => {
    const trans = [makeTransSeg("Hello", 0, 5), makeTransSeg("World", 5, 10)];
    const result = alignWithTranscript([], trans);
    expect(result).toHaveLength(2);
    expect(result[0].speaker).toBe("UNKNOWN");
    expect(result[1].speaker).toBe("UNKNOWN");
  });

  it("assigns speaker whose diarization window covers the transcript midpoint", () => {
    // trans seg [0, 4] → midpoint 2 → falls in SPEAKER_0 [0, 5)
    const diar = [makeDiarSeg("SPEAKER_0", 0, 5), makeDiarSeg("SPEAKER_1", 5, 10)];
    const trans = [makeTransSeg("Hello there", 0, 4)];
    const result = alignWithTranscript(diar, trans);
    expect(result[0].speaker).toBe("SPEAKER_0");
  });

  it("assigns SPEAKER_1 when midpoint falls in the second diarization segment", () => {
    const diar = [makeDiarSeg("SPEAKER_0", 0, 5), makeDiarSeg("SPEAKER_1", 5, 10)];
    // trans seg [6, 10] → midpoint 8 → SPEAKER_1
    const trans = [makeTransSeg("Goodbye", 6, 10)];
    const result = alignWithTranscript(diar, trans);
    expect(result[0].speaker).toBe("SPEAKER_1");
  });

  it("preserves original transcript fields in the output", () => {
    const diar = [makeDiarSeg("SPEAKER_0", 0, 10)];
    const words = [{ word: "hi", start: 0, end: 0.5 }];
    const trans: TranscriptSegment[] = [{ text: "hi", start: 0, end: 0.5, words }];
    const result = alignWithTranscript(diar, trans);
    expect(result[0].text).toBe("hi");
    expect(result[0].words).toBe(words);
  });

  it("handles transcript segment that spans a speaker boundary — uses midpoint only", () => {
    // trans [0, 10] → midpoint 5 → boundary of SPEAKER_0 [0,5] so it matches SPEAKER_0 (inclusive)
    const diar = [makeDiarSeg("SPEAKER_0", 0, 5), makeDiarSeg("SPEAKER_1", 5, 10)];
    const trans = [makeTransSeg("cross-boundary", 0, 10)];
    const result = alignWithTranscript(diar, trans);
    // midpoint = 5, first matching segment is SPEAKER_0 (diarSeg.start=0 <= 5 <= diarSeg.end=5)
    expect(result[0].speaker).toBe("SPEAKER_0");
  });

  it("assigns UNKNOWN when no diarization segment covers the midpoint", () => {
    // Gap between [0,3] and [7,10] — midpoint of [4,6] is 5, not covered
    const diar = [makeDiarSeg("SPEAKER_0", 0, 3), makeDiarSeg("SPEAKER_1", 7, 10)];
    const trans = [makeTransSeg("gap segment", 4, 6)];
    const result = alignWithTranscript(diar, trans);
    expect(result[0].speaker).toBe("UNKNOWN");
  });

  it("handles multiple transcript segments with different speakers", () => {
    const diar = [
      makeDiarSeg("SPEAKER_0", 0, 10),
      makeDiarSeg("SPEAKER_1", 10, 20),
      makeDiarSeg("SPEAKER_0", 20, 30),
    ];
    const trans = [
      makeTransSeg("First", 0, 8),    // midpoint 4 → SPEAKER_0
      makeTransSeg("Second", 12, 18), // midpoint 15 → SPEAKER_1
      makeTransSeg("Third", 22, 28),  // midpoint 25 → SPEAKER_0
    ];
    const result = alignWithTranscript(diar, trans);
    expect(result[0].speaker).toBe("SPEAKER_0");
    expect(result[1].speaker).toBe("SPEAKER_1");
    expect(result[2].speaker).toBe("SPEAKER_0");
  });
});

// ─── getSpeakerDisplayNames ───────────────────────────────────────────────────

describe("getSpeakerDisplayNames", () => {
  it("returns empty object for empty speaker list", () => {
    expect(getSpeakerDisplayNames([])).toEqual({});
  });

  it("maps a single speaker to 'Speaker 1'", () => {
    const result = getSpeakerDisplayNames(["SPEAKER_0"]);
    expect(result).toEqual({ SPEAKER_0: "Speaker 1" });
  });

  it("maps multiple speakers to consecutive numbers", () => {
    const result = getSpeakerDisplayNames(["SPEAKER_0", "SPEAKER_1"]);
    // Both are mapped, total 2 entries
    expect(Object.keys(result)).toHaveLength(2);
    const values = Object.values(result);
    expect(values).toContain("Speaker 1");
    expect(values).toContain("Speaker 2");
  });

  it("sorts speakers alphabetically before numbering", () => {
    // SPEAKER_1 sorts before SPEAKER_0 alphabetically? No — "SPEAKER_0" < "SPEAKER_1"
    // So SPEAKER_0 → Speaker 1, SPEAKER_1 → Speaker 2
    const result = getSpeakerDisplayNames(["SPEAKER_1", "SPEAKER_0"]);
    expect(result["SPEAKER_0"]).toBe("Speaker 1");
    expect(result["SPEAKER_1"]).toBe("Speaker 2");
  });

  it("produces consistent ordering regardless of input order", () => {
    const result1 = getSpeakerDisplayNames(["B", "A", "C"]);
    const result2 = getSpeakerDisplayNames(["C", "B", "A"]);
    expect(result1).toEqual(result2);
  });

  it("assigns Speaker 1 to the lexicographically first speaker", () => {
    const result = getSpeakerDisplayNames(["SPEAKER_Z", "SPEAKER_A"]);
    expect(result["SPEAKER_A"]).toBe("Speaker 1");
    expect(result["SPEAKER_Z"]).toBe("Speaker 2");
  });
});

// ─── formatSpeakerStats ───────────────────────────────────────────────────────

describe("formatSpeakerStats", () => {
  function makeStat(total_time: number, percentage: number, segments_count = 1): SpeakerStats {
    return { total_time, percentage, segments_count };
  }

  it("returns empty string for empty stats", () => {
    expect(formatSpeakerStats({})).toBe("");
  });

  it("formats a single speaker with time under a minute", () => {
    const stats = { SPEAKER_0: makeStat(45, 100) };
    const result = formatSpeakerStats(stats);
    expect(result).toBe("SPEAKER_0: 45s (100%)");
  });

  it("formats time in minutes and seconds when total_time >= 60", () => {
    const stats = { SPEAKER_0: makeStat(90, 100) };
    const result = formatSpeakerStats(stats);
    expect(result).toBe("SPEAKER_0: 1m 30s (100%)");
  });

  it("uses display name when provided", () => {
    const stats = { SPEAKER_0: makeStat(30, 50), SPEAKER_1: makeStat(30, 50) };
    const displayNames = { SPEAKER_0: "Alice", SPEAKER_1: "Bob" };
    const result = formatSpeakerStats(stats, displayNames);
    expect(result).toContain("Alice:");
    expect(result).toContain("Bob:");
  });

  it("falls back to speaker ID when displayNames omits that speaker", () => {
    const stats = { SPEAKER_0: makeStat(30, 100) };
    const result = formatSpeakerStats(stats, {}); // empty displayNames
    expect(result).toContain("SPEAKER_0:");
  });

  it("includes percentage in the output", () => {
    const stats = { SPEAKER_0: makeStat(60, 75) };
    const result = formatSpeakerStats(stats);
    expect(result).toContain("(75%)");
  });

  it("separates multiple speakers with newlines", () => {
    const stats = {
      SPEAKER_0: makeStat(30, 50),
      SPEAKER_1: makeStat(30, 50),
    };
    const result = formatSpeakerStats(stats);
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
  });

  it("formats 0 seconds correctly", () => {
    const stats = { SPEAKER_0: makeStat(0, 0) };
    const result = formatSpeakerStats(stats);
    expect(result).toBe("SPEAKER_0: 0s (0%)");
  });

  it("rounds seconds to nearest integer", () => {
    // 90.6s → 1m 31s (round(0.6) = 1)
    const stats = { SPEAKER_0: makeStat(90.6, 100) };
    const result = formatSpeakerStats(stats);
    expect(result).toBe("SPEAKER_0: 1m 31s (100%)");
  });
});
