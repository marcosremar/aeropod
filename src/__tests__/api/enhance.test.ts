import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Hoist service mocks ───────────────────────────────────────────────────
const { mockEnhance, mockPreview } = vi.hoisted(() => ({
  mockEnhance: vi.fn(),
  mockPreview: vi.fn(),
}));

vi.mock("@/lib/audio/enhancement-service", () => ({
  audioEnhancementService: {
    enhance: mockEnhance,
    preview: mockPreview,
  },
  ENHANCEMENT_PRESETS: {
    podcast_standard: {
      name: "Podcast Standard",
      description: "Standard podcast settings",
      settings: {
        normalize: { enabled: true, targetLufs: -16 },
        denoise: { enabled: true, strength: "medium" },
        eq: { enabled: true, preset: "voice" },
        compress: { enabled: true, preset: "medium" },
      },
    },
    voice_clarity: {
      name: "Voice Clarity",
      description: "Voice clarity settings",
      settings: {
        normalize: { enabled: true, targetLufs: -14 },
        eq: { enabled: true, preset: "clarity" },
        compress: { enabled: false, preset: "light" },
      },
    },
  },
}));

vi.mock("@/lib/db", () => {
  const mockDb = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  };
  return {
    db: mockDb,
    projects: "projects_table",
    audioEnhancements: "audio_enhancements_table",
  };
});

