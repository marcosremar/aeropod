import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => {
  const mockDb = {
    select: vi.fn(),
  };
  return {
    db: mockDb,
    projects: "projects_table",
  };
});

vi.mock("@/lib/ai/show-notes-service", () => ({
  showNotesService: {
    getShowNotes: vi.fn(),
    exportMarkdown: vi.fn(),
    exportPlainText: vi.fn(),
    generate: vi.fn(),
    regenerateSection: vi.fn(),
    updateShowNotes: vi.fn(),
  },
}));

import { db } from "@/lib/db";
import { showNotesService } from "@/lib/ai/show-notes-service";

function buildSelectChain(returnValue: unknown[]) {
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

const SAMPLE_NOTES = {
  id: "sn-1",
  projectId: PROJECT_ID,
  summary: "This is a great episode about AI.",
  chapters: [
    { title: "Intro", timestamp: 0, description: "Introduction" },
    { title: "Main Content", timestamp: 600, description: "Core content" },
  ],
  keyPoints: ["Key point 1", "Key point 2"],
  guestInfo: null,
  links: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

type RouteHandler = (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) => Promise<Response>;

describe("Show Notes API", () => {
  let GET: RouteHandler;
  let POST: RouteHandler;
  let PUT: RouteHandler;

  const ctx = { params: Promise.resolve({ id: PROJECT_ID }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/projects/[id]/show-notes/route");
    GET = module.GET;
    POST = module.POST;
    PUT = module.PUT;
  });

  // ── GET /api/projects/[id]/show-notes ────────────────────────────────

  describe("GET /api/projects/[id]/show-notes", () => {
    it("returns 404 when show notes do not exist", async () => {
      vi.mocked(showNotesService.getShowNotes).mockResolvedValue(null);

      const req = new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/show-notes`);
      const res = await GET(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toMatch(/show notes not found/i);
    });

    it("returns JSON show notes by default", async () => {
      vi.mocked(showNotesService.getShowNotes).mockResolvedValue(SAMPLE_NOTES as any);

      const req = new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/show-notes`);
      const res = await GET(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.showNotes).toMatchObject({
        id: SAMPLE_NOTES.id,
        projectId: SAMPLE_NOTES.projectId,
        summary: SAMPLE_NOTES.summary,
      });
    });

    it("returns markdown with correct Content-Type when format=markdown", async () => {
      vi.mocked(showNotesService.getShowNotes).mockResolvedValue(SAMPLE_NOTES as any);
      vi.mocked(showNotesService.exportMarkdown).mockReturnValue("## Resumo\n\nGreat episode.");

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/show-notes?format=markdown`
      );
      const res = await GET(req, ctx);
      const text = await res.text();

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/markdown");
      expect(res.headers.get("Content-Disposition")).toContain(`show-notes-${PROJECT_ID}.md`);
      expect(text).toBe("## Resumo\n\nGreat episode.");
    });

    it("returns plain text with correct Content-Type when format=text", async () => {
      vi.mocked(showNotesService.getShowNotes).mockResolvedValue(SAMPLE_NOTES as any);
      vi.mocked(showNotesService.exportPlainText).mockReturnValue("RESUMO\nGreat episode.");

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/show-notes?format=text`
      );
      const res = await GET(req, ctx);
      const text = await res.text();

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/plain");
      expect(res.headers.get("Content-Disposition")).toContain(`show-notes-${PROJECT_ID}.txt`);
      expect(text).toBe("RESUMO\nGreat episode.");
    });

    it("returns 500 when getShowNotes throws", async () => {
      vi.mocked(showNotesService.getShowNotes).mockRejectedValue(new Error("DB error"));

      const req = new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/show-notes`);
      const res = await GET(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toMatch(/failed to get show notes/i);
    });
  });

  // ── POST /api/projects/[id]/show-notes ───────────────────────────────

  describe("POST /api/projects/[id]/show-notes", () => {
    it("returns 404 when project does not exist", async () => {
      vi.mocked(db.select).mockReturnValue(buildSelectChain([]) as any);

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/show-notes`,
        { method: "POST", body: JSON.stringify({}) }
      );
      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toMatch(/project not found/i);
    });

    it("returns existing notes without generation when they already exist and regenerate=false", async () => {
      vi.mocked(db.select).mockReturnValue(buildSelectChain([SAMPLE_PROJECT]) as any);
      vi.mocked(showNotesService.getShowNotes).mockResolvedValue(SAMPLE_NOTES as any);

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/show-notes`,
        { method: "POST", body: JSON.stringify({ regenerate: false }) }
      );
      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toMatch(/already exist/i);
      expect(data.showNotes).toMatchObject({ id: SAMPLE_NOTES.id, summary: SAMPLE_NOTES.summary });
      expect(showNotesService.generate).not.toHaveBeenCalled();
    });

    it("regenerates all notes when regenerate=true even if notes exist", async () => {
      vi.mocked(db.select).mockReturnValue(buildSelectChain([SAMPLE_PROJECT]) as any);
      vi.mocked(showNotesService.getShowNotes).mockResolvedValue(SAMPLE_NOTES as any);
      vi.mocked(showNotesService.generate).mockResolvedValue(SAMPLE_NOTES as any);

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/show-notes`,
        { method: "POST", body: JSON.stringify({ regenerate: true }) }
      );
      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toMatch(/generated successfully/i);
      expect(showNotesService.generate).toHaveBeenCalledWith(PROJECT_ID);
    });

    it("generates new notes when none exist (regenerate=false)", async () => {
      vi.mocked(db.select).mockReturnValue(buildSelectChain([SAMPLE_PROJECT]) as any);
      vi.mocked(showNotesService.getShowNotes).mockResolvedValue(null);
      vi.mocked(showNotesService.generate).mockResolvedValue(SAMPLE_NOTES as any);

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/show-notes`,
        { method: "POST", body: JSON.stringify({}) }
      );
      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.showNotes).toMatchObject({ id: SAMPLE_NOTES.id, summary: SAMPLE_NOTES.summary });
      expect(showNotesService.generate).toHaveBeenCalledWith(PROJECT_ID);
    });

    it("regenerates specific section when section param is provided and notes exist", async () => {
      const updatedNotes = { ...SAMPLE_NOTES, summary: "New summary" };
      vi.mocked(db.select).mockReturnValue(buildSelectChain([SAMPLE_PROJECT]) as any);
      vi.mocked(showNotesService.getShowNotes).mockResolvedValue(SAMPLE_NOTES as any);
      vi.mocked(showNotesService.regenerateSection).mockResolvedValue(updatedNotes as any);

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/show-notes`,
        { method: "POST", body: JSON.stringify({ section: "summary" }) }
      );
      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toContain("summary");
      expect(showNotesService.regenerateSection).toHaveBeenCalledWith(PROJECT_ID, "summary");
    });

    it("falls back to generate when section is provided but no notes exist", async () => {
      vi.mocked(db.select).mockReturnValue(buildSelectChain([SAMPLE_PROJECT]) as any);
      vi.mocked(showNotesService.getShowNotes).mockResolvedValue(null);
      vi.mocked(showNotesService.generate).mockResolvedValue(SAMPLE_NOTES as any);

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/show-notes`,
        { method: "POST", body: JSON.stringify({ section: "chapters" }) }
      );
      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(showNotesService.generate).toHaveBeenCalledWith(PROJECT_ID);
    });

    it("returns 500 on unexpected error", async () => {
      vi.mocked(db.select).mockReturnValue(buildSelectChain([SAMPLE_PROJECT]) as any);
      vi.mocked(showNotesService.getShowNotes).mockRejectedValue(new Error("DB crash"));

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/show-notes`,
        { method: "POST", body: JSON.stringify({}) }
      );
      const res = await POST(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toMatch(/failed to generate show notes/i);
    });
  });

  // ── PUT /api/projects/[id]/show-notes ────────────────────────────────

  describe("PUT /api/projects/[id]/show-notes", () => {
    it("returns 404 when show notes do not exist", async () => {
      vi.mocked(showNotesService.getShowNotes).mockResolvedValue(null);

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/show-notes`,
        { method: "PUT", body: JSON.stringify({ summary: "Updated summary" }) }
      );
      const res = await PUT(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toMatch(/show notes not found/i);
    });

    it("updates and returns show notes when they exist", async () => {
      const updatedNotes = { ...SAMPLE_NOTES, summary: "Updated summary" };
      vi.mocked(showNotesService.getShowNotes).mockResolvedValue(SAMPLE_NOTES as any);
      vi.mocked(showNotesService.updateShowNotes).mockResolvedValue(updatedNotes as any);

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/show-notes`,
        { method: "PUT", body: JSON.stringify({ summary: "Updated summary" }) }
      );
      const res = await PUT(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.showNotes.summary).toBe("Updated summary");
      expect(showNotesService.updateShowNotes).toHaveBeenCalledWith(
        PROJECT_ID,
        expect.objectContaining({ summary: "Updated summary" })
      );
    });

    it("returns 500 when updateShowNotes throws", async () => {
      vi.mocked(showNotesService.getShowNotes).mockResolvedValue(SAMPLE_NOTES as any);
      vi.mocked(showNotesService.updateShowNotes).mockRejectedValue(new Error("Write failed"));

      const req = new NextRequest(
        `http://localhost/api/projects/${PROJECT_ID}/show-notes`,
        { method: "PUT", body: JSON.stringify({ summary: "Oops" }) }
      );
      const res = await PUT(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toMatch(/failed to update show notes/i);
    });
  });
});
