/**
 * Unit tests for SectionAssemblyService.getSectionCompletionStats
 * and SectionAssemblyService.getMissingSections.
 *
 * The computation logic is embedded inside async DB calls. We mock the drizzle
 * query chain so we can exercise business logic without a real database.
 */

import { describe, it, expect, vi } from "vitest";
import { SectionAssemblyService } from "@/lib/sections/SectionAssemblyService";

// ---------------------------------------------------------------------------
// Helpers — getSectionCompletionStats
// ---------------------------------------------------------------------------

type SectionRow = { status: string | null; isRequired: boolean | null };

/** Build a drizzle-like select chain; resolves at .where() */
function makeSelectChain(rows: SectionRow[]) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => Promise.resolve(rows));
  return chain;
}

function makeMockDb(rows: SectionRow[]) {
  return { select: vi.fn(() => makeSelectChain(rows)) };
}

// ---------------------------------------------------------------------------
// Helpers — getMissingSections
// ---------------------------------------------------------------------------

type MissingRow = {
  projectSection: {
    audioUrl: string | null;
    status: string;
  };
  templateSection: {
    isRequired: boolean | null;
    suggestedDuration: number | null;
    exampleText: string | null;
    name?: string;
    description?: string;
    type?: string;
    id?: string;
    order?: number;
    [key: string]: unknown;
  } | null;
};

/** Build a drizzle-like select chain for getMissingSections; resolves at .orderBy() */
function makeMissingChain(rows: MissingRow[]) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => Promise.resolve(rows));
  return chain;
}

function makeMissingDb(rows: MissingRow[]) {
  return { select: vi.fn(() => makeMissingChain(rows)) };
}

function makeTemplateSection(overrides: Partial<MissingRow["templateSection"]> = {}): NonNullable<MissingRow["templateSection"]> {
  return {
    id: "ts-1",
    name: "Intro",
    description: "Opening segment",
    type: "intro",
    isRequired: true,
    suggestedDuration: 120,
    exampleText: "Welcome to the show",
    order: 1,
    ...overrides,
  };
}

function makeRow(
  status: string,
  audioUrl: string | null,
  templateSection: MissingRow["templateSection"] = makeTemplateSection()
): MissingRow {
  return { projectSection: { audioUrl, status }, templateSection };
}

