/**
 * Unit tests for the database-dependent functions in filler-detection.ts:
 *   getFillerStats, processProjectFillers, markAllFillersForRemoval,
 *   saveFillers, getProjectFillers, getSegmentFillers, markFillersForRemoval
 *
 * Only @/lib/db is mocked (to avoid a real DB connection). drizzle-orm and
 * @/lib/db/schema are intentionally NOT mocked — the schema uses drizzle-orm
 * internals and works fine without a connection, and real eq/and/gte just
 * produce SQL expressions that the mocked db chain ignores.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FillerWord } from "@/lib/db/schema";

// ── hoisted mock references ────────────────────────────────────────────────

const {
  mockDbSelect,
  mockDbInsert,
  mockDbUpdate,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
  },
}));

// ── import after mocks ─────────────────────────────────────────────────────

import {
  getFillerStats,
  processProjectFillers,
  markAllFillersForRemoval,
  saveFillers,
  getProjectFillers,
  getSegmentFillers,
  markFillersForRemoval,
} from "@/lib/audio/filler-detection";

// ── helpers ────────────────────────────────────────────────────────────────

function makeFillerWord(overrides: Partial<FillerWord> = {}): FillerWord {
  return {
    id: "fw-1",
    projectId: "proj-1",
    segmentId: "seg-1",
    word: "hum",
    startTime: 1.0,
    endTime: 1.3,
    confidence: 0.9,
    isRemoved: false,
    createdAt: new Date(),
    ...overrides,
  };
}

/** Build a chainable drizzle-like select chain that resolves at .orderBy() */
function makeSelectChainOrderBy(returnValue: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => Promise.resolve(returnValue));
  return chain;
}

/** Build a chainable drizzle-like select chain that resolves at .where() */
function makeSelectChainWhere(returnValue: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => Promise.resolve(returnValue));
  return chain;
}

/** Build a chainable drizzle-like update chain */
function makeUpdateChain(returnValue: unknown[] = []) {
  const chain: Record<string, unknown> = {};
  chain.set = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.returning = vi.fn(() => Promise.resolve(returnValue));
  return chain;
}

/** Build a chainable drizzle-like insert chain that resolves at .returning() */
function makeInsertChain(returnValue: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.values = vi.fn(() => chain);
  chain.returning = vi.fn(() => Promise.resolve(returnValue));
  return chain;
}

// ── getProjectFillers ──────────────────────────────────────────────────────

describe("getProjectFillers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty array when project has no fillers", async () => {
    mockDbSelect.mockReturnValue(makeSelectChainOrderBy([]));
    const result = await getProjectFillers("proj-1");
    expect(result).toEqual([]);
  });

  it("returns fillers ordered by the DB query", async () => {
    const fillers = [makeFillerWord({ id: "fw-1" }), makeFillerWord({ id: "fw-2", startTime: 2.0 })];
    mockDbSelect.mockReturnValue(makeSelectChainOrderBy(fillers));
    const result = await getProjectFillers("proj-1");
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("fw-1");
    expect(result[1].id).toBe("fw-2");
  });
});

// ── getSegmentFillers ──────────────────────────────────────────────────────

describe("getSegmentFillers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty array when segment has no fillers", async () => {
    mockDbSelect.mockReturnValue(makeSelectChainOrderBy([]));
    const result = await getSegmentFillers("seg-1");
    expect(result).toEqual([]);
  });

  it("returns fillers for the given segment", async () => {
    const fillers = [makeFillerWord({ segmentId: "seg-1" })];
    mockDbSelect.mockReturnValue(makeSelectChainOrderBy(fillers));
    const result = await getSegmentFillers("seg-1");
    expect(result).toHaveLength(1);
    expect(result[0].segmentId).toBe("seg-1");
  });
});

// ── getFillerStats ─────────────────────────────────────────────────────────

