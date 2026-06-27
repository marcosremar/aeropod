import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockDb, tableStubs } from "../helpers/mock-db";

const { mockDb, setResult, queueResults, captured, reset } = createMockDb();

// --- DB mock (both @/lib/db and @/lib/db/schema resolve to the same stubs) ---
const dbExports = {
  db: mockDb,
  ...tableStubs(
    "projects",
    "segments",
    "users",
    "chatMessages",
    "projectTemplates",
    "projectSections",
    "sectionSegments",
    "templates",
    "templateSections",
    "socialClips"
  ),
};
vi.mock("@/lib/db", () => dbExports);
vi.mock("@/lib/db/schema", () => dbExports);

// --- drizzle-orm operators ---
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "eq"),
  desc: vi.fn(() => "desc"),
  and: vi.fn(() => "and"),
  or: vi.fn(() => "or"),
  sql: vi.fn(() => "sql"),
  inArray: vi.fn(() => "inArray"),
  asc: vi.fn(() => "asc"),
  ne: vi.fn(() => "ne"),
}));

// --- AI / service module mocks ---
const processMessageMock = vi.fn(async () => ({
  response: "AI reply",
  actions: [{ type: "info", message: "ok" }],
}));
vi.mock("@/lib/ai/editor-chat", () => ({
  getEditorChatService: vi.fn(() => ({ processMessage: processMessageMock })),
}));

const semanticSearchMock = vi.fn(async () => [
  {
    id: "seg1",
    text: "hello world",
    score: 0.9,
    metadata: { topic: "intro", startTime: 0, endTime: 5 },
  },
]);
vi.mock("@/lib/ai/semantic-search", () => ({
  getSemanticSearchService: vi.fn(() => ({ search: semanticSearchMock })),
}));

const quickSearchMock = vi.fn(async () => [
  { segment: { id: "seg1", text: "hi", startTime: 0, endTime: 5, topic: "t" }, score: 0.8 },
]);
const hybridSearchMock = vi.fn(async () => [
  { segment: { id: "seg2", text: "yo", startTime: 5, endTime: 10, topic: "t2" }, score: 0.7 },
]);
vi.mock("@/lib/search/semantic-search", () => ({
  quickSearch: quickSearchMock,
  hybridSearch: hybridSearchMock,
}));

const exportClipMock = vi.fn(async () => ({ success: true, clipUrl: "/x.mp4", duration: 30 }));
vi.mock("@/lib/clips/social-clip-service", () => ({
  socialClipService: { exportClip: exportClipMock },
}));

vi.mock("@/lib/ai/AIService", () => ({
  aiCompleteJSON: vi.fn(async () => ({})),
  getAIService: vi.fn(() => ({})),
}));
vi.mock("@/lib/audio/forced-aligner", () => ({
  getForcedAlignerService: vi.fn(() => ({ alignSegments: vi.fn(async () => ({ success: false })) })),
}));
vi.mock("groq-sdk", () => ({
  default: class {
    audio = { transcriptions: { create: vi.fn(async () => ({ segments: [] })) } };
  },
}));

// Avoid real disk writes during upload (route uses dynamic import of fs/promises).
vi.mock("fs/promises", () => {
  const api = { mkdir: vi.fn(async () => undefined), writeFile: vi.fn(async () => undefined) };
  return { ...api, default: api };
});

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const VALID_UUID2 = "22222222-2222-4222-8222-222222222222";

