/**
 * Unit tests for SegmentMappingService.validateMapping,
 * assignSegmentToSection, removeSegmentFromSection, and reorderSectionSegments.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SegmentMappingService,
  type SegmentSectionMapping,
  type ValidationIssue,
} from "@/lib/sections/SegmentMappingService";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SectionWithTemplate = Parameters<
  InstanceType<typeof SegmentMappingService>["validateMapping"]
>[1][number];

function makeSection(overrides: {
  projectSectionId?: string;
  templateSectionId?: string;
  isRequired?: boolean;
  name?: string;
}): SectionWithTemplate {
  const {
    projectSectionId = "ps-1",
    templateSectionId = "ts-1",
    isRequired = false,
    name = "Intro",
  } = overrides;
  return {
    projectSection: {
      id: projectSectionId,
      projectId: "proj-1",
      templateSectionId,
      status: "pending",
      order: 1,
      audioUrl: null,
      content: null,
      duration: null,
      updatedAt: new Date(),
      createdAt: new Date(),
    } as any,
    templateSection: {
      id: templateSectionId,
      templateId: "tmpl-1",
      name,
      type: "intro",
      description: null,
      isRequired,
      order: 1,
      suggestedDuration: null,
      exampleText: null,
      createdAt: new Date(),
    } as any,
  };
}

function makeMapping(overrides: {
  segmentId?: string;
  sectionId?: string;
  confidence?: number;
}): SegmentSectionMapping {
  return {
    segmentId: overrides.segmentId ?? "seg-1",
    sectionId: overrides.sectionId ?? "ps-1",
    templateSectionId: "ts-1",
    confidence: overrides.confidence ?? 0.9,
    reasoning: "test mapping",
  };
}

/** Instantiate the service without a real DB (validateMapping doesn't use it). */
function makeService() {
  return new SegmentMappingService(null as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SegmentMappingService.validateMapping", () => {
  describe("missing_required issues", () => {
    it("returns no issues when a required section has at least one mapping", () => {
      const sections = [makeSection({ isRequired: true })];
      const mappings = [makeMapping({ sectionId: "ps-1", confidence: 0.8 })];

      const issues = makeService().validateMapping(mappings, sections);

      expect(issues.filter((i) => i.type === "missing_required")).toHaveLength(0);
    });

    it("raises a missing_required error for a required section with no mappings", () => {
      const sections = [makeSection({ isRequired: true, name: "Intro" })];
      const issues = makeService().validateMapping([], sections);

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("missing_required");
      expect(issues[0].severity).toBe("error");
      expect(issues[0].sectionName).toBe("Intro");
    });

    it("does NOT raise missing_required for an optional section with no mappings", () => {
      const sections = [makeSection({ isRequired: false })];
      const issues = makeService().validateMapping([], sections);

      const missingRequired = issues.filter((i) => i.type === "missing_required");
      expect(missingRequired).toHaveLength(0);
    });

    it("raises one missing_required per uncovered required section", () => {
      const sections = [
        makeSection({ projectSectionId: "ps-1", isRequired: true, name: "Intro" }),
        makeSection({ projectSectionId: "ps-2", templateSectionId: "ts-2", isRequired: true, name: "Outro" }),
      ];
      // Only ps-1 is covered
      const mappings = [makeMapping({ sectionId: "ps-1", confidence: 0.9 })];

      const issues = makeService().validateMapping(mappings, sections);

      const missingRequired = issues.filter((i) => i.type === "missing_required");
      expect(missingRequired).toHaveLength(1);
      expect(missingRequired[0].sectionId).toBe("ps-2");
    });

    it("raises no issue when all required sections are covered", () => {
      const sections = [
        makeSection({ projectSectionId: "ps-1", isRequired: true }),
        makeSection({ projectSectionId: "ps-2", templateSectionId: "ts-2", isRequired: true }),
      ];
      const mappings = [
        makeMapping({ sectionId: "ps-1", confidence: 0.9 }),
        makeMapping({ segmentId: "seg-2", sectionId: "ps-2", confidence: 0.8 }),
      ];

      const issues = makeService().validateMapping(mappings, sections);
      expect(issues.filter((i) => i.type === "missing_required")).toHaveLength(0);
    });
  });

  describe("low_confidence issues", () => {
    it("returns no low_confidence issue when average confidence >= 0.5", () => {
      const sections = [makeSection({})];
      const mappings = [makeMapping({ sectionId: "ps-1", confidence: 0.5 })];

      const issues = makeService().validateMapping(mappings, sections);
      expect(issues.filter((i) => i.type === "low_confidence")).toHaveLength(0);
    });

    it("raises a low_confidence warning when single mapping confidence < 0.5", () => {
      const sections = [makeSection({ name: "Main Content" })];
      const mappings = [makeMapping({ sectionId: "ps-1", confidence: 0.3 })];

      const issues = makeService().validateMapping(mappings, sections);

      const lowConf = issues.filter((i) => i.type === "low_confidence");
      expect(lowConf).toHaveLength(1);
      expect(lowConf[0].severity).toBe("warning");
      expect(lowConf[0].sectionName).toBe("Main Content");
    });

    it("raises low_confidence when average of multiple mappings is below 0.5", () => {
      const sections = [makeSection({})];
      const mappings = [
        makeMapping({ segmentId: "seg-1", sectionId: "ps-1", confidence: 0.4 }),
        makeMapping({ segmentId: "seg-2", sectionId: "ps-1", confidence: 0.3 }),
      ];

      const issues = makeService().validateMapping(mappings, sections);
      expect(issues.filter((i) => i.type === "low_confidence")).toHaveLength(1);
    });

    it("does NOT raise low_confidence when section has no mappings at all", () => {
      const sections = [makeSection({})];
      const issues = makeService().validateMapping([], sections);

      expect(issues.filter((i) => i.type === "low_confidence")).toHaveLength(0);
    });

    it("uses average confidence across all mappings for a section", () => {
      const sections = [makeSection({})];
      // average = (0.3 + 0.8) / 2 = 0.55 — should NOT trigger warning
      const mappings = [
        makeMapping({ segmentId: "seg-1", sectionId: "ps-1", confidence: 0.3 }),
        makeMapping({ segmentId: "seg-2", sectionId: "ps-1", confidence: 0.8 }),
      ];

      const issues = makeService().validateMapping(mappings, sections);
      expect(issues.filter((i) => i.type === "low_confidence")).toHaveLength(0);
    });
  });

  describe("combined scenarios", () => {
    it("returns both missing_required and low_confidence for different sections", () => {
      const sections = [
        makeSection({ projectSectionId: "ps-1", isRequired: true, name: "Intro" }),
        makeSection({ projectSectionId: "ps-2", templateSectionId: "ts-2", isRequired: false, name: "CTA" }),
      ];
      const mappings = [
        makeMapping({ segmentId: "seg-1", sectionId: "ps-2", confidence: 0.2 }),
      ];

      const issues = makeService().validateMapping(mappings, sections);

      const types = issues.map((i) => i.type);
      expect(types).toContain("missing_required");
      expect(types).toContain("low_confidence");
    });

    it("returns empty array when no sections are provided", () => {
      const issues = makeService().validateMapping([], []);
      expect(issues).toEqual([]);
    });

    it("ignores mappings for sections not in the sections list", () => {
      const sections = [makeSection({ projectSectionId: "ps-known" })];
      const mappings = [
        makeMapping({ sectionId: "ps-unknown", confidence: 0.1 }),
      ];

      // ps-known has no mappings but is not required → no missing_required
      // ps-unknown is not in sections → should not produce any issue
      const issues = makeService().validateMapping(mappings, sections);
      expect(issues).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

function buildDeleteChain() {
  return { where: vi.fn().mockResolvedValue([]) };
}

function buildSelectChain(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(returnValue),
  };
}

function buildInsertChain() {
  return { values: vi.fn().mockResolvedValue([]) };
}

function buildUpdateChain() {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };
}

function makeMockDb() {
  return {
    delete: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// assignSegmentToSection
// ---------------------------------------------------------------------------

describe("SegmentMappingService.assignSegmentToSection", () => {
  let db: ReturnType<typeof makeMockDb>;
  let svc: InstanceType<typeof SegmentMappingService>;

  beforeEach(() => {
    db = makeMockDb();
    svc = new SegmentMappingService(db as any);
  });

  it("removes any existing assignment for the segment before adding new one", async () => {
    const deleteMock = buildDeleteChain();
    db.delete.mockReturnValue(deleteMock);
    db.select.mockReturnValue(buildSelectChain([]));
    db.insert.mockReturnValue(buildInsertChain());
    db.update.mockReturnValue(buildUpdateChain());

    await svc.assignSegmentToSection("seg-1", "ps-1");

    expect(db.delete).toHaveBeenCalled();
    expect(deleteMock.where).toHaveBeenCalled();
  });

  it("uses provided order when order argument is given", async () => {
    db.delete.mockReturnValue(buildDeleteChain());
    db.select.mockReturnValue(buildSelectChain([]));
    const insertMock = buildInsertChain();
    db.insert.mockReturnValue(insertMock);
    db.update.mockReturnValue(buildUpdateChain());

    await svc.assignSegmentToSection("seg-1", "ps-1", 5);

    expect(insertMock.values).toHaveBeenCalledWith(
      expect.objectContaining({ order: 5 })
    );
  });

  it("defaults order to existing assignment count when no order argument", async () => {
    const existingAssignments = [{ segmentId: "seg-a", sectionId: "ps-1", order: 0 }];
    db.delete.mockReturnValue(buildDeleteChain());
    db.select.mockReturnValue(buildSelectChain(existingAssignments));
    const insertMock = buildInsertChain();
    db.insert.mockReturnValue(insertMock);
    db.update.mockReturnValue(buildUpdateChain());

    await svc.assignSegmentToSection("seg-1", "ps-1");

    // existingAssignments.length === 1, so order should be 1
    expect(insertMock.values).toHaveBeenCalledWith(
      expect.objectContaining({ order: 1 })
    );
  });

  it("inserts the new assignment with correct segmentId and sectionId", async () => {
    db.delete.mockReturnValue(buildDeleteChain());
    db.select.mockReturnValue(buildSelectChain([]));
    const insertMock = buildInsertChain();
    db.insert.mockReturnValue(insertMock);
    db.update.mockReturnValue(buildUpdateChain());

    await svc.assignSegmentToSection("seg-42", "ps-99");

    expect(insertMock.values).toHaveBeenCalledWith(
      expect.objectContaining({ segmentId: "seg-42", sectionId: "ps-99" })
    );
  });

  it("updates section status to 'review' after inserting", async () => {
    db.delete.mockReturnValue(buildDeleteChain());
    db.select.mockReturnValue(buildSelectChain([]));
    db.insert.mockReturnValue(buildInsertChain());
    const updateMock = buildUpdateChain();
    db.update.mockReturnValue(updateMock);

    await svc.assignSegmentToSection("seg-1", "ps-1");

    expect(db.update).toHaveBeenCalled();
    expect(updateMock.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "review" })
    );
  });
});

// ---------------------------------------------------------------------------
// removeSegmentFromSection
// ---------------------------------------------------------------------------

describe("SegmentMappingService.removeSegmentFromSection", () => {
  it("calls db.delete with both segmentId and sectionId conditions", async () => {
    const db = makeMockDb();
    const svc = new SegmentMappingService(db as any);
    const deleteMock = buildDeleteChain();
    db.delete.mockReturnValue(deleteMock);

    await svc.removeSegmentFromSection("seg-1", "ps-1");

    expect(db.delete).toHaveBeenCalledOnce();
    expect(deleteMock.where).toHaveBeenCalledOnce();
  });

  it("does not interact with insert or update", async () => {
    const db = makeMockDb();
    const svc = new SegmentMappingService(db as any);
    db.delete.mockReturnValue(buildDeleteChain());

    await svc.removeSegmentFromSection("seg-1", "ps-1");

    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// reorderSectionSegments
// ---------------------------------------------------------------------------

describe("SegmentMappingService.reorderSectionSegments", () => {
  it("deletes all existing assignments for the section before reinserting", async () => {
    const db = makeMockDb();
    const svc = new SegmentMappingService(db as any);
    const deleteMock = buildDeleteChain();
    db.delete.mockReturnValue(deleteMock);
    db.insert.mockReturnValue(buildInsertChain());

    await svc.reorderSectionSegments("ps-1", ["seg-a", "seg-b"]);

    expect(db.delete).toHaveBeenCalledOnce();
    expect(deleteMock.where).toHaveBeenCalledOnce();
  });

  it("inserts each segment with its position index as order", async () => {
    const db = makeMockDb();
    const svc = new SegmentMappingService(db as any);
    db.delete.mockReturnValue(buildDeleteChain());
    const insertMock = buildInsertChain();
    db.insert.mockReturnValue(insertMock);

    await svc.reorderSectionSegments("ps-1", ["seg-a", "seg-b", "seg-c"]);

    expect(insertMock.values).toHaveBeenCalledTimes(3);
    expect(insertMock.values).toHaveBeenNthCalledWith(
      1, expect.objectContaining({ segmentId: "seg-a", order: 0 })
    );
    expect(insertMock.values).toHaveBeenNthCalledWith(
      2, expect.objectContaining({ segmentId: "seg-b", order: 1 })
    );
    expect(insertMock.values).toHaveBeenNthCalledWith(
      3, expect.objectContaining({ segmentId: "seg-c", order: 2 })
    );
  });

  it("inserts all segments with the correct sectionId", async () => {
    const db = makeMockDb();
    const svc = new SegmentMappingService(db as any);
    db.delete.mockReturnValue(buildDeleteChain());
    const insertMock = buildInsertChain();
    db.insert.mockReturnValue(insertMock);

    await svc.reorderSectionSegments("ps-xyz", ["seg-1"]);

    expect(insertMock.values).toHaveBeenCalledWith(
      expect.objectContaining({ sectionId: "ps-xyz" })
    );
  });

  it("makes no insert calls when segmentIds is empty", async () => {
    const db = makeMockDb();
    const svc = new SegmentMappingService(db as any);
    db.delete.mockReturnValue(buildDeleteChain());
    const insertMock = buildInsertChain();
    db.insert.mockReturnValue(insertMock);

    await svc.reorderSectionSegments("ps-1", []);

    expect(insertMock.values).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// saveMapping
// ---------------------------------------------------------------------------

describe("SegmentMappingService.saveMapping", () => {
  let db: ReturnType<typeof makeMockDb>;
  let svc: InstanceType<typeof SegmentMappingService>;

  beforeEach(() => {
    db = makeMockDb();
    svc = new SegmentMappingService(db as any);
  });

  it("skips delete when project has no sections", async () => {
    db.select.mockReturnValue(buildSelectChain([]));

    await svc.saveMapping("proj-1", []);

    expect(db.delete).not.toHaveBeenCalled();
  });

  it("deletes existing sectionSegments when sections are found", async () => {
    db.select.mockReturnValue(buildSelectChain([{ id: "ps-1" }]));
    const deleteMock = buildDeleteChain();
    db.delete.mockReturnValue(deleteMock);

    await svc.saveMapping("proj-1", []);

    expect(db.delete).toHaveBeenCalledOnce();
    expect(deleteMock.where).toHaveBeenCalledOnce();
  });

  it("inserts a sectionSegment for each mapping with order 0", async () => {
    db.select.mockReturnValue(buildSelectChain([{ id: "ps-1" }]));
    db.delete.mockReturnValue(buildDeleteChain());
    const insertMock = buildInsertChain();
    db.insert.mockReturnValue(insertMock);
    db.update.mockReturnValue(buildUpdateChain());

    const mappings: SegmentSectionMapping[] = [
      { segmentId: "seg-1", sectionId: "ps-1", templateSectionId: "ts-1", confidence: 0.9, reasoning: "test" },
    ];

    await svc.saveMapping("proj-1", mappings);

    expect(insertMock.values).toHaveBeenCalledWith(
      expect.objectContaining({ segmentId: "seg-1", sectionId: "ps-1", order: 0 })
    );
  });

  it("assigns sequential order to multiple mappings within the same section", async () => {
    db.select.mockReturnValue(buildSelectChain([{ id: "ps-1" }]));
    db.delete.mockReturnValue(buildDeleteChain());
    const insertMock = buildInsertChain();
    db.insert.mockReturnValue(insertMock);
    db.update.mockReturnValue(buildUpdateChain());

    const mappings: SegmentSectionMapping[] = [
      { segmentId: "seg-1", sectionId: "ps-1", templateSectionId: "ts-1", confidence: 0.9, reasoning: "" },
      { segmentId: "seg-2", sectionId: "ps-1", templateSectionId: "ts-1", confidence: 0.8, reasoning: "" },
    ];

    await svc.saveMapping("proj-1", mappings);

    expect(insertMock.values).toHaveBeenNthCalledWith(
      1, expect.objectContaining({ segmentId: "seg-1", order: 0 })
    );
    expect(insertMock.values).toHaveBeenNthCalledWith(
      2, expect.objectContaining({ segmentId: "seg-2", order: 1 })
    );
  });

  it("updates each section status to 'review' after inserting its mappings", async () => {
    db.select.mockReturnValue(buildSelectChain([{ id: "ps-1" }]));
    db.delete.mockReturnValue(buildDeleteChain());
    db.insert.mockReturnValue(buildInsertChain());
    const updateMock = buildUpdateChain();
    db.update.mockReturnValue(updateMock);

    const mappings: SegmentSectionMapping[] = [
      { segmentId: "seg-1", sectionId: "ps-1", templateSectionId: "ts-1", confidence: 0.9, reasoning: "" },
    ];

    await svc.saveMapping("proj-1", mappings);

    expect(updateMock.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "review" })
    );
  });

  it("calls db.update once per unique section in the mapping", async () => {
    db.select.mockReturnValue(buildSelectChain([{ id: "ps-1" }, { id: "ps-2" }]));
    db.delete.mockReturnValue(buildDeleteChain());
    db.insert.mockReturnValue(buildInsertChain());
    const updateMock = buildUpdateChain();
    db.update.mockReturnValue(updateMock);

    const mappings: SegmentSectionMapping[] = [
      { segmentId: "seg-1", sectionId: "ps-1", templateSectionId: "ts-1", confidence: 0.9, reasoning: "" },
      { segmentId: "seg-2", sectionId: "ps-2", templateSectionId: "ts-2", confidence: 0.8, reasoning: "" },
    ];

    await svc.saveMapping("proj-1", mappings);

    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it("makes no insert or update calls when mappings array is empty", async () => {
    db.select.mockReturnValue(buildSelectChain([{ id: "ps-1" }]));
    db.delete.mockReturnValue(buildDeleteChain());
    const insertMock = buildInsertChain();
    db.insert.mockReturnValue(insertMock);

    await svc.saveMapping("proj-1", []);

    expect(insertMock.values).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getCurrentMapping
// ---------------------------------------------------------------------------

function buildLimitChain(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
  };
}

function buildInnerJoinOrderByChain(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(returnValue),
  };
}

function buildWhereChain(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(returnValue),
  };
}

const SAMPLE_PROJECT_SECTION = {
  id: "ps-1",
  projectId: "proj-1",
  templateSectionId: "ts-1",
  status: "review",
  order: 1,
  audioUrl: null,
  content: null,
  duration: null,
  totalDuration: null,
  name: "Intro",
  transcription: null,
  notes: null,
  uploadedAt: null,
  approvedAt: null,
  updatedAt: new Date(),
  createdAt: new Date(),
};

const SAMPLE_TEMPLATE_SECTION = {
  id: "ts-1",
  templateId: "tmpl-1",
  name: "Intro",
  type: "intro",
  description: null,
  isRequired: false,
  order: 1,
  minDuration: null,
  maxDuration: null,
  suggestedDuration: null,
  exampleText: null,
  icon: null,
  color: null,
  createdAt: new Date(),
};

const SAMPLE_SEGMENT = {
  id: "seg-1",
  projectId: "proj-1",
  text: "Hello world",
  sectionMatchScore: 0.75,
  startTime: 0,
  endTime: 30,
  topic: "intro",
  isSelected: true,
  interestScore: null,
  clarityScore: null,
  wordTimestamps: null,
  textCuts: null,
  editedText: null,
  order: 1,
  speaker: null,
  isTangent: null,
  isRepetition: null,
  keyInsight: null,
  hasFactualError: null,
  hasContradiction: null,
  isConfusing: null,
  isIncomplete: null,
  needsRerecord: null,
  rerecordSuggestion: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("SegmentMappingService.getCurrentMapping", () => {
  let db: ReturnType<typeof makeMockDb>;
  let svc: InstanceType<typeof SegmentMappingService>;

  beforeEach(() => {
    db = makeMockDb();
    svc = new SegmentMappingService(db as any);
  });

  it("returns null when project has no template", async () => {
    db.select.mockReturnValueOnce(buildLimitChain([]));

    const result = await svc.getCurrentMapping("proj-1");

    expect(result).toBeNull();
  });

  it("returns null when project has sections but none are found (empty sections)", async () => {
    // 1. project template
    db.select.mockReturnValueOnce(buildLimitChain([{ projectId: "proj-1", templateId: "tmpl-1" }]));
    // 2. getProjectSectionsWithTemplate - no sections
    db.select.mockReturnValueOnce(buildInnerJoinOrderByChain([]));

    const result = await svc.getCurrentMapping("proj-1");

    expect(result).toBeNull();
  });

  it("returns a MappingResult with templateId from the project template", async () => {
    // 1. project template
    db.select.mockReturnValueOnce(buildLimitChain([{ projectId: "proj-1", templateId: "tmpl-1" }]));
    // 2. sections with template
    db.select.mockReturnValueOnce(buildInnerJoinOrderByChain([
      { projectSection: SAMPLE_PROJECT_SECTION, templateSection: SAMPLE_TEMPLATE_SECTION },
    ]));
    // 3. currentMappings - none
    db.select.mockReturnValueOnce(buildInnerJoinOrderByChain([]));
    // 4. all segments
    db.select.mockReturnValueOnce(buildWhereChain([]));

    const result = await svc.getCurrentMapping("proj-1");

    expect(result).not.toBeNull();
    expect(result!.templateId).toBe("tmpl-1");
    expect(result!.projectId).toBe("proj-1");
  });

  it("builds mappings from sectionSegments using sectionMatchScore as confidence", async () => {
    const sectionSegmentRow = { id: "ss-1", sectionId: "ps-1", segmentId: "seg-1", order: 0, createdAt: new Date() };
    // 1. project template
    db.select.mockReturnValueOnce(buildLimitChain([{ projectId: "proj-1", templateId: "tmpl-1" }]));
    // 2. sections
    db.select.mockReturnValueOnce(buildInnerJoinOrderByChain([
      { projectSection: SAMPLE_PROJECT_SECTION, templateSection: SAMPLE_TEMPLATE_SECTION },
    ]));
    // 3. currentMappings
    db.select.mockReturnValueOnce(buildInnerJoinOrderByChain([
      { sectionSegment: sectionSegmentRow, segment: SAMPLE_SEGMENT },
    ]));
    // 4. all segments
    db.select.mockReturnValueOnce(buildWhereChain([SAMPLE_SEGMENT]));

    const result = await svc.getCurrentMapping("proj-1");

    expect(result!.mappings).toHaveLength(1);
    expect(result!.mappings[0].segmentId).toBe("seg-1");
    expect(result!.mappings[0].sectionId).toBe("ps-1");
    expect(result!.mappings[0].confidence).toBe(0.75);
  });

  it("defaults confidence to 0.5 when sectionMatchScore is null", async () => {
    const segmentNoScore = { ...SAMPLE_SEGMENT, sectionMatchScore: null };
    const sectionSegmentRow = { id: "ss-1", sectionId: "ps-1", segmentId: "seg-1", order: 0, createdAt: new Date() };
    // 1. project template
    db.select.mockReturnValueOnce(buildLimitChain([{ projectId: "proj-1", templateId: "tmpl-1" }]));
    // 2. sections
    db.select.mockReturnValueOnce(buildInnerJoinOrderByChain([
      { projectSection: SAMPLE_PROJECT_SECTION, templateSection: SAMPLE_TEMPLATE_SECTION },
    ]));
    // 3. currentMappings
    db.select.mockReturnValueOnce(buildInnerJoinOrderByChain([
      { sectionSegment: sectionSegmentRow, segment: segmentNoScore },
    ]));
    // 4. all segments
    db.select.mockReturnValueOnce(buildWhereChain([segmentNoScore]));

    const result = await svc.getCurrentMapping("proj-1");

    expect(result!.mappings[0].confidence).toBe(0.5);
  });

  it("identifies unmapped segments (segments not in any sectionSegment)", async () => {
    const unmappedSegment = { ...SAMPLE_SEGMENT, id: "seg-2" };
    const sectionSegmentRow = { id: "ss-1", sectionId: "ps-1", segmentId: "seg-1", order: 0, createdAt: new Date() };
    // 1. project template
    db.select.mockReturnValueOnce(buildLimitChain([{ projectId: "proj-1", templateId: "tmpl-1" }]));
    // 2. sections
    db.select.mockReturnValueOnce(buildInnerJoinOrderByChain([
      { projectSection: SAMPLE_PROJECT_SECTION, templateSection: SAMPLE_TEMPLATE_SECTION },
    ]));
    // 3. currentMappings - only seg-1 is mapped
    db.select.mockReturnValueOnce(buildInnerJoinOrderByChain([
      { sectionSegment: sectionSegmentRow, segment: SAMPLE_SEGMENT },
    ]));
    // 4. all segments - both seg-1 and seg-2
    db.select.mockReturnValueOnce(buildWhereChain([SAMPLE_SEGMENT, unmappedSegment]));

    const result = await svc.getCurrentMapping("proj-1");

    expect(result!.unmappedSegments).toContain("seg-2");
    expect(result!.unmappedSegments).not.toContain("seg-1");
  });

  it("sets overallConfidence to 0 when no mappings exist", async () => {
    // 1. project template
    db.select.mockReturnValueOnce(buildLimitChain([{ projectId: "proj-1", templateId: "tmpl-1" }]));
    // 2. sections
    db.select.mockReturnValueOnce(buildInnerJoinOrderByChain([
      { projectSection: SAMPLE_PROJECT_SECTION, templateSection: SAMPLE_TEMPLATE_SECTION },
    ]));
    // 3. currentMappings - empty
    db.select.mockReturnValueOnce(buildInnerJoinOrderByChain([]));
    // 4. all segments - empty
    db.select.mockReturnValueOnce(buildWhereChain([]));

    const result = await svc.getCurrentMapping("proj-1");

    expect(result!.overallConfidence).toBe(0);
  });

  it("calculates overallConfidence as the average of mapping confidence values", async () => {
    const seg1 = { ...SAMPLE_SEGMENT, id: "seg-1", sectionMatchScore: 0.8 };
    const seg2 = { ...SAMPLE_SEGMENT, id: "seg-2", sectionMatchScore: 0.6 };
    const ss1 = { id: "ss-1", sectionId: "ps-1", segmentId: "seg-1", order: 0, createdAt: new Date() };
    const ss2 = { id: "ss-2", sectionId: "ps-1", segmentId: "seg-2", order: 1, createdAt: new Date() };
    // 1. project template
    db.select.mockReturnValueOnce(buildLimitChain([{ projectId: "proj-1", templateId: "tmpl-1" }]));
    // 2. sections
    db.select.mockReturnValueOnce(buildInnerJoinOrderByChain([
      { projectSection: SAMPLE_PROJECT_SECTION, templateSection: SAMPLE_TEMPLATE_SECTION },
    ]));
    // 3. currentMappings - two segments mapped
    db.select.mockReturnValueOnce(buildInnerJoinOrderByChain([
      { sectionSegment: ss1, segment: seg1 },
      { sectionSegment: ss2, segment: seg2 },
    ]));
    // 4. all segments
    db.select.mockReturnValueOnce(buildWhereChain([seg1, seg2]));

    const result = await svc.getCurrentMapping("proj-1");

    expect(result!.overallConfidence).toBeCloseTo(0.7, 5);
  });
});
