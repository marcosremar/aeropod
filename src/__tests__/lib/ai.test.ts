import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SegmentAnalysis } from "@/lib/db/schema";
import { createMockDb, tableStubs } from "../helpers/mock-db";
import { mockFetch, jsonResponse } from "../helpers/mock-fetch";

// ---------------------------------------------------------------------------
// Shared mock of the central AIService module. Individual tests reconfigure
// the underlying vi.fns. Services under test import from "@/lib/ai/AIService".
// ---------------------------------------------------------------------------
const aiCompleteJSON = vi.fn();
const aiComplete = vi.fn();
const completeMock = vi.fn();
const getAIService = vi.fn(() => ({ complete: completeMock }));

// Keep the real AIService class/config exports (the AIService.ts test block
// exercises them) while overriding the convenience helpers used by the other
// services under test.
vi.mock("@/lib/ai/AIService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/AIService")>();
  return {
    ...actual,
    aiCompleteJSON: (...args: unknown[]) => aiCompleteJSON(...args),
    aiComplete: (...args: unknown[]) => aiComplete(...args),
    getAIService: () => getAIService(),
  };
});

// groq-sdk client used by the real AIService. Default export is a class whose
// chat.completions.create is controlled per-test via the shared groqCreate fn.
const groqCreate = vi.fn();
vi.mock("groq-sdk", () => ({
  default: class {
    chat = { completions: { create: (...a: unknown[]) => groqCreate(...a) } };
  },
}));

// DB mock for show-notes-service (imports db + schema tables).
const { mockDb, setResult, queueResults, captured, reset: resetDb } = createMockDb();
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/db/schema", async () => {
  // Keep real types/interfaces are erased at runtime; we only need table stubs.
  return { ...tableStubs("showNotes", "segments", "projects", "templates", "contentTypeDetections") };
});
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "eq"),
  desc: vi.fn(() => "desc"),
  and: vi.fn(() => "and"),
  asc: vi.fn(() => "asc"),
}));

// TemplateService mock for ContentDetectionService.
const getTemplatesByCategory = vi.fn();
const getTemplateWithSections = vi.fn();
const getSystemTemplates = vi.fn();
vi.mock("@/lib/templates/TemplateService", () => ({
  TemplateService: class {
    getTemplatesByCategory = getTemplatesByCategory;
    getTemplateWithSections = getTemplateWithSections;
    getSystemTemplates = getSystemTemplates;
  },
}));

// Semantic search service mock for editor-chat.
// Keep the real SemanticSearchService export (semantic-search tests use it);
// only override the getSemanticSearchService singleton getter.
const searchMock = vi.fn();
vi.mock("@/lib/ai/semantic-search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/semantic-search")>();
  return {
    ...actual,
    getSemanticSearchService: () => ({ search: searchMock }),
  };
});

const baseAnalysis = (over: Partial<SegmentAnalysis> = {}): SegmentAnalysis => ({
  topic: "Topic",
  interestScore: 70,
  clarityScore: 80,
  isTangent: false,
  isRepetition: false,
  keyInsight: "insight",
  dependsOn: [],
  standalone: true,
  hasFactualError: false,
  hasContradiction: false,
  isConfusing: false,
  isIncomplete: false,
  needsRerecord: false,
  ...over,
});

beforeEach(() => {
  resetDb();
  vi.clearAllMocks();
});

