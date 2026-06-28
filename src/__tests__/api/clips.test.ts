import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/clips/social-clip-service", () => ({
  socialClipService: {
    getProjectClips: vi.fn(),
    generateSuggestions: vi.fn(),
    saveClip: vi.fn(),
    deleteClip: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => {
  const mockDb = {
    select: vi.fn(),
  };
  return {
    db: mockDb,
    projects: "projects_table",
    segments: "segments_table",
    socialClips: "social_clips_table",
  };
});

import { db } from "@/lib/db";
import { socialClipService } from "@/lib/clips/social-clip-service";

function buildSelectChain(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(returnValue),
    // for queries that don't call orderBy (project lookup)
    limit: vi.fn().mockResolvedValue(returnValue),
  };
}

function buildProjectChain(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(returnValue),
  };
}

const PROJECT_ID = "550e8400-e29b-41d4-a716-446655440000";

const SAMPLE_PROJECT = {
  id: PROJECT_ID,
  title: "My Podcast",
  status: "ready",
  userId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const SAMPLE_SEGMENTS = [
  {
    id: "seg-1",
    projectId: PROJECT_ID,
    text: "Welcome to the show",
    startTime: 0,
    endTime: 30,
    topic: "intro",
    isSelected: true,
    interestScore: 0.9,
  },
  {
    id: "seg-2",
    projectId: PROJECT_ID,
    text: "Today we discuss AI",
    startTime: 30,
    endTime: 90,
    topic: "main",
    isSelected: true,
    interestScore: 0.85,
  },
];

const SAMPLE_CLIPS = [
  {
    id: "clip-1",
    projectId: PROJECT_ID,
    title: "Intro Clip",
    startTime: 0,
    endTime: 30,
    platform: "twitter",
    createdAt: new Date(),
  },
];

const SAMPLE_SUGGESTIONS = [
  {
    title: "Best AI Moment",
    startTime: 30,
    endTime: 60,
    platform: "twitter",
    reason: "High interest score",
  },
];

type RouteHandler = (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) => Promise<Response>;

describe("Clips API /api/projects/[id]/clips", () => {
  let GET: RouteHandler;
  let POST: RouteHandler;
  let DELETE: RouteHandler;

  const ctx = { params: Promise.resolve({ id: PROJECT_ID }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/projects/[id]/clips/route");
    GET = module.GET;
    POST = module.POST;
    DELETE = module.DELETE;
  });

  // ── GET ──────────────────────────────────────────────────────────────

  describe("GET /api/projects/[id]/clips", () => {
    it("returns clips and count on success", async () => {
      vi.mocked(socialClipService.getProjectClips).mockResolvedValue(SAMPLE_CLIPS as any);

      const req = new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/clips`);
      const res = await GET(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.clips).toHaveLength(1);
      expect(data.count).toBe(1);
      expect(socialClipService.getProjectClips).toHaveBeenCalledWith(PROJECT_ID);
    });

    it("returns empty clips array when project has no clips", async () => {
      vi.mocked(socialClipService.getProjectClips).mockResolvedValue([]);

      const req = new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/clips`);
      const res = await GET(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.clips).toEqual([]);
      expect(data.count).toBe(0);
    });

    it("returns 500 when getProjectClips throws", async () => {
      vi.mocked(socialClipService.getProjectClips).mockRejectedValue(new Error("DB error"));

      const req = new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/clips`);
      const res = await GET(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toMatch(/failed to get clips/i);
    });
  });

  // ── POST ─────────────────────────────────────────────────────────────

  describe("POST /api/projects/[id]/clips", () => {
    it("returns 404 when project does not exist", async () => {
      vi.mocked(db.select).mockReturnValue(buildProjectChain([]) as any);

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/clips`,
        { method: "POST", body: JSON.stringify({ count: 3 }) }
      );
      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toMatch(/project not found/i);
    });

    it("returns 400 when project has no segments", async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(buildProjectChain([SAMPLE_PROJECT]) as any)
        .mockReturnValueOnce(buildSelectChain([]) as any);

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/clips`,
        { method: "POST", body: JSON.stringify({ count: 3 }) }
      );
      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toMatch(/no segments available/i);
    });

    it("returns suggestions without saving when save=false", async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(buildProjectChain([SAMPLE_PROJECT]) as any)
        .mockReturnValueOnce(buildSelectChain(SAMPLE_SEGMENTS) as any);
      vi.mocked(socialClipService.generateSuggestions).mockResolvedValue(
        SAMPLE_SUGGESTIONS as any
      );

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/clips`,
        { method: "POST", body: JSON.stringify({ count: 1, save: false }) }
      );
      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.suggestions).toHaveLength(1);
      expect(data.saved).toBe(false);
      expect(data.savedClips).toBeUndefined();
      expect(socialClipService.saveClip).not.toHaveBeenCalled();
    });

    it("saves clips and returns savedClips when save=true", async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(buildProjectChain([SAMPLE_PROJECT]) as any)
        .mockReturnValueOnce(buildSelectChain(SAMPLE_SEGMENTS) as any);
      vi.mocked(socialClipService.generateSuggestions).mockResolvedValue(
        SAMPLE_SUGGESTIONS as any
      );
      vi.mocked(socialClipService.saveClip).mockResolvedValue(SAMPLE_CLIPS[0] as any);

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/clips`,
        { method: "POST", body: JSON.stringify({ count: 1, save: true }) }
      );
      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.saved).toBe(true);
      expect(data.savedClips).toHaveLength(1);
      expect(socialClipService.saveClip).toHaveBeenCalledWith(PROJECT_ID, SAMPLE_SUGGESTIONS[0]);
    });

    it("uses default count of 5 when count is not provided", async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(buildProjectChain([SAMPLE_PROJECT]) as any)
        .mockReturnValueOnce(buildSelectChain(SAMPLE_SEGMENTS) as any);
      vi.mocked(socialClipService.generateSuggestions).mockResolvedValue([]);

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/clips`,
        { method: "POST", body: JSON.stringify({}) }
      );
      const res = await POST(req, ctx);

      expect(res.status).toBe(200);
      expect(socialClipService.generateSuggestions).toHaveBeenCalledWith(
        SAMPLE_SEGMENTS,
        5
      );
    });

    it("returns 500 on unexpected error", async () => {
      vi.mocked(db.select).mockImplementation(() => {
        throw new Error("DB crash");
      });

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/clips`,
        { method: "POST", body: JSON.stringify({ count: 3 }) }
      );
      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toMatch(/failed to generate clips/i);
    });
  });

  // ── DELETE ───────────────────────────────────────────────────────────

  describe("DELETE /api/projects/[id]/clips", () => {
    it("returns 400 when clipId is missing", async () => {
      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/clips`,
        { method: "DELETE" }
      );
      const res = await DELETE(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toMatch(/clipId parameter required/i);
    });

    it("deletes clip and returns success when clipId is provided", async () => {
      vi.mocked(socialClipService.deleteClip).mockResolvedValue(undefined);

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/clips?clipId=clip-1`,
        { method: "DELETE" }
      );
      const res = await DELETE(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toMatch(/deleted/i);
      expect(socialClipService.deleteClip).toHaveBeenCalledWith("clip-1");
    });

    it("returns 500 when deleteClip throws", async () => {
      vi.mocked(socialClipService.deleteClip).mockRejectedValue(new Error("Delete failed"));

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/clips?clipId=clip-1`,
        { method: "DELETE" }
      );
      const res = await DELETE(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toMatch(/failed to delete clip/i);
    });
  });
});
