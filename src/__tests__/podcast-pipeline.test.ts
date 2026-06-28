/**
 * Unit tests for PodcastPipeline private helpers (src/services/pipeline.ts).
 *
 * The helpers under test are pure logic methods (chunkSegments,
 * calculateSegmentScore, selectBestSegments, getDefaultAnalysis) with no
 * I/O, so they are accessed via (pipeline as any) to avoid exposing them
 * in the public API.
 */

import { describe, it, expect, vi } from "vitest";
import { PodcastPipeline } from "@/services/pipeline";
import type { SegmentAnalysis } from "@/lib/db";
import type {
  TranscriptSegment,
  SegmentWithAnalysis,
} from "@/services/pipeline";

// ── Minimal constructor mocks ────────────────────────────────────────────────

const mockTranscription = { transcribe: vi.fn() };
const mockAnalysis = { analyzeSegment: vi.fn() };
const mockReorder = { suggestOrder: vi.fn() };
const mockStorage = {
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  getFileUrl: vi.fn(),
};
const mockDb = {} as any;
const mockForcedAligner = {
  alignSegments: vi.fn(),
  isHealthy: vi.fn(),
};

function makePipeline(): PodcastPipeline {
  return new PodcastPipeline(
    mockTranscription,
    mockAnalysis,
    mockReorder,
    mockStorage,
    mockDb,
    mockForcedAligner
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAnalysis(overrides: Partial<SegmentAnalysis> = {}): SegmentAnalysis {
  return {
    topic: "Test",
    interestScore: 50,
    clarityScore: 50,
    isTangent: false,
    isRepetition: false,
    keyInsight: "test insight",
    dependsOn: [],
    standalone: false,
    hasFactualError: false,
    hasContradiction: false,
    isConfusing: false,
    isIncomplete: false,
    needsRerecord: false,
    ...overrides,
  };
}

function makeSegment(
  start: number,
  end: number,
  text = "segment text"
): TranscriptSegment {
  return { start, end, text };
}

function makeSegmentWithAnalysis(
  startTime: number,
  endTime: number,
  analysis: Partial<SegmentAnalysis> = {}
): SegmentWithAnalysis {
  return {
    id: "",
    startTime,
    endTime,
    text: "segment text",
    analysis: makeAnalysis(analysis),
  };
}

// ── chunkSegments ────────────────────────────────────────────────────────────

describe("PodcastPipeline.chunkSegments", () => {
  const pipeline = makePipeline();
  const chunk = (segments: TranscriptSegment[], min = 30, max = 60) =>
    (pipeline as any).chunkSegments(segments, min, max);

  it("returns an empty array when given no segments", () => {
    expect(chunk([])).toEqual([]);
  });

  it("returns a single-element array for one segment", () => {
    const result = chunk([makeSegment(0, 45)]);
    expect(result).toHaveLength(1);
    expect(result[0].start).toBe(0);
    expect(result[0].end).toBe(45);
  });

  it("merges short segments until the chunk meets minimum duration", () => {
    // Each segment is 10 s — three are needed to reach minDuration=30
    const segs = [makeSegment(0, 10), makeSegment(10, 20), makeSegment(20, 30)];
    const result = chunk(segs, 30, 60);
    expect(result).toHaveLength(1);
    expect(result[0].start).toBe(0);
    expect(result[0].end).toBe(30);
    expect(result[0].text).toBe("segment text segment text segment text");
  });

  it("splits into a new chunk when adding a segment would exceed maxDuration and current meets minDuration", () => {
    // 40-s chunk already meets min=30; adding another 40-s segment would
    // exceed max=60, so it should be split off as a new chunk.
    const segs = [makeSegment(0, 40), makeSegment(40, 80)];
    const result = chunk(segs, 30, 60);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ start: 0, end: 40 });
    expect(result[1]).toMatchObject({ start: 40, end: 80 });
  });

  it("extends current chunk beyond maxDuration when it does not yet meet minDuration", () => {
    // 10-s chunk does not meet min=30; next 40-s segment would exceed max=60
    // but the chunk is extended anyway rather than split.
    const segs = [makeSegment(0, 10), makeSegment(10, 50)];
    const result = chunk(segs, 30, 60);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ start: 0, end: 50 });
  });

  it("preserves and merges word timestamps when segments have them", () => {
    const segs: TranscriptSegment[] = [
      {
        start: 0,
        end: 35,
        text: "hello",
        words: [{ word: "hello", start: 0, end: 1 }],
      },
      {
        start: 35,
        end: 70,
        text: "world",
        words: [{ word: "world", start: 35, end: 36 }],
      },
    ];
    const result = chunk(segs, 30, 60);
    // First segment (35 s) meets min and adding second would exceed max → split
    expect(result).toHaveLength(2);
    expect(result[0].words).toEqual([{ word: "hello", start: 0, end: 1 }]);
    expect(result[1].words).toEqual([{ word: "world", start: 35, end: 36 }]);
  });

  it("concatenates text with a space when merging segments", () => {
    const segs = [makeSegment(0, 20, "foo"), makeSegment(20, 40, "bar")];
    const result = chunk(segs, 30, 60);
    expect(result[0].text).toBe("foo bar");
  });
});

