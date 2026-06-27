import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockDb, tableStubs } from "../helpers/mock-db";

const { mockDb, setResult, queueResults, captured, reset } = createMockDb();

// ---- Shared module mocks ----
vi.mock("@/lib/db", () => ({
  db: mockDb,
  ...tableStubs("projects", "segments", "users", "socialClips"),
}));

vi.mock("@/lib/db/schema", () => ({
  ...tableStubs("projects", "segments", "users", "socialClips"),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "eq"),
  and: vi.fn(() => "and"),
  desc: vi.fn(() => "desc"),
  asc: vi.fn(() => "asc"),
}));

// bcryptjs for login route
const bcryptCompare = vi.fn(async () => true);
vi.mock("bcryptjs", () => ({
  default: { compare: (...a: unknown[]) => bcryptCompare(...a) },
  compare: (...a: unknown[]) => bcryptCompare(...a),
}));

// auth/session
const setSession = vi.fn(async () => {});
const clearSession = vi.fn(async () => {});
const getSession = vi.fn(async () => ({
  userId: "u1",
  email: "a@b.c",
  name: "Alice",
  plan: "free",
}));
vi.mock("@/lib/auth/session", () => ({
  setSession: (...a: unknown[]) => setSession(...a),
  clearSession: (...a: unknown[]) => clearSession(...a),
  getSession: (...a: unknown[]) => getSession(...a),
  getOrCreateUser: vi.fn(async () => ({ id: "u1", email: "a@b.c" })),
}));

// social clip service used by clips route
const getProjectClips = vi.fn(async () => [] as unknown[]);
const generateSuggestions = vi.fn(async () => [] as unknown[]);
const saveClip = vi.fn(async (_pid: string, s: unknown) => s);
const deleteClip = vi.fn(async () => {});
vi.mock("@/lib/clips/social-clip-service", () => ({
  socialClipService: {
    getProjectClips: (...a: unknown[]) => getProjectClips(...a),
    generateSuggestions: (...a: unknown[]) => generateSuggestions(...a),
    saveClip: (...a: unknown[]) => saveClip(...(a as [string, unknown])),
    deleteClip: (...a: unknown[]) => deleteClip(...a),
  },
}));

// AI + groq + fs for record route
vi.mock("@/lib/ai/AIService", () => ({
  aiCompleteJSON: vi.fn(async () => ({
    topic: "AI Topic",
    interestScore: 8,
    clarityScore: 9,
    isTangent: false,
    isRepetition: false,
    keyInsight: "insight",
    hasFactualError: false,
    hasContradiction: false,
    isConfusing: false,
    isIncomplete: false,
    needsRerecord: false,
  })),
}));

const groqTranscribe = vi.fn(async () => ({
  text: "transcribed text",
  segments: [{ start: 0, end: 5, text: "transcribed text" }],
  words: [{ word: "transcribed", start: 0, end: 1 }],
}));
vi.mock("groq-sdk", () => ({
  default: class {
    audio = { transcriptions: { create: (...a: unknown[]) => groqTranscribe(...a) } };
  },
}));

vi.mock("fs", () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  readFileSync: vi.fn(() => Buffer.from("audio")),
}));

const VALID_UUID = "11111111-1111-1111-1111-111111111111";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  reset();
  bcryptCompare.mockReset();
  bcryptCompare.mockResolvedValue(true);
  setSession.mockClear();
  clearSession.mockClear();
  getSession.mockReset();
  getSession.mockResolvedValue({ userId: "u1", email: "a@b.c", name: "Alice", plan: "free" });
  getProjectClips.mockReset();
  getProjectClips.mockResolvedValue([]);
  generateSuggestions.mockReset();
  generateSuggestions.mockResolvedValue([]);
  saveClip.mockClear();
  deleteClip.mockReset();
  deleteClip.mockResolvedValue(undefined);
  groqTranscribe.mockClear();
  delete process.env.GROQ_API_KEY;
});

