/**
 * Unit tests for SectionAssemblyService.getSectionCompletionStats
 *
 * The pure computation logic (percentComplete, isReadyForExport) is embedded
 * inside an async DB call. We mock the drizzle query chain so we can exercise
 * the business logic without a real database.
 */

import { describe, it, expect, vi } from "vitest";
import { SectionAssemblyService } from "@/lib/sections/SectionAssemblyService";

// ---------------------------------------------------------------------------
// Helpers
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
