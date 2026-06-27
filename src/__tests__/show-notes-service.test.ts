/**
 * Unit tests for ShowNotesService pure methods and SegmentMappingService.validateMapping
 * These methods have no DB/AI dependencies and can be tested in isolation.
 */

import { describe, it, expect } from "vitest";
import { ShowNotesService } from "@/lib/ai/show-notes-service";
import type { ShowNote } from "@/lib/db/schema";
import type {
  SegmentSectionMapping,
} from "@/lib/sections/SegmentMappingService";
import { SegmentMappingService } from "@/lib/sections/SegmentMappingService";

// ─── ShowNotesService pure helpers ───────────────────────────────────────────

// Access private methods via casting
type ShowNotesServiceInternal = ShowNotesService & {
  formatTimestamp(seconds: number): string;
  buildTranscript(segments: { startTime: number; text: string }[]): string;
};

function makeService(): ShowNotesServiceInternal {
  return new ShowNotesService() as unknown as ShowNotesServiceInternal;
}

describe("ShowNotesService.formatTimestamp", () => {
  const svc = makeService();

  it("formats seconds-only as M:SS", () => {
    expect(svc.formatTimestamp(0)).toBe("0:00");
    expect(svc.formatTimestamp(9)).toBe("0:09");
    expect(svc.formatTimestamp(59)).toBe("0:59");
  });

  it("formats minutes and seconds", () => {
    expect(svc.formatTimestamp(60)).toBe("1:00");
    expect(svc.formatTimestamp(90)).toBe("1:30");
    expect(svc.formatTimestamp(599)).toBe("9:59");
  });

  it("includes hours when >= 3600 seconds", () => {
    expect(svc.formatTimestamp(3600)).toBe("1:00:00");
    expect(svc.formatTimestamp(3661)).toBe("1:01:01");
    expect(svc.formatTimestamp(7325)).toBe("2:02:05");
  });

  it("pads minutes and seconds to two digits inside hours", () => {
    expect(svc.formatTimestamp(3605)).toBe("1:00:05");
    expect(svc.formatTimestamp(3660)).toBe("1:01:00");
  });
});

describe("ShowNotesService.buildTranscript", () => {
  const svc = makeService();

  it("returns empty string for no segments", () => {
    expect(svc.buildTranscript([])).toBe("");
  });

  it("formats a single segment correctly", () => {
    const result = svc.buildTranscript([{ startTime: 0, text: "Hello world" }]);
    expect(result).toBe("[0:00] Hello world");
  });

  it("joins multiple segments with double newlines", () => {
    const segments = [
      { startTime: 0, text: "Intro" },
      { startTime: 60, text: "Main topic" },
      { startTime: 120, text: "Conclusion" },
    ];
    const result = svc.buildTranscript(segments);
    expect(result).toBe("[0:00] Intro\n\n[1:00] Main topic\n\n[2:00] Conclusion");
  });

  it("uses correct timestamp format for each segment", () => {
    const segments = [
      { startTime: 3661, text: "Late segment" },
    ];
    const result = svc.buildTranscript(segments);
    expect(result).toBe("[1:01:01] Late segment");
  });
});

// ─── ShowNotesService export helpers ─────────────────────────────────────────