// ============================================================
// POST /api/auth/login
// ============================================================
describe("POST /api/auth/login", () => {
  async function post(body: unknown) {
    const { POST } = await import("@/app/api/auth/login/route");
    return POST(
      new NextRequest("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      })
    );
  }

  it("rejects invalid input with 400", async () => {
    const res = await post({ email: "not-an-email", password: "" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/required/i);
  });

  it("returns 401 when user not found", async () => {
    setResult([]); // no user
    const res = await post({ email: "alice@example.com", password: "secret" });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/Invalid email or password/);
  });

  it("returns 401 when password does not match", async () => {
    setResult([{ id: "u1", email: "alice@example.com", password: "hash", name: "Alice", plan: "free" }]);
    bcryptCompare.mockResolvedValue(false);
    const res = await post({ email: "alice@example.com", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("logs in successfully and creates a session", async () => {
    setResult([{ id: "u1", email: "alice@example.com", password: "hash", name: "Alice", plan: "pro" }]);
    bcryptCompare.mockResolvedValue(true);
    const res = await post({ email: "alice@example.com", password: "secret" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.user).toMatchObject({ id: "u1", email: "alice@example.com", plan: "pro" });
    expect(setSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", email: "alice@example.com" })
    );
  });

  it("returns 500 when DB throws", async () => {
    setSession.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    setResult([{ id: "u1", email: "alice@example.com", password: "hash" }]);
    bcryptCompare.mockResolvedValue(true);
    const res = await post({ email: "alice@example.com", password: "secret" });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Failed to login");
  });
});

// ============================================================
// POST /api/auth/logout
// ============================================================
describe("POST /api/auth/logout", () => {
  async function post() {
    const { POST } = await import("@/app/api/auth/logout/route");
    return POST(new NextRequest("http://localhost/api/auth/logout", { method: "POST" }));
  }

  it("clears the session and returns success", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(clearSession).toHaveBeenCalled();
  });

  it("returns 500 when clearSession throws", async () => {
    clearSession.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const res = await post();
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Failed to logout");
  });
});

// ============================================================
// GET /api/auth/me
// ============================================================
describe("GET /api/auth/me", () => {
  async function get() {
    const { GET } = await import("@/app/api/auth/me/route");
    return GET(new NextRequest("http://localhost/api/auth/me"));
  }

  it("returns the user when authenticated", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user).toMatchObject({ id: "u1", email: "a@b.c", name: "Alice", plan: "free" });
  });

  it("returns 401 when no session", async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await get();
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Not authenticated");
  });

  it("returns 500 when getSession throws", async () => {
    getSession.mockRejectedValueOnce(new Error("boom"));
    const res = await get();
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Failed to get user");
  });
});

// ============================================================
// GET /api/auth/demo
// ============================================================
describe("GET /api/auth/demo", () => {
  async function get(url: string) {
    const { GET } = await import("@/app/api/auth/demo/route");
    return GET(new NextRequest(url));
  }

  it("redirects to default dashboard and sets session cookie", async () => {
    const res = await get("http://localhost/api/auth/demo");
    // NextResponse.redirect -> 307
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("location")).toContain("/dashboard");
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain("aeropod_session");
  });

  it("honors the redirect query param", async () => {
    const res = await get("http://localhost/api/auth/demo?redirect=/editor/abc");
    expect(res.headers.get("location")).toContain("/editor/abc");
  });
});

// ============================================================
// /api/projects/[id]  (GET / PATCH / DELETE)
// ============================================================
describe("GET /api/projects/[id]", () => {
  async function get(id: string) {
    const { GET } = await import("@/app/api/projects/[id]/route");
    return GET(new NextRequest(`http://localhost/api/projects/${id}`), ctx(id));
  }

  it("rejects an invalid UUID with 400", async () => {
    const res = await get("not-a-uuid");
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid project ID format");
  });

  it("returns 404 when the project does not exist", async () => {
    setResult([]);
    const res = await get(VALID_UUID);
    expect(res.status).toBe(404);
  });

  it("returns the project and its segments", async () => {
    queueResults(
      [{ id: VALID_UUID, title: "Pod" }], // project lookup
      [{ id: "s1", projectId: VALID_UUID }] // segments
    );
    const res = await get(VALID_UUID);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.project).toMatchObject({ id: VALID_UUID });
    expect(data.segments).toHaveLength(1);
  });
});

