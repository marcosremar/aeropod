import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => {
  const mockDb = {
    select: vi.fn(),
    update: vi.fn(),
  };
  return {
    db: mockDb,
    segments: "segments_table",
  };
});

import { db } from "@/lib/db";

function buildSelectChain(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
  };
}

function buildUpdateChain(returnValue: unknown[]) {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnValue),
  };
}

const PROJECT_ID = "550e8400-e29b-41d4-a716-446655440000";
const SEGMENT_ID = "660e8400-e29b-41d4-a716-446655440001";

const SAMPLE_SEGMENT = {
  id: SEGMENT_ID,
  projectId: PROJECT_ID,
  text: "Welcome to the show",
  editedText: null,
  wordTimestamps: null,
  textCuts: null,
  isSelected: true,
  topic: "intro",
  interestScore: 0.9,
  clarityScore: 0.8,
  startTime: 0,
  endTime: 30,
  order: 1,
  speaker: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("GET /api/projects/[id]/segments/[segmentId]", () => {
  let GET: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string; segmentId: string }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import(
      "@/app/api/projects/[id]/segments/[segmentId]/route"
    );
    GET = module.GET;
  });

  it("returns the segment when it exists", async () => {
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([SAMPLE_SEGMENT]) as any
    );

    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/segments/${SEGMENT_ID}`
    );
    const ctx = {
      params: Promise.resolve({ id: PROJECT_ID, segmentId: SEGMENT_ID }),
    };

    const res = await GET(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.segment.id).toBe(SEGMENT_ID);
    expect(data.segment.text).toBe("Welcome to the show");
  });

  it("returns 404 when segment does not exist", async () => {
    vi.mocked(db.select).mockReturnValue(buildSelectChain([]) as any);

    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/segments/${SEGMENT_ID}`
    );
    const ctx = {
      params: Promise.resolve({ id: PROJECT_ID, segmentId: SEGMENT_ID }),
    };

    const res = await GET(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toMatch(/not found/i);
  });

  it("returns 500 when the DB throws", async () => {
    vi.mocked(db.select).mockImplementation(() => {
      throw new Error("DB error");
    });

    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/segments/${SEGMENT_ID}`
    );
    const ctx = {
      params: Promise.resolve({ id: PROJECT_ID, segmentId: SEGMENT_ID }),
    };

    const res = await GET(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toMatch(/failed to fetch/i);
  });
});

describe("PATCH /api/projects/[id]/segments/[segmentId]", () => {
  let PATCH: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string; segmentId: string }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import(
      "@/app/api/projects/[id]/segments/[segmentId]/route"
    );
    PATCH = module.PATCH;
  });

  it("returns 404 when segment does not exist", async () => {
    vi.mocked(db.select).mockReturnValue(buildSelectChain([]) as any);

    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/segments/${SEGMENT_ID}`,
      {
        method: "PATCH",
        body: JSON.stringify({ text: "New text" }),
        headers: { "Content-Type": "application/json" },
      }
    );
    const ctx = {
      params: Promise.resolve({ id: PROJECT_ID, segmentId: SEGMENT_ID }),
    };

    const res = await PATCH(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toMatch(/not found/i);
  });

  it("updates allowed fields and returns the updated segment", async () => {
    const updatedSegment = { ...SAMPLE_SEGMENT, text: "Updated text", editedText: "edited" };
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([SAMPLE_SEGMENT]) as any
    );
    vi.mocked(db.update).mockReturnValue(
      buildUpdateChain([updatedSegment]) as any
    );

    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/segments/${SEGMENT_ID}`,
      {
        method: "PATCH",
        body: JSON.stringify({ text: "Updated text", editedText: "edited" }),
        headers: { "Content-Type": "application/json" },
      }
    );
    const ctx = {
      params: Promise.resolve({ id: PROJECT_ID, segmentId: SEGMENT_ID }),
    };

    const res = await PATCH(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.segment.text).toBe("Updated text");
  });

  it("strips disallowed fields from the update", async () => {
    const updateChain = buildUpdateChain([SAMPLE_SEGMENT]);
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([SAMPLE_SEGMENT]) as any
    );
    vi.mocked(db.update).mockReturnValue(updateChain as any);

    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/segments/${SEGMENT_ID}`,
      {
        method: "PATCH",
        body: JSON.stringify({ text: "ok", id: "hacked", projectId: "hacked", order: 999 }),
        headers: { "Content-Type": "application/json" },
      }
    );
    const ctx = {
      params: Promise.resolve({ id: PROJECT_ID, segmentId: SEGMENT_ID }),
    };

    await PATCH(req, ctx);

    const setMock = vi.mocked(updateChain.set);
    expect(setMock).toHaveBeenCalledTimes(1);
    const passedUpdate = setMock.mock.calls[0][0] as Record<string, unknown>;
    expect(passedUpdate.text).toBe("ok");
    expect(passedUpdate.id).toBeUndefined();
    expect(passedUpdate.projectId).toBeUndefined();
    expect(passedUpdate.order).toBeUndefined();
  });

  it("allows updating isSelected, topic, interestScore, and clarityScore", async () => {
    const updateChain = buildUpdateChain([
      { ...SAMPLE_SEGMENT, isSelected: false, topic: "outro", interestScore: 0.5, clarityScore: 0.6 },
    ]);
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([SAMPLE_SEGMENT]) as any
    );
    vi.mocked(db.update).mockReturnValue(updateChain as any);

    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/segments/${SEGMENT_ID}`,
      {
        method: "PATCH",
        body: JSON.stringify({ isSelected: false, topic: "outro", interestScore: 0.5, clarityScore: 0.6 }),
        headers: { "Content-Type": "application/json" },
      }
    );
    const ctx = {
      params: Promise.resolve({ id: PROJECT_ID, segmentId: SEGMENT_ID }),
    };

    const res = await PATCH(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    const setMock = vi.mocked(updateChain.set);
    const passed = setMock.mock.calls[0][0] as Record<string, unknown>;
    expect(passed.isSelected).toBe(false);
    expect(passed.topic).toBe("outro");
    expect(passed.interestScore).toBe(0.5);
    expect(passed.clarityScore).toBe(0.6);
  });

  it("returns 500 when the DB throws on select", async () => {
    vi.mocked(db.select).mockImplementation(() => {
      throw new Error("DB error");
    });

    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/segments/${SEGMENT_ID}`,
      {
        method: "PATCH",
        body: JSON.stringify({ text: "New text" }),
        headers: { "Content-Type": "application/json" },
      }
    );
    const ctx = {
      params: Promise.resolve({ id: PROJECT_ID, segmentId: SEGMENT_ID }),
    };

    const res = await PATCH(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toMatch(/failed to update/i);
  });

  it("returns 500 when the DB throws on update", async () => {
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([SAMPLE_SEGMENT]) as any
    );
    vi.mocked(db.update).mockImplementation(() => {
      throw new Error("DB update error");
    });

    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/segments/${SEGMENT_ID}`,
      {
        method: "PATCH",
        body: JSON.stringify({ text: "New text" }),
        headers: { "Content-Type": "application/json" },
      }
    );
    const ctx = {
      params: Promise.resolve({ id: PROJECT_ID, segmentId: SEGMENT_ID }),
    };

    const res = await PATCH(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toMatch(/failed to update/i);
  });
});
