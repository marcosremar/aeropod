import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Hoist service mock ────────────────────────────────────────────────────
const { mockGetMissingSections, mockGetSectionCompletionStats } = vi.hoisted(() => ({
  mockGetMissingSections: vi.fn(),
  mockGetSectionCompletionStats: vi.fn(),
}));

vi.mock("@/lib/sections/SectionAssemblyService", () => ({
  SectionAssemblyService: vi.fn().mockImplementation(function () {
    return {
      getMissingSections: mockGetMissingSections,
      getSectionCompletionStats: mockGetSectionCompletionStats,
    };
  }),
}));

vi.mock("@/lib/db", () => {
  const mockDb = {
    select: vi.fn(),
  };
  return {
    db: mockDb,
    projects: "projects_table",
  };
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

import { db } from "@/lib/db";

function buildSelectChain(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
  };
}

const PROJECT_ID = "550e8400-e29b-41d4-a716-446655440000";

const SAMPLE_PROJECT = {
  id: PROJECT_ID,
  title: "Test Podcast",
  status: "ready",
  userId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const SAMPLE_TEMPLATE_SECTION = {
  id: "ts-1",
  name: "Introduction",
  description: "Episode introduction",
  order: 1,
  isRequired: true,
  suggestedDuration: 120,
  exampleText: "Welcome to the show...",
};

const SAMPLE_MISSING_SECTIONS = [
  {
    templateSection: SAMPLE_TEMPLATE_SECTION,
    isRequired: true,
    suggestedDuration: 120,
    exampleText: "Welcome to the show...",
  },
];

const SAMPLE_STATS = {
  total: 5,
  approved: 3,
  pending: 2,
  required: 3,
  requiredApproved: 2,
  percentComplete: 60,
  isReadyForExport: false,
};

type RouteHandler = (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) => Promise<Response>;

describe("GET /api/projects/[id]/missing-sections", () => {
  let GET: RouteHandler;

  const ctx = { params: Promise.resolve({ id: PROJECT_ID }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import(
      "@/app/api/projects/[id]/missing-sections/route"
    );
    GET = module.GET;
  });

  it("returns missing sections and stats for a valid project", async () => {
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([SAMPLE_PROJECT]) as any
    );
    mockGetMissingSections.mockResolvedValue(SAMPLE_MISSING_SECTIONS);
    mockGetSectionCompletionStats.mockResolvedValue(SAMPLE_STATS);

    const req = new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/missing-sections`);
    const res = await GET(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.missingSections).toEqual(SAMPLE_MISSING_SECTIONS);
    expect(body.stats).toEqual(SAMPLE_STATS);
  });

  it("returns 404 when project does not exist", async () => {
    vi.mocked(db.select).mockReturnValue(buildSelectChain([]) as any);

    const req = new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/missing-sections`);
    const res = await GET(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Project not found");
  });

  it("returns empty missing sections array when all sections are complete", async () => {
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([SAMPLE_PROJECT]) as any
    );
    mockGetMissingSections.mockResolvedValue([]);
    mockGetSectionCompletionStats.mockResolvedValue({
      total: 3,
      approved: 3,
      pending: 0,
      required: 3,
      requiredApproved: 3,
      percentComplete: 100,
      isReadyForExport: true,
    });

    const req = new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/missing-sections`);
    const res = await GET(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.missingSections).toEqual([]);
    expect(body.stats.isReadyForExport).toBe(true);
    expect(body.stats.percentComplete).toBe(100);
  });

  it("returns multiple missing sections when several are incomplete", async () => {
    const multiMissing = [
      {
        templateSection: { ...SAMPLE_TEMPLATE_SECTION, id: "ts-1", name: "Introduction" },
        isRequired: true,
        suggestedDuration: 120,
        exampleText: "Welcome...",
      },
      {
        templateSection: { ...SAMPLE_TEMPLATE_SECTION, id: "ts-2", name: "Outro", isRequired: false },
        isRequired: false,
        suggestedDuration: 60,
        exampleText: undefined,
      },
    ];

    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([SAMPLE_PROJECT]) as any
    );
    mockGetMissingSections.mockResolvedValue(multiMissing);
    mockGetSectionCompletionStats.mockResolvedValue(SAMPLE_STATS);

    const req = new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/missing-sections`);
    const res = await GET(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.missingSections).toHaveLength(2);
    expect(body.missingSections[0].isRequired).toBe(true);
    expect(body.missingSections[1].isRequired).toBe(false);
  });

  it("returns 500 when SectionAssemblyService.getMissingSections throws", async () => {
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([SAMPLE_PROJECT]) as any
    );
    mockGetMissingSections.mockRejectedValue(new Error("DB failure"));

    const req = new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/missing-sections`);
    const res = await GET(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe("DB failure");
  });

  it("returns 500 when SectionAssemblyService.getSectionCompletionStats throws", async () => {
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([SAMPLE_PROJECT]) as any
    );
    mockGetMissingSections.mockResolvedValue(SAMPLE_MISSING_SECTIONS);
    mockGetSectionCompletionStats.mockRejectedValue(new Error("Stats error"));

    const req = new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/missing-sections`);
    const res = await GET(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Stats error");
  });

  it("returns 500 with generic message when error has no message", async () => {
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([SAMPLE_PROJECT]) as any
    );
    mockGetMissingSections.mockRejectedValue({});

    const req = new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/missing-sections`);
    const res = await GET(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Failed to get missing sections");
  });

  it("invokes SectionAssemblyService with the correct projectId", async () => {
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([SAMPLE_PROJECT]) as any
    );
    mockGetMissingSections.mockResolvedValue([]);
    mockGetSectionCompletionStats.mockResolvedValue(SAMPLE_STATS);

    const req = new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/missing-sections`);
    await GET(req, ctx);

    expect(mockGetMissingSections).toHaveBeenCalledWith(PROJECT_ID);
    expect(mockGetSectionCompletionStats).toHaveBeenCalledWith(PROJECT_ID);
  });
});
