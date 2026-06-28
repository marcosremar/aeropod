import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Hoist shared mock references ─────────────────────────────────────────────
const {
  mockDbSelect,
  mockDbInsert,
  mockGroqCreate,
  mockAiCompleteJSON,
  mockFsExistsSync,
  mockFsMkdirSync,
  mockFsWriteFileSync,
  mockFsReadFileSync,
  mockFsUnlinkSync,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockGroqCreate: vi.fn(),
  mockAiCompleteJSON: vi.fn(),
  mockFsExistsSync: vi.fn(),
  mockFsMkdirSync: vi.fn(),
  mockFsWriteFileSync: vi.fn(),
  mockFsReadFileSync: vi.fn(),
  mockFsUnlinkSync: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { select: mockDbSelect, insert: mockDbInsert },
  projects: "projects_table",
  segments: "segments_table",
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

vi.mock("fs", () => ({
  existsSync: mockFsExistsSync,
  mkdirSync: mockFsMkdirSync,
  writeFileSync: mockFsWriteFileSync,
  readFileSync: mockFsReadFileSync,
  unlinkSync: mockFsUnlinkSync,
}));

// Make ffmpeg exec fail fast (no real process spawn)
vi.mock("child_process", () => ({
  exec: vi.fn((_cmd: string, cb: (err: Error) => void) =>
    cb(new Error("ffmpeg not available in tests"))
  ),
}));

vi.mock("groq-sdk", () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      audio: { transcriptions: { create: mockGroqCreate } },
    };
  }),
}));

vi.mock("@/lib/ai/AIService", () => ({
  aiCompleteJSON: mockAiCompleteJSON,
}));

// ─── Constants ────────────────────────────────────────────────────────────────
const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

const SAMPLE_PROJECT = {
  id: VALID_UUID,
  title: "Test Podcast",
  status: "ready",
  userId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const SAMPLE_SEGMENTS = [
  { id: "seg-1", projectId: VALID_UUID, startTime: 0, endTime: 30, order: 1 },
];

const MOCK_TRANSCRIPTION = {
  text: "Hello world transcription text",
  segments: [{ start: 0, end: 5, text: "Hello world" }],
  words: [
    { word: "Hello", start: 0, end: 0.5 },
    { word: "world", start: 0.5, end: 1.0 },
  ],
};

const MOCK_ANALYSIS = {
  topic: "Test topic",
  interestScore: 8,
  clarityScore: 8,
  isTangent: false,
  isRepetition: false,
  keyInsight: "Key insight",
  hasFactualError: false,
  hasContradiction: false,
  isConfusing: false,
  isIncomplete: false,
  needsRerecord: false,
};

type RouteHandler = (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) => Promise<Response>;

// ─── Helper builders ──────────────────────────────────────────────────────────
function buildSelectChainWithLimit(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
  };
}

function buildSelectChainNoLimit(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(returnValue),
  };
}

function buildInsertChain() {
  return { values: vi.fn().mockResolvedValue(undefined) };
}

function makeFile(content = "audio data"): File {
  const file = new File([content], "recording.webm", { type: "audio/webm" });
  if (typeof (file as any).arrayBuffer !== "function") {
    const buf = Buffer.from(content);
    (file as any).arrayBuffer = () => Promise.resolve(buf.buffer.slice(0));
  }
  return file;
}

function makeRequest(
  projectId: string,
  fields: Record<string, string | File | undefined>
): NextRequest {
  const fd = new FormData();
  for (const [key, val] of Object.entries(fields)) {
    if (val != null) fd.append(key, val as any);
  }
  const req = new NextRequest(
    `http://localhost/api/projects/${projectId}/record`,
    { method: "POST" }
  );
  (req as any).formData = vi.fn().mockResolvedValue(fd);
  return req;
}