describe("getFillerStats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns zero stats when project has no fillers", async () => {
    mockDbSelect.mockReturnValue(makeSelectChainOrderBy([]));
    const stats = await getFillerStats("proj-1");
    expect(stats).toEqual({ totalCount: 0, removedCount: 0, timeSaved: 0, byType: {} });
  });

  it("counts totalCount from all fillers", async () => {
    const fillers = [
      makeFillerWord({ word: "hum", isRemoved: false }),
      makeFillerWord({ id: "fw-2", word: "tipo", isRemoved: false }),
    ];
    mockDbSelect.mockReturnValue(makeSelectChainOrderBy(fillers));
    const stats = await getFillerStats("proj-1");
    expect(stats.totalCount).toBe(2);
  });

  it("counts removedCount only for fillers with isRemoved=true", async () => {
    const fillers = [
      makeFillerWord({ id: "fw-1", isRemoved: true }),
      makeFillerWord({ id: "fw-2", isRemoved: false }),
      makeFillerWord({ id: "fw-3", isRemoved: true }),
    ];
    mockDbSelect.mockReturnValue(makeSelectChainOrderBy(fillers));
    const stats = await getFillerStats("proj-1");
    expect(stats.removedCount).toBe(2);
  });

  it("accumulates timeSaved from isRemoved=true fillers only", async () => {
    const fillers = [
      makeFillerWord({ id: "fw-1", startTime: 1.0, endTime: 1.4, isRemoved: true }),  // 0.4s
      makeFillerWord({ id: "fw-2", startTime: 3.0, endTime: 3.6, isRemoved: false }), // not removed
      makeFillerWord({ id: "fw-3", startTime: 5.0, endTime: 5.2, isRemoved: true }),  // 0.2s
    ];
    mockDbSelect.mockReturnValue(makeSelectChainOrderBy(fillers));
    const stats = await getFillerStats("proj-1");
    expect(stats.timeSaved).toBeCloseTo(0.6);
  });

  it("groups fillers by word in byType", async () => {
    const fillers = [
      makeFillerWord({ id: "fw-1", word: "hum", isRemoved: false }),
      makeFillerWord({ id: "fw-2", word: "tipo", isRemoved: false }),
      makeFillerWord({ id: "fw-3", word: "hum", isRemoved: false }),
    ];
    mockDbSelect.mockReturnValue(makeSelectChainOrderBy(fillers));
    const stats = await getFillerStats("proj-1");
    expect(stats.byType).toEqual({ hum: 2, tipo: 1 });
  });

  it("counts timeSaved as 0 when no fillers are removed", async () => {
    const fillers = [
      makeFillerWord({ id: "fw-1", startTime: 1.0, endTime: 1.5, isRemoved: false }),
    ];
    mockDbSelect.mockReturnValue(makeSelectChainOrderBy(fillers));
    const stats = await getFillerStats("proj-1");
    expect(stats.timeSaved).toBe(0);
    expect(stats.removedCount).toBe(0);
  });

  it("handles a mix of many filler types correctly", async () => {
    const fillers = [
      makeFillerWord({ id: "fw-1", word: "eh", isRemoved: true, startTime: 0, endTime: 0.2 }),
      makeFillerWord({ id: "fw-2", word: "eh", isRemoved: true, startTime: 1, endTime: 1.3 }),
      makeFillerWord({ id: "fw-3", word: "ne", isRemoved: false, startTime: 2, endTime: 2.1 }),
      makeFillerWord({ id: "fw-4", word: "tipo", isRemoved: true, startTime: 3, endTime: 3.5 }),
    ];
    mockDbSelect.mockReturnValue(makeSelectChainOrderBy(fillers));
    const stats = await getFillerStats("proj-1");
    expect(stats.totalCount).toBe(4);
    expect(stats.removedCount).toBe(3);
    expect(stats.timeSaved).toBeCloseTo(0.2 + 0.3 + 0.5);
    expect(stats.byType).toEqual({ eh: 2, ne: 1, tipo: 1 });
  });
});

// ── markFillersForRemoval ──────────────────────────────────────────────────