vi.mock("@/lib/db/schema", () => ({
  projects: "projects_table",
  audioEnhancements: "audio_enhancements_table",
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("path", () => ({
  default: {
    join: vi.fn((...args: string[]) => args.join("/")),
    basename: vi.fn((p: string) => p.split("/").pop() ?? p),
  },
}));

vi.mock("os", () => ({
  default: { tmpdir: vi.fn(() => "/tmp") },
}));

import { db } from "@/lib/db";

// ─── Helpers ──────────────────────────────────────────────────────────────

const PROJECT_ID = "550e8400-e29b-41d4-a716-446655440000";

const SAMPLE_PROJECT = {
  id: PROJECT_ID,
  title: "My Podcast",
  originalAudioUrl: "/uploads/audio.mp3",
  audioEnhanced: false,
  enhancedAudioUrl: null,
  enhancementSettings: null,
  status: "ready",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const SAMPLE_ENHANCEMENTS = [
  {
    id: "enh-1",
    projectId: PROJECT_ID,
    enhancementType: "podcast_standard",
    settings: {},
    isApplied: true,
    appliedAt: new Date(),
  },
];

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

function buildInsertChain() {
  return {
    values: vi.fn().mockResolvedValue([]),
  };
}

type RouteHandler = (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) => Promise<Response>;

describe("Enhance API", () => {
  let GET: RouteHandler;
  let POST: RouteHandler;
  let DELETE: RouteHandler;

  const ctx = { params: Promise.resolve({ id: PROJECT_ID }) };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await import("@/app/api/projects/[id]/enhance/route");
    GET = module.GET;
    POST = module.POST;
    DELETE = module.DELETE;
  });

  // ── GET /api/projects/[id]/enhance ──────────────────────────────────

  describe("GET /api/projects/[id]/enhance", () => {
    it("returns 404 when project does not exist", async () => {
      vi.mocked(db.select).mockReturnValueOnce(buildSelectChain([]) as any);

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/enhance`
      );
      const res = await GET(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toMatch(/project not found/i);
    });

    it("returns enhancement status and presets for existing project", async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(buildSelectChain([SAMPLE_PROJECT]) as any)
        .mockReturnValueOnce(buildSelectChain(SAMPLE_ENHANCEMENTS) as any);

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/enhance`
      );
      const res = await GET(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.isEnhanced).toBe(false);
      expect(data.enhancedAudioUrl).toBeNull();
      expect(data.appliedEnhancements).toHaveLength(1);
      expect(data.presets).toBeInstanceOf(Array);
      expect(data.presets).toHaveLength(2);
      expect(data.presets[0]).toMatchObject({
        id: "podcast_standard",
        name: "Podcast Standard",
      });
    });

    it("returns 500 on unexpected error", async () => {
      vi.mocked(db.select).mockImplementationOnce(() => {
        throw new Error("DB error");
      });

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/enhance`
      );
      const res = await GET(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toMatch(/failed to get enhancement status/i);
    });
  });

  // ── POST /api/projects/[id]/enhance ─────────────────────────────────

  describe("POST /api/projects/[id]/enhance", () => {
    it("returns 404 when project does not exist", async () => {
      vi.mocked(db.select).mockReturnValueOnce(buildSelectChain([]) as any);

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/enhance`,
        { method: "POST", body: JSON.stringify({ preset: "podcast_standard" }) }
      );
      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toMatch(/project not found/i);
    });

    it("returns 400 when project has no audio file", async () => {
      const projectNoAudio = { ...SAMPLE_PROJECT, originalAudioUrl: null };
      vi.mocked(db.select).mockReturnValueOnce(
        buildSelectChain([projectNoAudio]) as any
      );

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/enhance`,
        { method: "POST", body: JSON.stringify({ preset: "podcast_standard" }) }
      );
      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toMatch(/no audio file available/i);
    });

    it("generates a preview when preview=true", async () => {
      vi.mocked(db.select).mockReturnValueOnce(
        buildSelectChain([SAMPLE_PROJECT]) as any
      );
      mockPreview.mockResolvedValue({
        success: true,
        previewPath: "/tmp/preview.mp3",
        duration: 10,
      });

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/enhance`,
        {
          method: "POST",
          body: JSON.stringify({
            preset: "podcast_standard",
            preview: true,
            previewStart: 0,
            previewDuration: 10,
          }),
        }
      );
      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.preview).toBe(true);
      expect(data.previewUrl).toBe("/tmp/preview.mp3");
      expect(data.duration).toBe(10);
      expect(mockPreview).toHaveBeenCalled();
      expect(mockEnhance).not.toHaveBeenCalled();
    });

    it("returns 500 when preview generation fails", async () => {
      vi.mocked(db.select).mockReturnValueOnce(
        buildSelectChain([SAMPLE_PROJECT]) as any
      );
      mockPreview.mockResolvedValue({
        success: false,
        error: "FFmpeg failed",
        previewPath: "",
        duration: 0,
      });

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/enhance`,
        {
          method: "POST",
          body: JSON.stringify({ preset: "podcast_standard", preview: true }),
        }
      );
      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toMatch(/preview failed|FFmpeg failed/i);
    });

    it("applies full enhancement with preset and updates DB", async () => {
      vi.mocked(db.select).mockReturnValueOnce(
        buildSelectChain([SAMPLE_PROJECT]) as any
      );
      vi.mocked(db.update).mockReturnValue(buildUpdateChain() as any);
      vi.mocked(db.insert).mockReturnValue(buildInsertChain() as any);
      mockEnhance.mockResolvedValue({
        success: true,
        outputPath: "/public/uploads/enhanced-test.mp3",
        appliedFilters: ["loudnorm", "afftdn"],
      });

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/enhance`,
        {
          method: "POST",
          body: JSON.stringify({ preset: "podcast_standard", preview: false }),
        }
      );
      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.enhanced).toBe(true);
      expect(data.enhancedAudioUrl).toMatch(/enhanced-/);
      expect(data.appliedFilters).toEqual(["loudnorm", "afftdn"]);
      expect(mockEnhance).toHaveBeenCalled();
      expect(db.update).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalled();
    });

    it("returns 500 when full enhancement fails", async () => {
      vi.mocked(db.select).mockReturnValueOnce(
        buildSelectChain([SAMPLE_PROJECT]) as any
      );
      mockEnhance.mockResolvedValue({
        success: false,
        error: "Enhancement failed",
        outputPath: "",
        appliedFilters: [],
      });

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/enhance`,
        {
          method: "POST",
          body: JSON.stringify({ preset: "podcast_standard", preview: false }),
        }
      );
      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toMatch(/enhancement failed/i);
    });

    it("applies custom settings when no preset is provided", async () => {
      vi.mocked(db.select).mockReturnValueOnce(
        buildSelectChain([SAMPLE_PROJECT]) as any
      );
      vi.mocked(db.update).mockReturnValue(buildUpdateChain() as any);
      vi.mocked(db.insert).mockReturnValue(buildInsertChain() as any);
      mockEnhance.mockResolvedValue({
        success: true,
        outputPath: "/public/uploads/enhanced-custom.mp3",
        appliedFilters: ["loudnorm"],
      });

      const customSettings = {
        normalize: { enabled: true, targetLufs: -18 },
        denoise: { enabled: false, strength: "light" as const },
      };

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/enhance`,
        {
          method: "POST",
          body: JSON.stringify({ settings: customSettings, preview: false }),
        }
      );
      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockEnhance).toHaveBeenCalled();
    });

    it("returns 500 on unexpected error", async () => {
      vi.mocked(db.select).mockImplementationOnce(() => {
        throw new Error("DB crash");
      });

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/enhance`,
        {
          method: "POST",
          body: JSON.stringify({ preset: "podcast_standard" }),
        }
      );
      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toMatch(/failed to apply enhancements/i);
    });
  });

  // ── DELETE /api/projects/[id]/enhance ───────────────────────────────

  describe("DELETE /api/projects/[id]/enhance", () => {
    it("removes enhancements and returns success", async () => {
      vi.mocked(db.update).mockReturnValue(buildUpdateChain() as any);

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/enhance`,
        { method: "DELETE" }
      );
      const res = await DELETE(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toMatch(/enhancements removed/i);
      expect(db.update).toHaveBeenCalled();
    });

    it("returns 500 on unexpected error during removal", async () => {
      vi.mocked(db.update).mockImplementationOnce(() => {
        throw new Error("DB write error");
      });

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/enhance`,
        { method: "DELETE" }
      );
      const res = await DELETE(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toMatch(/failed to remove enhancements/i);
    });
  });
});
