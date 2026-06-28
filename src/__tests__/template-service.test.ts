/**
 * Unit tests for TemplateService.
 * The DB is injected via the constructor, so we pass a mock with chainable
 * query-builder methods — no real database required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TemplateService } from "@/lib/templates/TemplateService";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TEMPLATE_ID = "550e8400-e29b-41d4-a716-446655440000";
const USER_ID = "660e8400-e29b-41d4-a716-446655440001";
const PROJECT_ID = "770e8400-e29b-41d4-a716-446655440002";
const SECTION_ID = "880e8400-e29b-41d4-a716-446655440003";

const SAMPLE_TEMPLATE = {
  id: TEMPLATE_ID,
  name: "Interview Template",
  description: "A template for podcast interviews",
  category: "interview",
  isSystem: true,
  userId: null,
  thumbnailUrl: null,
  estimatedDuration: null,
  metadata: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const SAMPLE_SECTION = {
  id: SECTION_ID,
  templateId: TEMPLATE_ID,
  name: "Introduction",
  description: "Opening section",
  order: 1,
  isRequired: true,
  minDuration: null,
  maxDuration: null,
  suggestedDuration: null,
  type: "intro",
  aiPrompt: null,
  editingRules: null,
  exampleText: null,
  icon: null,
  color: null,
};

// ─── DB mock helpers ──────────────────────────────────────────────────────────

function buildSelectChain(returnValue: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
  };
  // Resolve when awaited directly (no .limit())
  (chain as any)[Symbol.iterator] = undefined;
  // Allow awaiting the chain itself
  (chain as any).then = (resolve: (v: unknown[]) => void) =>
    Promise.resolve(returnValue).then(resolve);
  return chain;
}

function buildInsertChain(returnValue: unknown) {
  return {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([returnValue]),
  };
}

function buildUpdateChain(returnValue: unknown) {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([returnValue]),
  };
}

function buildDeleteChain() {
  return {
    where: vi.fn().mockResolvedValue([]),
  };
}

function makeMockDb() {
  return {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

// ─── listTemplates ────────────────────────────────────────────────────────────

describe("TemplateService.listTemplates", () => {
  let db: ReturnType<typeof makeMockDb>;
  let svc: TemplateService;

  beforeEach(() => {
    db = makeMockDb();
    svc = new TemplateService(db as any);
  });

  it("returns templates with no filters (defaults to isSystem=true)", async () => {
    db.select.mockReturnValue(buildSelectChain([SAMPLE_TEMPLATE]));

    const result = await svc.listTemplates();

    expect(db.select).toHaveBeenCalledOnce();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(TEMPLATE_ID);
  });

  it("filters by category when provided", async () => {
    db.select.mockReturnValue(buildSelectChain([SAMPLE_TEMPLATE]));

    const result = await svc.listTemplates({ category: "interview" });

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("interview");
  });

  it("filters by isSystem flag when provided", async () => {
    db.select.mockReturnValue(buildSelectChain([SAMPLE_TEMPLATE]));

    const result = await svc.listTemplates({ isSystem: true });

    expect(result).toHaveLength(1);
  });

  it("applies userId filter to show system + user templates", async () => {
    db.select.mockReturnValue(buildSelectChain([SAMPLE_TEMPLATE]));

    const result = await svc.listTemplates({ userId: USER_ID });

    expect(db.select).toHaveBeenCalledOnce();
    expect(result).toHaveLength(1);
  });

  it("returns empty array when no templates match", async () => {
    db.select.mockReturnValue(buildSelectChain([]));

    const result = await svc.listTemplates({ category: "nonexistent" });

    expect(result).toEqual([]);
  });
});

// ─── getTemplateWithSections ──────────────────────────────────────────────────

describe("TemplateService.getTemplateWithSections", () => {
  let db: ReturnType<typeof makeMockDb>;
  let svc: TemplateService;

  beforeEach(() => {
    db = makeMockDb();
    svc = new TemplateService(db as any);
  });

  it("returns null when template is not found", async () => {
    db.select.mockReturnValue(buildSelectChain([]));

    const result = await svc.getTemplateWithSections(TEMPLATE_ID);

    expect(result).toBeNull();
  });

  it("returns template with sections when found", async () => {
    db.select
      .mockReturnValueOnce(buildSelectChain([SAMPLE_TEMPLATE]))
      .mockReturnValueOnce(buildSelectChain([SAMPLE_SECTION]));

    const result = await svc.getTemplateWithSections(TEMPLATE_ID);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(TEMPLATE_ID);
    expect(result!.sections).toHaveLength(1);
    expect(result!.sections[0].id).toBe(SECTION_ID);
  });

  it("returns template with empty sections array when template has no sections", async () => {
    db.select
      .mockReturnValueOnce(buildSelectChain([SAMPLE_TEMPLATE]))
      .mockReturnValueOnce(buildSelectChain([]));

    const result = await svc.getTemplateWithSections(TEMPLATE_ID);

    expect(result).not.toBeNull();
    expect(result!.sections).toEqual([]);
  });
});

// ─── createCustomTemplate ─────────────────────────────────────────────────────

describe("TemplateService.createCustomTemplate", () => {
  let db: ReturnType<typeof makeMockDb>;
  let svc: TemplateService;

  beforeEach(() => {
    db = makeMockDb();
    svc = new TemplateService(db as any);
  });

  it("inserts a new template and returns it", async () => {
    const customTemplate = {
      ...SAMPLE_TEMPLATE,
      isSystem: false,
      userId: USER_ID,
    };
    db.insert.mockReturnValue(buildInsertChain(customTemplate));

    const result = await svc.createCustomTemplate(USER_ID, {
      name: "My Template",
      category: "interview",
    });

    expect(db.insert).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ userId: USER_ID, isSystem: false });
  });

  it("calls insert with isSystem=false regardless of input", async () => {
    const customTemplate = { ...SAMPLE_TEMPLATE, isSystem: false, userId: USER_ID };
    const insertMock = db.insert.mockReturnValue(buildInsertChain(customTemplate));

    await svc.createCustomTemplate(USER_ID, {
      name: "Custom",
      category: "monologue",
    });

    // The values passed to .values() should include isSystem: false
    const valuesFn = insertMock.mock.results[0].value.values;
    const insertedData = valuesFn.mock.calls[0][0];
    expect(insertedData.isSystem).toBe(false);
    expect(insertedData.userId).toBe(USER_ID);
  });
});

// ─── getSuggestedTemplatesForProject ─────────────────────────────────────────

describe("TemplateService.getSuggestedTemplatesForProject", () => {
  let db: ReturnType<typeof makeMockDb>;
  let svc: TemplateService;

  beforeEach(() => {
    db = makeMockDb();
    svc = new TemplateService(db as any);
  });

  it("returns empty array when no content detection exists", async () => {
    db.select.mockReturnValue(buildSelectChain([]));

    const result = await svc.getSuggestedTemplatesForProject(PROJECT_ID);

    expect(result).toEqual([]);
  });

  it("returns empty array when suggestedTemplates is null", async () => {
    const detection = { id: "det-1", projectId: PROJECT_ID, suggestedTemplates: null };
    db.select.mockReturnValue(buildSelectChain([detection]));

    const result = await svc.getSuggestedTemplatesForProject(PROJECT_ID);

    expect(result).toEqual([]);
  });

  it("returns empty array when suggestedTemplates is not an array", async () => {
    const detection = {
      id: "det-1",
      projectId: PROJECT_ID,
      suggestedTemplates: { templateId: TEMPLATE_ID, matchScore: 0.9, reason: "x" },
    };
    db.select.mockReturnValue(buildSelectChain([detection]));

    const result = await svc.getSuggestedTemplatesForProject(PROJECT_ID);

    expect(result).toEqual([]);
  });

  it("returns sorted suggestions when detection has valid suggestedTemplates", async () => {
    const TEMPLATE_ID_2 = "991e8400-e29b-41d4-a716-446655440004";
    const detection = {
      id: "det-1",
      projectId: PROJECT_ID,
      suggestedTemplates: [
        { templateId: TEMPLATE_ID, matchScore: 0.7, reason: "good match" },
        { templateId: TEMPLATE_ID_2, matchScore: 0.95, reason: "best match" },
      ],
    };

    const template2 = { ...SAMPLE_TEMPLATE, id: TEMPLATE_ID_2, name: "Monologue Template" };

    // First call: detection query
    // Second+Third calls: getTemplateWithSections for each templateId
    db.select
      .mockReturnValueOnce(buildSelectChain([detection]))
      // getTemplateWithSections for TEMPLATE_ID: template then sections
      .mockReturnValueOnce(buildSelectChain([SAMPLE_TEMPLATE]))
      .mockReturnValueOnce(buildSelectChain([SAMPLE_SECTION]))
      // getTemplateWithSections for TEMPLATE_ID_2: template then sections
      .mockReturnValueOnce(buildSelectChain([template2]))
      .mockReturnValueOnce(buildSelectChain([]));

    const result = await svc.getSuggestedTemplatesForProject(PROJECT_ID);

    expect(result).toHaveLength(2);
    // Sorted by matchScore descending
    expect(result[0].matchScore).toBe(0.95);
    expect(result[1].matchScore).toBe(0.7);
    expect(result[0].template.name).toBe("Monologue Template");
  });

  it("skips suggestions where the template no longer exists", async () => {
    const detection = {
      id: "det-1",
      projectId: PROJECT_ID,
      suggestedTemplates: [
        { templateId: TEMPLATE_ID, matchScore: 0.8, reason: "match" },
      ],
    };

    db.select
      .mockReturnValueOnce(buildSelectChain([detection]))
      // template not found
      .mockReturnValueOnce(buildSelectChain([]));

    const result = await svc.getSuggestedTemplatesForProject(PROJECT_ID);

    expect(result).toEqual([]);
  });
});

// ─── getSystemTemplates / getTemplatesByCategory ──────────────────────────────

describe("TemplateService.getSystemTemplates", () => {
  it("delegates to listTemplates with isSystem=true", async () => {
    const db = makeMockDb();
    const svc = new TemplateService(db as any);
    db.select.mockReturnValue(buildSelectChain([SAMPLE_TEMPLATE]));

    const result = await svc.getSystemTemplates();

    expect(result).toHaveLength(1);
    expect(result[0].isSystem).toBe(true);
  });
});

describe("TemplateService.getTemplatesByCategory", () => {
  it("delegates to listTemplates with the given category", async () => {
    const db = makeMockDb();
    const svc = new TemplateService(db as any);
    db.select.mockReturnValue(buildSelectChain([SAMPLE_TEMPLATE]));

    const result = await svc.getTemplatesByCategory("interview");

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("interview");
  });
});

// ─── updateTemplate ───────────────────────────────────────────────────────────

describe("TemplateService.updateTemplate", () => {
  it("calls db.update and returns the updated template", async () => {
    const db = makeMockDb();
    const svc = new TemplateService(db as any);
    const updatedTemplate = { ...SAMPLE_TEMPLATE, name: "Renamed Template" };
    db.update.mockReturnValue(buildUpdateChain(updatedTemplate));

    const result = await svc.updateTemplate(TEMPLATE_ID, { name: "Renamed Template" });

    expect(db.update).toHaveBeenCalledOnce();
    expect(result.name).toBe("Renamed Template");
  });

  it("sets updatedAt when updating", async () => {
    const db = makeMockDb();
    const svc = new TemplateService(db as any);
    db.update.mockReturnValue(buildUpdateChain(SAMPLE_TEMPLATE));
    const updateMock = db.update.mock;

    await svc.updateTemplate(TEMPLATE_ID, { name: "New Name" });

    const setCall = updateMock.results[0].value.set.mock.calls[0][0];
    expect(setCall).toHaveProperty("updatedAt");
    expect(setCall.updatedAt).toBeInstanceOf(Date);
  });
});

// ─── deleteTemplate ───────────────────────────────────────────────────────────

describe("TemplateService.deleteTemplate", () => {
  it("calls db.delete with templateId and userId conditions", async () => {
    const db = makeMockDb();
    const svc = new TemplateService(db as any);
    const deleteMock = { where: vi.fn().mockResolvedValue([]) };
    db.delete.mockReturnValue(deleteMock);

    await svc.deleteTemplate(TEMPLATE_ID, USER_ID);

    expect(db.delete).toHaveBeenCalledOnce();
    expect(deleteMock.where).toHaveBeenCalledOnce();
  });
});

// ─── createTemplateSection ────────────────────────────────────────────────────

describe("TemplateService.createTemplateSection", () => {
  it("inserts a section and returns it", async () => {
    const db = makeMockDb();
    const svc = new TemplateService(db as any);
    db.insert.mockReturnValue(buildInsertChain(SAMPLE_SECTION));

    const result = await svc.createTemplateSection({
      templateId: TEMPLATE_ID,
      name: "Introduction",
      order: 1,
      type: "intro",
    });

    expect(db.insert).toHaveBeenCalledOnce();
    expect(result.templateId).toBe(TEMPLATE_ID);
  });
});

// ─── deleteTemplateSection ────────────────────────────────────────────────────

describe("TemplateService.deleteTemplateSection", () => {
  it("calls db.delete with the section id", async () => {
    const db = makeMockDb();
    const svc = new TemplateService(db as any);
    const deleteMock = { where: vi.fn().mockResolvedValue([]) };
    db.delete.mockReturnValue(deleteMock);

    await svc.deleteTemplateSection(SECTION_ID);

    expect(db.delete).toHaveBeenCalledOnce();
    expect(deleteMock.where).toHaveBeenCalledOnce();
  });
});
