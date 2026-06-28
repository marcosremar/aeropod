/**
 * Unit tests for SegmentMappingService.validateMapping.
 *
 * validateMapping is a pure synchronous method — it takes plain arrays and
 * returns ValidationIssue[]. No DB mocking is required.
 */

import { describe, it, expect } from "vitest";
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
