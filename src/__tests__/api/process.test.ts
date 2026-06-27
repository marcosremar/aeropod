import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return {
    db: mockDb,
    projects: "projects_table",
    segments: "segments_table",
  };
});

vi.mock("groq-sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    audio: {
      transcriptions: {
        create: vi.fn().mockResolvedValue({ segments: [], words: [] }),
      },
    },
  })),
}));

vi.mock("@/lib/ai/AIService", () => ({
  aiCompleteJSON: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/audio/forced-aligner", () => ({
  getForcedAlignerService: vi.fn().mockReturnValue({
    alignSegments: vi.fn().mockResolvedValue({ success: false, segments: [] }),
  }),
}));

import { db } from "@/lib/db";

function buildSelectChain(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
  };
}

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const INVALID_UUID = "not-a-uuid";

const SAMPLE_PROJECT = {
  id: VALID_UUID,
  title: "Test Episode",
  status: "uploaded",
  originalAudioUrl: "/uploads/episode.mp3",
  language: "pt",
  userId: null,
  targetDuration: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("POST /api/process/[id]", () => {
  let POST: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;

  function makeRequest(id = VALID_UUID) {
    return new NextRequest(`http://localhost/api/process/${id}`, {
      method: "POST",
    });
  }

  function makeCtx(id = VALID_UUID) {
    return { params: Promise.resolve({ id }) };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/process/[id]/route");
    POST = module.POST;
  });

  it("returns 400 for an invalid UUID format", async () => {
    const res = await POST(makeRequest(INVALID_UUID), makeCtx(INVALID_UUID));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid project ID format");
  });

  it("returns 400 for a UUID-like but wrong string", async () => {
    const badId = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";
    const res = await POST(makeRequest(badId), makeCtx(badId));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid project ID format");
  });

  it("returns 404 when project does not exist in DB", async () => {
    vi.mocked(db.select).mockReturnValue(buildSelectChain([]) as any);

    const res = await POST(makeRequest(), makeCtx());
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("Project not found");
  });

  it("returns 400 when project has no audio file", async () => {
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([{ ...SAMPLE_PROJECT, originalAudioUrl: null }]) as any
    );

    const res = await POST(makeRequest(), makeCtx());
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Project has no audio file");
  });

  it("returns 409 when project status is 'transcribing'", async () => {
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([{ ...SAMPLE_PROJECT, status: "transcribing" }]) as any
    );

    const res = await POST(makeRequest(), makeCtx());
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toBe("Project is already being processed");
  });

  it("returns 409 when project status is 'analyzing'", async () => {
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([{ ...SAMPLE_PROJECT, status: "analyzing" }]) as any
    );

    const res = await POST(makeRequest(), makeCtx());
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toBe("Project is already being processed");
  });

  it("returns 500 when GROQ_API_KEY is not configured", async () => {
    const savedKey = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;

    vi.mocked(db.select).mockReturnValue(buildSelectChain([SAMPLE_PROJECT]) as any);

    // Re-import so the module-level constant re-reads the env (only works if not cached)
    // If the module is cached, this tests the already-captured undefined value
    const res = await POST(makeRequest(), makeCtx());
    const data = await res.json();

    // Restore env var
    if (savedKey !== undefined) process.env.GROQ_API_KEY = savedKey;

    expect(res.status).toBe(500);
    expect(data.error).toBe("GROQ_API_KEY not configured");
  });

  it("returns 500 when DB throws during project lookup", async () => {
    vi.mocked(db.select).mockImplementation(() => {
      throw new Error("DB connection lost");
    });

    const res = await POST(makeRequest(), makeCtx());
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe("Failed to start processing");
  });
});
