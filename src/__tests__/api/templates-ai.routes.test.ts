import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockDb, tableStubs } from "../helpers/mock-db";

// ---- shared DB mock ----
const { mockDb, setResult, queueResults, captured, reset } = createMockDb();

vi.mock("@/lib/db", () => ({
  db: mockDb,
  ...tableStubs(
    "projects",
    "projectTemplates",
    "projectSections",
    "sectionSegments",
    "audioEnhancements",
    "templates",
    "templateSections"
  ),
}));

vi.mock("@/lib/db/schema", () => ({
  ...tableStubs(
    "projects",
    "projectTemplates",
    "projectSections",
    "sectionSegments",
    "audioEnhancements",
    "templates",
    "templateSections",
    "contentTypeDetections"
  ),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "eq"),
  and: vi.fn(() => "and"),
  or: vi.fn(() => "or"),
  desc: vi.fn(() => "desc"),
  asc: vi.fn(() => "asc"),
  sql: vi.fn(() => "sql"),
  inArray: vi.fn(() => "inArray"),
  ne: vi.fn(() => "ne"),
}));

// ---- service mocks ----
const listTemplates = vi.fn();
const getTemplateWithSections = vi.fn();
vi.mock("@/lib/templates/TemplateService", () => ({
  TemplateService: class {
    listTemplates = (...args: unknown[]) => listTemplates(...args);
    getTemplateWithSections = (...args: unknown[]) => getTemplateWithSections(...args);
  },
}));

const aiCompleteJSON = vi.fn();
vi.mock("@/lib/ai/AIService", () => ({
  aiCompleteJSON: (...args: unknown[]) => aiCompleteJSON(...args),
}));

const showNotes = {
  getShowNotes: vi.fn(),
  generate: vi.fn(),
  regenerateSection: vi.fn(),
  updateShowNotes: vi.fn(),
  exportMarkdown: vi.fn(() => "# md"),
  exportPlainText: vi.fn(() => "plain text"),
};
vi.mock("@/lib/ai/show-notes-service", () => ({
  showNotesService: showNotes,
}));

const enhanceSvc = {
  enhance: vi.fn(),
  preview: vi.fn(),
};
vi.mock("@/lib/audio/enhancement-service", () => ({
  audioEnhancementService: enhanceSvc,
  ENHANCEMENT_PRESETS: {
    podcast_standard: {
      name: "Podcast Standard",
      description: "Standard preset",
      settings: { normalize: { enabled: true, targetLufs: -16 } },
    },
    voice_clarity: {
      name: "Voice Clarity",
      description: "Clarity preset",
      settings: { eq: { enabled: true, preset: "voice" } },
    },
  },
}));

const fillerFns = {
  getProjectFillers: vi.fn(),
  processProjectFillers: vi.fn(),
  markFillersForRemoval: vi.fn(),
  markAllFillersForRemoval: vi.fn(),
  getFillerStats: vi.fn(),
};
vi.mock("@/lib/audio/filler-detection", () => ({
  getProjectFillers: (...a: unknown[]) => fillerFns.getProjectFillers(...a),
  processProjectFillers: (...a: unknown[]) => fillerFns.processProjectFillers(...a),
  markFillersForRemoval: (...a: unknown[]) => fillerFns.markFillersForRemoval(...a),
  markAllFillersForRemoval: (...a: unknown[]) => fillerFns.markAllFillersForRemoval(...a),
  getFillerStats: (...a: unknown[]) => fillerFns.getFillerStats(...a),
}));

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const reqJson = (url: string, method: string, body: unknown) =>
  new NextRequest(url, { method, body: JSON.stringify(body) });

beforeEach(() => {
  reset();
  vi.clearAllMocks();
  showNotes.exportMarkdown.mockReturnValue("# md");
  showNotes.exportPlainText.mockReturnValue("plain text");
});

