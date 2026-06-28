import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockGetTemplateWithSections } = vi.hoisted(() => ({
  mockGetTemplateWithSections: vi.fn(),
}));

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
    projectTemplates: "project_templates_table",
    projectSections: "project_sections_table",
    sectionSegments: "section_segments_table",
  };
});

vi.mock("@/lib/templates/TemplateService", () => ({
  TemplateService: vi.fn().mockImplementation(function () {
    this.getTemplateWithSections = mockGetTemplateWithSections;
  }),
}));

import { db } from "@/lib/db";

const PROJECT_ID = "550e8400-e29b-41d4-a716-446655440000";
const TEMPLATE_ID = "660e8400-e29b-41d4-a716-446655440001";

const SAMPLE_PROJECT = {
  id: PROJECT_ID,
  title: "My Podcast Episode",
  status: "ready",
  currentTemplateId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const SAMPLE_TEMPLATE = {
  id: TEMPLATE_ID,
  name: "Interview Template",
  sections: [
    { id: "sec-1", templateId: TEMPLATE_ID, name: "Introduction", order: 1 },
    { id: "sec-2", templateId: TEMPLATE_ID, name: "Main Content", order: 2 },
  ],
};

function buildSelectChain(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
  };
}

// For selects without .limit() — .where() is the terminal awaited call
function buildSelectChainNoLimit(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(returnValue),
  };
}

function buildInsertChain(returnValue: unknown[]) {
  return {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnValue),
  };
}

function buildUpdateChain() {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };
}

function buildDeleteChain() {
  return {
    where: vi.fn().mockResolvedValue([]),
  };
}

describe("POST /api/projects/[id]/select-template", () => {
  let POST: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;

  const ctx = { params: Promise.resolve({ id: PROJECT_ID }) };

  function makeRequest(body: object) {
    return new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/select-template`,
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const module = await import(
      "@/app/api/projects/[id]/select-template/route"
    );
    POST = module.POST;
  });

  it("returns 400 when templateId is missing", async () => {
    const req = makeRequest({});
    const res = await POST(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/template id is required/i);
  });

  it("returns 404 when project does not exist", async () => {
    vi.mocked(db.select).mockReturnValue(buildSelectChain([]) as any);

    const req = makeRequest({ templateId: TEMPLATE_ID });
    const res = await POST(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/project not found/i);
  });

  it("returns 404 when template does not exist", async () => {
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([SAMPLE_PROJECT]) as any
    );
    mockGetTemplateWithSections.mockResolvedValue(null);

    const req = makeRequest({ templateId: TEMPLATE_ID });
    const res = await POST(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/template not found/i);
  });

  it("creates project-template association and sections on success (no prior template)", async () => {
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([SAMPLE_PROJECT]) as any
    );
    mockGetTemplateWithSections.mockResolvedValue(SAMPLE_TEMPLATE);

    const mockProjectTemplate = { id: "pt-1", projectId: PROJECT_ID, templateId: TEMPLATE_ID };
    const mockSection1 = { id: "ps-1", projectId: PROJECT_ID, name: "Introduction", order: 1 };
    const mockSection2 = { id: "ps-2", projectId: PROJECT_ID, name: "Main Content", order: 2 };

    vi.mocked(db.insert)
      .mockReturnValueOnce(buildInsertChain([mockProjectTemplate]) as any)
      .mockReturnValueOnce(buildInsertChain([mockSection1]) as any)
      .mockReturnValueOnce(buildInsertChain([mockSection2]) as any);

    vi.mocked(db.update).mockReturnValue(buildUpdateChain() as any);

    const req = makeRequest({ templateId: TEMPLATE_ID });
    const res = await POST(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.sections).toHaveLength(2);
    expect(data.message).toMatch(/Interview Template/);
    expect(db.insert).toHaveBeenCalledTimes(3); // 1 projectTemplate + 2 sections
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("cleans up old template data before assigning a new one", async () => {
    const projectWithTemplate = {
      ...SAMPLE_PROJECT,
      currentTemplateId: "old-template-id",
    };
    const oldSection = { id: "old-sec-1" };

    // First select: project lookup (uses .limit()); second select: old sections (no .limit())
    vi.mocked(db.select)
      .mockReturnValueOnce(buildSelectChain([projectWithTemplate]) as any)
      .mockReturnValueOnce(buildSelectChainNoLimit([oldSection]) as any);

    mockGetTemplateWithSections.mockResolvedValue(SAMPLE_TEMPLATE);

    const mockProjectTemplate = { id: "pt-new", projectId: PROJECT_ID, templateId: TEMPLATE_ID };
    const mockSection1 = { id: "ps-1", name: "Introduction", order: 1 };
    const mockSection2 = { id: "ps-2", name: "Main Content", order: 2 };

    vi.mocked(db.insert)
      .mockReturnValueOnce(buildInsertChain([mockProjectTemplate]) as any)
      .mockReturnValueOnce(buildInsertChain([mockSection1]) as any)
      .mockReturnValueOnce(buildInsertChain([mockSection2]) as any);

    vi.mocked(db.delete).mockReturnValue(buildDeleteChain() as any);
    vi.mocked(db.update).mockReturnValue(buildUpdateChain() as any);

    const req = makeRequest({ templateId: TEMPLATE_ID });
    const res = await POST(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    // Cleanup: delete sectionSegments for old section, delete old projectSections, delete old projectTemplates
    expect(db.delete).toHaveBeenCalledTimes(3);
  });

  it("passes autoDetected and detectionConfidence to insert", async () => {
    vi.mocked(db.select).mockReturnValue(
      buildSelectChain([SAMPLE_PROJECT]) as any
    );
    mockGetTemplateWithSections.mockResolvedValue({ ...SAMPLE_TEMPLATE, sections: [] });

    const mockProjectTemplate = { id: "pt-1", projectId: PROJECT_ID, templateId: TEMPLATE_ID, autoDetected: true, detectionConfidence: 0.95 };
    vi.mocked(db.insert).mockReturnValue(
      buildInsertChain([mockProjectTemplate]) as any
    );
    vi.mocked(db.update).mockReturnValue(buildUpdateChain() as any);

    const req = makeRequest({
      templateId: TEMPLATE_ID,
      autoDetected: true,
      detectionConfidence: 0.95,
    });
    const res = await POST(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    // The insert values should include autoDetected and detectionConfidence
    const insertMock = vi.mocked(db.insert);
    const valuesCall = insertMock.mock.results[0].value.values.mock.calls[0][0];
    expect(valuesCall).toMatchObject({ autoDetected: true, detectionConfidence: 0.95 });
  });

  it("returns 500 when database throws", async () => {
    vi.mocked(db.select).mockImplementation(() => {
      throw new Error("DB connection error");
    });

    const req = makeRequest({ templateId: TEMPLATE_ID });
    const res = await POST(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
  });
});