describe("markFillersForRemoval", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls db.update once per filler ID", async () => {
    mockDbUpdate.mockReturnValue(makeUpdateChain());
    await markFillersForRemoval(["fw-1", "fw-2", "fw-3"]);
    expect(mockDbUpdate).toHaveBeenCalledTimes(3);
  });

  it("does not call db.update when ids array is empty", async () => {
    await markFillersForRemoval([]);
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("sets isRemoved=true by default", async () => {
    const chain = makeUpdateChain();
    mockDbUpdate.mockReturnValue(chain);
    await markFillersForRemoval(["fw-1"]);
    expect(chain.set).toHaveBeenCalledWith({ isRemoved: true });
  });

  it("sets isRemoved=false when remove=false", async () => {
    const chain = makeUpdateChain();
    mockDbUpdate.mockReturnValue(chain);
    await markFillersForRemoval(["fw-1"], false);
    expect(chain.set).toHaveBeenCalledWith({ isRemoved: false });
  });
});

// ── markAllFillersForRemoval ───────────────────────────────────────────────

describe("markAllFillersForRemoval", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the count of updated fillers", async () => {
    // First update: markAllFillersForRemoval's bulk update (has .returning())
    const markChain = makeUpdateChain([{ id: "fw-1" }, { id: "fw-2" }]);
    // Second update: updateProjectFillerStats project stats update (no .returning())
    const statsUpdateChain = makeUpdateChain();
    mockDbUpdate
      .mockReturnValueOnce(markChain)
      .mockReturnValueOnce(statsUpdateChain);
    // getProjectFillers inside updateProjectFillerStats
    mockDbSelect.mockReturnValue(makeSelectChainOrderBy([]));

    const count = await markAllFillersForRemoval("proj-1", 0.7);
    expect(count).toBe(2);
  });

  it("returns 0 when no fillers match the confidence threshold", async () => {
    const markChain = makeUpdateChain([]);
    const statsUpdateChain = makeUpdateChain();
    mockDbUpdate
      .mockReturnValueOnce(markChain)
      .mockReturnValueOnce(statsUpdateChain);
    mockDbSelect.mockReturnValue(makeSelectChainOrderBy([]));

    const count = await markAllFillersForRemoval("proj-1", 0.9);
    expect(count).toBe(0);
  });

  it("triggers updateProjectFillerStats (calls select + update) after marking", async () => {
    const markChain = makeUpdateChain([{ id: "fw-1" }]);
    const statsUpdateChain = makeUpdateChain();
    mockDbUpdate
      .mockReturnValueOnce(markChain)
      .mockReturnValueOnce(statsUpdateChain);
    mockDbSelect.mockReturnValue(makeSelectChainOrderBy([]));

    await markAllFillersForRemoval("proj-1", 0.8);

    // Two db.update calls: one for fillerWords, one for project stats
    expect(mockDbUpdate).toHaveBeenCalledTimes(2);
    // One db.select call for getProjectFillers inside getFillerStats
    expect(mockDbSelect).toHaveBeenCalledTimes(1);
  });
});

// ── saveFillers ────────────────────────────────────────────────────────────

