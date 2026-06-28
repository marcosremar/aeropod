import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Hoist service mocks ──────────────────────────────────────────────────────
const {
  mockAutoMapSegments,
  mockSaveMapping,
  mockAssignSegmentToSection,
  mockRemoveSegmentFromSection,
  mockReorderSectionSegments,
} = vi.hoisted(() => ({
  mockAutoMapSegments: vi.fn(),
  mockSaveMapping: vi.fn(),
  mockAssignSegmentToSection: vi.fn(),
  mockRemoveSegmentFromSection: vi.fn(),
  mockReorderSectionSegments: vi.fn(),
}));

vi.mock("@/lib/sections/SegmentMappingService", () => ({
  SegmentMappingService: function MockSegmentMappingService() {
    return {
      autoMapSegments: mockAutoMapSegments,
      saveMapping: mockSaveMapping,
      assignSegmentToSection: mockAssignSegmentToSection,
      removeSegmentFromSection: mockRemoveSegmentFromSection,
      reorderSectionSegments: mockReorderSectionSegments,
    };
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
    projectTemplates: "project_templates_table",
    templateSections: "template_sections_table",
    segments: "segments_table",
    sectionSegments: "section_segments_table",
  };
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  asc: vi.fn(),
}));

import { db } from "@/lib/db";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PROJECT_ID = "550e8400-e29b-41d4-a716-446655440000";
const TEMPLATE_ID = "660e8400-e29b-41d4-a716-446655440001";

const SAMPLE_PROJECT = {
  id: PROJECT_ID,
  title: "My Podcast",
  currentTemplateId: TEMPLATE_ID,
  status: "ready",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const SAMPLE_SECTIONS = [
  {
    id: "sec-1",
    templateId: TEMPLATE_ID,
    name: "Introduction",
    type: "intro",
    description: "Episode intro",
    minDuration: 30,
    maxDuration: 120,
    suggestedDuration: 60,
    isRequired: true,
    order: 1,
    exampleText: null,
  },
];

const SAMPLE_SEGMENTS = [
  {
    id: "seg-1",
    projectId: PROJECT_ID,
    title: "Welcome segment",
    summary: "Welcome to the podcast",
    startTime: 0,
    endTime: 60,
    topics: [],
  },
];

const SAMPLE_MAPPING_RESULT = {
  mappings: [
    {
      segmentId: "seg-1",
      sectionId: "sec-1",
      templateSectionId: "tmpl-sec-1",
      confidence: 0.9,
      reasoning: "Good match",
    },
  ],
  unmappedSegments: [],
  issues: [],
  overallConfidence: 0.9,
};

// For queries that terminate with .limit() or .orderBy()
function buildSelectChain(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
    orderBy: vi.fn().mockResolvedValue(returnValue),
    innerJoin: vi.fn().mockReturnThis(),
  };
}

// For queries that terminate with .where() (no .limit() / .orderBy() suffix)
function buildSelectChainTerminatesAtWhere(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(returnValue),
    innerJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
    orderBy: vi.fn().mockResolvedValue(returnValue),
  };
}

const ctx = { params: Promise.resolve({ id: PROJECT_ID }) };

function makeRequest(method: string, body?: object) {
  return new NextRequest(
    `http://localhost/api/projects/${PROJECT_ID}/auto-map`,
    {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { "Content-Type": "application/json" } : undefined,
    }
  );
}

type AutoMapHandler = (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) => Promise<Response>;

// ─── POST /api/projects/[id]/auto-map ────────────────────────────────────────

