import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetProjectFillers,
  mockProcessProjectFillers,
  mockMarkFillersForRemoval,
  mockMarkAllFillersForRemoval,
  mockGetFillerStats,
} = vi.hoisted(() => ({
  mockGetProjectFillers: vi.fn(),
  mockProcessProjectFillers: vi.fn(),
  mockMarkFillersForRemoval: vi.fn(),
  mockMarkAllFillersForRemoval: vi.fn(),
  mockGetFillerStats: vi.fn(),
}));

vi.mock("@/lib/audio/filler-detection", () => ({
  getProjectFillers: mockGetProjectFillers,
  processProjectFillers: mockProcessProjectFillers,
  markFillersForRemoval: mockMarkFillersForRemoval,
  markAllFillersForRemoval: mockMarkAllFillersForRemoval,
  getFillerStats: mockGetFillerStats,
}));

vi.mock("@/lib/db", () => {
  const mockDb = {
    select: vi.fn(),
    update: vi.fn(),
  };
  return { db: mockDb, projects: "projects_table" };
});

vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

import { db } from "@/lib/db";

const PROJECT_ID = "550e8400-e29b-41d4-a716-446655440000";

const SAMPLE_PROJECT = {
  id: PROJECT_ID,
  title: "My Podcast",
  fillerWordsCount: 0,
};

const SAMPLE_PROJECT_WITH_FILLERS = {
  ...SAMPLE_PROJECT,
  fillerWordsCount: 5,
};

const SAMPLE_FILLERS = [
  { id: "f-1", projectId: PROJECT_ID, word: "uh", startTime: 1.0, endTime: 1.2, shouldRemove: false },
  { id: "f-2", projectId: PROJECT_ID, word: "um", startTime: 3.5, endTime: 3.8, shouldRemove: false },
];

const SAMPLE_STATS = { totalCount: 2, markedForRemoval: 0, byWord: { uh: 1, um: 1 } };

function buildSelectChain(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(returnValue),
  };
}

const ctx = { params: Promise.resolve({ id: PROJECT_ID }) };

function makeRequest(method: string, body?: object, url?: string) {
  return new NextRequest(
    url || `http://localhost/api/projects/${PROJECT_ID}/fillers`,
    {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { "Content-Type": "application/json" } : undefined,
    }
  );
}

describe("GET /api/projects/[id]/fillers", () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const module = await import("@/app/api/projects/[id]/fillers/route");
    GET = module.GET;
  });

  it("returns fillers and stats on success", async () => {
    mockGetProjectFillers.mockResolvedValue(SAMPLE_FILLERS);
    mockGetFillerStats.mockResolvedValue(SAMPLE_STATS);

    const res = await GET(makeRequest("GET"), ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.fillers).toEqual(SAMPLE_FILLERS);
    expect(data.stats).toEqual(SAMPLE_STATS);
    expect(mockGetProjectFillers).toHaveBeenCalledWith(PROJECT_ID);
    expect(mockGetFillerStats).toHaveBeenCalledWith(PROJECT_ID);
  });

  it("returns 500 when getProjectFillers throws", async () => {
    mockGetProjectFillers.mockRejectedValue(new Error("DB error"));

    const res = await GET(makeRequest("GET"), ctx);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toMatch(/failed to get fillers/i);
  });
});