// =====================================================================
// GET /api/templates
// =====================================================================
describe("GET /api/templates", () => {
  it("returns templates from the service", async () => {
    listTemplates.mockResolvedValue([{ id: "t1", name: "Interview" }]);
    const { GET } = await import("@/app/api/templates/route");
    const res = await GET(new NextRequest("http://localhost/api/templates?category=interview&isSystem=true"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.templates).toHaveLength(1);
    expect(listTemplates).toHaveBeenCalledWith(
      expect.objectContaining({ category: "interview", isSystem: true })
    );
  });

  it("passes userId filter when provided", async () => {
    listTemplates.mockResolvedValue([]);
    const { GET } = await import("@/app/api/templates/route");
    await GET(new NextRequest("http://localhost/api/templates?userId=u9"));
    expect(listTemplates).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u9" })
    );
  });

  it("returns 500 when the service throws", async () => {
    listTemplates.mockRejectedValue(new Error("boom"));
    const { GET } = await import("@/app/api/templates/route");
    const res = await GET(new NextRequest("http://localhost/api/templates"));
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe("boom");
  });
});

// =====================================================================
// GET /api/templates/[id]
// =====================================================================
describe("GET /api/templates/[id]", () => {
  it("returns a template with sections", async () => {
    getTemplateWithSections.mockResolvedValue({ id: "t1", name: "Interview", sections: [] });
    const { GET } = await import("@/app/api/templates/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/templates/t1"), ctx("t1"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.template.id).toBe("t1");
    expect(getTemplateWithSections).toHaveBeenCalledWith("t1");
  });

  it("returns 404 when not found", async () => {
    getTemplateWithSections.mockResolvedValue(null);
    const { GET } = await import("@/app/api/templates/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/templates/missing"), ctx("missing"));
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toBe("Template not found");
  });

  it("returns 500 on service error", async () => {
    getTemplateWithSections.mockRejectedValue(new Error("db down"));
    const { GET } = await import("@/app/api/templates/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/templates/t1"), ctx("t1"));
    expect(res.status).toBe(500);
  });
});