// ===========================================================================
// selection.ts — pure logic
// ===========================================================================
describe("selection.ts", () => {
  it("selects high-score segments and computes stats", async () => {
    const { selectBestSegments } = await import("@/lib/ai/selection");
    const segments = [
      { id: "a", startTime: 0, endTime: 10, text: "a", analysis: baseAnalysis({ topic: "A", interestScore: 90, clarityScore: 90 }) },
      { id: "b", startTime: 10, endTime: 20, text: "b", analysis: baseAnalysis({ topic: "B", interestScore: 80, clarityScore: 80 }) },
    ];
    const res = selectBestSegments(segments, 1000);
    expect(res.selectedSegments).toHaveLength(2);
    expect(res.removedCount).toBe(0);
    expect(res.averageInterestScore).toBe(85);
    expect(res.totalDuration).toBe(20);
    // sorted by startTime
    expect(res.selectedSegments[0].id).toBe("a");
  });

  it("removes low-score, tangent, repetition, rerecord and factual-error segments", async () => {
    const { selectBestSegments } = await import("@/lib/ai/selection");
    const segments = [
      { id: "good", startTime: 0, endTime: 5, text: "g", analysis: baseAnalysis({ topic: "G" }) },
      { id: "low", startTime: 5, endTime: 10, text: "l", analysis: baseAnalysis({ topic: "L", interestScore: 10, clarityScore: 10 }) },
      { id: "tan", startTime: 10, endTime: 15, text: "t", analysis: baseAnalysis({ topic: "T", isTangent: true }) },
      { id: "rep", startTime: 15, endTime: 20, text: "r", analysis: baseAnalysis({ topic: "R", isRepetition: true }) },
      { id: "rr", startTime: 20, endTime: 25, text: "x", analysis: baseAnalysis({ topic: "X", needsRerecord: true }) },
      { id: "err", startTime: 25, endTime: 30, text: "e", analysis: baseAnalysis({ topic: "E", hasFactualError: true }) },
    ];
    const res = selectBestSegments(segments, 1000);
    expect(res.selectedSegments.map((s) => s.id)).toEqual(["good"]);
    expect(res.removedReasons.low_score).toBe(1);
    expect(res.removedReasons.tangent).toBe(1);
    expect(res.removedReasons.repetition).toBe(1);
    expect(res.removedReasons.needs_rerecord).toBe(1);
    expect(res.removedReasons.factual_error).toBe(1);
    expect(res.removedCount).toBe(5);
  });

  it("respects target duration with greedy selection", async () => {
    const { selectBestSegments } = await import("@/lib/ai/selection");
    const segments = [
      { id: "a", startTime: 0, endTime: 30, text: "a", analysis: baseAnalysis({ topic: "A", interestScore: 95, clarityScore: 95 }) },
      { id: "b", startTime: 30, endTime: 60, text: "b", analysis: baseAnalysis({ topic: "B", interestScore: 60, clarityScore: 60 }) },
    ];
    // target 30s: only the top-scored 30s segment fits
    const res = selectBestSegments(segments, 30);
    expect(res.selectedSegments.map((s) => s.id)).toEqual(["a"]);
  });

  it("allows tangents/repetitions when options enable them", async () => {
    const { selectBestSegments } = await import("@/lib/ai/selection");
    const segments = [
      { id: "tan", startTime: 0, endTime: 5, text: "t", analysis: baseAnalysis({ topic: "T", isTangent: true }) },
    ];
    const res = selectBestSegments(segments, 1000, { allowTangents: true, allowRepetitions: true });
    expect(res.selectedSegments.map((s) => s.id)).toEqual(["tan"]);
  });

  it("estimateCompressionRatio drops low-value duration", async () => {
    const { estimateCompressionRatio } = await import("@/lib/ai/selection");
    const segments = [
      { id: "keep", startTime: 0, endTime: 10, text: "k", analysis: baseAnalysis() },
      { id: "cut", startTime: 10, endTime: 20, text: "c", analysis: baseAnalysis({ isTangent: true }) },
    ];
    // 10s kept of 20s total = 0.5
    expect(estimateCompressionRatio(segments)).toBeCloseTo(0.5);
    expect(estimateCompressionRatio([])).toBe(1);
  });

  it("suggestTargetDuration clamps within min/max ratios", async () => {
    const { suggestTargetDuration } = await import("@/lib/ai/selection");
    const segments = [
      { id: "a", startTime: 0, endTime: 100, text: "a", analysis: baseAnalysis() },
    ];
    // all kept -> ratio 1, clamped to max 0.9 -> 90
    expect(suggestTargetDuration(segments)).toBe(90);
  });
});

