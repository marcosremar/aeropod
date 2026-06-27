/**
 * Unit tests for audio chunking pure functions.
 * These have no DB/IO dependencies and exercise the core chunking logic.
 */

import { describe, it, expect } from "vitest";
import {
  chunkTranscription,
  mergeChunks,
  splitChunkAtTime,
  validateChunks,
  type AudioChunk,
} from "@/lib/audio/chunking";
import type { TranscriptionSegment } from "@/lib/audio/transcription";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeSeg(
  id: number,
  start: number,
  end: number,
  text: string
): TranscriptionSegment {
  return { id, start, end, text };
}

// ─── chunkTranscription ───────────────────────────────────────────────────────

describe("chunkTranscription", () => {
  it("returns empty array for empty input", () => {
    expect(chunkTranscription([])).toEqual([]);
  });

  it("produces a single chunk for a short sequence under maxDuration", () => {
    const segs = [
      makeSeg(1, 0, 20, "hello world"),
      makeSeg(2, 20, 40, "how are you"),
    ];
    const chunks = chunkTranscription(segs, { minDuration: 30, maxDuration: 60 });
    expect(chunks.length).toBe(1);
    expect(chunks[0].startTime).toBe(0);
    expect(chunks[0].endTime).toBe(40);
    expect(chunks[0].segmentIds).toEqual([1, 2]);
  });

  it("splits into multiple chunks when maxDuration is exceeded", () => {
    // Each segment is 25s; maxDuration=60 → second segment tips over the limit
    // at 75s potential duration, so chunk 1=[0,50), chunk 2=[50,75)
    const segs = [
      makeSeg(1, 0, 25, "segment one"),
      makeSeg(2, 25, 50, "segment two"),
      makeSeg(3, 50, 75, "segment three"),
    ];
    const chunks = chunkTranscription(segs, { minDuration: 10, maxDuration: 60 });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Every chunk must have valid times
    for (const c of chunks) {
      expect(c.endTime).toBeGreaterThan(c.startTime);
    }
  });

  it("breaks at sentence boundaries when preferSentenceBoundaries is true", () => {
    // After 35s (>= minDuration=30) the next segment starts with a sentence
    // boundary (the previous segment ends with a period).
    const segs = [
      makeSeg(1, 0, 20, "First idea."),
      makeSeg(2, 20, 35, "Second idea."), // ends sentence → boundary candidate
      makeSeg(3, 35, 50, "Third idea."),
      makeSeg(4, 50, 65, "Fourth idea."),
    ];
    const chunks = chunkTranscription(segs, {
      minDuration: 30,
      maxDuration: 120,
      preferSentenceBoundaries: true,
    });
    // Chunk should break after segment 2 since cumulative = 35s >= minDuration
    // and segment 2 text ends with a period
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("respects a long pause between segments as a boundary", () => {
    // Gap of 2s between segs 2 and 3 triggers a boundary after minDuration
    const segs = [
      makeSeg(1, 0, 20, "hello world"),
      makeSeg(2, 20, 35, "some content"),
      makeSeg(3, 37, 55, "after long pause"), // 2s gap
      makeSeg(4, 55, 70, "more content"),
    ];
    const chunks = chunkTranscription(segs, {
      minDuration: 30,
      maxDuration: 120,
      preferSentenceBoundaries: true,
    });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("assigns sequential chunk IDs starting at chunk-0", () => {
    const segs = [
      makeSeg(1, 0, 35, "first chunk content"),
      makeSeg(2, 35, 70, "second chunk content"),
      makeSeg(3, 70, 105, "third chunk content"),
    ];
    const chunks = chunkTranscription(segs, { minDuration: 10, maxDuration: 40 });
    chunks.forEach((c, i) => expect(c.id).toBe(`chunk-${i}`));
  });

  it("produces valid (non-overlapping, ordered) chunks", () => {
    const segs = Array.from({ length: 10 }, (_, i) =>
      makeSeg(i + 1, i * 20, (i + 1) * 20, `segment ${i + 1}`)
    );
    const chunks = chunkTranscription(segs, { minDuration: 30, maxDuration: 60 });
    expect(validateChunks(chunks)).toBe(true);
  });

  it("works without preferSentenceBoundaries (only breaks at maxDuration)", () => {
    const segs = [
      makeSeg(1, 0, 20, "no period here"),
      makeSeg(2, 20, 40, "still no period"),
      makeSeg(3, 40, 60, "third segment"),
      makeSeg(4, 60, 80, "fourth segment"),
    ];
    const chunks = chunkTranscription(segs, {
      minDuration: 10,
      maxDuration: 55,
      preferSentenceBoundaries: false,
    });
    // Should break when potential duration > 55s
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── mergeChunks ─────────────────────────────────────────────────────────────

describe("mergeChunks", () => {
  it("returns null for empty array", () => {
    expect(mergeChunks([])).toBeNull();
  });

  it("returns the original chunk unchanged for a single-element array", () => {
    const chunk: AudioChunk = {
      id: "chunk-0",
      startTime: 0,
      endTime: 30,
      text: "hello",
      segmentIds: [1],
    };
    expect(mergeChunks([chunk])).toEqual(chunk);
  });

  it("merges two chunks into one spanning both", () => {
    const a: AudioChunk = {
      id: "chunk-0",
      startTime: 0,
      endTime: 30,
      text: "first",
      segmentIds: [1, 2],
    };
    const b: AudioChunk = {
      id: "chunk-1",
      startTime: 30,
      endTime: 60,
      text: "second",
      segmentIds: [3],
    };
    const merged = mergeChunks([a, b]);
    expect(merged).not.toBeNull();
    expect(merged!.startTime).toBe(0);
    expect(merged!.endTime).toBe(60);
    expect(merged!.text).toBe("first second");
    expect(merged!.segmentIds).toEqual([1, 2, 3]);
  });

  it("sorts chunks by startTime before merging", () => {
    const b: AudioChunk = {
      id: "chunk-1",
      startTime: 30,
      endTime: 60,
      text: "second",
      segmentIds: [3],
    };
    const a: AudioChunk = {
      id: "chunk-0",
      startTime: 0,
      endTime: 30,
      text: "first",
      segmentIds: [1, 2],
    };
    // Pass in reverse order
    const merged = mergeChunks([b, a]);
    expect(merged!.startTime).toBe(0);
    expect(merged!.endTime).toBe(60);
    expect(merged!.text).toBe("first second");
  });

  it("builds the merged ID from constituent chunk IDs", () => {
    const a: AudioChunk = { id: "chunk-0", startTime: 0, endTime: 10, text: "a", segmentIds: [1] };
    const b: AudioChunk = { id: "chunk-1", startTime: 10, endTime: 20, text: "b", segmentIds: [2] };
    const merged = mergeChunks([a, b]);
    expect(merged!.id).toBe("merged-chunk-0-chunk-1");
  });
});

// ─── splitChunkAtTime ─────────────────────────────────────────────────────────

describe("splitChunkAtTime", () => {
  const segments: TranscriptionSegment[] = [
    makeSeg(1, 0, 10, "first"),
    makeSeg(2, 10, 20, "second"),
    makeSeg(3, 20, 30, "third"),
  ];
  const chunk: AudioChunk = {
    id: "chunk-0",
    startTime: 0,
    endTime: 30,
    text: "first second third",
    segmentIds: [1, 2, 3],
  };

  it("returns null when splitTime equals startTime", () => {
    expect(splitChunkAtTime(chunk, segments, 0)).toBeNull();
  });

  it("returns null when splitTime equals endTime", () => {
    expect(splitChunkAtTime(chunk, segments, 30)).toBeNull();
  });

  it("returns null when splitTime is outside the chunk bounds", () => {
    expect(splitChunkAtTime(chunk, segments, -5)).toBeNull();
    expect(splitChunkAtTime(chunk, segments, 50)).toBeNull();
  });

  it("splits at a segment boundary into two valid chunks", () => {
    const result = splitChunkAtTime(chunk, segments, 15);
    expect(result).not.toBeNull();
    const [first, second] = result!;
    expect(first.startTime).toBe(0);
    expect(second.endTime).toBe(30);
    // They must not overlap
    expect(first.endTime).toBeLessThanOrEqual(second.startTime);
  });

  it("generates IDs with -a and -b suffixes", () => {
    const result = splitChunkAtTime(chunk, segments, 15);
    expect(result).not.toBeNull();
    const [first, second] = result!;
    expect(first.id).toBe("chunk-0-a");
    expect(second.id).toBe("chunk-0-b");
  });
});

// ─── validateChunks ──────────────────────────────────────────────────────────

describe("validateChunks", () => {
  it("returns true for an empty array", () => {
    expect(validateChunks([])).toBe(true);
  });

  it("returns true for a single valid chunk", () => {
    const chunk: AudioChunk = { id: "chunk-0", startTime: 0, endTime: 30, text: "hi", segmentIds: [1] };
    expect(validateChunks([chunk])).toBe(true);
  });

  it("returns true for multiple sequential non-overlapping chunks", () => {
    const chunks: AudioChunk[] = [
      { id: "chunk-0", startTime: 0, endTime: 30, text: "a", segmentIds: [1] },
      { id: "chunk-1", startTime: 30, endTime: 60, text: "b", segmentIds: [2] },
      { id: "chunk-2", startTime: 60, endTime: 90, text: "c", segmentIds: [3] },
    ];
    expect(validateChunks(chunks)).toBe(true);
  });

  it("returns false when a chunk has startTime >= endTime", () => {
    const chunks: AudioChunk[] = [
      { id: "chunk-0", startTime: 10, endTime: 5, text: "bad", segmentIds: [1] },
    ];
    expect(validateChunks(chunks)).toBe(false);
  });

  it("returns false when chunks overlap", () => {
    const chunks: AudioChunk[] = [
      { id: "chunk-0", startTime: 0, endTime: 40, text: "a", segmentIds: [1] },
      { id: "chunk-1", startTime: 30, endTime: 60, text: "b", segmentIds: [2] }, // overlaps
    ];
    expect(validateChunks(chunks)).toBe(false);
  });
});