// ─── Suite: input validation (GROQ key irrelevant) ────────────────────────────
describe("POST /api/projects/[id]/record — validation", () => {
  let POST: RouteHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.GROQ_API_KEY;
    vi.resetModules();
    ({ POST } = await import("@/app/api/projects/[id]/record/route"));

    // Default fs: dir already exists, no mp3
    mockFsExistsSync.mockReturnValue(false);
    mockFsWriteFileSync.mockReturnValue(undefined);
    mockFsMkdirSync.mockReturnValue(undefined);
    mockFsReadFileSync.mockReturnValue(Buffer.from("audio data"));
    mockFsUnlinkSync.mockReturnValue(undefined);
  });

  it("returns 400 for an invalid UUID", async () => {
    const req = makeRequest("not-a-uuid", { audio: makeFile() });
    const res = await POST(req, { params: Promise.resolve({ id: "not-a-uuid" }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid project ID format");
  });

  it("returns 400 for an empty project ID", async () => {
    const req = makeRequest("", { audio: makeFile() });
    const res = await POST(req, { params: Promise.resolve({ id: "" }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid project ID format");
  });

  it("returns 404 when project does not exist", async () => {
    mockDbSelect.mockReturnValueOnce(buildSelectChainWithLimit([]) as any);

    const req = makeRequest(VALID_UUID, { audio: makeFile() });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Project not found");
  });

  it("returns 400 when no audio file is attached", async () => {
    mockDbSelect.mockReturnValueOnce(buildSelectChainWithLimit([SAMPLE_PROJECT]) as any);

    const req = makeRequest(VALID_UUID, {});
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("No audio file provided");
  });
});

// ─── Suite: no GROQ_API_KEY (skip transcription) ──────────────────────────────
describe("POST /api/projects/[id]/record — without GROQ_API_KEY", () => {
  let POST: RouteHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.GROQ_API_KEY;
    vi.resetModules();
    ({ POST } = await import("@/app/api/projects/[id]/record/route"));

    // uploadDir check → false (triggers mkdirSync), mp3 check → false
    mockFsExistsSync.mockReturnValue(false);
    mockFsWriteFileSync.mockReturnValue(undefined);
    mockFsMkdirSync.mockReturnValue(undefined);
    mockFsReadFileSync.mockReturnValue(Buffer.from("audio data"));
    mockFsUnlinkSync.mockReturnValue(undefined);
  });

  it("returns 200 with a segment ID and skip message", async () => {
    mockDbSelect
      .mockReturnValueOnce(buildSelectChainWithLimit([SAMPLE_PROJECT]) as any)
      .mockReturnValueOnce(buildSelectChainNoLimit(SAMPLE_SEGMENTS) as any);
    mockDbInsert.mockReturnValue(buildInsertChain() as any);

    const req = makeRequest(VALID_UUID, { audio: makeFile(), duration: "15" });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.segmentId).toBeDefined();
    expect(body.message).toContain("no API key");
    expect(mockDbInsert).toHaveBeenCalledOnce();
    expect(mockGroqCreate).not.toHaveBeenCalled();
  });

  it("writes the audio file to disk", async () => {
    mockDbSelect
      .mockReturnValueOnce(buildSelectChainWithLimit([SAMPLE_PROJECT]) as any)
      .mockReturnValueOnce(buildSelectChainNoLimit([]) as any);
    mockDbInsert.mockReturnValue(buildInsertChain() as any);

    const req = makeRequest(VALID_UUID, { audio: makeFile() });
    await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });

    expect(mockFsWriteFileSync).toHaveBeenCalledOnce();
  });

  it("creates upload directory when it does not exist", async () => {
    mockFsExistsSync.mockReturnValue(false); // uploadDir missing
    mockDbSelect
      .mockReturnValueOnce(buildSelectChainWithLimit([SAMPLE_PROJECT]) as any)
      .mockReturnValueOnce(buildSelectChainNoLimit([]) as any);
    mockDbInsert.mockReturnValue(buildInsertChain() as any);

    const req = makeRequest(VALID_UUID, { audio: makeFile() });
    await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });

    expect(mockFsMkdirSync).toHaveBeenCalledWith(
      expect.any(String),
      { recursive: true }
    );
  });

  it("skips mkdirSync when upload directory already exists", async () => {
    mockFsExistsSync
      .mockReturnValueOnce(true)   // uploadDir exists
      .mockReturnValueOnce(false); // mp3 doesn't exist
    mockDbSelect
      .mockReturnValueOnce(buildSelectChainWithLimit([SAMPLE_PROJECT]) as any)
      .mockReturnValueOnce(buildSelectChainNoLimit([]) as any);
    mockDbInsert.mockReturnValue(buildInsertChain() as any);

    const req = makeRequest(VALID_UUID, { audio: makeFile() });
    await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });

    expect(mockFsMkdirSync).not.toHaveBeenCalled();
  });

  it("uses default duration of 0 when duration field is absent", async () => {
    mockDbSelect
      .mockReturnValueOnce(buildSelectChainWithLimit([SAMPLE_PROJECT]) as any)
      .mockReturnValueOnce(buildSelectChainNoLimit([]) as any);

    let insertedValues: Record<string, unknown> | null = null;
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockImplementation((v) => {
        insertedValues = v;
        return Promise.resolve(undefined);
      }),
    } as any);

    const req = makeRequest(VALID_UUID, { audio: makeFile() });
    await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });

    // With no existing segments, lastEndTime = 0, duration = 0, so endTime = 0
    expect(insertedValues).toMatchObject({ startTime: 0, endTime: 0 });
  });

  it("returns 500 when DB insert throws", async () => {
    mockDbSelect
      .mockReturnValueOnce(buildSelectChainWithLimit([SAMPLE_PROJECT]) as any)
      .mockReturnValueOnce(buildSelectChainNoLimit([]) as any);
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error("DB insert failed")),
    } as any);

    const req = makeRequest(VALID_UUID, { audio: makeFile() });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("DB insert failed");
  });
});

