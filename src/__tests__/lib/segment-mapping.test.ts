import { describe, it, expect } from "vitest";
import { SegmentMappingService } from "@/lib/sections/SegmentMappingService";
import { mockDb } from "../helpers/mock-db";

// validateMapping is pure (does not touch the DB), but the constructor requires
// a db handle — pass the mock.
const svc = new SegmentMappingService(mockDb as never);

function section(id: string, name: string, isRequired: boolean) {
  return {
    projectSection: { id, name },
    templateSection: { id: `t-${id}`, name, isRequired, exampleText: "ex" },
  } as never;
}

function mapping(sectionId: string, confidence: number) {
  return {
    segmentId: `seg-${sectionId}-${confidence}`,
    sectionId,
    templateSectionId: `t-${sectionId}`,
    confidence,
    reasoning: "r",
  };
}

describe("SegmentMappingService.validateMapping", () => {
  it("flags a required section with no mapped segments", () => {
    const issues = svc.validateMapping([], [section("s1", "Intro", true)]);
    const missing = issues.find((i) => i.type === "missing_required");
    expect(missing).toBeDefined();
    expect(missing?.severity).toBe("error");
    expect(missing?.sectionId).toBe("s1");
  });

  it("does not flag a required section that has mappings", () => {
    const issues = svc.validateMapping(
      [mapping("s1", 0.9)],
      [section("s1", "Intro", true)]
    );
    expect(issues.find((i) => i.type === "missing_required")).toBeUndefined();
  });

  it("warns on low-confidence mappings", () => {
    const issues = svc.validateMapping(
      [mapping("s1", 0.2), mapping("s1", 0.3)],
      [section("s1", "Intro", true)]
    );
    const low = issues.find((i) => i.type === "low_confidence");
    expect(low).toBeDefined();
    expect(low?.severity).toBe("warning");
  });

  it("does not warn when confidence is high", () => {
    const issues = svc.validateMapping(
      [mapping("s1", 0.9)],
      [section("s1", "Intro", true)]
    );
    expect(issues.find((i) => i.type === "low_confidence")).toBeUndefined();
  });

  it("ignores optional sections with no content", () => {
    const issues = svc.validateMapping([], [section("s2", "CTA", false)]);
    expect(issues.find((i) => i.type === "missing_required")).toBeUndefined();
  });
});