// ── calculateSegmentScore ────────────────────────────────────────────────────

describe("PodcastPipeline.calculateSegmentScore", () => {
  const pipeline = makePipeline();
  const score = (analysis: Partial<SegmentAnalysis>) =>
    (pipeline as any).calculateSegmentScore(makeAnalysis(analysis));

  it("sums interestScore and clarityScore for a clean segment", () => {
    expect(score({ interestScore: 60, clarityScore: 40 })).toBe(100);
  });

  it("treats missing scores as zero", () => {
    expect(
      score({ interestScore: undefined as any, clarityScore: undefined as any })
    ).toBe(0);
  });

  it("deducts 20 for isTangent", () => {
    expect(score({ interestScore: 50, clarityScore: 50, isTangent: true })).toBe(80);
  });

  it("deducts 30 for isRepetition", () => {
    expect(score({ interestScore: 50, clarityScore: 50, isRepetition: true })).toBe(70);
  });

  it("deducts 50 for hasFactualError", () => {
    expect(score({ interestScore: 50, clarityScore: 50, hasFactualError: true })).toBe(50);
  });

  it("deducts 40 for hasContradiction", () => {
    expect(score({ interestScore: 50, clarityScore: 50, hasContradiction: true })).toBe(60);
  });

  it("deducts 25 for isConfusing", () => {
    expect(score({ interestScore: 50, clarityScore: 50, isConfusing: true })).toBe(75);
  });

  it("deducts 15 for isIncomplete", () => {
    expect(score({ interestScore: 50, clarityScore: 50, isIncomplete: true })).toBe(85);
  });

  it("adds 10 bonus for standalone", () => {
    expect(score({ interestScore: 50, clarityScore: 50, standalone: true })).toBe(110);
  });

  it("accumulates multiple penalties and bonuses correctly", () => {
    // 50+50 - 20(tangent) - 30(repetition) + 10(standalone) = 60
    expect(
      score({
        interestScore: 50,
        clarityScore: 50,
        isTangent: true,
        isRepetition: true,
        standalone: true,
      })
    ).toBe(60);
  });
});

// ── selectBestSegments ───────────────────────────────────────────────────────

describe("PodcastPipeline.selectBestSegments", () => {
  const pipeline = makePipeline();
  const select = (segments: SegmentWithAnalysis[], targetDuration: number) =>
    (pipeline as any).selectBestSegments(segments, targetDuration);

  it("returns an empty array when no segments are provided", () => {
    expect(select([], 120)).toEqual([]);
  });

  it("returns segments sorted by score, highest first", () => {
    const segments = [
      makeSegmentWithAnalysis(0, 30, { interestScore: 10, clarityScore: 10 }),
      makeSegmentWithAnalysis(30, 60, { interestScore: 80, clarityScore: 80 }),
      makeSegmentWithAnalysis(60, 90, { interestScore: 50, clarityScore: 50 }),
    ];
    const result = select(segments, 300);
    expect(result[0].analysis.interestScore).toBe(80);
    expect(result[1].analysis.interestScore).toBe(50);
    expect(result[2].analysis.interestScore).toBe(10);
  });

  it("stops selecting once the target duration is reached", () => {
    // Each segment is 30 s; target is 60 s so only the top 2 should be chosen
    const segments = [
      makeSegmentWithAnalysis(0, 30, { interestScore: 90, clarityScore: 0 }),
      makeSegmentWithAnalysis(30, 60, { interestScore: 80, clarityScore: 0 }),
      makeSegmentWithAnalysis(60, 90, { interestScore: 70, clarityScore: 0 }),
    ];
    const result = select(segments, 60);
    expect(result).toHaveLength(2);
  });

  it("returns all segments when their combined duration is below target", () => {
    const segments = [
      makeSegmentWithAnalysis(0, 20),
      makeSegmentWithAnalysis(20, 40),
    ];
    const result = select(segments, 999);
    expect(result).toHaveLength(2);
  });
});

// ── getDefaultAnalysis ───────────────────────────────────────────────────────

describe("PodcastPipeline.getDefaultAnalysis", () => {
  const pipeline = makePipeline();
  const getDefault = () => (pipeline as any).getDefaultAnalysis();

  it("returns a valid SegmentAnalysis object", () => {
    const analysis = getDefault();
    expect(typeof analysis.topic).toBe("string");
    expect(typeof analysis.interestScore).toBe("number");
    expect(typeof analysis.clarityScore).toBe("number");
    expect(analysis.standalone).toBe(true);
    expect(analysis.needsRerecord).toBe(false);
  });

  it("returns consistent values on repeated calls", () => {
    expect(getDefault()).toEqual(getDefault());
  });
});