describe("POST /api/projects/[id]/fillers", () => {
  let POST: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const module = await import("@/app/api/projects/[id]/fillers/route");
    POST = module.POST;
  });

  it("returns 404 when project not found", async () => {
    vi.mocked(db.select).mockReturnValue(buildSelectChain([]) as any);

    const res = await POST(makeRequest("POST", { language: "en" }), ctx);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toMatch(/project not found/i);
  });

  it("returns cached fillers when already processed and reprocess not set", async () => {
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([SAMPLE_PROJECT_WITH_FILLERS]) as any
    );
    mockGetProjectFillers.mockResolvedValue(SAMPLE_FILLERS);
    mockGetFillerStats.mockResolvedValue(SAMPLE_STATS);

    const res = await POST(makeRequest("POST", { language: "en", reprocess: false }), ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toMatch(/already detected/i);
    expect(data.fillers).toEqual(SAMPLE_FILLERS);
    expect(mockProcessProjectFillers).not.toHaveBeenCalled();
  });

  it("processes fillers even when already processed if reprocess=true", async () => {
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([SAMPLE_PROJECT_WITH_FILLERS]) as any
    );
    mockProcessProjectFillers.mockResolvedValue({
      fillers: SAMPLE_FILLERS,
      stats: { ...SAMPLE_STATS, totalCount: 2 },
    });

    const res = await POST(makeRequest("POST", { language: "en", reprocess: true }), ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toMatch(/detected 2 filler/i);
    expect(mockProcessProjectFillers).toHaveBeenCalledWith(PROJECT_ID, "en");
  });

  it("processes fillers for new project with default language", async () => {
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([SAMPLE_PROJECT]) as any
    );
    mockProcessProjectFillers.mockResolvedValue({
      fillers: SAMPLE_FILLERS,
      stats: { ...SAMPLE_STATS, totalCount: 2 },
    });

    const res = await POST(makeRequest("POST", {}), ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockProcessProjectFillers).toHaveBeenCalledWith(PROJECT_ID, "pt");
  });

  it("returns 500 when processProjectFillers throws", async () => {
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([SAMPLE_PROJECT]) as any
    );
    mockProcessProjectFillers.mockRejectedValue(new Error("Processing error"));

    const res = await POST(makeRequest("POST", { language: "en" }), ctx);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toMatch(/failed to detect fillers/i);
  });
});

describe("PATCH /api/projects/[id]/fillers", () => {
  let PATCH: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const module = await import("@/app/api/projects/[id]/fillers/route");
    PATCH = module.PATCH;
  });

  it("returns 400 when action=remove and fillerIds is missing", async () => {
    const res = await PATCH(makeRequest("PATCH", { action: "remove" }), ctx);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/fillerIds required/i);
  });

  it("returns 400 when action=keep and fillerIds is empty", async () => {
    const res = await PATCH(makeRequest("PATCH", { action: "keep", fillerIds: [] }), ctx);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/fillerIds required/i);
  });

  it("marks fillers for removal on action=remove", async () => {
    mockMarkFillersForRemoval.mockResolvedValue(undefined);
    mockGetFillerStats.mockResolvedValue(SAMPLE_STATS);

    const res = await PATCH(
      makeRequest("PATCH", { action: "remove", fillerIds: ["f-1", "f-2"] }),
      ctx
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockMarkFillersForRemoval).toHaveBeenCalledWith(["f-1", "f-2"], true);
  });

  it("unmarks fillers for removal on action=keep", async () => {
    mockMarkFillersForRemoval.mockResolvedValue(undefined);
    mockGetFillerStats.mockResolvedValue(SAMPLE_STATS);

    const res = await PATCH(
      makeRequest("PATCH", { action: "keep", fillerIds: ["f-1"] }),
      ctx
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockMarkFillersForRemoval).toHaveBeenCalledWith(["f-1"], false);
  });

  it("removes all fillers above confidence threshold on action=remove_all", async () => {
    mockMarkAllFillersForRemoval.mockResolvedValue(5);
    mockGetFillerStats.mockResolvedValue({ ...SAMPLE_STATS, markedForRemoval: 5 });

    const res = await PATCH(
      makeRequest("PATCH", { action: "remove_all", minConfidence: 0.8 }),
      ctx
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.removedCount).toBe(5);
    expect(data.message).toMatch(/marked 5 fillers/i);
    expect(mockMarkAllFillersForRemoval).toHaveBeenCalledWith(PROJECT_ID, 0.8);
  });

  it("returns 500 when markFillersForRemoval throws", async () => {
    mockMarkFillersForRemoval.mockRejectedValue(new Error("DB error"));

    const res = await PATCH(
      makeRequest("PATCH", { action: "remove", fillerIds: ["f-1"] }),
      ctx
    );
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toMatch(/failed to mark fillers/i);
  });
});