// ─── Suite: with GROQ_API_KEY (full transcription flow) ───────────────────────
describe("POST /api/projects/[id]/record — with GROQ_API_KEY", () => {
  let POST: RouteHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.GROQ_API_KEY = "test-groq-key";
    vi.resetModules();
    ({ POST } = await import("@/app/api/projects/[id]/record/route"));

    mockFsExistsSync.mockReturnValue(false);
    mockFsWriteFileSync.mockReturnValue(undefined);
    mockFsMkdirSync.mockReturnValue(undefined);
    mockFsReadFileSync.mockReturnValue(Buffer.from("audio data"));
    mockFsUnlinkSync.mockReturnValue(undefined);
    mockGroqCreate.mockResolvedValue(MOCK_TRANSCRIPTION);
    mockAiCompleteJSON.mockResolvedValue(MOCK_ANALYSIS);
  });

  afterEach(() => {
    delete process.env.GROQ_API_KEY;
  });

  it("transcribes audio and returns segment text and topic", async () => {
    mockDbSelect
      .mockReturnValueOnce(buildSelectChainWithLimit([SAMPLE_PROJECT]) as any)
      .mockReturnValueOnce(buildSelectChainNoLimit(SAMPLE_SEGMENTS) as any);
    mockDbInsert.mockReturnValue(buildInsertChain() as any);

    const req = makeRequest(VALID_UUID, { audio: makeFile(), duration: "10" });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.segmentId).toBeDefined();
    expect(body.text).toBe("Hello world transcription text");
    expect(body.topic).toBe("Test topic");
    expect(body.analysis).toBeDefined();
    expect(mockGroqCreate).toHaveBeenCalledOnce();
    expect(mockDbInsert).toHaveBeenCalledOnce();
  });

  it("still succeeds when AI analysis throws (uses default values)", async () => {
    mockAiCompleteJSON.mockRejectedValue(new Error("AI timeout"));
    mockDbSelect
      .mockReturnValueOnce(buildSelectChainWithLimit([SAMPLE_PROJECT]) as any)
      .mockReturnValueOnce(buildSelectChainNoLimit([]) as any);
    mockDbInsert.mockReturnValue(buildInsertChain() as any);

    const req = makeRequest(VALID_UUID, { audio: makeFile() });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    const body = await res.json();

    // Route catches analysis error and falls back to defaults
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockDbInsert).toHaveBeenCalledOnce();
  });

  it("returns 500 when Groq transcription throws", async () => {
    mockGroqCreate.mockRejectedValue(new Error("Groq API error"));
    mockDbSelect
      .mockReturnValueOnce(buildSelectChainWithLimit([SAMPLE_PROJECT]) as any);

    const req = makeRequest(VALID_UUID, { audio: makeFile() });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Groq API error");
  });

  it("stores word timestamps in the inserted segment", async () => {
    mockDbSelect
      .mockReturnValueOnce(buildSelectChainWithLimit([SAMPLE_PROJECT]) as any)
      .mockReturnValueOnce(buildSelectChainNoLimit([]) as any);

    let insertedValues: Record<string, unknown> | null = null;
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockImplementation((v) => {
        insertedValues = v;
        return Promise.resolve(undefined);
      }),
    } as any);

    const req = makeRequest(VALID_UUID, { audio: makeFile() });
    await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });

    expect(insertedValues).toMatchObject({
      text: "Hello world transcription text",
      wordTimestamps: expect.arrayContaining([
        expect.objectContaining({ word: "Hello" }),
        expect.objectContaining({ word: "world" }),
      ]),
    });
  });
});