// ============================================================
// POST /api/chat
// ============================================================
describe("POST /api/chat", () => {
  let POST: (req: NextRequest) => Promise<Response>;
  beforeEach(async () => {
    reset();
    processMessageMock.mockClear();
    POST = (await import("@/app/api/chat/route")).POST;
  });

  it("rejects invalid input with 400 and zod issues", async () => {
    const req = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ projectId: "not-a-uuid", userId: "x", message: "" }),
    });
    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid input");
    expect(Array.isArray(data.details)).toBe(true);
  });

  it("saves message without AI when skipAI is true", async () => {
    const req = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        projectId: VALID_UUID,
        userId: VALID_UUID2,
        message: "hi there",
        skipAI: true,
      }),
    });
    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(processMessageMock).not.toHaveBeenCalled();
    expect(captured.values[0]).toMatchObject({
      projectId: VALID_UUID,
      content: "hi there",
      role: "user",
    });
  });

  it("returns a no-segments response when project has no segments", async () => {
    // history fetch -> [], segments fetch -> []
    queueResults([], []);
    const req = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        projectId: VALID_UUID,
        userId: VALID_UUID2,
        message: "edit my podcast please",
      }),
    });
    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.response).toContain("segmentos");
    expect(processMessageMock).not.toHaveBeenCalled();
  });

  it("processes message with AI on the happy path", async () => {
    // insert user msg -> [], history -> [], segments -> [one], insert assistant -> []
    queueResults(
      [],
      [{ role: "user", content: "older", isDeleted: false, createdAt: new Date() }],
      [{ id: "s1", text: "t", topic: "x", startTime: 0, endTime: 5, isSelected: false, interestScore: 7 }]
    );
    const req = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        projectId: VALID_UUID,
        userId: VALID_UUID2,
        message: "make it shorter",
      }),
    });
    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.response).toBe("AI reply");
    expect(processMessageMock).toHaveBeenCalled();
    expect(Array.isArray(data.richContent)).toBe(true);
  });

  it("returns template rich content for template queries with context", async () => {
    // insert user msg -> [], then getTemplateData: project lookup with no currentTemplateId -> [{}]
    queueResults([], [{ id: VALID_UUID }]);
    const req = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        projectId: VALID_UUID,
        userId: VALID_UUID2,
        message: "mostrar o template",
        includeTemplateContext: true,
      }),
    });
    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    // templateData is null -> response prompts to pick a template
    expect(data.response).toContain("template");
    expect(Array.isArray(data.richContent)).toBe(true);
  });

  it("returns 500 when the db throws", async () => {
    const orig = mockDb.insert;
    mockDb.insert = vi.fn(() => {
      throw new Error("boom");
    });
    const req = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        projectId: VALID_UUID,
        userId: VALID_UUID2,
        message: "hello",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Chat processing failed");
    mockDb.insert = orig;
  });
});

// ============================================================
// GET / DELETE /api/chat/[projectId]
// ============================================================
describe("GET/DELETE /api/chat/[projectId]", () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) => Promise<Response>;
  let DELETE: (req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) => Promise<Response>;
  beforeEach(async () => {
    reset();
    const mod = await import("@/app/api/chat/[projectId]/route");
    GET = mod.GET;
    DELETE = mod.DELETE;
  });

  it("GET rejects a malformed project id with 400", async () => {
    const req = new NextRequest("http://localhost/api/chat/bad");
    const res = await GET(req, { params: Promise.resolve({ projectId: "bad" }) });
    expect(res.status).toBe(400);
  });

  it("GET returns mapped messages", async () => {
    setResult([
      { role: "user", content: "hi", actions: [], createdAt: new Date("2024-01-01") },
      { role: "assistant", content: "hello", actions: [], createdAt: new Date("2024-01-02") },
    ]);
    const req = new NextRequest(`http://localhost/api/chat/${VALID_UUID}`);
    const res = await GET(req, { params: Promise.resolve({ projectId: VALID_UUID }) });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.messages).toHaveLength(2);
    expect(data.messages[0]).toMatchObject({ role: "user", content: "hi" });
  });

  it("DELETE soft-deletes messages and captures the set", async () => {
    const req = new NextRequest(`http://localhost/api/chat/${VALID_UUID}`, { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ projectId: VALID_UUID }) });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.message).toContain("cleared");
    expect(captured.sets[0]).toMatchObject({ isDeleted: true });
  });

  it("DELETE rejects a malformed project id with 400", async () => {
    const req = new NextRequest("http://localhost/api/chat/bad", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ projectId: "nope" }) });
    expect(res.status).toBe(400);
  });
});

