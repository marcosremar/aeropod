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

vi.mock("@/lib/search/semantic-search", () => ({
  quickSearch: vi.fn(),
  hybridSearch: vi.fn(),
}));

import { db } from "@/lib/db";
import { quickSearch, hybridSearch } from "@/lib/search/semantic-search";

function buildSelectChain(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(returnValue),
  };
}

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const INVALID_UUID = "not-a-uuid";

const SAMPLE_SEGMENTS = [
  {
    id: "seg-1",
    projectId: VALID_UUID,
    text: "Welcome to the show",
    topic: "intro",
    startTime: 0,
    endTime: 10,
    isSelected: true,
    interestScore: 0.9,
  },
  {
    id: "seg-2",
    projectId: VALID_UUID,
    text: "Today we discuss AI",
    topic: "main",
    startTime: 10,
    endTime: 30,
    isSelected: true,
    interestScore: 0.85,
  },
];

const SAMPLE_SEARCH_RESULTS = [
  { segment: SAMPLE_SEGMENTS[0], score: 0.95 },
  { segment: SAMPLE_SEGMENTS[1], score: 0.80 },
];

describe("POST /api/projects/[id]/search", () => {
  let POST: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/projects/[id]/search/route");
    POST = module.POST;
  });

  function makeRequest(body: Record<string, unknown>, projectId = VALID_UUID) {
    return new NextRequest(`http://localhost/api/projects/${projectId}/search`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  it("returns 400 when query is missing", async () => {
    const req = makeRequest({});
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

    const res = await POST(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Query is required");
  });

  it("returns 400 when query is not a string", async () => {
    const req = makeRequest({ query: 123 });
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

    const res = await POST(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Query is required");
  });

  it("returns 400 for an invalid project UUID", async () => {
    const req = makeRequest({ query: "AI topics" }, INVALID_UUID);
    const ctx = { params: Promise.resolve({ id: INVALID_UUID }) };

    const res = await POST(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid project ID format");
  });

  it("returns empty results when project has no segments", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      buildSelectChain([])
    );

    const req = makeRequest({ query: "intro" });
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

    const res = await POST(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.results).toEqual([]);
    expect(data.totalSegments).toBe(0);
    expect(data.query).toBe("intro");
  });

  it("uses quickSearch by default (no mode specified)", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      buildSelectChain(SAMPLE_SEGMENTS)
    );
    (quickSearch as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_SEARCH_RESULTS);

    const req = makeRequest({ query: "AI" });
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

    const res = await POST(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(quickSearch).toHaveBeenCalledWith("AI", SAMPLE_SEGMENTS, 10);
    expect(hybridSearch).not.toHaveBeenCalled();
    expect(data.mode).toBe("quick");
  });

  it("uses quickSearch when mode is 'quick'", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      buildSelectChain(SAMPLE_SEGMENTS)
    );
    (quickSearch as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_SEARCH_RESULTS);

    const req = makeRequest({ query: "welcome", mode: "quick" });
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    expect(quickSearch).toHaveBeenCalled();
    expect(hybridSearch).not.toHaveBeenCalled();
  });

  it("uses hybridSearch when mode is 'full'", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      buildSelectChain(SAMPLE_SEGMENTS)
    );
    (hybridSearch as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_SEARCH_RESULTS);

    const req = makeRequest({ query: "AI topics", mode: "full" });
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    expect(hybridSearch).toHaveBeenCalled();
    expect(quickSearch).not.toHaveBeenCalled();
  });

  it("respects a custom topK parameter", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      buildSelectChain(SAMPLE_SEGMENTS)
    );
    (quickSearch as ReturnType<typeof vi.fn>).mockResolvedValue([SAMPLE_SEARCH_RESULTS[0]]);

    const req = makeRequest({ query: "intro", topK: 1 });
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

    await POST(req, ctx);

    expect(quickSearch).toHaveBeenCalledWith("intro", SAMPLE_SEGMENTS, 1);
  });

  it("returns correctly shaped result objects", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      buildSelectChain(SAMPLE_SEGMENTS)
    );
    (quickSearch as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_SEARCH_RESULTS);

    const req = makeRequest({ query: "show" });
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

    const res = await POST(req, ctx);
    const data = await res.json();

    expect(data.results).toHaveLength(2);
    expect(data.results[0]).toMatchObject({
      segmentId: "seg-1",
      text: "Welcome to the show",
      startTime: 0,
      endTime: 10,
      topic: "intro",
      score: 0.95,
    });
    expect(data.totalSegments).toBe(2);
    expect(data.query).toBe("show");
  });

  it("returns 500 when an unexpected error occurs", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("DB connection failed");
    });

    const req = makeRequest({ query: "crash" });
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

    const res = await POST(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe("Search failed");
  });
});
