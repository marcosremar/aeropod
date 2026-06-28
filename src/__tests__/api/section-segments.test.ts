import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };
  return {
    db: mockDb,
    projectSections: "project_sections_table",
    sectionSegments: "section_segments_table",
    segments: "segments_table",
  };
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

import { db } from "@/lib/db";

const PROJECT_ID = "550e8400-e29b-41d4-a716-446655440000";
const SECTION_ID = "660e8400-e29b-41d4-a716-446655440001";
const SEGMENT_ID = "770e8400-e29b-41d4-a716-446655440002";

const SAMPLE_SECTION = {
  id: SECTION_ID,
  projectId: PROJECT_ID,
  name: "Intro",
  status: "empty",
};

const SAMPLE_SEGMENT = {
  id: SEGMENT_ID,
  projectId: PROJECT_ID,
  text: "Hello world",
  startTime: 0,
  endTime: 5,
};

const SAMPLE_MAPPING = {
  sectionSegments: { sectionId: SECTION_ID, segmentId: SEGMENT_ID, order: 1, confidence: 0.9 },
  segments: SAMPLE_SEGMENT,
};

const ctx = {
  params: Promise.resolve({ id: PROJECT_ID, sectionId: SECTION_ID }),
};

function makeRequest(method: string, body?: object) {
  return new NextRequest(
    `http://localhost/api/projects/${PROJECT_ID}/sections/${SECTION_ID}/segments`,
    {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { "Content-Type": "application/json" } : undefined,
    }
  );
}

function buildSelectChain(returnValue: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(returnValue),
  };
}

describe("POST /api/projects/[id]/sections/[sectionId]/segments", () => {
  let POST: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string; sectionId: string }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const module = await import(
      "@/app/api/projects/[id]/sections/[sectionId]/segments/route"
    );
    POST = module.POST;
  });

  it("returns 400 when segmentId is missing", async () => {
    const res = await POST(makeRequest("POST", {}), ctx);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/segmentId is required/i);
  });

  it("returns 404 when section not found", async () => {
    vi.mocked(db.select).mockReturnValue(buildSelectChain([]) as any);

    const res = await POST(makeRequest("POST", { segmentId: SEGMENT_ID }), ctx);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/section not found/i);
  });

  it("returns 404 when segment not found or belongs to different project", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(buildSelectChain([SAMPLE_SECTION]) as any)
      .mockReturnValueOnce(buildSelectChain([]) as any);

    const res = await POST(makeRequest("POST", { segmentId: SEGMENT_ID }), ctx);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/segment not found/i);
  });

  it("assigns segment to section and returns 200 on success", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(buildSelectChain([SAMPLE_SECTION]) as any)
      .mockReturnValueOnce(buildSelectChain([SAMPLE_SEGMENT]) as any)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      } as any);

    const mockInsert = {
      values: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(db.insert).mockReturnValue(mockInsert as any);

    const mockUpdate = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(db.update).mockReturnValue(mockUpdate as any);

    const res = await POST(makeRequest("POST", { segmentId: SEGMENT_ID }), ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.sectionId).toBe(SECTION_ID);
    expect(data.segmentId).toBe(SEGMENT_ID);
    expect(db.insert).toHaveBeenCalled();
    expect(db.update).toHaveBeenCalled();
  });

  it("sets order to maxOrder+1 when existing mappings exist", async () => {
    const existingMappings = [
      { sectionId: SECTION_ID, segmentId: "other-seg", order: 3, confidence: 1.0 },
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(buildSelectChain([SAMPLE_SECTION]) as any)
      .mockReturnValueOnce(buildSelectChain([SAMPLE_SEGMENT]) as any)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(existingMappings),
      } as any);

    let capturedValues: any = null;
    const mockInsert = {
      values: vi.fn().mockImplementation((v) => {
        capturedValues = v;
        return Promise.resolve(undefined);
      }),
    };
    vi.mocked(db.insert).mockReturnValue(mockInsert as any);

    const mockUpdate = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(db.update).mockReturnValue(mockUpdate as any);

    await POST(makeRequest("POST", { segmentId: SEGMENT_ID }), ctx);

    expect(capturedValues.order).toBe(4);
  });

  it("returns 500 when db throws", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockRejectedValue(new Error("DB error")),
    } as any);

    const res = await POST(makeRequest("POST", { segmentId: SEGMENT_ID }), ctx);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });
});

describe("GET /api/projects/[id]/sections/[sectionId]/segments", () => {
  let GET: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string; sectionId: string }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const module = await import(
      "@/app/api/projects/[id]/sections/[sectionId]/segments/route"
    );
    GET = module.GET;
  });

  it("returns 404 when section not found", async () => {
    vi.mocked(db.select).mockReturnValue(buildSelectChain([]) as any);

    const res = await GET(makeRequest("GET"), ctx);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/section not found/i);
  });

  it("returns segments for a section on success", async () => {
    const mappings = [
      {
        mapping: { sectionId: SECTION_ID, segmentId: SEGMENT_ID, order: 1, confidence: 0.9 },
        segment: SAMPLE_SEGMENT,
      },
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(buildSelectChain([SAMPLE_SECTION]) as any)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(mappings),
      } as any);

    const res = await GET(makeRequest("GET"), ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.sectionId).toBe(SECTION_ID);
    expect(data.segments).toHaveLength(1);
    expect(data.segments[0].id).toBe(SEGMENT_ID);
    expect(data.segments[0].order).toBe(1);
    expect(data.segments[0].confidence).toBe(0.9);
  });

  it("returns empty segments array when no mappings exist", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(buildSelectChain([SAMPLE_SECTION]) as any)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      } as any);

    const res = await GET(makeRequest("GET"), ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.segments).toEqual([]);
  });

  it("returns 500 when db throws", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockRejectedValue(new Error("DB error")),
    } as any);

    const res = await GET(makeRequest("GET"), ctx);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });
});
