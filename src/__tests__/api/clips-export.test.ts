import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => {
  const mockDb = {
    select: vi.fn(),
    update: vi.fn(),
  };
  return {
    db: mockDb,
    socialClips: "social_clips_table",
    projects: "projects_table",
  };
});

vi.mock("@/lib/clips/social-clip-service", () => ({
  socialClipService: {
    exportClip: vi.fn(),
  },
}));

import { db } from "@/lib/db";
import { socialClipService } from "@/lib/clips/social-clip-service";

function buildSelectChain(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(returnValue),
  };
}

function buildUpdateChain() {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };
}

const CLIP_ID = "clip-abc-123";

const PENDING_CLIP = {
  id: CLIP_ID,
  projectId: "550e8400-e29b-41d4-a716-446655440000",
  status: "pending",
  clipUrl: null,
  format: null,
  captionsEnabled: false,
  captionStyle: "animated",
  title: "Test Clip",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const READY_CLIP = {
  ...PENDING_CLIP,
  status: "ready",
  clipUrl: "/exports/clips/clip-abc-123-999.mp4",
  format: "9:16",
};

const PROCESSING_CLIP = {
  ...PENDING_CLIP,
  status: "processing",
};

const SAMPLE_PROJECT = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  title: "Test Podcast",
  originalAudioUrl: "/audio/test.mp3",
  status: "ready",
  userId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const PROJECT_NO_AUDIO = {
  ...SAMPLE_PROJECT,
  originalAudioUrl: null,
};

describe("Clips Export API", () => {
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
    const module = await import("@/app/api/clips/[id]/export/route");
    GET = module.GET;
    POST = module.POST;
  });

  // ── GET /api/clips/[id]/export ────────────────────────────────────────

  describe("GET /api/clips/[id]/export", () => {
    it("returns 404 when clip does not exist", async () => {
      vi.mocked(db.select).mockReturnValue(buildSelectChain([]) as any);

      const req = new NextRequest(`http://localhost/api/clips/${CLIP_ID}/export`);
      const ctx = { params: Promise.resolve({ id: CLIP_ID }) };

      const res = await GET(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toMatch(/clip not found/i);
    });

    it("returns status, clipUrl, and format for a ready clip", async () => {
      vi.mocked(db.select).mockReturnValue(buildSelectChain([READY_CLIP]) as any);

      const req = new NextRequest(`http://localhost/api/clips/${CLIP_ID}/export`);
      const ctx = { params: Promise.resolve({ id: CLIP_ID }) };

      const res = await GET(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.status).toBe("ready");
      expect(data.clipUrl).toBe(READY_CLIP.clipUrl);
      expect(data.format).toBe("9:16");
    });

    it("returns status=pending and clipUrl=null for a pending clip", async () => {
      vi.mocked(db.select).mockReturnValue(buildSelectChain([PENDING_CLIP]) as any);

      const req = new NextRequest(`http://localhost/api/clips/${CLIP_ID}/export`);
      const ctx = { params: Promise.resolve({ id: CLIP_ID }) };

      const res = await GET(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe("pending");
      expect(data.clipUrl).toBeNull();
    });

    it("returns status=processing for an in-progress clip", async () => {
      vi.mocked(db.select).mockReturnValue(buildSelectChain([PROCESSING_CLIP]) as any);

      const req = new NextRequest(`http://localhost/api/clips/${CLIP_ID}/export`);
      const ctx = { params: Promise.resolve({ id: CLIP_ID }) };

      const res = await GET(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe("processing");
    });
  });

  // ── POST /api/clips/[id]/export ───────────────────────────────────────

  describe("POST /api/clips/[id]/export", () => {
    it("returns 404 when clip does not exist", async () => {
      vi.mocked(db.select).mockReturnValue(buildSelectChain([]) as any);

      const req = new NextRequest(`http://localhost/api/clips/${CLIP_ID}/export`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const ctx = { params: Promise.resolve({ id: CLIP_ID }) };

      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toMatch(/clip not found/i);
    });

    it("returns 404 when project does not exist", async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(buildSelectChain([PENDING_CLIP]) as any)
        .mockReturnValueOnce(buildSelectChain([]) as any);

      const req = new NextRequest(`http://localhost/api/clips/${CLIP_ID}/export`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const ctx = { params: Promise.resolve({ id: CLIP_ID }) };

      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toMatch(/project audio not found/i);
    });

    it("returns 404 when project has no audio URL", async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(buildSelectChain([PENDING_CLIP]) as any)
        .mockReturnValueOnce(buildSelectChain([PROJECT_NO_AUDIO]) as any);

      const req = new NextRequest(`http://localhost/api/clips/${CLIP_ID}/export`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const ctx = { params: Promise.resolve({ id: CLIP_ID }) };

      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toMatch(/project audio not found/i);
    });

    it("sets clip status to 'processing' before calling exportClip", async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(buildSelectChain([PENDING_CLIP]) as any)
        .mockReturnValueOnce(buildSelectChain([SAMPLE_PROJECT]) as any);

      const updateChain = buildUpdateChain();
      vi.mocked(db.update).mockReturnValue(updateChain as any);
      vi.mocked(socialClipService.exportClip).mockResolvedValue({
        success: true,
        clipUrl: "/exports/clips/clip-abc-123-999.mp4",
        duration: 30,
      });

      const req = new NextRequest(`http://localhost/api/clips/${CLIP_ID}/export`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const ctx = { params: Promise.resolve({ id: CLIP_ID }) };

      await POST(req, ctx);

      const firstUpdateSetCall = vi.mocked(db.update).mock.calls[0];
      expect(firstUpdateSetCall).toBeDefined();
      expect(updateChain.set.mock.calls[0][0]).toEqual({ status: "processing" });
    });

    it("returns 500 and reverts status to 'pending' when export fails", async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(buildSelectChain([PENDING_CLIP]) as any)
        .mockReturnValueOnce(buildSelectChain([SAMPLE_PROJECT]) as any);

      const updateChain = buildUpdateChain();
      vi.mocked(db.update).mockReturnValue(updateChain as any);
      vi.mocked(socialClipService.exportClip).mockResolvedValue({
        success: false,
        clipUrl: "",
        duration: 0,
        error: "FFmpeg error",
      });

      const req = new NextRequest(`http://localhost/api/clips/${CLIP_ID}/export`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const ctx = { params: Promise.resolve({ id: CLIP_ID }) };

      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toMatch(/ffmpeg error/i);

      // second update should revert status to pending
      expect(updateChain.set.mock.calls[1][0]).toEqual({ status: "pending" });
    });

    it("returns 200 with clipUrl and duration on successful export", async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(buildSelectChain([PENDING_CLIP]) as any)
        .mockReturnValueOnce(buildSelectChain([SAMPLE_PROJECT]) as any);

      vi.mocked(db.update).mockReturnValue(buildUpdateChain() as any);
      vi.mocked(socialClipService.exportClip).mockResolvedValue({
        success: true,
        clipUrl: "/exports/clips/clip-abc-123-999.mp4",
        duration: 42,
      });

      const req = new NextRequest(`http://localhost/api/clips/${CLIP_ID}/export`, {
        method: "POST",
        body: JSON.stringify({ format: "1:1", addCaptions: false }),
      });
      const ctx = { params: Promise.resolve({ id: CLIP_ID }) };

      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.clipUrl).toMatch(/\/exports\/clips\//);
      expect(data.duration).toBe(42);
      expect(data.format).toBe("1:1");
    });

    it("uses default format '9:16' when no format is provided", async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(buildSelectChain([PENDING_CLIP]) as any)
        .mockReturnValueOnce(buildSelectChain([SAMPLE_PROJECT]) as any);

      vi.mocked(db.update).mockReturnValue(buildUpdateChain() as any);
      vi.mocked(socialClipService.exportClip).mockResolvedValue({
        success: true,
        clipUrl: "/exports/clips/clip-abc-123-999.mp4",
        duration: 15,
      });

      const req = new NextRequest(`http://localhost/api/clips/${CLIP_ID}/export`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const ctx = { params: Promise.resolve({ id: CLIP_ID }) };

      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.format).toBe("9:16");
    });

    it("returns 500 for invalid format value", async () => {
      const req = new NextRequest(`http://localhost/api/clips/${CLIP_ID}/export`, {
        method: "POST",
        body: JSON.stringify({ format: "invalid" }),
      });
      const ctx = { params: Promise.resolve({ id: CLIP_ID }) };

      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toMatch(/failed to export clip/i);
    });

    it("updates clip status to 'ready' with correct fields on success", async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(buildSelectChain([PENDING_CLIP]) as any)
        .mockReturnValueOnce(buildSelectChain([SAMPLE_PROJECT]) as any);

      const updateChain = buildUpdateChain();
      vi.mocked(db.update).mockReturnValue(updateChain as any);
      vi.mocked(socialClipService.exportClip).mockResolvedValue({
        success: true,
        clipUrl: "/exports/clips/clip-abc-123-999.mp4",
        duration: 20,
      });

      const req = new NextRequest(`http://localhost/api/clips/${CLIP_ID}/export`, {
        method: "POST",
        body: JSON.stringify({ format: "16:9", addCaptions: true, captionStyle: "static" }),
      });
      const ctx = { params: Promise.resolve({ id: CLIP_ID }) };

      await POST(req, ctx);

      const finalSetCall = updateChain.set.mock.calls[1][0];
      expect(finalSetCall.status).toBe("ready");
      expect(finalSetCall.format).toBe("16:9");
      expect(finalSetCall.captionsEnabled).toBe(true);
      expect(finalSetCall.captionStyle).toBe("static");
      expect(finalSetCall.clipUrl).toMatch(/\/exports\/clips\//);
    });
  });
});