function makeShowNote(overrides: Partial<ShowNote> = {}): ShowNote {
  return {
    id: "test-id",
    projectId: "proj-1",
    summary: null,
    chapters: null,
    keyPoints: null,
    guestInfo: null,
    links: null,
    generatedAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("ShowNotesService.exportMarkdown", () => {
  const svc = new ShowNotesService();

  it("returns empty string when note has no content", () => {
    expect(svc.exportMarkdown(makeShowNote())).toBe("");
  });

  it("includes summary section", () => {
    const note = makeShowNote({ summary: "Great episode about testing." });
    const md = svc.exportMarkdown(note);
    expect(md).toContain("## Resumo");
    expect(md).toContain("Great episode about testing.");
  });

  it("includes chapters with timestamps", () => {
    const chapters = [
      { title: "Intro", timestamp: 0, description: "Opening" },
      { title: "Deep Dive", timestamp: 600, description: "Main content" },
    ];
    const note = makeShowNote({ chapters: chapters as any });
    const md = svc.exportMarkdown(note);
    expect(md).toContain("## Capitulos");
    expect(md).toContain("**0:00**");
    expect(md).toContain("Intro");
    expect(md).toContain("**10:00**");
    expect(md).toContain("Deep Dive");
  });

  it("includes key points as list items", () => {
    const note = makeShowNote({ keyPoints: ["Point A", "Point B"] as any });
    const md = svc.exportMarkdown(note);
    expect(md).toContain("## Pontos-Chave");
    expect(md).toContain("- Point A");
    expect(md).toContain("- Point B");
  });

  it("includes guest info with role", () => {
    const note = makeShowNote({
      guestInfo: [{ name: "Jane Doe", role: "CTO", bio: "Tech leader" }] as any,
    });
    const md = svc.exportMarkdown(note);
    expect(md).toContain("## Convidados");
    expect(md).toContain("Jane Doe");
    expect(md).toContain("CTO");
    expect(md).toContain("Tech leader");
  });

  it("includes links section", () => {
    const note = makeShowNote({ links: ["https://example.com"] as any });
    const md = svc.exportMarkdown(note);
    expect(md).toContain("## Links Mencionados");
    expect(md).toContain("- https://example.com");
  });

  it("omits sections that are null or empty", () => {
    const note = makeShowNote({ summary: "Only summary", keyPoints: [] as any });
    const md = svc.exportMarkdown(note);
    expect(md).toContain("## Resumo");
    expect(md).not.toContain("## Pontos-Chave");
    expect(md).not.toContain("## Capitulos");
  });
});

describe("ShowNotesService.exportPlainText", () => {
  const svc = new ShowNotesService();

  it("returns empty string for note with no content", () => {
    expect(svc.exportPlainText(makeShowNote())).toBe("");
  });

  it("includes summary with header", () => {
    const note = makeShowNote({ summary: "This is the summary." });
    const text = svc.exportPlainText(note);
    expect(text).toContain("RESUMO");
    expect(text).toContain("This is the summary.");
  });

  it("includes chapters", () => {
    const chapters = [{ title: "Opening", timestamp: 0 }];
    const note = makeShowNote({ chapters: chapters as any });
    const text = svc.exportPlainText(note);
    expect(text).toContain("CAPITULOS");
    expect(text).toContain("0:00 - Opening");
  });

  it("includes key points", () => {
    const note = makeShowNote({ keyPoints: ["Alpha", "Beta"] as any });
    const text = svc.exportPlainText(note);
    expect(text).toContain("PONTOS-CHAVE");
    expect(text).toContain("* Alpha");
    expect(text).toContain("* Beta");
  });
});

// ─── SegmentMappingService.validateMapping ───────────────────────────────────

// We can test validateMapping without a real DB by constructing the service
// without calling the constructor's db usage (it's only used in async methods).
function makeMappingService(): SegmentMappingService {
  return new SegmentMappingService(null as any);
}

function makeTemplateSection(overrides: Record<string, unknown> = {}) {
  return {
    id: "ts-1",
    templateId: "tmpl-1",
    name: "Main Content",
    type: "main_content",
    description: "The core content",
    order: 1,
    isRequired: false,
    suggestedDuration: 600,
    exampleText: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeProjectSection(overrides: Record<string, unknown> = {}) {
  return {
    id: "ps-1",
    projectId: "proj-1",
    templateSectionId: "ts-1",
    name: "Main Content",
    order: 1,
    status: "pending",
    audioUrl: null,
    duration: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("SegmentMappingService.validateMapping", () => {
  const svc = makeMappingService();

  it("returns no issues when required section has mappings with high confidence", () => {
    const sections = [
      {
        projectSection: makeProjectSection() as any,
        templateSection: makeTemplateSection({ isRequired: true }) as any,
      },
    ];
    const mappings: SegmentSectionMapping[] = [
      {
        segmentId: "seg-1",
        sectionId: "ps-1",
        templateSectionId: "ts-1",
        confidence: 0.9,
        reasoning: "Obvious match",
      },
    ];

    const issues = svc.validateMapping(mappings, sections);
    expect(issues).toHaveLength(0);
  });

  it("reports missing_required error when required section has no mappings", () => {
    const sections = [
      {
        projectSection: makeProjectSection() as any,
        templateSection: makeTemplateSection({ isRequired: true, name: "Intro" }) as any,
      },
    ];

    const issues = svc.validateMapping([], sections);

    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("missing_required");
    expect(issues[0].severity).toBe("error");
    expect(issues[0].sectionName).toBe("Intro");
  });

  it("does NOT report missing_required for optional sections with no mappings", () => {
    const sections = [
      {
        projectSection: makeProjectSection() as any,
        templateSection: makeTemplateSection({ isRequired: false }) as any,
      },
    ];

    const issues = svc.validateMapping([], sections);
    expect(issues).toHaveLength(0);
  });

  it("reports low_confidence warning when average confidence is below 0.5", () => {
    const sections = [
      {
        projectSection: makeProjectSection() as any,
        templateSection: makeTemplateSection() as any,
      },
    ];
    const mappings: SegmentSectionMapping[] = [
      {
        segmentId: "seg-1",
        sectionId: "ps-1",
        templateSectionId: "ts-1",
        confidence: 0.3,
        reasoning: "Uncertain",
      },
      {
        segmentId: "seg-2",
        sectionId: "ps-1",
        templateSectionId: "ts-1",
        confidence: 0.2,
        reasoning: "Also uncertain",
      },
    ];

    const issues = svc.validateMapping(mappings, sections);
    expect(issues.some((i) => i.type === "low_confidence")).toBe(true);
    const warning = issues.find((i) => i.type === "low_confidence")!;
    expect(warning.severity).toBe("warning");
  });

  it("does NOT warn when average confidence is 0.5 or above", () => {
    const sections = [
      {
        projectSection: makeProjectSection() as any,
        templateSection: makeTemplateSection() as any,
      },
    ];
    const mappings: SegmentSectionMapping[] = [
      {
        segmentId: "seg-1",
        sectionId: "ps-1",
        templateSectionId: "ts-1",
        confidence: 0.5,
        reasoning: "Borderline",
      },
    ];

    const issues = svc.validateMapping(mappings, sections);
    expect(issues.filter((i) => i.type === "low_confidence")).toHaveLength(0);
  });

  it("handles multiple sections independently", () => {
    const sections = [
      {
        projectSection: makeProjectSection({ id: "ps-1" }) as any,
        templateSection: makeTemplateSection({ id: "ts-1", isRequired: true, name: "Intro" }) as any,
      },
      {
        projectSection: makeProjectSection({ id: "ps-2" }) as any,
        templateSection: makeTemplateSection({ id: "ts-2", isRequired: false, name: "Outro" }) as any,
      },
    ];
    // Only ps-2 has a mapping (low confidence)
    const mappings: SegmentSectionMapping[] = [
      {
        segmentId: "seg-1",
        sectionId: "ps-2",
        templateSectionId: "ts-2",
        confidence: 0.2,
        reasoning: "Weak",
      },
    ];

    const issues = svc.validateMapping(mappings, sections);
    const missingRequired = issues.filter((i) => i.type === "missing_required");
    const lowConf = issues.filter((i) => i.type === "low_confidence");

    expect(missingRequired).toHaveLength(1);
    expect(missingRequired[0].sectionName).toBe("Intro");
    expect(lowConf).toHaveLength(1);
    expect(lowConf[0].sectionName).toBe("Outro");
  });
});
