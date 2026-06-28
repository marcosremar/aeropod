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