describe("PATCH /api/projects/[id]", () => {
  async function patch(id: string, body: unknown) {
    const { PATCH } = await import("@/app/api/projects/[id]/route");
    return PATCH(
      new NextRequest(`http://localhost/api/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
      ctx(id)
    );
  }

  it("rejects an invalid UUID with 400", async () => {
    const res = await patch("bad", { title: "X" });
    expect(res.status).toBe(400);
  });

  it("rejects invalid body (bad title) with 400 and details", async () => {
    const res = await patch(VALID_UUID, { title: "" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid input");
    expect(Array.isArray(data.details)).toBe(true);
  });

  it("returns 404 when the project does not exist", async () => {
    setResult([]);
    const res = await patch(VALID_UUID, { title: "New" });
    expect(res.status).toBe(404);
  });

  it("updates the title and returns the project", async () => {
    queueResults(
      [{ id: VALID_UUID, title: "Old" }], // existence check
      [], // awaited db.update(...).set(...) for the title
      [{ id: VALID_UUID, title: "New" }], // updated project select
      [{ id: "s1" }] // updated segments select
    );
    const res = await patch(VALID_UUID, { title: "New" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe("Project updated successfully");
    expect(data.project).toMatchObject({ title: "New" });
    expect(captured.sets.some((s) => (s as { title?: string }).title === "New")).toBe(true);
  });

  it("returns 500 when DB throws", async () => {
    queueResults([{ id: VALID_UUID }]);
    // make the update throw
    (mockDb.update as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const res = await patch(VALID_UUID, { title: "New" });
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/projects/[id]", () => {
  async function del(id: string) {
    const { DELETE } = await import("@/app/api/projects/[id]/route");
    return DELETE(new NextRequest(`http://localhost/api/projects/${id}`, { method: "DELETE" }), ctx(id));
  }

  it("rejects an invalid UUID with 400", async () => {
    const res = await del("bad");
    expect(res.status).toBe(400);
  });

  it("returns 404 when the project does not exist", async () => {
    setResult([]);
    const res = await del(VALID_UUID);
    expect(res.status).toBe(404);
  });

  it("deletes the project", async () => {
    setResult([{ id: VALID_UUID }]);
    const res = await del(VALID_UUID);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe("Project deleted successfully");
    expect(captured.deletes).toBeGreaterThan(0);
  });
});

// ============================================================
// POST /api/projects/[id]/record
// ============================================================
describe("POST /api/projects/[id]/record", () => {
  async function post(id: string, form?: FormData) {
    const { POST } = await import("@/app/api/projects/[id]/record/route");
    const init: { method: string; body?: BodyInit } = { method: "POST" };
    if (form) init.body = form;
    return POST(new NextRequest(`http://localhost/api/projects/${id}/record`, init), ctx(id));
  }

  it("rejects an invalid UUID with 400", async () => {
    const res = await post("bad", new FormData());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid project ID format");
  });

  it("returns 404 when the project does not exist", async () => {
    setResult([]);
    const fd = new FormData();
    const res = await post(VALID_UUID, fd);
    expect(res.status).toBe(404);
  });

  it("returns 400 when no audio file is provided", async () => {
    setResult([{ id: VALID_UUID }]); // project exists
    const fd = new FormData();
    fd.set("duration", "10");
    const res = await post(VALID_UUID, fd);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("No audio file provided");
  });

  it("saves audio without transcription when GROQ_API_KEY is absent", async () => {
    delete process.env.GROQ_API_KEY;
    queueResults(
      [{ id: VALID_UUID }], // project exists
      [] // existing segments
    );
    const fd = new FormData();
    fd.set("audio", new File(["abc"], "rec.webm", { type: "audio/webm" }));
    fd.set("duration", "12");
    const res = await post(VALID_UUID, fd);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.segmentId).toBeTruthy();
    expect(captured.values[0]).toMatchObject({
      projectId: VALID_UUID,
      isSelected: true,
    });
  });

  it("returns 500 when processing throws", async () => {
    setResult([{ id: VALID_UUID }]);
    const fd = new FormData();
    fd.set("audio", new File(["abc"], "rec.webm", { type: "audio/webm" }));
    // make insert throw
    (mockDb.insert as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("insert boom");
    });
    const res = await post(VALID_UUID, fd);
    expect(res.status).toBe(500);
  });
});

