/**
 * Unit tests for SemanticSearchService (src/lib/ai/semantic-search.ts).
 * All network calls are intercepted via vi.stubGlobal('fetch').
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SemanticSearchService,
  getSemanticSearchService,
  type SegmentWithEmbedding,
} from "@/lib/ai/semantic-search";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockFetchOk(body: unknown): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

function mockFetchFail(status = 500, text = "Internal Server Error"): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: async () => text,
    json: async () => ({ error: text }),
  });
}

function makeEmbedding(seed: number, length = 4): number[] {
  return Array.from({ length }, (_, i) => (i + 1) * seed * 0.1);
}

function makeSegment(
  id: string,
  text: string,
  embedding?: number[],
): SegmentWithEmbedding {
  return { id, text, startTime: 0, endTime: 10, embedding };
}

// ─── Cache management ────────────────────────────────────────────────────────

describe("SemanticSearchService — cache", () => {
  let svc: SemanticSearchService;

  beforeEach(() => {
    svc = new SemanticSearchService({ apiKey: "test-key" });
  });

  it("starts with empty cache", () => {
    expect(svc.getCacheSize()).toBe(0);
  });

  it("clearCache resets size to zero after entries are present", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchOk({ data: [{ embedding: makeEmbedding(1) }] }),
    );
    await svc.generateEmbedding("hello");
    expect(svc.getCacheSize()).toBe(1);
    svc.clearCache();
    expect(svc.getCacheSize()).toBe(0);
    vi.unstubAllGlobals();
  });

  it("getCacheSize increments for each unique text", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({ data: [{ embedding: makeEmbedding(1) }] }),
          text: async () => "",
        }),
    );
    await svc.generateEmbedding("a");
    await svc.generateEmbedding("b");
    expect(svc.getCacheSize()).toBe(2);
    vi.unstubAllGlobals();
  });
});

// ─── generateEmbedding ───────────────────────────────────────────────────────

describe("SemanticSearchService.generateEmbedding", () => {
  let svc: SemanticSearchService;

  beforeEach(() => {
    svc = new SemanticSearchService({ apiKey: "test-key" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns embedding from API and caches it", async () => {
    const embedding = makeEmbedding(2);
    vi.stubGlobal("fetch", mockFetchOk({ data: [{ embedding }] }));

    const result = await svc.generateEmbedding("hello");

    expect(result).toEqual(embedding);
    expect(svc.getCacheSize()).toBe(1);
  });

  it("returns cached embedding without calling fetch again", async () => {
    const embedding = makeEmbedding(3);
    const fetchMock = mockFetchOk({ data: [{ embedding }] });
    vi.stubGlobal("fetch", fetchMock);

    await svc.generateEmbedding("cached-text");
    await svc.generateEmbedding("cached-text"); // second call

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when API response is not ok", async () => {
    vi.stubGlobal("fetch", mockFetchFail(401, "Unauthorized"));

    await expect(svc.generateEmbedding("fail")).rejects.toThrow(
      "Failed to generate embedding",
    );
  });
});

// ─── generateEmbeddings (batch) ──────────────────────────────────────────────

describe("SemanticSearchService.generateEmbeddings", () => {
  let svc: SemanticSearchService;

  beforeEach(() => {
    svc = new SemanticSearchService({ apiKey: "test-key" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches only uncached texts and returns all results", async () => {
    const emb1 = makeEmbedding(1);
    const emb2 = makeEmbedding(2);

    // Pre-cache text1
    vi.stubGlobal("fetch", mockFetchOk({ data: [{ embedding: emb1 }] }));
    await svc.generateEmbedding("text1");
    vi.unstubAllGlobals();

    // Now batch call — only text2 should be fetched
    const fetchMock = mockFetchOk({ data: [{ embedding: emb2 }] });
    vi.stubGlobal("fetch", fetchMock);

    const results = await svc.generateEmbeddings(["text1", "text2"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ text: "text1", embedding: emb1 });
    expect(results[1]).toEqual({ text: "text2", embedding: emb2 });
  });

  it("skips network call when all texts are already cached", async () => {
    const emb = makeEmbedding(1);
    vi.stubGlobal("fetch", mockFetchOk({ data: [{ embedding: emb }] }));
    await svc.generateEmbedding("already-cached");
    vi.unstubAllGlobals();

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const results = await svc.generateEmbeddings(["already-cached"]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(results[0].embedding).toEqual(emb);
  });

  it("throws when API response is not ok", async () => {
    vi.stubGlobal("fetch", mockFetchFail(403, "Forbidden"));

    await expect(svc.generateEmbeddings(["x"])).rejects.toThrow(
      "Failed to generate embeddings",
    );
  });

  it("returns empty array for empty input without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const results = await svc.generateEmbeddings([]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });
});

// ─── search ──────────────────────────────────────────────────────────────────

describe("SemanticSearchService.search", () => {
  let svc: SemanticSearchService;

  beforeEach(() => {
    svc = new SemanticSearchService({ apiKey: "test-key" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns results sorted by cosine similarity when segments have embeddings", async () => {
    // Query embedding: [1,0,0,0]
    const queryEmbedding = [1, 0, 0, 0];
    vi.stubGlobal("fetch", mockFetchOk({ data: [{ embedding: queryEmbedding }] }));

    const segments: SegmentWithEmbedding[] = [
      makeSegment("a", "segment A", [0.9, 0.1, 0, 0]),   // high similarity
      makeSegment("b", "segment B", [0.1, 0.9, 0, 0]),   // low similarity
      makeSegment("c", "segment C", [0.8, 0.2, 0, 0]),   // medium similarity
    ];

    const results = await svc.search("query", segments, { minScore: 0 });

    expect(results[0].id).toBe("a");
    expect(results[1].id).toBe("c");
    expect(results[2].id).toBe("b");
  });

  it("filters out segments with score below minScore", async () => {
    const queryEmbedding = [1, 0, 0, 0];
    vi.stubGlobal("fetch", mockFetchOk({ data: [{ embedding: queryEmbedding }] }));

    const segments: SegmentWithEmbedding[] = [
      makeSegment("high", "H", [1, 0, 0, 0]),   // score ~1.0
      makeSegment("low", "L", [0, 1, 0, 0]),    // score 0 (orthogonal)
    ];

    const results = await svc.search("q", segments, { minScore: 0.5 });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("high");
  });

  it("respects topK limit", async () => {
    const queryEmbedding = [1, 0, 0, 0];
    vi.stubGlobal("fetch", mockFetchOk({ data: [{ embedding: queryEmbedding }] }));

    const segments: SegmentWithEmbedding[] = Array.from({ length: 10 }, (_, i) =>
      makeSegment(`seg${i}`, `text ${i}`, [1, 0, 0, 0]),
    );

    const results = await svc.search("q", segments, { topK: 3, minScore: 0 });

    expect(results).toHaveLength(3);
  });

  it("returns empty array when no segments match minScore", async () => {
    const queryEmbedding = [1, 0, 0, 0];
    vi.stubGlobal("fetch", mockFetchOk({ data: [{ embedding: queryEmbedding }] }));

    const segments: SegmentWithEmbedding[] = [
      makeSegment("a", "A", [0, 1, 0, 0]), // orthogonal, score 0
    ];

    const results = await svc.search("q", segments, { minScore: 0.5 });

    expect(results).toHaveLength(0);
  });

  it("populates missing embeddings by calling generateEmbeddings", async () => {
    const queryEmb = [1, 0, 0, 0];
    const segEmb = [1, 0, 0, 0];

    const fetchMock = vi
      .fn()
      // first call: query embedding
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ embedding: queryEmb }] }),
        text: async () => "",
      })
      // second call: segment batch embedding
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ embedding: segEmb }] }),
        text: async () => "",
      });
    vi.stubGlobal("fetch", fetchMock);

    const segments: SegmentWithEmbedding[] = [
      makeSegment("x", "needs embedding"), // no embedding provided
    ];

    const results = await svc.search("query", segments, { minScore: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("x");
  });

  it("includes topic and timing metadata in each result", async () => {
    const queryEmbedding = [1, 0, 0, 0];
    vi.stubGlobal("fetch", mockFetchOk({ data: [{ embedding: queryEmbedding }] }));

    const segments: SegmentWithEmbedding[] = [
      {
        id: "m",
        text: "meta segment",
        startTime: 30,
        endTime: 60,
        topic: "intro",
        embedding: [1, 0, 0, 0],
      },
    ];

    const results = await svc.search("q", segments, { minScore: 0 });

    expect(results[0].metadata).toMatchObject({
      topic: "intro",
      startTime: 30,
      endTime: 60,
    });
  });
});

// ─── getSemanticSearchService singleton ──────────────────────────────────────

describe("getSemanticSearchService", () => {
  it("returns the same instance on repeated calls", () => {
    const a = getSemanticSearchService();
    const b = getSemanticSearchService();
    expect(a).toBe(b);
  });

  it("returns a SemanticSearchService instance", () => {
    expect(getSemanticSearchService()).toBeInstanceOf(SemanticSearchService);
  });
});