describe("saveFillers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty array immediately when fillers list is empty", async () => {
    const result = await saveFillers("proj-1", "seg-1", []);
    expect(result).toEqual([]);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("inserts each filler with isRemoved=false", async () => {
    const insertChain = makeInsertChain([makeFillerWord()]);
    mockDbInsert.mockReturnValueOnce(insertChain);
    // updateProjectFillerStats: select stats + update project
    mockDbSelect.mockReturnValue(makeSelectChainOrderBy([]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    await saveFillers("proj-1", "seg-1", [
      { word: "hum", startTime: 1.0, endTime: 1.3, confidence: 0.9, segmentId: "seg-1" },
    ]);

    expect(insertChain.values).toHaveBeenCalledWith([
      expect.objectContaining({ word: "hum", isRemoved: false, projectId: "proj-1", segmentId: "seg-1" }),
    ]);
  });

  it("returns the inserted records from the database", async () => {
    const inserted = [makeFillerWord({ id: "new-fw" })];
    const insertChain = makeInsertChain(inserted);
    mockDbInsert.mockReturnValueOnce(insertChain);
    mockDbSelect.mockReturnValue(makeSelectChainOrderBy([]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    const result = await saveFillers("proj-1", "seg-1", [
      { word: "tipo", startTime: 2.0, endTime: 2.2, confidence: 0.8, segmentId: "seg-1" },
    ]);

    expect(result).toEqual(inserted);
  });

  it("inserts multiple fillers in a single db.insert call", async () => {
    const insertChain = makeInsertChain([makeFillerWord(), makeFillerWord({ id: "fw-2", word: "ne" })]);
    mockDbInsert.mockReturnValueOnce(insertChain);
    mockDbSelect.mockReturnValue(makeSelectChainOrderBy([]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    await saveFillers("proj-1", "seg-1", [
      { word: "hum", startTime: 1.0, endTime: 1.3, confidence: 0.9, segmentId: "seg-1" },
      { word: "ne", startTime: 3.0, endTime: 3.1, confidence: 0.85, segmentId: "seg-1" },
    ]);

    expect(mockDbInsert).toHaveBeenCalledTimes(1);
    expect(insertChain.values).toHaveBeenCalledWith([
      expect.objectContaining({ word: "hum" }),
      expect.objectContaining({ word: "ne" }),
    ]);
  });
});

// ── processProjectFillers ──────────────────────────────────────────────────

describe("processProjectFillers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty fillers and zero stats when project has no segments", async () => {
    // Segments select (resolves at .where())
    mockDbSelect.mockReturnValueOnce(makeSelectChainWhere([]));
    // getFillerStats select at end of function (resolves at .orderBy())
    mockDbSelect.mockReturnValueOnce(makeSelectChainOrderBy([]));
    // updateProjectFillerStats project update (no segments → no saveFillers → only the final stats call)
    // Actually: no saveFillers called since no segments, so only the final getFillerStats → getProjectFillers
    // But wait — processProjectFillers calls getFillerStats at the end ALWAYS:
    //   const stats = await getFillerStats(projectId);
    // And getFillerStats → getProjectFillers → db.select()...orderBy()
    // Then updateProjectFillerStats is NOT called here (only called inside saveFillers)
    // So: 1 select for segments + 1 select for final stats = 2 selects total

    const result = await processProjectFillers("proj-1");

    expect(result.fillers).toEqual([]);
    expect(result.stats.totalCount).toBe(0);
  });

  it("skips segments that have no wordTimestamps", async () => {
    const segWithoutTimestamps = { id: "seg-1", projectId: "proj-1", wordTimestamps: null };
    // Segments select
    mockDbSelect.mockReturnValueOnce(makeSelectChainWhere([segWithoutTimestamps]));
    // Final stats select
    mockDbSelect.mockReturnValueOnce(makeSelectChainOrderBy([]));

    const result = await processProjectFillers("proj-1");

    expect(result.fillers).toEqual([]);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("detects Portuguese filler words from segments with wordTimestamps", async () => {
    // "tipo" and "hum" are valid Portuguese fillers
    const wordTimestamps = [
      { word: "tipo", start: 1.0, end: 1.2 },
      { word: "hello", start: 1.5, end: 1.9 },
    ];
    const segment = { id: "seg-1", projectId: "proj-1", wordTimestamps };

    // Segments select
    mockDbSelect.mockReturnValueOnce(makeSelectChainWhere([segment]));
    // saveFillers: insert
    const insertChain = makeInsertChain([makeFillerWord({ word: "tipo" })]);
    mockDbInsert.mockReturnValueOnce(insertChain);
    // saveFillers → updateProjectFillerStats → getFillerStats → select
    mockDbSelect.mockReturnValueOnce(makeSelectChainOrderBy([]));
    // saveFillers → updateProjectFillerStats → update projects
    mockDbUpdate.mockReturnValueOnce(makeUpdateChain());
    // Final getFillerStats select
    mockDbSelect.mockReturnValueOnce(makeSelectChainOrderBy([]));

    const result = await processProjectFillers("proj-1", "pt");

    expect(result.fillers.length).toBeGreaterThan(0);
    expect(result.fillers[0].word).toBe("tipo");
    expect(result.fillers[0].segmentId).toBe("seg-1");
  });

  it("sets segmentId on detected fillers", async () => {
    const wordTimestamps = [{ word: "um", start: 0.5, end: 0.7 }]; // "um" is English filler
    const segment = { id: "seg-42", projectId: "proj-1", wordTimestamps };

    mockDbSelect.mockReturnValueOnce(makeSelectChainWhere([segment]));
    const insertChain = makeInsertChain([]);
    mockDbInsert.mockReturnValueOnce(insertChain);
    // updateProjectFillerStats
    mockDbSelect.mockReturnValueOnce(makeSelectChainOrderBy([]));
    mockDbUpdate.mockReturnValueOnce(makeUpdateChain());
    // Final stats
    mockDbSelect.mockReturnValueOnce(makeSelectChainOrderBy([]));

    const result = await processProjectFillers("proj-1", "en");

    expect(result.fillers.length).toBeGreaterThan(0);
    for (const filler of result.fillers) {
      expect(filler.segmentId).toBe("seg-42");
    }
  });

  it("defaults language to 'pt' when not provided", async () => {
    // "tipo" is a Portuguese filler; it must be detected in default (pt) mode
    const wordTimestamps = [{ word: "tipo", start: 1.0, end: 1.2 }];
    const segment = { id: "seg-1", projectId: "proj-1", wordTimestamps };

    mockDbSelect.mockReturnValueOnce(makeSelectChainWhere([segment]));
    mockDbInsert.mockReturnValueOnce(makeInsertChain([]));
    mockDbSelect.mockReturnValueOnce(makeSelectChainOrderBy([]));
    mockDbUpdate.mockReturnValueOnce(makeUpdateChain());
    mockDbSelect.mockReturnValueOnce(makeSelectChainOrderBy([]));

    const result = await processProjectFillers("proj-1"); // no language arg

    expect(result.fillers.some((f) => f.word === "tipo")).toBe(true);
  });

  it("aggregates fillers across multiple segments", async () => {
    // Use confirmed Portuguese fillers for both segments
    const seg1 = {
      id: "seg-1", projectId: "proj-1",
      wordTimestamps: [{ word: "tipo", start: 1.0, end: 1.3 }],
    };
    const seg2 = {
      id: "seg-2", projectId: "proj-1",
      wordTimestamps: [{ word: "hum", start: 5.0, end: 5.2 }],
    };

    // Segments select
    mockDbSelect.mockReturnValueOnce(makeSelectChainWhere([seg1, seg2]));
    // saveFillers for seg1: insert + stats select + project update
    mockDbInsert.mockReturnValueOnce(makeInsertChain([]));
    mockDbSelect.mockReturnValueOnce(makeSelectChainOrderBy([]));
    mockDbUpdate.mockReturnValueOnce(makeUpdateChain());
    // saveFillers for seg2: insert + stats select + project update
    mockDbInsert.mockReturnValueOnce(makeInsertChain([]));
    mockDbSelect.mockReturnValueOnce(makeSelectChainOrderBy([]));
    mockDbUpdate.mockReturnValueOnce(makeUpdateChain());
    // final getFillerStats select
    mockDbSelect.mockReturnValueOnce(makeSelectChainOrderBy([]));

    const result = await processProjectFillers("proj-1");

    expect(result.fillers).toHaveLength(2);
    const segIds = result.fillers.map((f) => f.segmentId);
    expect(segIds).toContain("seg-1");
    expect(segIds).toContain("seg-2");
  });
});