describe("POST /api/projects/[id]/auto-map", () => {
  let POST: AutoMapHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/projects/[id]/auto-map/route");
    POST = module.POST;
  });

  it("returns 404 when project does not exist", async () => {
    vi.mocked(db.select).mockReturnValueOnce(buildSelectChain([]) as any);

    const res = await POST(makeRequest("POST"), ctx);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/not found/i);
  });

  it("returns 400 when no template is configured for the project", async () => {
    const projectNoTemplate = { ...SAMPLE_PROJECT, currentTemplateId: null };
    vi.mocked(db.select)
      .mockReturnValueOnce(buildSelectChain([projectNoTemplate]) as any)
      // projectTemplates lookup returns empty
      .mockReturnValueOnce(buildSelectChain([]) as any);

    const res = await POST(makeRequest("POST"), ctx);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/no template/i);
  });

  it("auto-maps segments and saves mappings by default", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(buildSelectChain([SAMPLE_PROJECT]) as any)
      // projectTemplates lookup (no explicit templateId) — returns empty, falls back to project.currentTemplateId
      .mockReturnValueOnce(buildSelectChain([]) as any);
    mockAutoMapSegments.mockResolvedValue(SAMPLE_MAPPING_RESULT);
    mockSaveMapping.mockResolvedValue(undefined);

    const res = await POST(makeRequest("POST"), ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.templateId).toBe(TEMPLATE_ID);
    expect(data.mappings).toHaveLength(1);
    expect(data.saved).toBe(true);
    expect(mockSaveMapping).toHaveBeenCalledWith(
      PROJECT_ID,
      SAMPLE_MAPPING_RESULT.mappings
    );
  });

  it("skips saving when save=false is provided", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(buildSelectChain([SAMPLE_PROJECT]) as any)
      .mockReturnValueOnce(buildSelectChain([]) as any);
    mockAutoMapSegments.mockResolvedValue(SAMPLE_MAPPING_RESULT);

    const res = await POST(makeRequest("POST", { save: false }), ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.saved).toBe(false);
    expect(mockSaveMapping).not.toHaveBeenCalled();
  });

  it("uses an explicit templateId when provided in request body", async () => {
    const explicitTemplateId = "explicit-tmpl-999";
    vi.mocked(db.select).mockReturnValueOnce(
      buildSelectChain([SAMPLE_PROJECT]) as any
    );
    mockAutoMapSegments.mockResolvedValue(SAMPLE_MAPPING_RESULT);

    const res = await POST(
      makeRequest("POST", { templateId: explicitTemplateId }),
      ctx
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockAutoMapSegments).toHaveBeenCalledWith(
      PROJECT_ID,
      explicitTemplateId
    );
  });

  it("falls back to projectTemplates table when project has no currentTemplateId", async () => {
    const projectNoTemplate = { ...SAMPLE_PROJECT, currentTemplateId: null };
    vi.mocked(db.select)
      .mockReturnValueOnce(buildSelectChain([projectNoTemplate]) as any)
      .mockReturnValueOnce(
        buildSelectChain([{ projectId: PROJECT_ID, templateId: TEMPLATE_ID }]) as any
      );
    mockAutoMapSegments.mockResolvedValue(SAMPLE_MAPPING_RESULT);

    const res = await POST(makeRequest("POST"), ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.templateId).toBe(TEMPLATE_ID);
  });

  it("returns 500 on unexpected error", async () => {
    vi.mocked(db.select).mockImplementation(() => {
      throw new Error("DB connection failed");
    });

    const res = await POST(makeRequest("POST"), ctx);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/db connection failed/i);
  });
});

// ─── GET /api/projects/[id]/auto-map ─────────────────────────────────────────

describe("GET /api/projects/[id]/auto-map", () => {
  let GET: AutoMapHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/projects/[id]/auto-map/route");
    GET = module.GET;
  });

  it("returns 404 when project does not exist", async () => {
    vi.mocked(db.select).mockReturnValueOnce(buildSelectChain([]) as any);

    const res = await GET(makeRequest("GET"), ctx);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/not found/i);
  });

  it("returns empty mapping data when no template is selected", async () => {
    const projectNoTemplate = { ...SAMPLE_PROJECT, currentTemplateId: null };
    vi.mocked(db.select)
      .mockReturnValueOnce(buildSelectChain([projectNoTemplate]) as any)
      .mockReturnValueOnce(buildSelectChain([]) as any); // projectTemplates empty

    const res = await GET(makeRequest("GET"), ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.sections).toEqual([]);
    expect(data.mappings).toEqual([]);
    expect(data.unmappedSegments).toEqual([]);
  });

  it("returns sections, mappings, and unmapped segments for a configured project", async () => {
    const mappingRow = {
      sectionSegment: {
        sectionId: "sec-1",
        segmentId: "seg-1",
        confidence: 0.9,
        order: 0,
      },
      segment: SAMPLE_SEGMENTS[0],
    };

    vi.mocked(db.select)
      // 1. project lookup → .limit(1)
      .mockReturnValueOnce(buildSelectChain([SAMPLE_PROJECT]) as any)
      // 2. templateSections → .orderBy(...)
      .mockReturnValueOnce(buildSelectChain(SAMPLE_SECTIONS) as any)
      // 3. segments → .where(...)  (terminal)
      .mockReturnValueOnce(buildSelectChainTerminatesAtWhere(SAMPLE_SEGMENTS) as any)
      // 4. sectionSegments innerJoin → .where(...)  (terminal)
      .mockReturnValueOnce(buildSelectChainTerminatesAtWhere([mappingRow]) as any);

    const res = await GET(makeRequest("GET"), ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.templateId).toBe(TEMPLATE_ID);
    expect(data.sections).toHaveLength(1);
    expect(data.sections[0].id).toBe("sec-1");
    expect(data.mappings).toHaveLength(1);
    expect(data.mappings[0].segmentId).toBe("seg-1");
    expect(data.unmappedSegments).toHaveLength(0);
  });

  it("correctly identifies unmapped segments", async () => {
    const extraSegment = {
      id: "seg-unmapped",
      projectId: PROJECT_ID,
      title: "Orphan segment",
      summary: null,
      startTime: 90,
      endTime: 120,
      topics: [],
    };

    vi.mocked(db.select)
      // 1. project lookup → .limit(1)
      .mockReturnValueOnce(buildSelectChain([SAMPLE_PROJECT]) as any)
      // 2. templateSections → .orderBy(...)
      .mockReturnValueOnce(buildSelectChain(SAMPLE_SECTIONS) as any)
      // 3. segments → .where(...) terminal
      .mockReturnValueOnce(
        buildSelectChainTerminatesAtWhere([...SAMPLE_SEGMENTS, extraSegment]) as any
      )
      // 4. sectionSegments innerJoin → .where(...) terminal — no mappings
      .mockReturnValueOnce(buildSelectChainTerminatesAtWhere([]) as any);

    const res = await GET(makeRequest("GET"), ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.unmappedSegments).toHaveLength(2);
    expect(data.mappings).toHaveLength(0);
    expect(data.overallConfidence).toBe(0);
  });

  it("returns 500 on unexpected error", async () => {
    vi.mocked(db.select).mockImplementation(() => {
      throw new Error("connection lost");
    });

    const res = await GET(makeRequest("GET"), ctx);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
  });
});

