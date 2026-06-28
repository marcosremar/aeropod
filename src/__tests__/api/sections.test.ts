import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => {
  const mockDb = {
    select: vi.fn(),
    update: vi.fn(),
  };
  return {
    db: mockDb,
    projects: "projects_table",
    projectSections: "project_sections_table",
    templateSections: "template_sections_table",
  };
});

const { mockGetSectionSegments, mockUpdateSectionStatus } = vi.hoisted(() => ({
  mockGetSectionSegments: vi.fn(),
  mockUpdateSectionStatus: vi.fn(),
}));

vi.mock("@/lib/sections/SectionAssemblyService", () => ({
  SectionAssemblyService: function MockSectionAssemblyService() {
    return {
      getSectionSegments: mockGetSectionSegments,
      updateSectionStatus: mockUpdateSectionStatus,
    };
  },
}));

import { db } from "@/lib/db";

function buildSelectChain(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
    orderBy: vi.fn().mockResolvedValue(returnValue),
  };
}

const PROJECT_ID = "550e8400-e29b-41d4-a716-446655440000";
const SECTION_ID = "660e8400-e29b-41d4-a716-446655440001";

const SAMPLE_PROJECT = {
  id: PROJECT_ID,
  title: "My Podcast Episode",
  status: "ready",
  userId: null,
  currentTemplateId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const SAMPLE_SECTION = {
  id: SECTION_ID,
  projectId: PROJECT_ID,
  templateSectionId: null,
  name: "Introduction",
  order: 1,
  status: "pending",
  audioUrl: null,
  transcription: null,
  duration: null,
  uploadedAt: null,
  approvedAt: null,
  approvedBy: null,
  notes: null,
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  templateSection: null,
};

type ProjectSectionsHandler = (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) => Promise<Response>;

type SectionDetailHandler = (
  req: NextRequest,
  ctx: { params: Promise<{ id: string; sectionId: string }> }
) => Promise<Response>;

// ─── GET /api/projects/[id]/sections ─────────────────────────────────────────

describe("GET /api/projects/[id]/sections", () => {
  let GET: ProjectSectionsHandler;

  const ctx = { params: Promise.resolve({ id: PROJECT_ID }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/projects/[id]/sections/route");
    GET = module.GET;
  });

  it("returns 404 when project does not exist", async () => {
    vi.mocked(db.select).mockReturnValueOnce(buildSelectChain([]) as any);

    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/sections`
    );
    const res = await GET(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/not found/i);
  });

  it("returns sections list for a valid project", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(buildSelectChain([SAMPLE_PROJECT]) as any)
      .mockReturnValueOnce(buildSelectChain([SAMPLE_SECTION]) as any);

    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/sections`
    );
    const res = await GET(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.sections).toHaveLength(1);
    expect(data.sections[0].id).toBe(SECTION_ID);
    expect(data.sections[0].name).toBe("Introduction");
  });

  it("returns an empty array when project has no sections", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(buildSelectChain([SAMPLE_PROJECT]) as any)
      .mockReturnValueOnce(buildSelectChain([]) as any);

    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/sections`
    );
    const res = await GET(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.sections).toHaveLength(0);
  });

  it("returns 500 when the DB throws", async () => {
    vi.mocked(db.select).mockImplementation(() => {
      throw new Error("DB error");
    });

    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/sections`
    );
    const res = await GET(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
  });
});

// ─── GET /api/projects/[id]/sections/[sectionId] ─────────────────────────────

describe("GET /api/projects/[id]/sections/[sectionId]", () => {
  let GET: SectionDetailHandler;

  const ctx = {
    params: Promise.resolve({ id: PROJECT_ID, sectionId: SECTION_ID }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import(
      "@/app/api/projects/[id]/sections/[sectionId]/route"
    );
    GET = module.GET;
  });

  it("returns section with segments when it exists", async () => {
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([SAMPLE_SECTION]) as any
    );
    mockGetSectionSegments.mockResolvedValue([]);

    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/sections/${SECTION_ID}`
    );
    const res = await GET(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.section.id).toBe(SECTION_ID);
    expect(data.segments).toEqual([]);
  });

  it("returns segments associated with the section", async () => {
    const mockSegment = {
      id: "seg-1",
      sectionId: SECTION_ID,
      segmentId: "550e8400-e29b-41d4-a716-000000000001",
      order: 1,
    };
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([SAMPLE_SECTION]) as any
    );
    mockGetSectionSegments.mockResolvedValue([mockSegment]);

    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/sections/${SECTION_ID}`
    );
    const res = await GET(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.segments).toHaveLength(1);
    expect(data.segments[0].id).toBe("seg-1");
  });

  it("returns 404 when section does not exist", async () => {
    vi.mocked(db.select).mockReturnValue(buildSelectChain([]) as any);

    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/sections/${SECTION_ID}`
    );
    const res = await GET(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/not found/i);
  });

  it("returns 500 when DB throws", async () => {
    vi.mocked(db.select).mockImplementation(() => {
      throw new Error("DB error");
    });

    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/sections/${SECTION_ID}`
    );
    const res = await GET(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
  });
});