// ============================================================
// /api/projects/[id]/clips  (GET / POST / DELETE)
// ============================================================
describe("GET /api/projects/[id]/clips", () => {
  async function get(id: string) {
    const { GET } = await import("@/app/api/projects/[id]/clips/route");
    return GET(new NextRequest(`http://localhost/api/projects/${id}/clips`), ctx(id));
  }

  it("returns clips and a count", async () => {
    getProjectClips.mockResolvedValueOnce([{ id: "c1" }, { id: "c2" }]);
    const res = await get(VALID_UUID);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.count).toBe(2);
    expect(data.clips).toHaveLength(2);
  });

  it("returns 500 when the service throws", async () => {
    getProjectClips.mockRejectedValueOnce(new Error("boom"));
    const res = await get(VALID_UUID);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Failed to get clips");
  });
});

describe("POST /api/projects/[id]/clips", () => {
  async function post(id: string, body: unknown) {
    const { POST } = await import("@/app/api/projects/[id]/clips/route");
    return POST(
      new NextRequest(`http://localhost/api/projects/${id}/clips`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
      ctx(id)
    );
  }

  it("returns 404 when the project does not exist", async () => {
    setResult([]); // project lookup empty
    const res = await post(VALID_UUID, { count: 3 });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Project not found");
  });

  it("returns 400 when there are no segments", async () => {
    queueResults(
      [{ id: VALID_UUID }], // project exists
      [] // no segments
    );
    const res = await post(VALID_UUID, { count: 3 });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("No segments available");
  });

  it("generates suggestions on the happy path", async () => {
    queueResults(
      [{ id: VALID_UUID }], // project
      [{ id: "s1", startTime: 0 }] // segments
    );
    generateSuggestions.mockResolvedValueOnce([{ title: "Clip A" }]);
    const res = await post(VALID_UUID, { count: 2, save: false });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.saved).toBe(false);
    expect(data.suggestions).toHaveLength(1);
    expect(generateSuggestions).toHaveBeenCalled();
  });

  it("saves clips when save=true", async () => {
    queueResults(
      [{ id: VALID_UUID }],
      [{ id: "s1", startTime: 0 }]
    );
    generateSuggestions.mockResolvedValueOnce([{ title: "Clip A" }]);
    const res = await post(VALID_UUID, { count: 1, save: true });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.saved).toBe(true);
    expect(data.savedClips).toHaveLength(1);
    expect(saveClip).toHaveBeenCalled();
  });

  it("returns 500 on invalid body (count out of range)", async () => {
    // zod .parse throws -> caught -> 500
    const res = await post(VALID_UUID, { count: 99 });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Failed to generate clips");
  });
});

describe("DELETE /api/projects/[id]/clips", () => {
  async function del(id: string, query = "") {
    const { DELETE } = await import("@/app/api/projects/[id]/clips/route");
    return DELETE(
      new NextRequest(`http://localhost/api/projects/${id}/clips${query}`, { method: "DELETE" }),
      ctx(id)
    );
  }

  it("returns 400 when clipId is missing", async () => {
    const res = await del(VALID_UUID);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("clipId parameter required");
  });

  it("deletes the clip when clipId is provided", async () => {
    const res = await del(VALID_UUID, "?clipId=c1");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(deleteClip).toHaveBeenCalledWith("c1");
  });

  it("returns 500 when the service throws", async () => {
    deleteClip.mockRejectedValueOnce(new Error("boom"));
    const res = await del(VALID_UUID, "?clipId=c1");
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Failed to delete clip");
  });
});
