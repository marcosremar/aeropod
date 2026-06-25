import { describe, it, expect, vi, afterEach } from "vitest";
import {
  SemanticSearchService,
  type SegmentWithEmbedding,
} from "@/lib/ai/semantic-search";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SemanticSearchService", () => {
  it("isConfigured() is true when an API key is provided", () => {
    const svc = new SemanticSearchService({ apiKey: "test-key" });
    expect(svc.isConfigured()).toBe(true);
  });

  it("generateEmbedding fetches and returns the embedding vector", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
      text: async () => "",
    })) as unknown as typeof fetch;

    const svc = new SemanticSearchService({ apiKey: "test-key" });
    const emb = await svc.generateEmbedding("oi");
    expect(emb).toEqual([0.1, 0.2, 0.3]);
  });

  it("ranks segments by cosine similarity to the query", async () => {
    // query embedding = [1,0,0]
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ embedding: [1, 0, 0] }] }),
      text: async () => "",
    })) as unknown as typeof fetch;

    const segments: SegmentWithEmbedding[] = [
      { id: "far", text: "b", startTime: 0, endTime: 1, embedding: [0, 1, 0] }, // score 0
      { id: "near", text: "a", startTime: 1, endTime: 2, embedding: [1, 0, 0] }, // score 1
    ];

    const svc = new SemanticSearchService({ apiKey: "test-key" });
    const results = await svc.search("query", segments, { minScore: 0, topK: 5 });

    expect(results[0].id).toBe("near");
    expect(results[0].score).toBeCloseTo(1, 5);
    // "far" has score 0 and is filtered out by default? minScore=0 keeps >=0
    expect(results.map((r) => r.id)).toContain("near");
  });

  it("filters out results below minScore", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ embedding: [1, 0, 0] }] }),
      text: async () => "",
    })) as unknown as typeof fetch;

    const segments: SegmentWithEmbedding[] = [
      { id: "far", text: "b", startTime: 0, endTime: 1, embedding: [0, 1, 0] },
    ];
    const svc = new SemanticSearchService({ apiKey: "test-key" });
    const results = await svc.search("q", segments, { minScore: 0.5 });
    expect(results).toHaveLength(0);
  });

  it("generateEmbedding throws when the API responds with an error", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({}),
      text: async () => "boom",
    })) as unknown as typeof fetch;

    const svc = new SemanticSearchService({ apiKey: "test-key" });
    await expect(svc.generateEmbedding("x")).rejects.toThrow();
  });
});
