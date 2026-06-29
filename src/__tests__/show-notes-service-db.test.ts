/**
 * Unit tests for ShowNotesService database-interacting methods:
 * generate(), regenerateSection(), getShowNotes(), updateShowNotes().
 *
 * All DB and AI calls are mocked so these tests run without a real database
 * or network access.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoist mock functions before any vi.mock() calls ─────────────────────────

const {
  mockAiComplete,
  mockAiCompleteJSON,
  mockDbSelect,
  mockDbUpdate,
  mockDbInsert,
} = vi.hoisted(() => ({
  mockAiComplete: vi.fn(),
  mockAiCompleteJSON: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbInsert: vi.fn(),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/ai/AIService", () => ({
  aiComplete: mockAiComplete,
  aiCompleteJSON: mockAiCompleteJSON,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    insert: mockDbInsert,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  showNotes: "show_notes_table",
  segments: "segments_table",
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val })),
}));

import { ShowNotesService } from "@/lib/ai/show-notes-service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSelectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockResolvedValue(rows);
  chain.limit = vi.fn().mockResolvedValue(rows);
  return chain;
}

function buildUpdateChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.set = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue(rows);
  return chain;
}

function buildInsertChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.values = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue(rows);
  return chain;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PROJECT_ID = "550e8400-e29b-41d4-a716-446655440000";

const SAMPLE_SEGMENTS = [
  {
    id: "seg-1",
    projectId: PROJECT_ID,
    text: "Welcome to the podcast. Today we discuss AI.",
    startTime: 0,
    endTime: 60,
    topic: "intro",
    keyInsight: "AI overview",
  },
  {
    id: "seg-2",
    projectId: PROJECT_ID,
    text: "Let us wrap up with key takeaways.",
    startTime: 600,
    endTime: 660,
    topic: "outro",
    keyInsight: "",
  },
];

const AI_SHOW_NOTES = {
  summary: "A great episode about artificial intelligence.",
  chapters: [
    { title: "Introduction", timestamp: 0, description: "Welcome" },
    { title: "Conclusion", timestamp: 600, description: "Wrap-up" },
  ],
  keyPoints: ["AI is transformative", "Practical applications exist"],
  guestInfo: [],
  links: [],
};

const EXISTING_NOTE = {
  id: "sn-1",
  projectId: PROJECT_ID,
  summary: "Old summary",
  chapters: [],
  keyPoints: [],
  guestInfo: null,
  links: null,
  generatedAt: new Date(),
  updatedAt: new Date(),
};

// ─── getShowNotes ─────────────────────────────────────────────────────────────

describe("ShowNotesService.getShowNotes", () => {
  let svc: ShowNotesService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new ShowNotesService();
  });

  it("returns null when no show note exists for the project", async () => {
    mockDbSelect.mockReturnValue(buildSelectChain([]));

    const result = await svc.getShowNotes(PROJECT_ID);

    expect(result).toBeNull();
  });

  it("returns the show note when one exists", async () => {
    mockDbSelect.mockReturnValue(buildSelectChain([EXISTING_NOTE]));

    const result = await svc.getShowNotes(PROJECT_ID);

    expect(result).toEqual(EXISTING_NOTE);
  });

  it("returns only the first row even when multiple rows are present", async () => {
    const second = { ...EXISTING_NOTE, id: "sn-2", summary: "Other" };
    mockDbSelect.mockReturnValue(buildSelectChain([EXISTING_NOTE, second]));

    const result = await svc.getShowNotes(PROJECT_ID);

    expect(result).toEqual(EXISTING_NOTE);
  });
});

// ─── updateShowNotes ──────────────────────────────────────────────────────────

describe("ShowNotesService.updateShowNotes", () => {
  let svc: ShowNotesService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new ShowNotesService();
  });

  it("returns the updated show note from the database", async () => {
    const updatedNote = { ...EXISTING_NOTE, summary: "Revised summary" };
    const updateChain = buildUpdateChain([updatedNote]);
    mockDbUpdate.mockReturnValue(updateChain);

    const result = await svc.updateShowNotes(PROJECT_ID, { summary: "Revised summary" });

    expect(mockDbUpdate).toHaveBeenCalledOnce();
    expect(result).toEqual(updatedNote);
  });

  it("passes the provided updates to the set() call", async () => {
    const updateChain = buildUpdateChain([EXISTING_NOTE]);
    mockDbUpdate.mockReturnValue(updateChain);

    await svc.updateShowNotes(PROJECT_ID, {
      summary: "New summary",
      keyPoints: ["Point A"],
    });

    const setMock = vi.mocked(updateChain.set as ReturnType<typeof vi.fn>);
    expect(setMock).toHaveBeenCalledOnce();
    const passed = setMock.mock.calls[0][0] as Record<string, unknown>;
    expect(passed.summary).toBe("New summary");
    expect(passed.keyPoints).toEqual(["Point A"]);
  });

  it("always stamps updatedAt with a current Date", async () => {
    const updateChain = buildUpdateChain([EXISTING_NOTE]);
    mockDbUpdate.mockReturnValue(updateChain);

    const before = Date.now();
    await svc.updateShowNotes(PROJECT_ID, { summary: "x" });
    const after = Date.now();

    const setMock = vi.mocked(updateChain.set as ReturnType<typeof vi.fn>);
    const passed = setMock.mock.calls[0][0] as Record<string, unknown>;
    expect(passed.updatedAt).toBeInstanceOf(Date);
    const ts = (passed.updatedAt as Date).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

// ─── generate ─────────────────────────────────────────────────────────────────

describe("ShowNotesService.generate", () => {
  let svc: ShowNotesService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new ShowNotesService();
    mockAiCompleteJSON.mockResolvedValue(AI_SHOW_NOTES);
  });

  it("throws when the project has no segments", async () => {
    mockDbSelect.mockReturnValue(buildSelectChain([]));

    await expect(svc.generate(PROJECT_ID)).rejects.toThrow(
      "No segments found for project"
    );
  });

  it("inserts a new show note when none exist yet and returns it", async () => {
    const insertedNote = { id: "sn-new", projectId: PROJECT_ID, ...AI_SHOW_NOTES };
    const insertChain = buildInsertChain([insertedNote]);

    mockDbSelect
      .mockReturnValueOnce(buildSelectChain(SAMPLE_SEGMENTS)) // segments
      .mockReturnValueOnce(buildSelectChain([])); // existing show notes (empty)
    mockDbInsert.mockReturnValue(insertChain);

    const result = await svc.generate(PROJECT_ID);

    expect(mockDbInsert).toHaveBeenCalledOnce();
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(result).toEqual(insertedNote);
  });

  it("updates an existing show note instead of inserting a new one", async () => {
    const updatedNote = { ...EXISTING_NOTE, ...AI_SHOW_NOTES };
    const updateChain = buildUpdateChain([updatedNote]);

    mockDbSelect
      .mockReturnValueOnce(buildSelectChain(SAMPLE_SEGMENTS)) // segments
      .mockReturnValueOnce(buildSelectChain([EXISTING_NOTE])); // existing show note
    mockDbUpdate.mockReturnValue(updateChain);

    const result = await svc.generate(PROJECT_ID);

    expect(mockDbUpdate).toHaveBeenCalledOnce();
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(result).toEqual(updatedNote);
  });

  it("calls aiCompleteJSON with task type 'show_notes'", async () => {
    const insertChain = buildInsertChain([{ id: "sn-1" }]);
    mockDbSelect
      .mockReturnValueOnce(buildSelectChain(SAMPLE_SEGMENTS))
      .mockReturnValueOnce(buildSelectChain([]));
    mockDbInsert.mockReturnValue(insertChain);

    await svc.generate(PROJECT_ID);

    expect(mockAiCompleteJSON).toHaveBeenCalledOnce();
    expect(mockAiCompleteJSON.mock.calls[0][0]).toBe("show_notes");
  });

  it("includes segment text in the prompt sent to AI", async () => {
    const insertChain = buildInsertChain([{ id: "sn-1" }]);
    mockDbSelect
      .mockReturnValueOnce(buildSelectChain(SAMPLE_SEGMENTS))
      .mockReturnValueOnce(buildSelectChain([]));
    mockDbInsert.mockReturnValue(insertChain);

    await svc.generate(PROJECT_ID);

    const prompt = mockAiCompleteJSON.mock.calls[0][1] as string;
    expect(prompt).toContain("Welcome to the podcast");
    expect(prompt).toContain("wrap up with key takeaways");
  });

  it("handles AI response with missing optional fields gracefully", async () => {
    mockAiCompleteJSON.mockResolvedValue({
      summary: "Minimal summary",
      // chapters and keyPoints absent
    });

    const insertedNote = { id: "sn-1", projectId: PROJECT_ID, summary: "Minimal summary" };
    const insertChain = buildInsertChain([insertedNote]);
    mockDbSelect
      .mockReturnValueOnce(buildSelectChain(SAMPLE_SEGMENTS))
      .mockReturnValueOnce(buildSelectChain([]));
    mockDbInsert.mockReturnValue(insertChain);

    const result = await svc.generate(PROJECT_ID);
    expect(result).toEqual(insertedNote);
  });
});

// ─── regenerateSection ────────────────────────────────────────────────────────

describe("ShowNotesService.regenerateSection", () => {
  let svc: ShowNotesService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new ShowNotesService();
  });

  it("delegates to generate() when no show notes exist yet", async () => {
    mockAiCompleteJSON.mockResolvedValue(AI_SHOW_NOTES);

    const insertedNote = { id: "sn-new", projectId: PROJECT_ID, ...AI_SHOW_NOTES };
    const insertChain = buildInsertChain([insertedNote]);

    mockDbSelect
      .mockReturnValueOnce(buildSelectChain([])) // regenerateSection's own check
      .mockReturnValueOnce(buildSelectChain(SAMPLE_SEGMENTS)) // generate()'s segments
      .mockReturnValueOnce(buildSelectChain([])); // generate()'s existing notes check
    mockDbInsert.mockReturnValue(insertChain);

    const result = await svc.regenerateSection(PROJECT_ID, "summary");

    expect(mockDbInsert).toHaveBeenCalledOnce();
    expect(result).toEqual(insertedNote);
  });

  it("regenerates the summary via aiComplete and updates the show note", async () => {
    const newSummary = "Brand new AI summary";
    mockAiComplete.mockResolvedValue(newSummary);

    const updatedNote = { ...EXISTING_NOTE, summary: newSummary };
    const updateChain = buildUpdateChain([updatedNote]);

    mockDbSelect
      .mockReturnValueOnce(buildSelectChain([EXISTING_NOTE])) // existing notes
      .mockReturnValueOnce(buildSelectChain(SAMPLE_SEGMENTS)); // segments
    mockDbUpdate.mockReturnValue(updateChain);

    const result = await svc.regenerateSection(PROJECT_ID, "summary");

    expect(mockAiComplete).toHaveBeenCalledWith("show_notes", expect.any(String));
    expect(mockAiCompleteJSON).not.toHaveBeenCalled();
    expect(result).toEqual(updatedNote);
  });

  it("regenerates chapters via aiCompleteJSON and updates the show note", async () => {
    const newChapters = [{ title: "New Chapter", timestamp: 0, description: "Intro" }];
    mockAiCompleteJSON.mockResolvedValue(newChapters);

    const updatedNote = { ...EXISTING_NOTE, chapters: newChapters };
    const updateChain = buildUpdateChain([updatedNote]);

    mockDbSelect
      .mockReturnValueOnce(buildSelectChain([EXISTING_NOTE]))
      .mockReturnValueOnce(buildSelectChain(SAMPLE_SEGMENTS));
    mockDbUpdate.mockReturnValue(updateChain);

    const result = await svc.regenerateSection(PROJECT_ID, "chapters");

    expect(mockAiCompleteJSON).toHaveBeenCalledWith("show_notes", expect.any(String));
    expect(mockAiComplete).not.toHaveBeenCalled();
    expect(result).toEqual(updatedNote);
  });

  it("regenerates key points via aiCompleteJSON and updates the show note", async () => {
    const newKeyPoints = ["Insight A", "Insight B", "Insight C"];
    mockAiCompleteJSON.mockResolvedValue(newKeyPoints);

    const updatedNote = { ...EXISTING_NOTE, keyPoints: newKeyPoints };
    const updateChain = buildUpdateChain([updatedNote]);

    mockDbSelect
      .mockReturnValueOnce(buildSelectChain([EXISTING_NOTE]))
      .mockReturnValueOnce(buildSelectChain(SAMPLE_SEGMENTS));
    mockDbUpdate.mockReturnValue(updateChain);

    const result = await svc.regenerateSection(PROJECT_ID, "keyPoints");

    expect(mockAiCompleteJSON).toHaveBeenCalledWith("show_notes", expect.any(String));
    expect(mockAiComplete).not.toHaveBeenCalled();
    expect(result).toEqual(updatedNote);
  });

  it("returns empty chapters array when AI chapter generation fails", async () => {
    mockAiCompleteJSON.mockRejectedValue(new Error("AI unavailable"));

    const updatedNote = { ...EXISTING_NOTE, chapters: [] };
    const updateChain = buildUpdateChain([updatedNote]);

    mockDbSelect
      .mockReturnValueOnce(buildSelectChain([EXISTING_NOTE]))
      .mockReturnValueOnce(buildSelectChain(SAMPLE_SEGMENTS));
    mockDbUpdate.mockReturnValue(updateChain);

    const result = await svc.regenerateSection(PROJECT_ID, "chapters");
    expect(result).toEqual(updatedNote);
  });

  it("returns empty key points array when AI key point generation fails", async () => {
    mockAiCompleteJSON.mockRejectedValue(new Error("AI unavailable"));

    const updatedNote = { ...EXISTING_NOTE, keyPoints: [] };
    const updateChain = buildUpdateChain([updatedNote]);

    mockDbSelect
      .mockReturnValueOnce(buildSelectChain([EXISTING_NOTE]))
      .mockReturnValueOnce(buildSelectChain(SAMPLE_SEGMENTS));
    mockDbUpdate.mockReturnValue(updateChain);

    const result = await svc.regenerateSection(PROJECT_ID, "keyPoints");
    expect(result).toEqual(updatedNote);
  });
});
