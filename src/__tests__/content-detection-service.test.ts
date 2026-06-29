/**
 * Unit tests for ContentDetectionService.
 * Mocks aiCompleteJSON and TemplateService so no real AI calls or DB I/O occur.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoist mocks ─────────────────────────────────────────────────────────────

const {
  mockAiCompleteJSON,
  mockGetTemplatesByCategory,
  mockGetSystemTemplates,
  mockGetTemplateWithSections,
  mockDbInsert,
  mockDbUpdate,
  mockDbSelect,
} = vi.hoisted(() => ({
  mockAiCompleteJSON: vi.fn(),
  mockGetTemplatesByCategory: vi.fn(),
  mockGetSystemTemplates: vi.fn(),
  mockGetTemplateWithSections: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbSelect: vi.fn(),
}));

vi.mock("@/lib/ai/AIService", () => ({
  aiCompleteJSON: mockAiCompleteJSON,
}));

vi.mock("@/lib/templates/TemplateService", () => ({
  TemplateService: vi.fn().mockImplementation(function () {
    this.getTemplatesByCategory = mockGetTemplatesByCategory;
    this.getSystemTemplates = mockGetSystemTemplates;
    this.getTemplateWithSections = mockGetTemplateWithSections;
  }),
}));

vi.mock("@/lib/db/schema", () => ({
  contentTypeDetections: "content_type_detections_table",
  projects: "projects_table",
  templates: "templates_table",
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val })),
}));

import { ContentDetectionService } from "@/lib/ai/ContentDetectionService";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PROJECT_ID = "550e8400-e29b-41d4-a716-446655440000";

const DETECTION_RESULT = {
  detectedType: "interview" as const,
  confidence: 0.92,
  reasoning: "Clear Q&A pattern",
  characteristics: ["two speakers", "question-answer"],
  speakers: 2,
  questionAnswerPatterns: 12,
  narrativeStructure: "conversational" as const,
};

const TEMPLATE_A = {
  id: "tpl-a",
  name: "Interview Template",
  category: "interview",
  isSystem: true,
};
const TEMPLATE_B = {
  id: "tpl-b",
  name: "Monologue Template",
  category: "monologue",
  isSystem: true,
};

// Builds a fake db object with chainable insert/update/select methods
function buildFakeDb() {
  const insertValues = vi.fn().mockResolvedValue([]);
  const insertInto = vi.fn().mockReturnValue({ values: insertValues });

  const updateSet = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([]),
  });
  const updateTable = vi.fn().mockReturnValue({ set: updateSet });

  const selectFrom = vi.fn().mockReturnThis();
  const selectWhere = vi.fn().mockReturnThis();
  const selectOrderBy = vi.fn().mockReturnThis();
  const selectLimit = vi.fn().mockResolvedValue([]);

  const selectChain = {
    from: selectFrom.mockReturnValue({
      where: selectWhere.mockReturnValue({
        orderBy: selectOrderBy.mockReturnValue({
          limit: selectLimit,
        }),
        limit: selectLimit,
      }),
    }),
  };

  return {
    insert: insertInto,
    update: updateTable,
    select: vi.fn().mockReturnValue(selectChain),
    _insertValues: insertValues,
    _updateSet: updateSet,
    _selectLimit: selectLimit,
  };
}

// ─── detectContentType ────────────────────────────────────────────────────────

describe("ContentDetectionService.detectContentType", () => {
  let svc: ContentDetectionService;
  let fakeDb: ReturnType<typeof buildFakeDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeDb = buildFakeDb();
    svc = new ContentDetectionService(fakeDb as any);
    mockAiCompleteJSON.mockResolvedValue(DETECTION_RESULT);
  });

  it("returns detection result from AI on success", async () => {
    const result = await svc.detectContentType(PROJECT_ID, "Short transcript.");

    expect(result.detectedType).toBe("interview");
    expect(result.confidence).toBe(0.92);
    expect(result.characteristics).toEqual(["two speakers", "question-answer"]);
  });

  it("passes transcription shorter than 3000 chars unchanged to AI", async () => {
    const shortText = "Hello world";
    await svc.detectContentType(PROJECT_ID, shortText);

    const promptArg = mockAiCompleteJSON.mock.calls[0][1] as string;
    expect(promptArg).toContain(shortText);
    expect(promptArg).not.toContain("...");
  });

  it("truncates transcription longer than 3000 chars to 3000 + '...'", async () => {
    const longText = "A".repeat(4000);
    await svc.detectContentType(PROJECT_ID, longText);

    const promptArg = mockAiCompleteJSON.mock.calls[0][1] as string;
    // The analysisText used inside the prompt is exactly 3000 chars + "..."
    expect(promptArg).toContain("A".repeat(3000) + "...");
    expect(promptArg).not.toContain("A".repeat(3001));
  });

  it("returns monologue fallback with confidence 0.3 when AI throws", async () => {
    mockAiCompleteJSON.mockRejectedValue(new Error("AI unavailable"));

    const result = await svc.detectContentType(PROJECT_ID, "Some transcript");

    expect(result.detectedType).toBe("monologue");
    expect(result.confidence).toBe(0.3);
    expect(result.reasoning).toMatch(/detection failed/i);
  });

  it("returns monologue fallback when AI result is missing detectedType", async () => {
    mockAiCompleteJSON.mockResolvedValue({ confidence: 0.9 }); // missing detectedType

    const result = await svc.detectContentType(PROJECT_ID, "transcript");

    expect(result.detectedType).toBe("monologue");
    expect(result.confidence).toBe(0.3);
  });

  it("returns monologue fallback when AI result is missing confidence", async () => {
    mockAiCompleteJSON.mockResolvedValue({ detectedType: "debate" }); // missing confidence

    const result = await svc.detectContentType(PROJECT_ID, "transcript");

    expect(result.detectedType).toBe("monologue");
    expect(result.confidence).toBe(0.3);
  });

  it("passes task type 'content_detection' to aiCompleteJSON", async () => {
    await svc.detectContentType(PROJECT_ID, "transcript");

    expect(mockAiCompleteJSON).toHaveBeenCalledWith(
      "content_detection",
      expect.any(String)
    );
  });
});

// ─── suggestTemplates ─────────────────────────────────────────────────────────

describe("ContentDetectionService.suggestTemplates", () => {
  let svc: ContentDetectionService;
  let fakeDb: ReturnType<typeof buildFakeDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeDb = buildFakeDb();
    svc = new ContentDetectionService(fakeDb as any);
    mockGetTemplateWithSections.mockResolvedValue({ id: TEMPLATE_A.id, sections: [] });
  });

  it("returns suggestions from matching category templates", async () => {
    mockGetTemplatesByCategory.mockResolvedValue([TEMPLATE_A]);

    const suggestions = await svc.suggestTemplates("interview", 0.9);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].templateId).toBe(TEMPLATE_A.id);
    expect(suggestions[0].matchScore).toBe(0.9);
  });

  it("adds system-template fallbacks when no category templates exist", async () => {
    mockGetTemplatesByCategory.mockResolvedValue([]);
    mockGetSystemTemplates.mockResolvedValue([TEMPLATE_A, TEMPLATE_B]);
    mockGetTemplateWithSections.mockResolvedValue({ id: TEMPLATE_A.id, sections: [] });

    const suggestions = await svc.suggestTemplates("interview", 0.9);

    // No category match → up to 2 system fallbacks added
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions.every((s) => s.matchScore === 0.5)).toBe(true);
  });

  it("adds system-template fallbacks when confidence < 0.6 even if category templates exist", async () => {
    mockGetTemplatesByCategory.mockResolvedValue([TEMPLATE_A]);
    mockGetSystemTemplates.mockResolvedValue([TEMPLATE_B]);
    // getTemplateWithSections returns template for TEMPLATE_A; TEMPLATE_B is different
    mockGetTemplateWithSections.mockImplementation(async (id: string) => {
      if (id === TEMPLATE_A.id) return { id: TEMPLATE_A.id, sections: [] };
      if (id === TEMPLATE_B.id) return { id: TEMPLATE_B.id, sections: [] };
      return null;
    });

    const suggestions = await svc.suggestTemplates("interview", 0.5); // below 0.6

    // Should include both the category match and the fallback
    const ids = suggestions.map((s) => s.templateId);
    expect(ids).toContain(TEMPLATE_A.id);
    expect(ids).toContain(TEMPLATE_B.id);
  });

  it("does not duplicate a fallback template already in suggestions", async () => {
    // Category match already returns TEMPLATE_A; system templates also returns TEMPLATE_A
    mockGetTemplatesByCategory.mockResolvedValue([TEMPLATE_A]);
    mockGetSystemTemplates.mockResolvedValue([TEMPLATE_A, TEMPLATE_B]);
    mockGetTemplateWithSections.mockImplementation(async (id: string) => {
      if (id === TEMPLATE_A.id) return { id: TEMPLATE_A.id, sections: [] };
      if (id === TEMPLATE_B.id) return { id: TEMPLATE_B.id, sections: [] };
      return null;
    });

    const suggestions = await svc.suggestTemplates("interview", 0.4); // low confidence

    const ids = suggestions.map((s) => s.templateId);
    // TEMPLATE_A must appear only once
    expect(ids.filter((id) => id === TEMPLATE_A.id)).toHaveLength(1);
  });

  it("omits a category template when getTemplateWithSections returns null and no system fallbacks exist", async () => {
    mockGetTemplatesByCategory.mockResolvedValue([TEMPLATE_A]);
    mockGetTemplateWithSections.mockResolvedValue(null);
    mockGetSystemTemplates.mockResolvedValue([]); // no fallback templates either

    const suggestions = await svc.suggestTemplates("interview", 0.9);

    expect(suggestions).toHaveLength(0);
  });
});

// ─── getLatestDetection ───────────────────────────────────────────────────────

describe("ContentDetectionService.getLatestDetection", () => {
  let svc: ContentDetectionService;
  let fakeDb: ReturnType<typeof buildFakeDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeDb = buildFakeDb();
    svc = new ContentDetectionService(fakeDb as any);
  });

  it("returns null when no detection record exists", async () => {
    fakeDb._selectLimit.mockResolvedValue([]);

    const result = await svc.getLatestDetection(PROJECT_ID);

    expect(result).toBeNull();
  });

  it("returns the detection record when one exists", async () => {
    const record = { id: "det-1", projectId: PROJECT_ID, detectedType: "interview" };
    fakeDb._selectLimit.mockResolvedValue([record]);

    const result = await svc.getLatestDetection(PROJECT_ID);

    expect(result).toEqual(record);
  });
});

// ─── detectAndSave ────────────────────────────────────────────────────────────

describe("ContentDetectionService.detectAndSave", () => {
  let svc: ContentDetectionService;
  let fakeDb: ReturnType<typeof buildFakeDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeDb = buildFakeDb();
    svc = new ContentDetectionService(fakeDb as any);
    mockAiCompleteJSON.mockResolvedValue(DETECTION_RESULT);
    mockGetTemplatesByCategory.mockResolvedValue([TEMPLATE_A]);
    mockGetTemplateWithSections.mockResolvedValue({ id: TEMPLATE_A.id, sections: [] });
    mockGetSystemTemplates.mockResolvedValue([]);
  });

  it("resolves to void on success", async () => {
    const result = await svc.detectAndSave(PROJECT_ID, "Interview transcript");
    expect(result).toBeUndefined();
  });

  it("inserts a detection record with projectId, detectedType, confidence, and reasoning", async () => {
    await svc.detectAndSave(PROJECT_ID, "Interview transcript");

    expect(fakeDb._insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT_ID,
        detectedType: "interview",
        confidence: 0.92,
        reasoning: "Clear Q&A pattern",
      })
    );
  });

  it("includes a suggestedTemplates array in the inserted record", async () => {
    await svc.detectAndSave(PROJECT_ID, "Interview transcript");

    const args = fakeDb._insertValues.mock.calls[0][0];
    expect(Array.isArray(args.suggestedTemplates)).toBe(true);
  });

  it("saves analysisData with speakers, questionAnswerPatterns, narrativeStructure, and characteristics", async () => {
    await svc.detectAndSave(PROJECT_ID, "Interview transcript");

    const args = fakeDb._insertValues.mock.calls[0][0];
    expect(args.analysisData).toMatchObject({
      speakers: DETECTION_RESULT.speakers,
      questionAnswerPatterns: DETECTION_RESULT.questionAnswerPatterns,
      narrativeStructure: DETECTION_RESULT.narrativeStructure,
      characteristics: DETECTION_RESULT.characteristics,
    });
  });

  it("updates the project with contentType set to the detected type and detectionStatus='detected'", async () => {
    await svc.detectAndSave(PROJECT_ID, "Interview transcript");

    expect(fakeDb._updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "interview",
        detectionStatus: "detected",
      })
    );
  });

  it("performs the DB insert before the project update", async () => {
    const callOrder: string[] = [];
    fakeDb._insertValues.mockImplementation(async () => {
      callOrder.push("insert");
      return [];
    });
    fakeDb._updateSet.mockImplementation(() => {
      callOrder.push("update");
      return { where: vi.fn().mockResolvedValue([]) };
    });

    await svc.detectAndSave(PROJECT_ID, "Interview transcript");

    expect(callOrder[0]).toBe("insert");
    expect(callOrder[1]).toBe("update");
  });

  it("saves the monologue fallback type when AI detection fails", async () => {
    mockAiCompleteJSON.mockRejectedValue(new Error("AI unavailable"));
    mockGetTemplatesByCategory.mockResolvedValue([]);

    await svc.detectAndSave(PROJECT_ID, "Some transcript");

    const args = fakeDb._insertValues.mock.calls[0][0];
    expect(args.detectedType).toBe("monologue");
    expect(args.confidence).toBe(0.3);
  });

  it("throws when the DB insert fails", async () => {
    fakeDb._insertValues.mockRejectedValue(new Error("Insert failed"));

    await expect(svc.detectAndSave(PROJECT_ID, "transcript")).rejects.toThrow("Insert failed");
  });
});