// ─── PATCH /api/projects/[id]/sections/[sectionId] ───────────────────────────

describe("PATCH /api/projects/[id]/sections/[sectionId]", () => {
  let PATCH: SectionDetailHandler;

  const ctx = {
    params: Promise.resolve({ id: PROJECT_ID, sectionId: SECTION_ID }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import(
      "@/app/api/projects/[id]/sections/[sectionId]/route"
    );
    PATCH = module.PATCH;
  });

  it("returns 404 when section does not exist", async () => {
    vi.mocked(db.select).mockReturnValue(buildSelectChain([]) as any);

    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/sections/${SECTION_ID}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "review" }),
        headers: { "Content-Type": "application/json" },
      }
    );
    const res = await PATCH(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/not found/i);
  });

  it("returns 400 when trying to modify an approved section with a non-review status", async () => {
    const approvedSection = { ...SAMPLE_SECTION, status: "approved" };
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([approvedSection]) as any
    );

    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/sections/${SECTION_ID}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "pending" }),
        headers: { "Content-Type": "application/json" },
      }
    );
    const res = await PATCH(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/cannot modify approved/i);
  });

  it("allows re-opening an approved section to review status", async () => {
    const approvedSection = { ...SAMPLE_SECTION, status: "approved" };
    const reopenedSection = { ...SAMPLE_SECTION, status: "review" };
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([approvedSection]) as any
    );
    mockUpdateSectionStatus.mockResolvedValue(reopenedSection);

    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/sections/${SECTION_ID}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "review" }),
        headers: { "Content-Type": "application/json" },
      }
    );
    const res = await PATCH(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.section.status).toBe("review");
  });

  it("updates section status, audioUrl and duration", async () => {
    const updatedSection = {
      ...SAMPLE_SECTION,
      status: "review",
      audioUrl: "/audio/new.mp3",
      duration: 120,
    };
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([SAMPLE_SECTION]) as any
    );
    mockUpdateSectionStatus.mockResolvedValue(updatedSection);

    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/sections/${SECTION_ID}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: "review",
          audioUrl: "/audio/new.mp3",
          duration: 120,
        }),
        headers: { "Content-Type": "application/json" },
      }
    );
    const res = await PATCH(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockUpdateSectionStatus).toHaveBeenCalledWith(
      SECTION_ID,
      "review",
      expect.objectContaining({ audioUrl: "/audio/new.mp3", duration: 120 })
    );
  });

  it("falls back to the existing status when none is provided in body", async () => {
    const updatedSection = { ...SAMPLE_SECTION };
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([SAMPLE_SECTION]) as any
    );
    mockUpdateSectionStatus.mockResolvedValue(updatedSection);

    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/sections/${SECTION_ID}`,
      {
        method: "PATCH",
        body: JSON.stringify({ notes: "Record again more clearly" }),
        headers: { "Content-Type": "application/json" },
      }
    );
    await PATCH(req, ctx);

    expect(mockUpdateSectionStatus).toHaveBeenCalledWith(
      SECTION_ID,
      SAMPLE_SECTION.status,
      expect.objectContaining({ notes: "Record again more clearly" })
    );
  });

  it("returns 500 when DB throws on select", async () => {
    vi.mocked(db.select).mockImplementation(() => {
      throw new Error("DB error");
    });

    const req = new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/sections/${SECTION_ID}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "review" }),
        headers: { "Content-Type": "application/json" },
      }
    );
    const res = await PATCH(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
  });
});