// ===========================================================================
// reorder.ts — validateReorderingDependencies + service (mock + AI path)
// ===========================================================================
describe("reorder.ts", () => {
  it("validateReorderingDependencies passes when deps come before", async () => {
    const { validateReorderingDependencies } = await import("@/lib/ai/reorder");
    const segments = [
      { id: "base", text: "b", originalOrder: 0, analysis: baseAnalysis({ topic: "Base" }) },
      { id: "dep", text: "d", originalOrder: 1, analysis: baseAnalysis({ topic: "Dep", dependsOn: ["Base"] }) },
    ];
    const res = validateReorderingDependencies(segments, ["base", "dep"]);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("validateReorderingDependencies fails when a dependency comes after", async () => {
    const { validateReorderingDependencies } = await import("@/lib/ai/reorder");
    const segments = [
      { id: "base", text: "b", originalOrder: 0, analysis: baseAnalysis({ topic: "Base" }) },
      { id: "dep", text: "d", originalOrder: 1, analysis: baseAnalysis({ topic: "Dep", dependsOn: ["Base"] }) },
    ];
    const res = validateReorderingDependencies(segments, ["dep", "base"]);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain("depends on");
  });

  it("validateReorderingDependencies reports unknown segment ids", async () => {
    const { validateReorderingDependencies } = await import("@/lib/ai/reorder");
    const res = validateReorderingDependencies([], ["ghost"]);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain("not found");
  });

  it("mock reordering puts standalone high-interest first and adds outro", async () => {
    const { createReorderService } = await import("@/lib/ai/reorder");
    const svc = createReorderService({ useMock: true });
    const segments = [
      { id: "dep", text: "d", originalOrder: 0, analysis: baseAnalysis({ topic: "Dep", standalone: false, interestScore: 50, clarityScore: 50 }) },
      { id: "hi", text: "h", originalOrder: 1, analysis: baseAnalysis({ topic: "Hi", standalone: true, interestScore: 95, clarityScore: 95 }) },
    ];
    const res = await svc.suggestReordering(segments);
    expect(res.suggestedOrder).toEqual(["hi", "dep"]);
    expect(res.needsOutro).toBe(true);
    expect(res.outroSuggestion).toBeDefined();
  });

  it("AI path validates and normalizes a complete result", async () => {
    const { createReorderService } = await import("@/lib/ai/reorder");
    const svc = createReorderService();
    aiCompleteJSON.mockResolvedValue({
      suggestedOrder: ["a", "b"],
      transitions: [],
      reasoning: "ok",
    });
    const segments = [
      { id: "a", text: "a", originalOrder: 0, analysis: baseAnalysis() },
      { id: "b", text: "b", originalOrder: 1, analysis: baseAnalysis() },
    ];
    const res = await svc.suggestReordering(segments);
    expect(res.suggestedOrder).toEqual(["a", "b"]);
    expect(res.needsIntro).toBe(false);
    expect(res.reasoning).toBe("ok");
    expect(aiCompleteJSON).toHaveBeenCalledWith("segment_reorder", expect.any(String));
  });

  it("AI path throws when result is missing segment IDs", async () => {
    const { createReorderService } = await import("@/lib/ai/reorder");
    const svc = createReorderService();
    aiCompleteJSON.mockResolvedValue({ suggestedOrder: ["a"], reasoning: "x" });
    const segments = [
      { id: "a", text: "a", originalOrder: 0, analysis: baseAnalysis() },
      { id: "b", text: "b", originalOrder: 1, analysis: baseAnalysis() },
    ];
    await expect(svc.suggestReordering(segments)).rejects.toThrow(/Failed to reorder/);
  });
});

// ===========================================================================
// analyze.ts — AnalysisService
// ===========================================================================
describe("analyze.ts", () => {
  it("mock analysis clamps scores and flags filler words", async () => {
    const { createAnalysisService } = await import("@/lib/ai/analyze");
    const svc = createAnalysisService({ useMock: true });
    const res = await svc.analyzeSegment({ text: "um uh ah", startTime: 0, endTime: 2 });
    expect(res.interestScore).toBeGreaterThanOrEqual(0);
    expect(res.clarityScore).toBeGreaterThanOrEqual(0);
    expect(res.isConfusing).toBe(true); // hasUmAh && wordCount < 10
  });

  it("AI path normalizes a partial analysis with defaults", async () => {
    const { AnalysisService } = await import("@/lib/ai/analyze");
    const svc = new AnalysisService();
    aiCompleteJSON.mockResolvedValue({ topic: "AI", interestScore: 150 });
    const res = await svc.analyzeSegment({ text: "hi", startTime: 0, endTime: 5 });
    expect(res.topic).toBe("AI");
    expect(res.interestScore).toBe(100); // clamped from 150
    expect(res.clarityScore).toBe(50); // default
    expect(res.standalone).toBe(true);
    expect(aiCompleteJSON).toHaveBeenCalledWith("segment_analysis", expect.any(String));
  });

  it("AI path wraps errors in a descriptive throw", async () => {
    const { AnalysisService } = await import("@/lib/ai/analyze");
    const svc = new AnalysisService();
    aiCompleteJSON.mockRejectedValue(new Error("boom"));
    await expect(svc.analyzeSegment({ text: "x", startTime: 0, endTime: 1 })).rejects.toThrow(/Failed to analyze segment: boom/);
  });

  it("analyzeBatch in mock mode maps every segment", async () => {
    const { createAnalysisService } = await import("@/lib/ai/analyze");
    const svc = createAnalysisService({ useMock: true });
    const res = await svc.analyzeBatch([
      { text: "one two three", startTime: 0, endTime: 5 },
      { text: "four five six", startTime: 5, endTime: 10 },
    ]);
    expect(res).toHaveLength(2);
    expect(res[0].topic).toBeTruthy();
  });
});

// ===========================================================================
// AIService.ts — real class, mock groq-sdk + fetch
// ===========================================================================
describe("AIService.ts", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("getTaskConfig and listTasks expose task configuration", async () => {
    const mod = await import("@/lib/ai/AIService");
    const svc = new mod.AIService();
    const cfg = svc.getTaskConfig("editor_chat");
    expect(cfg.complexity).toBe("balanced");
    expect(svc.listTasks().length).toBeGreaterThan(5);
  });

  it("completes via Groq and reports provider/latency", async () => {
    process.env.GROQ_API_KEY = "gk";
    groqCreate.mockResolvedValue({
      choices: [{ message: { content: "hello world" } }],
      usage: { total_tokens: 42 },
    });
    const mod = await import("@/lib/ai/AIService");
    const svc = new mod.AIService();
    const res = await svc.complete({
      task: "editor_chat",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.content).toBe("hello world");
    expect(res.provider).toBe("groq");
    expect(res.tokensUsed).toBe(42);
    expect(typeof res.latencyMs).toBe("number");
  });

  it("falls back to OpenRouter when Groq fails", async () => {
    process.env.GROQ_API_KEY = "gk";
    process.env.OPENROUTER_API_KEY = "ok";
    groqCreate.mockRejectedValue(new Error("groq down"));
    mockFetch(() =>
      jsonResponse({ choices: [{ message: { content: "via openrouter" } }], usage: { total_tokens: 7 } })
    );
    const mod = await import("@/lib/ai/AIService");
    const svc = new mod.AIService();
    const res = await svc.complete({
      task: "editor_chat",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.content).toBe("via openrouter");
    expect(res.provider).toBe("openrouter");
  });

  it("throws when no provider is configured", async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    const mod = await import("@/lib/ai/AIService");
    const svc = new mod.AIService();
    await expect(
      svc.complete({ task: "editor_chat", messages: [{ role: "user", content: "x" }] })
    ).rejects.toThrow(/Nenhum provider/);
  });

  it("completeJSON strips markdown fences and parses JSON", async () => {
    process.env.GROQ_API_KEY = "gk";
    groqCreate.mockResolvedValue({
      choices: [{ message: { content: '```json\n{"ok":true}\n```' } }],
      usage: {},
    });
    const mod = await import("@/lib/ai/AIService");
    const svc = new mod.AIService();
    const parsed = await svc.completeJSON<{ ok: boolean }>({
      task: "segment_analysis",
      messages: [{ role: "user", content: "x" }],
    });
    expect(parsed.ok).toBe(true);
  });

  it("completeJSON throws on invalid JSON", async () => {
    process.env.GROQ_API_KEY = "gk";
    groqCreate.mockResolvedValue({
      choices: [{ message: { content: "not json" } }],
      usage: {},
    });
    const mod = await import("@/lib/ai/AIService");
    const svc = new mod.AIService();
    await expect(
      svc.completeJSON({ task: "segment_analysis", messages: [{ role: "user", content: "x" }] })
    ).rejects.toThrow(/JSON válido/);
  });

  it("getProviderStatus reflects configured env", async () => {
    process.env.GROQ_API_KEY = "gk";
    delete process.env.OPENROUTER_API_KEY;
    const mod = await import("@/lib/ai/AIService");
    const svc = new mod.AIService();
    const status = svc.getProviderStatus();
    expect(status.groq.configured).toBe(true);
    expect(status.openrouter.configured).toBe(false);
  });
});

// ===========================================================================
// semantic-search.ts — cosine/ranking via search(), mock fetch
// ===========================================================================
describe("semantic-search.ts", () => {
  it("ranks segments by cosine similarity to the query embedding", async () => {
    const { SemanticSearchService } = await import("@/lib/ai/semantic-search");
    const svc = new SemanticSearchService({ apiKey: "k" });

    // query embedding [1,0]; seg "a" identical -> score 1, seg "b" orthogonal -> 0
    const fetchFn = mockFetch((url: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? "{}");
      const input = body.input;
      const embedFor = (t: string) => (t === "query" ? [1, 0] : t === "a" ? [1, 0] : [0, 1]);
      if (Array.isArray(input)) {
        return jsonResponse({ data: input.map((t: string) => ({ embedding: embedFor(t) })) });
      }
      return jsonResponse({ data: [{ embedding: embedFor(input) }] });
    });

    const segments = [
      { id: "b", text: "b", startTime: 0, endTime: 1 },
      { id: "a", text: "a", startTime: 1, endTime: 2 },
    ];
    const results = await svc.search("query", segments, { minScore: 0.1 });
    expect(results.map((r) => r.id)).toEqual(["a"]); // "b" filtered out by minScore
    expect(results[0].score).toBeCloseTo(1);
    expect(fetchFn).toHaveBeenCalled();
  });

  it("caches embeddings so repeated text avoids extra fetches", async () => {
    const { SemanticSearchService } = await import("@/lib/ai/semantic-search");
    const svc = new SemanticSearchService({ apiKey: "k" });
    const fetchFn = mockFetch(() => jsonResponse({ data: [{ embedding: [1, 2, 3] }] }));
    const first = await svc.generateEmbedding("hello");
    const second = await svc.generateEmbedding("hello");
    expect(first).toEqual([1, 2, 3]);
    expect(second).toEqual([1, 2, 3]);
    expect(fetchFn).toHaveBeenCalledTimes(1); // second served from cache
    expect(svc.getCacheSize()).toBe(1);
    svc.clearCache();
    expect(svc.getCacheSize()).toBe(0);
  });

  it("generateEmbedding throws on non-ok response", async () => {
    const { SemanticSearchService } = await import("@/lib/ai/semantic-search");
    const svc = new SemanticSearchService({ apiKey: "k" });
    mockFetch(() => jsonResponse({ error: "nope" }, { status: 500, ok: false }));
    await expect(svc.generateEmbedding("x")).rejects.toThrow(/Failed to generate embedding/);
  });
});

// ===========================================================================
// show-notes-service.ts — mock AIService + db; test pure exporters + db flow
// ===========================================================================
describe("show-notes-service.ts", () => {
  it("exportMarkdown renders summary, chapters, key points and links", async () => {
    const { ShowNotesService } = await import("@/lib/ai/show-notes-service");
    const svc = new ShowNotesService();
    const md = svc.exportMarkdown({
      summary: "A great episode",
      chapters: [{ title: "Intro", timestamp: 65, description: "start" }],
      keyPoints: ["point one"],
      guestInfo: [{ name: "Jane", role: "host", bio: "bio" }],
      links: ["https://x.com"],
    } as any);
    expect(md).toContain("## Resumo");
    expect(md).toContain("A great episode");
    expect(md).toContain("## Capitulos");
    expect(md).toContain("1:05"); // 65s formatted
    expect(md).toContain("## Pontos-Chave");
    expect(md).toContain("point one");
    expect(md).toContain("## Convidados");
    expect(md).toContain("Jane");
    expect(md).toContain("https://x.com");
  });

  it("exportPlainText renders headers and content", async () => {
    const { ShowNotesService } = await import("@/lib/ai/show-notes-service");
    const svc = new ShowNotesService();
    const txt = svc.exportPlainText({
      summary: "Hi",
      chapters: [{ title: "Ch1", timestamp: 0, description: "" }],
      keyPoints: ["kp"],
    } as any);
    expect(txt).toContain("RESUMO");
    expect(txt).toContain("CAPITULOS");
    expect(txt).toContain("PONTOS-CHAVE");
    expect(txt).toContain("kp");
  });

  it("generate throws when project has no segments", async () => {
    const { ShowNotesService } = await import("@/lib/ai/show-notes-service");
    const svc = new ShowNotesService();
    setResult([]); // empty segments query
    await expect(svc.generate("proj-1")).rejects.toThrow(/No segments found/);
  });

  it("generate creates a new show note when none exists", async () => {
    const { ShowNotesService } = await import("@/lib/ai/show-notes-service");
    const svc = new ShowNotesService();
    aiCompleteJSON.mockResolvedValue({
      summary: "sum",
      chapters: [{ title: "C", timestamp: 10, description: "d" }],
      keyPoints: ["k"],
    });
    // 1) segments query, 2) existing note query (empty), 3) insert .returning()
    queueResults(
      [{ id: "s1", projectId: "proj-1", startTime: 0, text: "hello", topic: "T", keyInsight: "ins" }],
      [],
      [{ id: "note-1", projectId: "proj-1", summary: "sum" }]
    );
    const note = await svc.generate("proj-1");
    expect(note).toMatchObject({ id: "note-1", summary: "sum" });
    // insert captured the AI-generated content
    expect(captured.values[0]).toMatchObject({ projectId: "proj-1", summary: "sum" });
    expect(aiCompleteJSON).toHaveBeenCalledWith("show_notes", expect.any(String));
  });

  it("generate updates an existing show note", async () => {
    const { ShowNotesService } = await import("@/lib/ai/show-notes-service");
    const svc = new ShowNotesService();
    aiCompleteJSON.mockResolvedValue({ summary: "new", chapters: [], keyPoints: [] });
    queueResults(
      [{ id: "s1", projectId: "proj-1", startTime: 0, text: "hello", topic: "T" }],
      [{ id: "note-1", projectId: "proj-1" }], // existing note found
      [{ id: "note-1", projectId: "proj-1", summary: "new" }]
    );
    const note = await svc.generate("proj-1");
    expect(note).toMatchObject({ summary: "new" });
    expect(captured.sets[0]).toMatchObject({ summary: "new" });
  });

  it("getShowNotes returns null when no note exists", async () => {
    const { ShowNotesService } = await import("@/lib/ai/show-notes-service");
    const svc = new ShowNotesService();
    setResult([]);
    expect(await svc.getShowNotes("proj-x")).toBeNull();
  });
});

// ===========================================================================
// ContentDetectionService.ts — mock AIService + TemplateService
// ===========================================================================
describe("ContentDetectionService.ts", () => {
  it("detectContentType returns the AI result", async () => {
    const { ContentDetectionService } = await import("@/lib/ai/ContentDetectionService");
    const svc = new ContentDetectionService(mockDb as any);
    aiCompleteJSON.mockResolvedValue({
      detectedType: "interview",
      confidence: 0.9,
      reasoning: "two speakers",
      characteristics: ["q&a"],
    });
    const res = await svc.detectContentType("p1", "host: hi\nguest: hello");
    expect(res.detectedType).toBe("interview");
    expect(res.confidence).toBe(0.9);
  });

  it("detectContentType falls back to monologue on error/invalid result", async () => {
    const { ContentDetectionService } = await import("@/lib/ai/ContentDetectionService");
    const svc = new ContentDetectionService(mockDb as any);
    aiCompleteJSON.mockResolvedValue({ detectedType: "", confidence: 0 }); // invalid -> throws internally
    const res = await svc.detectContentType("p1", "text");
    expect(res.detectedType).toBe("monologue");
    expect(res.confidence).toBe(0.3);
  });

  it("suggestTemplates returns matches scored by confidence", async () => {
    const { ContentDetectionService } = await import("@/lib/ai/ContentDetectionService");
    const svc = new ContentDetectionService(mockDb as any);
    getTemplatesByCategory.mockResolvedValue([{ id: "t1" }]);
    getTemplateWithSections.mockResolvedValue({ id: "t1", sections: [] });
    getSystemTemplates.mockResolvedValue([]);
    const res = await svc.suggestTemplates("interview", 0.9);
    expect(res).toHaveLength(1);
    expect(res[0].templateId).toBe("t1");
    expect(res[0].matchScore).toBe(0.9);
  });

  it("suggestTemplates adds fallback templates when confidence is low", async () => {
    const { ContentDetectionService } = await import("@/lib/ai/ContentDetectionService");
    const svc = new ContentDetectionService(mockDb as any);
    getTemplatesByCategory.mockResolvedValue([]);
    getSystemTemplates.mockResolvedValue([{ id: "sys1" }, { id: "sys2" }]);
    const res = await svc.suggestTemplates("review", 0.4);
    expect(res.map((s) => s.templateId)).toEqual(["sys1", "sys2"]);
    expect(res[0].matchScore).toBe(0.5);
  });
});

// ===========================================================================
// editor-chat.ts — mock AIService.complete + semantic search
// ===========================================================================
describe("editor-chat.ts", () => {
  const seg = (over: Partial<import("@/lib/ai/editor-chat").Segment> = {}) => ({
    id: "s1",
    text: "talking about something",
    topic: "General",
    startTime: 0,
    endTime: 10,
    isSelected: false,
    interestScore: 8,
    ...over,
  });

  it("parses focus actions from a JSON code block in the AI reply", async () => {
    const { getEditorChatService } = await import("@/lib/ai/editor-chat");
    const svc = getEditorChatService();
    completeMock.mockResolvedValue({
      content:
        'Encontrei os segmentos.\n```json\n{"actions":[{"type":"focus","segmentIds":["s1"],"message":"highlight"}]}\n```',
    });
    const res = await svc.processMessage("me mostra a introducao", [seg()]);
    expect(res.actions).toHaveLength(1);
    expect(res.actions[0].type).toBe("focus");
    expect(res.actions[0].segmentIds).toEqual(["s1"]);
    expect(res.response).toContain("Encontrei");
    expect(res.response).not.toContain("```");
  });

  it("returns no actions when reply has no JSON block", async () => {
    const { getEditorChatService } = await import("@/lib/ai/editor-chat");
    const svc = getEditorChatService();
    completeMock.mockResolvedValue({ content: "Apenas uma resposta normal." });
    const res = await svc.processMessage("ola", [seg()]);
    expect(res.actions).toHaveLength(0);
    expect(res.response).toBe("Apenas uma resposta normal.");
  });

  it("runs semantic search for search-like queries and tolerates search errors", async () => {
    const { getEditorChatService } = await import("@/lib/ai/editor-chat");
    const svc = getEditorChatService();
    searchMock.mockRejectedValue(new Error("search down"));
    completeMock.mockResolvedValue({ content: "ok" });
    // "sobre" is a search keyword -> triggers searchService.search
    const res = await svc.processMessage("qual parte fala de IA?", [seg()]);
    expect(searchMock).toHaveBeenCalled();
    expect(res.response).toBe("ok");
  });

  it("generateSuggestions returns heuristic suggestions", async () => {
    const { getEditorChatService } = await import("@/lib/ai/editor-chat");
    const svc = getEditorChatService();
    const segments = [
      ...Array.from({ length: 6 }, (_, i) => seg({ id: `low${i}`, interestScore: 1, isSelected: false })),
      seg({ id: "a", topic: "T1", isSelected: false }),
      seg({ id: "b", topic: "T2", isSelected: false }),
      seg({ id: "c", topic: "T3", isSelected: false }),
      seg({ id: "d", topic: "T4", isSelected: false }),
    ];
    const suggestions = await svc.generateSuggestions(segments);
    expect(suggestions.some((s) => s.includes("baixo interesse"))).toBe(true);
    expect(suggestions.length).toBeGreaterThan(0);
  });
});
