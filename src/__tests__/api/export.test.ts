import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock the DB module before importing the route
vi.mock("@/lib/db", () => {
  const mockDb = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  };
  return {
    db: mockDb,
    projects: "projects_table",
    segments: "segments_table",
  };
});

// Mock fluent-ffmpeg to simulate FFmpeg being unavailable in tests
vi.mock("fluent-ffmpeg", () => {
  throw new Error("FFmpeg not available");
});

import { db } from "@/lib/db";

// Helper to build a chainable drizzle-style mock
function buildSelectChain(returnValue: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
    orderBy: vi.fn().mockResolvedValue(returnValue),
    and: vi.fn().mockReturnThis(),
  };
  return chain;
}

function buildUpdateChain() {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };
  return chain;
}

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const INVALID_UUID = "not-a-uuid";

const READY_PROJECT = {
  id: VALID_UUID,
  title: "Test Podcast",
  status: "ready",
  originalAudioUrl: "/audio/test.mp3",
  editedAudioUrl: null,
  userId: null,
  targetDuration: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const EXPORTED_PROJECT = {
  ...READY_PROJECT,
  status: "completed",
  editedAudioUrl: "/exports/edited-123.mp3",
};

const PROCESSING_PROJECT = {
  ...READY_PROJECT,
  status: "processing",
};

const SAMPLE_SEGMENTS = [
  {
    id: "seg-1",
    projectId: VALID_UUID,
    startTime: 0,
    endTime: 30,
    order: 1,
    isSelected: true,
    textCuts: null,
    text: "Hello world",
    speaker: null,
    createdAt: new Date(),
  },
  {
    id: "seg-2",
    projectId: VALID_UUID,
    startTime: 30,
    endTime: 60,
    order: 2,
    isSelected: true,
    textCuts: [{ startTime: 35, endTime: 40, deletedText: "um", wordIndices: [2] }],
    text: "This is segment two",
    speaker: null,
    createdAt: new Date(),
  },
];

describe("Export API", () => {
  let GET: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;
  let POST: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/export/[id]/route");
    GET = module.GET;
    POST = module.POST;
  });

  // ── GET /api/export/[id] ──────────────────────────────────────────────

  describe("GET /api/export/[id]", () => {
    it("returns 400 for invalid UUID", async () => {
      const req = new NextRequest(`http://localhost/api/export/${INVALID_UUID}`);
      const ctx = { params: Promise.resolve({ id: INVALID_UUID }) };

      const res = await GET(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toMatch(/invalid project id/i);
    });

    it("returns 404 when project does not exist", async () => {
      vi.mocked(db.select).mockReturnValue(buildSelectChain([]) as any);

      const req = new NextRequest(`http://localhost/api/export/${VALID_UUID}`);
      const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

      const res = await GET(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toMatch(/not found/i);
    });

    it("returns exported: false when project has not been exported yet", async () => {
      vi.mocked(db.select).mockReturnValue(
        buildSelectChain([READY_PROJECT]) as any
      );

      const req = new NextRequest(`http://localhost/api/export/${VALID_UUID}`);
      const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

      const res = await GET(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.exported).toBe(false);
    });

    it("returns download URL when project has been exported", async () => {
      vi.mocked(db.select).mockReturnValue(
        buildSelectChain([EXPORTED_PROJECT]) as any
      );

      const req = new NextRequest(`http://localhost/api/export/${VALID_UUID}`);
      const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

      const res = await GET(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.exported).toBe(true);
      expect(data.downloadUrl).toBe(EXPORTED_PROJECT.editedAudioUrl);
      expect(data.projectId).toBe(VALID_UUID);
    });
  });

  // ── POST /api/export/[id] ─────────────────────────────────────────────

  describe("POST /api/export/[id]", () => {
    it("returns 400 for invalid UUID", async () => {
      const req = new NextRequest(`http://localhost/api/export/${INVALID_UUID}`, {
        method: "POST",
      });
      const ctx = { params: Promise.resolve({ id: INVALID_UUID }) };

      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toMatch(/invalid project id/i);
    });

    it("returns 404 when project does not exist", async () => {
      vi.mocked(db.select).mockReturnValue(buildSelectChain([]) as any);

      const req = new NextRequest(`http://localhost/api/export/${VALID_UUID}`, {
        method: "POST",
      });
      const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toMatch(/not found/i);
    });

    it("returns 400 when project is still processing", async () => {
      vi.mocked(db.select).mockReturnValue(
        buildSelectChain([PROCESSING_PROJECT]) as any
      );

      const req = new NextRequest(`http://localhost/api/export/${VALID_UUID}`, {
        method: "POST",
      });
      const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toMatch(/not ready/i);
    });

    it("returns 400 when no segments are selected", async () => {
      // First call returns the project, second call returns empty segments
      vi.mocked(db.select)
        .mockReturnValueOnce(buildSelectChain([READY_PROJECT]) as any)
        .mockReturnValueOnce(buildSelectChain([]) as any);

      const req = new NextRequest(`http://localhost/api/export/${VALID_UUID}`, {
        method: "POST",
      });
      const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toMatch(/no segments selected/i);
    });

    it("returns 200 with mock export URL when segments are selected", async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(buildSelectChain([READY_PROJECT]) as any)
        .mockReturnValueOnce(buildSelectChain(SAMPLE_SEGMENTS) as any);

      vi.mocked(db.update).mockReturnValue(buildUpdateChain() as any);

      const req = new NextRequest(`http://localhost/api/export/${VALID_UUID}`, {
        method: "POST",
      });
      const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toMatch(/export completed/i);
      expect(data.downloadUrl).toBeDefined();
      expect(data.projectId).toBe(VALID_UUID);
      expect(data.segmentCount).toBe(SAMPLE_SEGMENTS.length);
    });

    it("includes segment count in successful export response", async () => {
      const threeSegments = [
        ...SAMPLE_SEGMENTS,
        { ...SAMPLE_SEGMENTS[0], id: "seg-3", order: 3, startTime: 60, endTime: 90 },
      ];

      vi.mocked(db.select)
        .mockReturnValueOnce(buildSelectChain([READY_PROJECT]) as any)
        .mockReturnValueOnce(buildSelectChain(threeSegments) as any);

      vi.mocked(db.update).mockReturnValue(buildUpdateChain() as any);

      const req = new NextRequest(`http://localhost/api/export/${VALID_UUID}`, {
        method: "POST",
      });
      const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.segmentCount).toBe(3);
    });

    it("accepts projects with status 'completed' for re-export", async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(buildSelectChain([EXPORTED_PROJECT]) as any)
        .mockReturnValueOnce(buildSelectChain(SAMPLE_SEGMENTS) as any);

      vi.mocked(db.update).mockReturnValue(buildUpdateChain() as any);

      const req = new NextRequest(`http://localhost/api/export/${VALID_UUID}`, {
        method: "POST",
      });
      const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
    });

    it("returns 500 when db.select throws on project lookup", async () => {
      vi.mocked(db.select).mockImplementation(() => {
        throw new Error("DB connection error");
      });

      const req = new NextRequest(`http://localhost/api/export/${VALID_UUID}`, {
        method: "POST",
      });
      const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toMatch(/failed to export/i);
    });

    it("returns 500 when db.select throws on segment lookup", async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(buildSelectChain([READY_PROJECT]) as any)
        .mockImplementationOnce(() => {
          throw new Error("DB segments error");
        });

      const req = new NextRequest(`http://localhost/api/export/${VALID_UUID}`, {
        method: "POST",
      });
      const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toMatch(/failed to export/i);
    });

    it("returns 500 when db.update throws after export generation", async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(buildSelectChain([READY_PROJECT]) as any)
        .mockReturnValueOnce(buildSelectChain(SAMPLE_SEGMENTS) as any);

      vi.mocked(db.update).mockImplementation(() => {
        throw new Error("DB update error");
      });

      const req = new NextRequest(`http://localhost/api/export/${VALID_UUID}`, {
        method: "POST",
      });
      const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toMatch(/failed to export/i);
    });
  });

  describe("GET /api/export/[id] error handling", () => {
    it("returns 500 when db.select throws", async () => {
      vi.mocked(db.select).mockImplementation(() => {
        throw new Error("DB connection error");
      });

      const req = new NextRequest(`http://localhost/api/export/${VALID_UUID}`);
      const ctx = { params: Promise.resolve({ id: VALID_UUID }) };

      const res = await GET(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toMatch(/failed to get export status/i);
    });
  });
});