// =====================================================================
// POST /api/projects/[id]/select-template
// =====================================================================
describe("POST /api/projects/[id]/select-template", () => {
  it("rejects missing templateId with 400", async () => {
    const { POST } = await import("@/app/api/projects/[id]/select-template/route");
    const res = await POST(
      reqJson("http://localhost/api/projects/p1/select-template", "POST", {}),
      ctx("p1")
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Template ID is required");
  });

  it("returns 404 when project not found", async () => {
    setResult([]); // project lookup returns nothing
    const { POST } = await import("@/app/api/projects/[id]/select-template/route");
    const res = await POST(
      reqJson("http://localhost/api/projects/p1/select-template", "POST", { templateId: "t1" }),
      ctx("p1")
    );
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toBe("Project not found");
  });

  it("returns 404 when template not found", async () => {
    setResult([{ id: "p1", currentTemplateId: null }]); // project found
    getTemplateWithSections.mockResolvedValue(null);
    const { POST } = await import("@/app/api/projects/[id]/select-template/route");
    const res = await POST(
      reqJson("http://localhost/api/projects/p1/select-template", "POST", { templateId: "t1" }),
      ctx("p1")
    );
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toBe("Template not found");
  });

  it("selects a template, creates sections and captures inserts (happy path)", async () => {
    // 1: project lookup, then inserts use returning() which awaits the chain.
    queueResults(
      [{ id: "p1", currentTemplateId: null }], // project select
      [{ id: "pt1", projectId: "p1", templateId: "t1" }], // projectTemplates insert returning
      [{ id: "ps1", name: "Intro" }] // projectSections insert returning
    );
    getTemplateWithSections.mockResolvedValue({
      id: "t1",
      name: "Interview",
      sections: [{ id: "s1", name: "Intro", order: 0 }],
    });
    const { POST } = await import("@/app/api/projects/[id]/select-template/route");
    const res = await POST(
      reqJson("http://localhost/api/projects/p1/select-template", "POST", {
        templateId: "t1",
        autoDetected: true,
      }),
      ctx("p1")
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.projectTemplate.id).toBe("pt1");
    expect(data.sections).toHaveLength(1);
    expect(data.message).toContain("Interview");
    // captured insert values
    expect(captured.values[0]).toMatchObject({
      projectId: "p1",
      templateId: "t1",
      autoDetected: true,
    });
    // project update applied
    expect(captured.sets[0]).toMatchObject({
      currentTemplateId: "t1",
      detectionStatus: "detected",
    });
  });

  it("returns 500 when db throws", async () => {
    setResult([{ id: "p1", currentTemplateId: null }]);
    getTemplateWithSections.mockRejectedValue(new Error("kaboom"));
    const { POST } = await import("@/app/api/projects/[id]/select-template/route");
    const res = await POST(
      reqJson("http://localhost/api/projects/p1/select-template", "POST", { templateId: "t1" }),
      ctx("p1")
    );
    expect(res.status).toBe(500);
  });
});

// =====================================================================
// POST /api/ai/summarize
// =====================================================================
describe("POST /api/ai/summarize", () => {
  it("rejects empty text with 400", async () => {
    const { POST } = await import("@/app/api/ai/summarize/route");
    const res = await POST(reqJson("http://localhost/api/ai/summarize", "POST", { text: "  " }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Text is required");
  });

  it("returns AI summary on success", async () => {
    aiCompleteJSON.mockResolvedValue({ summary: "A short summary." });
    const { POST } = await import("@/app/api/ai/summarize/route");
    const res = await POST(
      reqJson("http://localhost/api/ai/summarize", "POST", { text: "long content here", maxWords: 50 })
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.summary).toBe("A short summary.");
    expect(aiCompleteJSON).toHaveBeenCalled();
  });

  it("falls back to extractive summary when AI fails", async () => {
    aiCompleteJSON.mockRejectedValue(new Error("ai unavailable"));
    const { POST } = await import("@/app/api/ai/summarize/route");
    const text =
      "This is the first meaningful sentence about something. " +
      "Here is a second meaningful sentence with content. " +
      "And a third meaningful sentence to include too.";
    const res = await POST(reqJson("http://localhost/api/ai/summarize", "POST", { text }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(typeof data.summary).toBe("string");
    expect(data.summary.length).toBeGreaterThan(0);
  });
});

// =====================================================================
// /api/projects/[id]/show-notes
// =====================================================================
describe("GET /api/projects/[id]/show-notes", () => {
  it("returns 404 when no notes exist", async () => {
    showNotes.getShowNotes.mockResolvedValue(null);
    const { GET } = await import("@/app/api/projects/[id]/show-notes/route");
    const res = await GET(new NextRequest("http://localhost/api/projects/p1/show-notes"), ctx("p1"));
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toContain("not found");
  });

  it("returns json show notes by default", async () => {
    showNotes.getShowNotes.mockResolvedValue({ summary: "S" });
    const { GET } = await import("@/app/api/projects/[id]/show-notes/route");
    const res = await GET(new NextRequest("http://localhost/api/projects/p1/show-notes"), ctx("p1"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.showNotes.summary).toBe("S");
  });

  it("returns markdown export when format=markdown", async () => {
    showNotes.getShowNotes.mockResolvedValue({ summary: "S" });
    const { GET } = await import("@/app/api/projects/[id]/show-notes/route");
    const res = await GET(
      new NextRequest("http://localhost/api/projects/p1/show-notes?format=markdown"),
      ctx("p1")
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/markdown");
    expect(await res.text()).toBe("# md");
    expect(showNotes.exportMarkdown).toHaveBeenCalled();
  });

  it("returns 500 on service error", async () => {
    showNotes.getShowNotes.mockRejectedValue(new Error("x"));
    const { GET } = await import("@/app/api/projects/[id]/show-notes/route");
    const res = await GET(new NextRequest("http://localhost/api/projects/p1/show-notes"), ctx("p1"));
    expect(res.status).toBe(500);
  });
});

describe("POST /api/projects/[id]/show-notes", () => {
  it("returns 404 when project missing", async () => {
    setResult([]); // project lookup empty
    const { POST } = await import("@/app/api/projects/[id]/show-notes/route");
    const res = await POST(
      reqJson("http://localhost/api/projects/p1/show-notes", "POST", {}),
      ctx("p1")
    );
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toBe("Project not found");
  });

  it("returns existing notes when present and not regenerating", async () => {
    setResult([{ id: "p1" }]);
    showNotes.getShowNotes.mockResolvedValue({ summary: "existing" });
    const { POST } = await import("@/app/api/projects/[id]/show-notes/route");
    const res = await POST(
      reqJson("http://localhost/api/projects/p1/show-notes", "POST", {}),
      ctx("p1")
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.message).toBe("Show notes already exist");
    expect(showNotes.generate).not.toHaveBeenCalled();
  });

  it("generates notes when none exist", async () => {
    setResult([{ id: "p1" }]);
    showNotes.getShowNotes.mockResolvedValue(null);
    showNotes.generate.mockResolvedValue({ summary: "generated" });
    const { POST } = await import("@/app/api/projects/[id]/show-notes/route");
    const res = await POST(
      reqJson("http://localhost/api/projects/p1/show-notes", "POST", { regenerate: true }),
      ctx("p1")
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.showNotes.summary).toBe("generated");
    expect(showNotes.generate).toHaveBeenCalledWith("p1");
  });

  it("regenerates a specific section", async () => {
    setResult([{ id: "p1" }]);
    showNotes.getShowNotes.mockResolvedValue({ summary: "existing" });
    showNotes.regenerateSection.mockResolvedValue({ summary: "new-summary" });
    const { POST } = await import("@/app/api/projects/[id]/show-notes/route");
    const res = await POST(
      reqJson("http://localhost/api/projects/p1/show-notes", "POST", { section: "summary" }),
      ctx("p1")
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.message).toContain("summary");
    expect(showNotes.regenerateSection).toHaveBeenCalledWith("p1", "summary");
  });
});

describe("PUT /api/projects/[id]/show-notes", () => {
  it("returns 404 when notes don't exist", async () => {
    showNotes.getShowNotes.mockResolvedValue(null);
    const { PUT } = await import("@/app/api/projects/[id]/show-notes/route");
    const res = await PUT(
      reqJson("http://localhost/api/projects/p1/show-notes", "PUT", { summary: "x" }),
      ctx("p1")
    );
    expect(res.status).toBe(404);
  });

  it("updates show notes", async () => {
    showNotes.getShowNotes.mockResolvedValue({ summary: "old" });
    showNotes.updateShowNotes.mockResolvedValue({ summary: "new" });
    const { PUT } = await import("@/app/api/projects/[id]/show-notes/route");
    const res = await PUT(
      reqJson("http://localhost/api/projects/p1/show-notes", "PUT", { summary: "new" }),
      ctx("p1")
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.showNotes.summary).toBe("new");
    expect(showNotes.updateShowNotes).toHaveBeenCalledWith("p1", expect.objectContaining({ summary: "new" }));
  });
});

// =====================================================================
// /api/projects/[id]/enhance
// =====================================================================
describe("GET /api/projects/[id]/enhance", () => {
  it("returns 404 when project not found", async () => {
    setResult([]);
    const { GET } = await import("@/app/api/projects/[id]/enhance/route");
    const res = await GET(new NextRequest("http://localhost/api/projects/p1/enhance"), ctx("p1"));
    expect(res.status).toBe(404);
  });

  it("returns presets and status when project exists", async () => {
    queueResults(
      [{ id: "p1", audioEnhanced: false, enhancedAudioUrl: null, enhancementSettings: null }],
      [] // applied enhancements
    );
    const { GET } = await import("@/app/api/projects/[id]/enhance/route");
    const res = await GET(new NextRequest("http://localhost/api/projects/p1/enhance"), ctx("p1"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.presets)).toBe(true);
    expect(data.presets.length).toBeGreaterThan(0);
  });
});

describe("POST /api/projects/[id]/enhance", () => {
  it("returns 404 when project not found", async () => {
    setResult([]);
    const { POST } = await import("@/app/api/projects/[id]/enhance/route");
    const res = await POST(
      reqJson("http://localhost/api/projects/p1/enhance", "POST", { preset: "podcast_standard" }),
      ctx("p1")
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when no audio file available", async () => {
    setResult([{ id: "p1", originalAudioUrl: null }]);
    const { POST } = await import("@/app/api/projects/[id]/enhance/route");
    const res = await POST(
      reqJson("http://localhost/api/projects/p1/enhance", "POST", { preset: "podcast_standard" }),
      ctx("p1")
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("No audio file available");
  });

  it("applies enhancement and updates project (happy path)", async () => {
    setResult([{ id: "p1", originalAudioUrl: "/uploads/in.mp3" }]);
    enhanceSvc.enhance.mockResolvedValue({
      success: true,
      outputPath: "/x/out.mp3",
      appliedFilters: ["loudnorm"],
    });
    const { POST } = await import("@/app/api/projects/[id]/enhance/route");
    const res = await POST(
      reqJson("http://localhost/api/projects/p1/enhance", "POST", { preset: "podcast_standard" }),
      ctx("p1")
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.enhanced).toBe(true);
    expect(data.enhancedAudioUrl).toContain("/uploads/enhanced-p1-");
    expect(enhanceSvc.enhance).toHaveBeenCalled();
    // project updated + enhancement record inserted
    expect(captured.sets[0]).toMatchObject({ audioEnhanced: true });
    expect(captured.values[0]).toMatchObject({ projectId: "p1", isApplied: true });
  });

  it("returns 500 when enhancement service reports failure", async () => {
    setResult([{ id: "p1", originalAudioUrl: "/uploads/in.mp3" }]);
    enhanceSvc.enhance.mockResolvedValue({ success: false, error: "ffmpeg crashed" });
    const { POST } = await import("@/app/api/projects/[id]/enhance/route");
    const res = await POST(
      reqJson("http://localhost/api/projects/p1/enhance", "POST", { preset: "podcast_standard" }),
      ctx("p1")
    );
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.error).toBe("ffmpeg crashed");
  });

  it("generates a preview when preview=true", async () => {
    setResult([{ id: "p1", originalAudioUrl: "/uploads/in.mp3" }]);
    enhanceSvc.preview.mockResolvedValue({
      success: true,
      previewPath: "/uploads/preview.mp3",
      duration: 10,
    });
    const { POST } = await import("@/app/api/projects/[id]/enhance/route");
    const res = await POST(
      reqJson("http://localhost/api/projects/p1/enhance", "POST", {
        preset: "podcast_standard",
        preview: true,
      }),
      ctx("p1")
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.preview).toBe(true);
    expect(data.previewUrl).toBe("/uploads/preview.mp3");
    expect(enhanceSvc.preview).toHaveBeenCalled();
  });
});

describe("DELETE /api/projects/[id]/enhance", () => {
  it("reverts enhancements", async () => {
    const { DELETE } = await import("@/app/api/projects/[id]/enhance/route");
    const res = await DELETE(new NextRequest("http://localhost/api/projects/p1/enhance"), ctx("p1"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(captured.sets[0]).toMatchObject({ audioEnhanced: false, enhancedAudioUrl: null });
  });
});

// =====================================================================
// /api/projects/[id]/fillers
// =====================================================================
describe("GET /api/projects/[id]/fillers", () => {
  it("returns fillers and stats", async () => {
    fillerFns.getProjectFillers.mockResolvedValue([{ id: "f1" }]);
    fillerFns.getFillerStats.mockResolvedValue({ totalCount: 1 });
    const { GET } = await import("@/app/api/projects/[id]/fillers/route");
    const res = await GET(new NextRequest("http://localhost/api/projects/p1/fillers"), ctx("p1"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.fillers).toHaveLength(1);
    expect(data.stats.totalCount).toBe(1);
  });

  it("returns 500 on error", async () => {
    fillerFns.getProjectFillers.mockRejectedValue(new Error("x"));
    const { GET } = await import("@/app/api/projects/[id]/fillers/route");
    const res = await GET(new NextRequest("http://localhost/api/projects/p1/fillers"), ctx("p1"));
    expect(res.status).toBe(500);
  });
});

describe("POST /api/projects/[id]/fillers", () => {
  it("returns 404 when project not found", async () => {
    setResult([]);
    const { POST } = await import("@/app/api/projects/[id]/fillers/route");
    const res = await POST(
      reqJson("http://localhost/api/projects/p1/fillers", "POST", {}),
      ctx("p1")
    );
    expect(res.status).toBe(404);
  });

  it("returns existing fillers when already processed", async () => {
    setResult([{ id: "p1", fillerWordsCount: 5 }]);
    fillerFns.getProjectFillers.mockResolvedValue([{ id: "f1" }]);
    fillerFns.getFillerStats.mockResolvedValue({ totalCount: 5 });
    const { POST } = await import("@/app/api/projects/[id]/fillers/route");
    const res = await POST(
      reqJson("http://localhost/api/projects/p1/fillers", "POST", {}),
      ctx("p1")
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.message).toBe("Fillers already detected");
    expect(fillerFns.processProjectFillers).not.toHaveBeenCalled();
  });

  it("detects fillers when not yet processed", async () => {
    setResult([{ id: "p1", fillerWordsCount: 0 }]);
    fillerFns.processProjectFillers.mockResolvedValue({
      fillers: [{ id: "f1" }],
      stats: { totalCount: 3 },
    });
    const { POST } = await import("@/app/api/projects/[id]/fillers/route");
    const res = await POST(
      reqJson("http://localhost/api/projects/p1/fillers", "POST", { language: "en" }),
      ctx("p1")
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.message).toContain("3");
    expect(fillerFns.processProjectFillers).toHaveBeenCalledWith("p1", "en");
  });
});

describe("PATCH /api/projects/[id]/fillers", () => {
  it("returns 400 when remove action has no fillerIds", async () => {
    const { PATCH } = await import("@/app/api/projects/[id]/fillers/route");
    const res = await PATCH(
      reqJson("http://localhost/api/projects/p1/fillers", "PATCH", { action: "remove" }),
      ctx("p1")
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain("fillerIds required");
  });

  it("marks fillers for removal and returns stats", async () => {
    fillerFns.getFillerStats.mockResolvedValue({ totalCount: 2 });
    const { PATCH } = await import("@/app/api/projects/[id]/fillers/route");
    const res = await PATCH(
      reqJson("http://localhost/api/projects/p1/fillers", "PATCH", {
        action: "remove",
        fillerIds: ["f1", "f2"],
      }),
      ctx("p1")
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.stats.totalCount).toBe(2);
    expect(fillerFns.markFillersForRemoval).toHaveBeenCalledWith(["f1", "f2"], true);
  });

  it("handles remove_all action", async () => {
    fillerFns.markAllFillersForRemoval.mockResolvedValue(7);
    const { PATCH } = await import("@/app/api/projects/[id]/fillers/route");
    const res = await PATCH(
      reqJson("http://localhost/api/projects/p1/fillers", "PATCH", {
        action: "remove_all",
        minConfidence: 0.8,
      }),
      ctx("p1")
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.removedCount).toBe(7);
    expect(fillerFns.markAllFillersForRemoval).toHaveBeenCalledWith("p1", 0.8);
  });

  it("returns 500 on invalid action (zod parse error)", async () => {
    const { PATCH } = await import("@/app/api/projects/[id]/fillers/route");
    const res = await PATCH(
      reqJson("http://localhost/api/projects/p1/fillers", "PATCH", { action: "nope" }),
      ctx("p1")
    );
    expect(res.status).toBe(500);
  });
});