// ─── PUT /api/projects/[id]/auto-map ─────────────────────────────────────────

describe("PUT /api/projects/[id]/auto-map", () => {
  let PUT: AutoMapHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/projects/[id]/auto-map/route");
    PUT = module.PUT;
  });

  it("returns 404 when project does not exist", async () => {
    vi.mocked(db.select).mockReturnValueOnce(buildSelectChain([]) as any);

    const res = await PUT(
      makeRequest("PUT", { action: "assign", segmentId: "s1", sectionId: "sec-1" }),
      ctx
    );
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/not found/i);
  });

  it("assigns a segment to a section", async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      buildSelectChain([SAMPLE_PROJECT]) as any
    );
    mockAssignSegmentToSection.mockResolvedValue(undefined);

    const res = await PUT(
      makeRequest("PUT", { action: "assign", segmentId: "seg-1", sectionId: "sec-1" }),
      ctx
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockAssignSegmentToSection).toHaveBeenCalledWith(
      "seg-1",
      "sec-1",
      undefined
    );
  });

  it("returns 400 when assign action is missing segmentId or sectionId", async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      buildSelectChain([SAMPLE_PROJECT]) as any
    );

    const res = await PUT(
      makeRequest("PUT", { action: "assign", segmentId: "seg-1" }),
      ctx
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/required/i);
  });

  it("removes a segment from a section", async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      buildSelectChain([SAMPLE_PROJECT]) as any
    );
    mockRemoveSegmentFromSection.mockResolvedValue(undefined);

    const res = await PUT(
      makeRequest("PUT", { action: "remove", segmentId: "seg-1", sectionId: "sec-1" }),
      ctx
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockRemoveSegmentFromSection).toHaveBeenCalledWith("seg-1", "sec-1");
  });

  it("returns 400 when remove action is missing segmentId or sectionId", async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      buildSelectChain([SAMPLE_PROJECT]) as any
    );

    const res = await PUT(
      makeRequest("PUT", { action: "remove", sectionId: "sec-1" }),
      ctx
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it("reorders segments within a section", async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      buildSelectChain([SAMPLE_PROJECT]) as any
    );
    mockReorderSectionSegments.mockResolvedValue(undefined);

    const segmentIds = ["seg-2", "seg-1", "seg-3"];
    const res = await PUT(
      makeRequest("PUT", { action: "reorder", sectionId: "sec-1", segmentIds }),
      ctx
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockReorderSectionSegments).toHaveBeenCalledWith("sec-1", segmentIds);
  });

  it("returns 400 when reorder action is missing sectionId or segmentIds", async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      buildSelectChain([SAMPLE_PROJECT]) as any
    );

    const res = await PUT(
      makeRequest("PUT", { action: "reorder", sectionId: "sec-1" }),
      ctx
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/required/i);
  });

  it("returns 400 for an unknown action", async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      buildSelectChain([SAMPLE_PROJECT]) as any
    );

    const res = await PUT(
      makeRequest("PUT", { action: "unknown-action" }),
      ctx
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/invalid action/i);
  });

  it("returns 500 on unexpected error", async () => {
    vi.mocked(db.select).mockImplementation(() => {
      throw new Error("DB failure");
    });

    const res = await PUT(
      makeRequest("PUT", { action: "assign", segmentId: "s1", sectionId: "sec-1" }),
      ctx
    );
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/db failure/i);
  });
});