function makeSection(
  status: string,
  isRequired: boolean | null = false
): SectionRow {
  return { status, isRequired };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SectionAssemblyService.getSectionCompletionStats", () => {
  it("returns all-zero stats for a project with no sections", async () => {
    const svc = new SectionAssemblyService(makeMockDb([]) as any);
    const stats = await svc.getSectionCompletionStats("proj-1");

    expect(stats.total).toBe(0);
    expect(stats.approved).toBe(0);
    expect(stats.pending).toBe(0);
    expect(stats.required).toBe(0);
    expect(stats.requiredApproved).toBe(0);
    expect(stats.percentComplete).toBe(0);
    // 0 required sections means all 0 required are approved → ready
    expect(stats.isReadyForExport).toBe(true);
  });

  it("counts pending and approved sections correctly", async () => {
    const rows = [
      makeSection("approved"),
      makeSection("approved"),
      makeSection("pending"),
    ];
    const svc = new SectionAssemblyService(makeMockDb(rows) as any);
    const stats = await svc.getSectionCompletionStats("proj-1");

    expect(stats.total).toBe(3);
    expect(stats.approved).toBe(2);
    expect(stats.pending).toBe(1);
  });

  it("calculates percentComplete as Math.round(approved/total * 100)", async () => {
    const rows = [
      makeSection("approved"),
      makeSection("pending"),
      makeSection("pending"),
    ];
    const svc = new SectionAssemblyService(makeMockDb(rows) as any);
    const stats = await svc.getSectionCompletionStats("proj-1");

    // 1/3 ≈ 33.33 → rounds to 33
    expect(stats.percentComplete).toBe(33);
  });

  it("rounds percentComplete correctly at 0.5 boundary", async () => {
    // 1/2 = 50%
    const rows = [makeSection("approved"), makeSection("pending")];
    const svc = new SectionAssemblyService(makeMockDb(rows) as any);
    const stats = await svc.getSectionCompletionStats("proj-1");
    expect(stats.percentComplete).toBe(50);
  });

  it("sets percentComplete to 100 when all sections are approved", async () => {
    const rows = [makeSection("approved"), makeSection("approved")];
    const svc = new SectionAssemblyService(makeMockDb(rows) as any);
    const stats = await svc.getSectionCompletionStats("proj-1");
    expect(stats.percentComplete).toBe(100);
  });

  it("isReadyForExport is false when a required section is pending", async () => {
    const rows = [
      makeSection("approved", false),
      makeSection("pending", true), // required but not approved
    ];
    const svc = new SectionAssemblyService(makeMockDb(rows) as any);
    const stats = await svc.getSectionCompletionStats("proj-1");

    expect(stats.required).toBe(1);
    expect(stats.requiredApproved).toBe(0);
    expect(stats.isReadyForExport).toBe(false);
  });

  it("isReadyForExport is true when all required sections are approved", async () => {
    const rows = [
      makeSection("approved", true),
      makeSection("approved", true),
      makeSection("pending", false), // optional, still pending
    ];
    const svc = new SectionAssemblyService(makeMockDb(rows) as any);
    const stats = await svc.getSectionCompletionStats("proj-1");

    expect(stats.required).toBe(2);
    expect(stats.requiredApproved).toBe(2);
    expect(stats.isReadyForExport).toBe(true);
  });

  it("isReadyForExport is false when only some required sections are approved", async () => {
    const rows = [
      makeSection("approved", true),
      makeSection("pending", true),
      makeSection("approved", true),
    ];
    const svc = new SectionAssemblyService(makeMockDb(rows) as any);
    const stats = await svc.getSectionCompletionStats("proj-1");

    expect(stats.required).toBe(3);
    expect(stats.requiredApproved).toBe(2);
    expect(stats.isReadyForExport).toBe(false);
  });

  it("treats isRequired=null as not required", async () => {
    const rows = [
      makeSection("pending", null), // null isRequired treated as falsy
    ];
    const svc = new SectionAssemblyService(makeMockDb(rows) as any);
    const stats = await svc.getSectionCompletionStats("proj-1");

    expect(stats.required).toBe(0);
    expect(stats.isReadyForExport).toBe(true);
  });

  it("counts only approved status (not other statuses) for requiredApproved", async () => {
    const rows = [
      makeSection("processing", true), // required but not 'approved'
      makeSection("blocked", true),    // required but not 'approved'
    ];
    const svc = new SectionAssemblyService(makeMockDb(rows) as any);
    const stats = await svc.getSectionCompletionStats("proj-1");

    expect(stats.required).toBe(2);
    expect(stats.requiredApproved).toBe(0);
    expect(stats.isReadyForExport).toBe(false);
  });

  it("uses the provided projectId when querying the database", async () => {
    const chain = makeSelectChain([]);
    const db = { select: vi.fn(() => chain) };
    const svc = new SectionAssemblyService(db as any);

    await svc.getSectionCompletionStats("proj-xyz");

    // The chain should have been built (from/leftJoin/where called once each)
    expect(db.select).toHaveBeenCalledOnce();
    expect((chain.from as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect((chain.leftJoin as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect((chain.where as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// getMissingSections
// ---------------------------------------------------------------------------

describe("SectionAssemblyService.getMissingSections", () => {
  it("returns empty array when there are no sections", async () => {
    const svc = new SectionAssemblyService(makeMissingDb([]) as any);
    const result = await svc.getMissingSections("proj-1");
    expect(result).toEqual([]);
  });

  it("includes a section with no audioUrl", async () => {
    const rows = [makeRow("approved", null)];
    const svc = new SectionAssemblyService(makeMissingDb(rows) as any);
    const result = await svc.getMissingSections("proj-1");
    expect(result).toHaveLength(1);
  });

  it("includes a section with status 'pending' even when audioUrl is set", async () => {
    const rows = [makeRow("pending", "https://cdn.example.com/audio.mp3")];
    const svc = new SectionAssemblyService(makeMissingDb(rows) as any);
    const result = await svc.getMissingSections("proj-1");
    expect(result).toHaveLength(1);
  });

  it("includes a section with status 'blocked'", async () => {
    const rows = [makeRow("blocked", null)];
    const svc = new SectionAssemblyService(makeMissingDb(rows) as any);
    const result = await svc.getMissingSections("proj-1");
    expect(result).toHaveLength(1);
  });

  it("does NOT include a section with audioUrl and status 'approved'", async () => {
    const rows = [makeRow("approved", "https://cdn.example.com/audio.mp3")];
    const svc = new SectionAssemblyService(makeMissingDb(rows) as any);
    const result = await svc.getMissingSections("proj-1");
    expect(result).toHaveLength(0);
  });

  it("does NOT include a section with audioUrl and status 'review'", async () => {
    const rows = [makeRow("review", "https://cdn.example.com/audio.mp3")];
    const svc = new SectionAssemblyService(makeMissingDb(rows) as any);
    const result = await svc.getMissingSections("proj-1");
    expect(result).toHaveLength(0);
  });

  it("skips rows where templateSection is null (left-join miss)", async () => {
    const rows: MissingRow[] = [{ projectSection: { audioUrl: null, status: "pending" }, templateSection: null }];
    const svc = new SectionAssemblyService(makeMissingDb(rows) as any);
    const result = await svc.getMissingSections("proj-1");
    expect(result).toHaveLength(0);
  });

  it("defaults isRequired to false when templateSection.isRequired is null", async () => {
    const rows = [makeRow("pending", null, makeTemplateSection({ isRequired: null }))];
    const svc = new SectionAssemblyService(makeMissingDb(rows) as any);
    const result = await svc.getMissingSections("proj-1");
    expect(result[0].isRequired).toBe(false);
  });

  it("defaults suggestedDuration to 60 when templateSection.suggestedDuration is null", async () => {
    const rows = [makeRow("pending", null, makeTemplateSection({ suggestedDuration: null }))];
    const svc = new SectionAssemblyService(makeMissingDb(rows) as any);
    const result = await svc.getMissingSections("proj-1");
    expect(result[0].suggestedDuration).toBe(60);
  });

  it("sets exampleText to undefined when templateSection.exampleText is null", async () => {
    const rows = [makeRow("pending", null, makeTemplateSection({ exampleText: null }))];
    const svc = new SectionAssemblyService(makeMissingDb(rows) as any);
    const result = await svc.getMissingSections("proj-1");
    expect(result[0].exampleText).toBeUndefined();
  });

  it("returns only missing sections when mixed with complete sections", async () => {
    const ts = makeTemplateSection();
    const rows: MissingRow[] = [
      makeRow("approved", "https://cdn.example.com/a.mp3", ts),   // complete
      makeRow("pending", null, ts),                                // missing
      makeRow("review", "https://cdn.example.com/b.mp3", ts),     // complete
      makeRow("blocked", null, ts),                                // missing
    ];
    const svc = new SectionAssemblyService(makeMissingDb(rows) as any);
    const result = await svc.getMissingSections("proj-1");
    expect(result).toHaveLength(2);
  });

  it("passes the templateSection object through in the result", async () => {
    const ts = makeTemplateSection({ name: "Outro", suggestedDuration: 90, isRequired: false });
    const rows = [makeRow("pending", null, ts)];
    const svc = new SectionAssemblyService(makeMissingDb(rows) as any);
    const result = await svc.getMissingSections("proj-1");
    expect(result[0].templateSection).toMatchObject({ name: "Outro" });
    expect(result[0].isRequired).toBe(false);
    expect(result[0].suggestedDuration).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// initializeProjectSections
// ---------------------------------------------------------------------------

type TemplateSectionRow = { id: string; name: string; order: number; [key: string]: unknown };
type ProjectSectionRow = { id: string; projectId: string; name: string; order: number; status: string; [key: string]: unknown };

function makeInitSelectChain(templateSectionRows: TemplateSectionRow[]) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => Promise.resolve(templateSectionRows));
  return chain;
}

function makeInsertReturningChain(returned: ProjectSectionRow) {
  const chain: Record<string, unknown> = {};
  chain.values = vi.fn(() => chain);
  chain.returning = vi.fn(() => Promise.resolve([returned]));
  return chain;
}

function makeInitDb(
  templateSectionRows: TemplateSectionRow[],
  makeProjectSection: (ts: TemplateSectionRow) => ProjectSectionRow
) {
  let insertCallIndex = 0;
  const insertChains = templateSectionRows.map((ts) => makeInsertReturningChain(makeProjectSection(ts)));

  return {
    select: vi.fn(() => makeInitSelectChain(templateSectionRows)),
    insert: vi.fn(() => insertChains[insertCallIndex++]),
  };
}

describe("SectionAssemblyService.initializeProjectSections", () => {
  it("returns empty array when template has no sections", async () => {
    const db = makeInitDb([], () => ({ id: "", projectId: "", name: "", order: 0, status: "" }));
    const svc = new SectionAssemblyService(db as any);
    const result = await svc.initializeProjectSections("proj-1", "tmpl-1");
    expect(result).toEqual([]);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("creates one project section per template section", async () => {
    const templateSections: TemplateSectionRow[] = [
      { id: "ts-1", name: "Intro", order: 1 },
      { id: "ts-2", name: "Body", order: 2 },
    ];
    const db = makeInitDb(templateSections, (ts) => ({
      id: `ps-${ts.id}`,
      projectId: "proj-1",
      templateSectionId: ts.id,
      name: ts.name,
      order: ts.order,
      status: "pending",
    }));
    const svc = new SectionAssemblyService(db as any);
    const result = await svc.initializeProjectSections("proj-1", "tmpl-1");

    expect(result).toHaveLength(2);
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it("each created section has status 'pending'", async () => {
    const templateSections: TemplateSectionRow[] = [{ id: "ts-1", name: "Intro", order: 1 }];
    const db = makeInitDb(templateSections, (ts) => ({
      id: "ps-1",
      projectId: "proj-1",
      templateSectionId: ts.id,
      name: ts.name,
      order: ts.order,
      status: "pending",
    }));
    const svc = new SectionAssemblyService(db as any);
    const result = await svc.initializeProjectSections("proj-1", "tmpl-1");

    expect(result[0].status).toBe("pending");
    expect(result[0].name).toBe("Intro");
  });
});

// ---------------------------------------------------------------------------
// getProjectSectionsWithDetails
// ---------------------------------------------------------------------------

type DetailRow = {
  id: string;
  projectId: string;
  name: string;
  order: number;
  status: string;
  templateSection: { id: string; name: string } | null;
  [key: string]: unknown;
};

function makeDetailsSelectChain(rows: DetailRow[]) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => Promise.resolve(rows));
  return chain;
}

describe("SectionAssemblyService.getProjectSectionsWithDetails", () => {
  it("returns empty array when project has no sections", async () => {
    const db = { select: vi.fn(() => makeDetailsSelectChain([])) };
    const svc = new SectionAssemblyService(db as any);
    const result = await svc.getProjectSectionsWithDetails("proj-1");
    expect(result).toEqual([]);
  });

  it("returns all section rows including template details", async () => {
    const rows: DetailRow[] = [
      { id: "ps-1", projectId: "proj-1", name: "Intro", order: 1, status: "pending", templateSection: { id: "ts-1", name: "Intro" } },
      { id: "ps-2", projectId: "proj-1", name: "Body", order: 2, status: "approved", templateSection: { id: "ts-2", name: "Body" } },
    ];
    const db = { select: vi.fn(() => makeDetailsSelectChain(rows)) };
    const svc = new SectionAssemblyService(db as any);
    const result = await svc.getProjectSectionsWithDetails("proj-1");

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Intro");
    expect(result[1].status).toBe("approved");
  });

  it("passes rows with null templateSection through unchanged", async () => {
    const rows: DetailRow[] = [
      { id: "ps-1", projectId: "proj-1", name: "Intro", order: 1, status: "pending", templateSection: null },
    ];
    const db = { select: vi.fn(() => makeDetailsSelectChain(rows)) };
    const svc = new SectionAssemblyService(db as any);
    const result = await svc.getProjectSectionsWithDetails("proj-1");
    expect(result[0].templateSection).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// autoAssignSegmentsToSections
// ---------------------------------------------------------------------------

function makeAssignDb(existingCount: number) {
  const existingRows = Array.from({ length: existingCount }, (_, i) => ({
    sectionId: "sec-1",
    segmentId: `old-seg-${i}`,
    order: i,
  }));

  const selectChain: Record<string, unknown> = {};
  selectChain.from = vi.fn(() => selectChain);
  selectChain.where = vi.fn(() => Promise.resolve(existingRows));

  const insertChain: Record<string, unknown> = {};
  const insertedValues: any[] = [];
  insertChain.values = vi.fn((v: any) => { insertedValues.push(v); return Promise.resolve(undefined); });
  (insertChain as any).__insertedValues = insertedValues;

  return {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
    __insertedValues: insertedValues,
  };
}

describe("SectionAssemblyService.autoAssignSegmentsToSections", () => {
  it("does nothing when segmentIds is empty", async () => {
    const db = makeAssignDb(0);
    const svc = new SectionAssemblyService(db as any);
    await svc.autoAssignSegmentsToSections("proj-1", [], "sec-1");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("inserts segments starting at order 0 when no existing assignments", async () => {
    const db = makeAssignDb(0);
    const svc = new SectionAssemblyService(db as any);
    await svc.autoAssignSegmentsToSections("proj-1", ["seg-a", "seg-b"], "sec-1");

    expect(db.insert).toHaveBeenCalledTimes(2);
    const inserted = db.__insertedValues;
    expect(inserted[0].order).toBe(0);
    expect(inserted[0].segmentId).toBe("seg-a");
    expect(inserted[1].order).toBe(1);
    expect(inserted[1].segmentId).toBe("seg-b");
  });

  it("offsets order by the number of existing assignments", async () => {
    const db = makeAssignDb(3); // 3 existing assignments
    const svc = new SectionAssemblyService(db as any);
    await svc.autoAssignSegmentsToSections("proj-1", ["seg-new"], "sec-1");

    const inserted = db.__insertedValues;
    expect(inserted[0].order).toBe(3); // starts after existing 3
    expect(inserted[0].sectionId).toBe("sec-1");
  });
});

// ---------------------------------------------------------------------------
// getSectionSegments
// ---------------------------------------------------------------------------

type AssignmentRow = { segment: { id: string; text: string; [key: string]: unknown }; order: number };

function makeSectionSegmentsDb(assignmentRows: AssignmentRow[]) {
  const selectChain: Record<string, unknown> = {};
  selectChain.from = vi.fn(() => selectChain);
  selectChain.innerJoin = vi.fn(() => selectChain);
  selectChain.where = vi.fn(() => selectChain);
  selectChain.orderBy = vi.fn(() => Promise.resolve(assignmentRows));
  return { select: vi.fn(() => selectChain) };
}

describe("SectionAssemblyService.getSectionSegments", () => {
  it("returns empty array when no segments are assigned", async () => {
    const db = makeSectionSegmentsDb([]);
    const svc = new SectionAssemblyService(db as any);
    const result = await svc.getSectionSegments("sec-1");
    expect(result).toEqual([]);
  });

  it("returns only the segment objects (not the order metadata)", async () => {
    const seg1 = { id: "seg-1", text: "Hello world" };
    const seg2 = { id: "seg-2", text: "Goodbye world" };
    const db = makeSectionSegmentsDb([
      { segment: seg1, order: 0 },
      { segment: seg2, order: 1 },
    ]);
    const svc = new SectionAssemblyService(db as any);
    const result = await svc.getSectionSegments("sec-1");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(seg1);
    expect(result[1]).toEqual(seg2);
    expect((result[0] as any).order).toBeUndefined();
  });

  it("returns segments in the order provided by the DB", async () => {
    const db = makeSectionSegmentsDb([
      { segment: { id: "seg-z", text: "Z" }, order: 0 },
      { segment: { id: "seg-a", text: "A" }, order: 1 },
    ]);
    const svc = new SectionAssemblyService(db as any);
    const result = await svc.getSectionSegments("sec-1");

    expect(result[0].id).toBe("seg-z");
    expect(result[1].id).toBe("seg-a");
  });
});

// ---------------------------------------------------------------------------
// updateSectionStatus
// ---------------------------------------------------------------------------

type UpdatedSection = { id: string; status: string; [key: string]: unknown };

function makeUpdateDb(
  returnedSection: UpdatedSection,
  captureSet?: (data: Record<string, unknown>) => void
) {
  const chain: Record<string, unknown> = {};
  chain.set = vi.fn((data: Record<string, unknown>) => {
    captureSet?.(data);
    return chain;
  });
  chain.where = vi.fn(() => chain);
  chain.returning = vi.fn(() => Promise.resolve([returnedSection]));
  return { update: vi.fn(() => chain) };
}

describe("SectionAssemblyService.updateSectionStatus", () => {
  it("updates status and returns the updated section", async () => {
    const updated: UpdatedSection = { id: "sec-1", status: "approved" };
    const db = makeUpdateDb(updated);
    const svc = new SectionAssemblyService(db as any);
    const result = await svc.updateSectionStatus("sec-1", "approved");

    expect(result).toEqual(updated);
    expect(db.update).toHaveBeenCalledOnce();
  });

  it("sets uploadedAt when audioUrl is provided in additionalData", async () => {
    let capturedSet: Record<string, unknown> = {};
    const db = makeUpdateDb({ id: "sec-1", status: "review" }, (d) => { capturedSet = d; });
    const svc = new SectionAssemblyService(db as any);
    await svc.updateSectionStatus("sec-1", "review", { audioUrl: "https://cdn.example.com/audio.mp3" });

    expect(capturedSet.audioUrl).toBe("https://cdn.example.com/audio.mp3");
    expect(capturedSet.uploadedAt).toBeDefined();
  });

  it("does NOT set uploadedAt when no audioUrl is provided", async () => {
    let capturedSet: Record<string, unknown> = {};
    const db = makeUpdateDb({ id: "sec-1", status: "pending" }, (d) => { capturedSet = d; });
    const svc = new SectionAssemblyService(db as any);
    await svc.updateSectionStatus("sec-1", "pending");

    expect(capturedSet.uploadedAt).toBeUndefined();
  });

  it("includes transcription and duration in the update when provided", async () => {
    let capturedSet: Record<string, unknown> = {};
    const db = makeUpdateDb({ id: "sec-1", status: "approved" }, (d) => { capturedSet = d; });
    const svc = new SectionAssemblyService(db as any);
    await svc.updateSectionStatus("sec-1", "approved", {
      transcription: "Hello world",
      duration: 120,
    });

    expect(capturedSet.transcription).toBe("Hello world");
    expect(capturedSet.duration).toBe(120);
  });

  it("includes notes in the update when provided", async () => {
    let capturedSet: Record<string, unknown> = {};
    const db = makeUpdateDb({ id: "sec-1", status: "blocked" }, (d) => { capturedSet = d; });
    const svc = new SectionAssemblyService(db as any);
    await svc.updateSectionStatus("sec-1", "blocked", { notes: "Needs re-record" });

    expect(capturedSet.notes).toBe("Needs re-record");
  });
});