// ============================================================
// POST /api/search
// ============================================================
describe("POST /api/search", () => {
  let POST: (req: NextRequest) => Promise<Response>;
  beforeEach(async () => {
    reset();
    semanticSearchMock.mockClear();
    POST = (await import("@/app/api/search/route")).POST;
  });

  it("rejects missing projectId/query with 400", async () => {
    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({ query: "hi" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns empty results when project has no segments", async () => {
    setResult([]);
    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({ projectId: VALID_UUID, query: "hi" }),
    });
    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.results).toEqual([]);
    expect(semanticSearchMock).not.toHaveBeenCalled();
  });

  it("returns mapped semantic search results", async () => {
    setResult([{ id: "seg1", text: "hello world", topic: "intro", startTime: 0, endTime: 5 }]);
    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({ projectId: VALID_UUID, query: "hello", topK: 3 }),
    });
    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(semanticSearchMock).toHaveBeenCalled();
    expect(data.results[0]).toMatchObject({ id: "seg1", score: 0.9, topic: "intro" });
  });

  it("returns 500 when search service throws", async () => {
    setResult([{ id: "seg1", text: "x", startTime: 0, endTime: 1 }]);
    semanticSearchMock.mockRejectedValueOnce(new Error("fail"));
    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({ projectId: VALID_UUID, query: "hi" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});

// ============================================================
// POST /api/projects/[id]/search
// ============================================================
describe("POST /api/projects/[id]/search", () => {
  let POST: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  beforeEach(async () => {
    reset();
    quickSearchMock.mockClear();
    hybridSearchMock.mockClear();
    POST = (await import("@/app/api/projects/[id]/search/route")).POST;
  });

  it("rejects missing query with 400", async () => {
    const req = new NextRequest(`http://localhost/api/projects/${VALID_UUID}/search`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(400);
  });

  it("rejects malformed project id with 400", async () => {
    const req = new NextRequest("http://localhost/api/projects/bad/search", {
      method: "POST",
      body: JSON.stringify({ query: "hi" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "bad" }) });
    expect(res.status).toBe(400);
  });

  it("returns empty results when no segments", async () => {
    setResult([]);
    const req = new NextRequest(`http://localhost/api/projects/${VALID_UUID}/search`, {
      method: "POST",
      body: JSON.stringify({ query: "hi" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.totalSegments).toBe(0);
    expect(data.results).toEqual([]);
  });

  it("uses quickSearch in quick mode (default) and maps results", async () => {
    setResult([{ id: "seg1", text: "hi", startTime: 0, endTime: 5 }]);
    const req = new NextRequest(`http://localhost/api/projects/${VALID_UUID}/search`, {
      method: "POST",
      body: JSON.stringify({ query: "hello" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(quickSearchMock).toHaveBeenCalled();
    expect(hybridSearchMock).not.toHaveBeenCalled();
    expect(data.results[0]).toMatchObject({ segmentId: "seg1", score: 0.8 });
    expect(data.mode).toBe("quick");
  });

  it("uses hybridSearch in full mode", async () => {
    setResult([{ id: "seg2", text: "yo", startTime: 0, endTime: 5 }]);
    const req = new NextRequest(`http://localhost/api/projects/${VALID_UUID}/search`, {
      method: "POST",
      body: JSON.stringify({ query: "hello", mode: "full" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(hybridSearchMock).toHaveBeenCalled();
    expect(data.mode).toBe("full");
  });

  it("returns 500 when search throws", async () => {
    setResult([{ id: "seg1", text: "hi", startTime: 0, endTime: 5 }]);
    quickSearchMock.mockRejectedValueOnce(new Error("fail"));
    const req = new NextRequest(`http://localhost/api/projects/${VALID_UUID}/search`, {
      method: "POST",
      body: JSON.stringify({ query: "hi" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(500);
  });
});

// ============================================================
// POST /api/process/[id]
// ============================================================
describe("POST /api/process/[id]", () => {
  let POST: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  beforeEach(async () => {
    reset();
    process.env.GROQ_API_KEY = "test-key";
    POST = (await import("@/app/api/process/[id]/route")).POST;
  });

  it("rejects malformed project id with 400", async () => {
    const req = new NextRequest("http://localhost/api/process/bad", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "bad" }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 when project does not exist", async () => {
    setResult([]);
    const req = new NextRequest(`http://localhost/api/process/${VALID_UUID}`, { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(404);
  });

  it("returns 400 when project has no audio", async () => {
    setResult([{ id: VALID_UUID, originalAudioUrl: null, status: "uploaded" }]);
    const req = new NextRequest(`http://localhost/api/process/${VALID_UUID}`, { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(400);
  });

  it("returns 409 when already processing", async () => {
    setResult([{ id: VALID_UUID, originalAudioUrl: "/a.mp3", status: "transcribing" }]);
    const req = new NextRequest(`http://localhost/api/process/${VALID_UUID}`, { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(409);
  });

  it("starts processing on the happy path", async () => {
    setResult([{ id: VALID_UUID, originalAudioUrl: "/a.mp3", status: "uploaded", language: "pt" }]);
    const req = new NextRequest(`http://localhost/api/process/${VALID_UUID}`, { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe("processing");
    expect(data.projectId).toBe(VALID_UUID);
  });

  it("returns 500 when GROQ_API_KEY is missing", async () => {
    // Re-import the module fresh with the key removed (it is read at module load).
    vi.resetModules();
    delete process.env.GROQ_API_KEY;
    const mod = await import("@/app/api/process/[id]/route");
    setResult([{ id: VALID_UUID, originalAudioUrl: "/a.mp3", status: "uploaded", language: "pt" }]);
    const req = new NextRequest(`http://localhost/api/process/${VALID_UUID}`, { method: "POST" });
    const res = await mod.POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("GROQ_API_KEY");
  });
});

// ============================================================
// POST / GET /api/export/[id]
// ============================================================
describe("POST/GET /api/export/[id]", () => {
  let POST: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  let GET: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  beforeEach(async () => {
    reset();
    const mod = await import("@/app/api/export/[id]/route");
    POST = mod.POST;
    GET = mod.GET;
  });

  it("POST rejects malformed id with 400", async () => {
    const req = new NextRequest("http://localhost/api/export/bad", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "bad" }) });
    expect(res.status).toBe(400);
  });

  it("POST returns 404 when project missing", async () => {
    setResult([]);
    const req = new NextRequest(`http://localhost/api/export/${VALID_UUID}`, { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(404);
  });

  it("POST returns 400 when project not ready", async () => {
    setResult([{ id: VALID_UUID, status: "transcribing" }]);
    const req = new NextRequest(`http://localhost/api/export/${VALID_UUID}`, { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(400);
  });

  it("POST returns 400 when no segments selected", async () => {
    // project lookup -> ready, segments lookup -> []
    queueResults([{ id: VALID_UUID, status: "completed", originalAudioUrl: "/a.mp3" }], []);
    const req = new NextRequest(`http://localhost/api/export/${VALID_UUID}`, { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain("No segments");
  });

  it("POST exports successfully on the happy path", async () => {
    queueResults(
      [{ id: VALID_UUID, status: "completed", originalAudioUrl: "/a.mp3" }],
      [{ startTime: 0, endTime: 5, order: 0, textCuts: null }]
    );
    const req = new NextRequest(`http://localhost/api/export/${VALID_UUID}`, { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.message).toContain("completed");
    expect(data.segmentCount).toBe(1);
    expect(typeof data.downloadUrl).toBe("string");
  });

  it("GET reports not-yet-exported", async () => {
    setResult([{ id: VALID_UUID, editedAudioUrl: null }]);
    const req = new NextRequest(`http://localhost/api/export/${VALID_UUID}`);
    const res = await GET(req, { params: Promise.resolve({ id: VALID_UUID }) });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.exported).toBe(false);
  });

  it("GET returns download url when exported", async () => {
    setResult([{ id: VALID_UUID, editedAudioUrl: "/exports/x.mp3" }]);
    const req = new NextRequest(`http://localhost/api/export/${VALID_UUID}`);
    const res = await GET(req, { params: Promise.resolve({ id: VALID_UUID }) });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.exported).toBe(true);
    expect(data.downloadUrl).toBe("/exports/x.mp3");
  });

  it("GET returns 404 when project missing", async () => {
    setResult([]);
    const req = new NextRequest(`http://localhost/api/export/${VALID_UUID}`);
    const res = await GET(req, { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(404);
  });
});

// ============================================================
// POST / GET /api/clips/[id]/export
// ============================================================
describe("POST/GET /api/clips/[id]/export", () => {
  let POST: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  let GET: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  beforeEach(async () => {
    reset();
    exportClipMock.mockClear();
    exportClipMock.mockResolvedValue({ success: true, clipUrl: "/x.mp4", duration: 30 });
    const mod = await import("@/app/api/clips/[id]/export/route");
    POST = mod.POST;
    GET = mod.GET;
  });

  it("POST returns 404 when clip not found", async () => {
    setResult([]);
    const req = new NextRequest(`http://localhost/api/clips/${VALID_UUID}/export`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(404);
  });

  it("POST returns 404 when project audio missing", async () => {
    // clip lookup -> [clip], project lookup -> []
    queueResults([{ id: VALID_UUID, projectId: VALID_UUID2 }], []);
    const req = new NextRequest(`http://localhost/api/clips/${VALID_UUID}/export`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toContain("audio");
  });

  it("POST exports a clip on the happy path", async () => {
    queueResults(
      [{ id: VALID_UUID, projectId: VALID_UUID2 }],
      [{ id: VALID_UUID2, originalAudioUrl: "/a.mp3" }]
    );
    const req = new NextRequest(`http://localhost/api/clips/${VALID_UUID}/export`, {
      method: "POST",
      body: JSON.stringify({ format: "1:1", addCaptions: false }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.format).toBe("1:1");
    expect(exportClipMock).toHaveBeenCalled();
    expect(typeof data.clipUrl).toBe("string");
  });

  it("POST returns 500 when the export service fails", async () => {
    queueResults(
      [{ id: VALID_UUID, projectId: VALID_UUID2 }],
      [{ id: VALID_UUID2, originalAudioUrl: "/a.mp3" }]
    );
    exportClipMock.mockResolvedValueOnce({ success: false, error: "ffmpeg died" });
    const req = new NextRequest(`http://localhost/api/clips/${VALID_UUID}/export`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.error).toContain("ffmpeg");
  });

  it("POST returns 500 when body is invalid (zod throws)", async () => {
    const req = new NextRequest(`http://localhost/api/clips/${VALID_UUID}/export`, {
      method: "POST",
      body: JSON.stringify({ format: "bad-format" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(500);
  });

  it("GET returns 404 when clip not found", async () => {
    setResult([]);
    const req = new NextRequest(`http://localhost/api/clips/${VALID_UUID}/export`);
    const res = await GET(req, { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(404);
  });

  it("GET returns clip status", async () => {
    setResult([{ id: VALID_UUID, status: "ready", clipUrl: "/c.mp4", format: "9:16" }]);
    const req = new NextRequest(`http://localhost/api/clips/${VALID_UUID}/export`);
    const res = await GET(req, { params: Promise.resolve({ id: VALID_UUID }) });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe("ready");
    expect(data.clipUrl).toBe("/c.mp4");
  });
});

// ============================================================
// POST /api/upload
// ============================================================
describe("POST /api/upload", () => {
  let POST: (req: NextRequest) => Promise<Response>;
  beforeEach(async () => {
    reset();
    // Ensure local-storage path (no S3) but writing to fs is mocked below.
    delete process.env.AWS_S3_BUCKET;
    POST = (await import("@/app/api/upload/route")).POST;
  });

  // jsdom/undici loses File.name through a real FormData round-trip (name -> "blob"),
  // so we stub request.formData() with a controlled map instead.
  // A minimal File-like object exposing the fields/methods the route uses.
  const audioFile = (name: string, type: string, size = 10) =>
    ({
      name,
      type,
      size,
      arrayBuffer: async () => new Uint8Array(size).buffer,
    }) as unknown as File;

  const fakeReq = (entries: Record<string, unknown>): NextRequest => {
    const map = new Map<string, unknown>(Object.entries(entries));
    return {
      formData: async () => ({ get: (k: string) => (map.has(k) ? map.get(k) : null) }),
    } as unknown as NextRequest;
  };

  it("returns 400 when no file is provided", async () => {
    const res = await POST(fakeReq({ title: "T" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("No file");
  });

  it("returns 400 for an invalid file extension", async () => {
    const res = await POST(fakeReq({ title: "T", file: audioFile("doc.txt", "text/plain") }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Invalid file type");
  });

  it("returns 400 when title is missing", async () => {
    const res = await POST(fakeReq({ file: audioFile("a.mp3", "audio/mpeg") }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Title");
  });

  it("uploads successfully and creates a project (201)", async () => {
    setResult([{ id: "new-id", title: "My Pod", status: "uploaded" }]);
    const res = await POST(
      fakeReq({ title: "My Pod", language: "en", file: audioFile("a.mp3", "audio/mpeg") })
    );
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.projectId).toBe("new-id");
    expect(captured.values[0]).toMatchObject({ title: "My Pod", status: "uploaded", language: "en" });
  });
});

// ============================================================
// GET /api/health
// ============================================================
describe("GET /api/health", () => {
  it("returns ok status", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.app).toBe("aeropod");
    expect(typeof data.timestamp).toBe("string");
  });
});
