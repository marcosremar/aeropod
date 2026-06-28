import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => {
  const mockDb = {
    select: vi.fn(),
  };
  return {
    db: mockDb,
    segments: "segments_table",
  };
});

vi.mock("@/lib/ai/semantic-search", () => ({
  getSemanticSearchService: vi.fn(),
}));

import { db } from "@/lib/db";
import { getSemanticSearchService } from "@/lib/ai/semantic-search";

function buildSelectChain(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(returnValue),
  };
}

const PROJECT_ID = "550e8400-e29b-41d4-a716-446655440000";

const SAMPLE_SEGMENTS = [
  {
    id: "aabbccdd-1234-5678-abcd-112233445566",
    projectId: PROJECT_ID,
    text: "Welcome to our podcast today",
    topic: "Introduction",
    startTime: 0,
    endTime: 30,
    order: 0,
    isSelected: true,
  },
  {
    id: "aabbccdd-1234-5678-abcd-223344556677",
    projectId: PROJECT_ID,
    text: "We discuss machine learning techniques",
    topic: "Main Topic",
    startTime: 30,
    endTime: 120,
    order: 1,
    isSelected: true,
  },
];

const SAMPLE_SEARCH_RESULTS = [
  {
    id: "aabbccdd-1234-5678-abcd-223344556677",
    text: "We discuss machine learning techniques",
    score: 0.92,
    metadata: {
      topic: "Main Topic",
      startTime: 30,
      endTime: 120,
    },
  },
  {
    id: "aabbccdd-1234-5678-abcd-112233445566",
    text: "Welcome to our podcast today",
    score: 0.71,
    metadata: {
      topic: "Introduction",
      startTime: 0,
      endTime: 30,
    },
  },
];

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/search", () => {
  let mockSearchService: { search: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.resetAllMocks();
    mockSearchService = { search: vi.fn().mockResolvedValue(SAMPLE_SEARCH_RESULTS) };
    (getSemanticSearchService as ReturnType<typeof vi.fn>).mockReturnValue(mockSearchService);
  });

  it("returns 400 when projectId is missing", async () => {
    const { POST } = await import("@/app/api/search/route");
    const req = makeRequest({ query: "machine learning" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/projectId and query are required/i);
  });

  it("returns 400 when query is missing", async () => {
    const { POST } = await import("@/app/api/search/route");
    const req = makeRequest({ projectId: PROJECT_ID });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/projectId and query are required/i);
  });

  it("returns 400 when both projectId and query are missing", async () => {
    const { POST } = await import("@/app/api/search/route");
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/projectId and query are required/i);
  });

  it("returns empty results when project has no segments", async () => {
    const { POST } = await import("@/app/api/search/route");
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain([])
    );
    const req = makeRequest({ projectId: PROJECT_ID, query: "machine learning" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  it("returns search results on success", async () => {
    const { POST } = await import("@/app/api/search/route");
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain(SAMPLE_SEGMENTS)
    );
    const req = makeRequest({ projectId: PROJECT_ID, query: "machine learning" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(2);
    expect(body.results[0]).toMatchObject({
      id: "aabbccdd-1234-5678-abcd-223344556677",
      text: "We discuss machine learning techniques",
      score: 0.92,
      topic: "Main Topic",
      startTime: 30,
      endTime: 120,
    });
  });

  it("passes correct segment shape to the search service", async () => {
    const { POST } = await import("@/app/api/search/route");
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain(SAMPLE_SEGMENTS)
    );
    const req = makeRequest({ projectId: PROJECT_ID, query: "podcast intro" });
    await POST(req);
    expect(mockSearchService.search).toHaveBeenCalledWith(
      "podcast intro",
      expect.arrayContaining([
        expect.objectContaining({ id: SAMPLE_SEGMENTS[0].id, text: SAMPLE_SEGMENTS[0].text }),
        expect.objectContaining({ id: SAMPLE_SEGMENTS[1].id, text: SAMPLE_SEGMENTS[1].text }),
      ]),
      expect.any(Object)
    );
  });

  it("uses useRerank=true when topK <= 5", async () => {
    const { POST } = await import("@/app/api/search/route");
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain(SAMPLE_SEGMENTS)
    );
    const req = makeRequest({ projectId: PROJECT_ID, query: "intro", topK: 3 });
    await POST(req);
    expect(mockSearchService.search).toHaveBeenCalledWith(
      "intro",
      expect.any(Array),
      { topK: 3, useRerank: true }
    );
  });

  it("uses useRerank=false when topK > 5", async () => {
    const { POST } = await import("@/app/api/search/route");
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain(SAMPLE_SEGMENTS)
    );
    const req = makeRequest({ projectId: PROJECT_ID, query: "podcast", topK: 10 });
    await POST(req);
    expect(mockSearchService.search).toHaveBeenCalledWith(
      "podcast",
      expect.any(Array),
      { topK: 10, useRerank: false }
    );
  });

  it("defaults topK to 10 when not provided", async () => {
    const { POST } = await import("@/app/api/search/route");
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain(SAMPLE_SEGMENTS)
    );
    const req = makeRequest({ projectId: PROJECT_ID, query: "machine learning" });
    await POST(req);
    expect(mockSearchService.search).toHaveBeenCalledWith(
      "machine learning",
      expect.any(Array),
      { topK: 10, useRerank: false }
    );
  });

  it("maps result fields correctly including null topic", async () => {
    const { POST } = await import("@/app/api/search/route");
    const resultsWithNullTopic = [
      {
        id: "aabbccdd-1234-5678-abcd-112233445566",
        text: "Segment without topic",
        score: 0.85,
        metadata: { topic: undefined, startTime: 0, endTime: 15 },
      },
    ];
    mockSearchService.search.mockResolvedValueOnce(resultsWithNullTopic);
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain(SAMPLE_SEGMENTS)
    );
    const req = makeRequest({ projectId: PROJECT_ID, query: "something" });
    const res = await POST(req);
    const body = await res.json();
    expect(body.results[0].topic).toBeUndefined();
  });

  it("returns 500 when DB throws", async () => {
    const { POST } = await import("@/app/api/search/route");
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockRejectedValue(new Error("DB connection failed")),
    });
    const req = makeRequest({ projectId: PROJECT_ID, query: "podcast" });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/search failed/i);
  });

  it("returns 500 when search service throws", async () => {
    const { POST } = await import("@/app/api/search/route");
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain(SAMPLE_SEGMENTS)
    );
    mockSearchService.search.mockRejectedValueOnce(new Error("Embedding API failed"));
    const req = makeRequest({ projectId: PROJECT_ID, query: "podcast" });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/search failed/i);
  });

  it("returns results with all expected fields", async () => {
    const { POST } = await import("@/app/api/search/route");
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain(SAMPLE_SEGMENTS)
    );
    const req = makeRequest({ projectId: PROJECT_ID, query: "machine learning" });
    const res = await POST(req);
    const body = await res.json();
    for (const result of body.results) {
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("text");
      expect(result).toHaveProperty("score");
      expect(result).toHaveProperty("startTime");
      expect(result).toHaveProperty("endTime");
    }
  });
});
