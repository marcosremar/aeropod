/**
 * Unit tests for AIService — synchronous methods and JSON cleaning logic.
 * Uses vi.hoisted + vi.mock to intercept the Groq SDK without real API calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Create the Groq mock before module loading (vi.mock is hoisted)
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock("groq-sdk", () => ({
  // Must use `function` (not arrow) so `new Groq(...)` works as a constructor
  default: vi.fn().mockImplementation(function () {
    return {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };
  }),
}));

import {
  AIService,
  GROQ_MODELS,
  OPENROUTER_MODELS,
  getAIService,
  aiComplete,
  aiCompleteJSON,
  type TaskType,
} from "@/lib/ai/AIService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALL_TASK_TYPES: TaskType[] = [
  "segment_mapping",
  "content_detection",
  "gap_analysis",
  "segment_classification",
  "transcription_summary",
  "editor_chat",
  "editing_suggestions",
  "script_generation",
  "segment_analysis",
  "show_notes",
  "segment_reorder",
];

function makeGroqResponse(content: string) {
  return {
    choices: [{ message: { content } }],
    usage: { total_tokens: 10 },
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

describe("GROQ_MODELS", () => {
  it("exposes llama-3.1-8b-instant as LLAMA_8B", () => {
    expect(GROQ_MODELS.LLAMA_8B).toBe("llama-3.1-8b-instant");
  });

  it("exposes llama-3.3-70b-versatile as LLAMA_70B", () => {
    expect(GROQ_MODELS.LLAMA_70B).toBe("llama-3.3-70b-versatile");
  });

  it("exposes GPT_OSS_20B and GPT_OSS_120B", () => {
    expect(typeof GROQ_MODELS.GPT_OSS_20B).toBe("string");
    expect(GROQ_MODELS.GPT_OSS_20B.length).toBeGreaterThan(0);
    expect(typeof GROQ_MODELS.GPT_OSS_120B).toBe("string");
    expect(GROQ_MODELS.GPT_OSS_120B.length).toBeGreaterThan(0);
  });
});

describe("OPENROUTER_MODELS", () => {
  it("LLAMA_8B contains 'llama'", () => {
    expect(OPENROUTER_MODELS.LLAMA_8B.toLowerCase()).toContain("llama");
  });

  it("LLAMA_70B contains 'llama'", () => {
    expect(OPENROUTER_MODELS.LLAMA_70B.toLowerCase()).toContain("llama");
  });

  it("QWEN_32B contains 'qwen'", () => {
    expect(OPENROUTER_MODELS.QWEN_32B.toLowerCase()).toContain("qwen");
  });
});

// ─── getTaskConfig ────────────────────────────────────────────────────────────

describe("AIService.getTaskConfig", () => {
  const svc = new AIService();

  it("segment_mapping is a fast task using GPT_OSS_20B", () => {
    const cfg = svc.getTaskConfig("segment_mapping");
    expect(cfg.complexity).toBe("fast");
    expect(cfg.model).toBe(GROQ_MODELS.GPT_OSS_20B);
    expect(cfg.temperature).toBe(0.3);
    expect(cfg.maxTokens).toBe(2048);
  });

  it("editor_chat is a balanced task using GPT_OSS_120B", () => {
    const cfg = svc.getTaskConfig("editor_chat");
    expect(cfg.complexity).toBe("balanced");
    expect(cfg.model).toBe(GROQ_MODELS.GPT_OSS_120B);
  });

  it("script_generation is a powerful task using LLAMA_70B", () => {
    const cfg = svc.getTaskConfig("script_generation");
    expect(cfg.complexity).toBe("powerful");
    expect(cfg.model).toBe(GROQ_MODELS.LLAMA_70B);
    expect(cfg.maxTokens).toBe(4096);
  });

  it("every task config has all required fields with valid values", () => {
    for (const task of ALL_TASK_TYPES) {
      const cfg = svc.getTaskConfig(task);
      expect(cfg.complexity, `${task}.complexity`).toMatch(/^(fast|balanced|powerful)$/);
      expect(cfg.model, `${task}.model`).toBeTruthy();
      expect(cfg.fallbackModel, `${task}.fallbackModel`).toBeTruthy();
      expect(cfg.maxTokens, `${task}.maxTokens`).toBeGreaterThan(0);
      expect(cfg.temperature, `${task}.temperature`).toBeGreaterThanOrEqual(0);
      expect(cfg.temperature, `${task}.temperature`).toBeLessThanOrEqual(1);
      expect(cfg.description, `${task}.description`).toBeTruthy();
    }
  });

  it("fast tasks use a lighter model than powerful tasks", () => {
    const fast = svc.getTaskConfig("segment_mapping");
    const powerful = svc.getTaskConfig("script_generation");
    // Fast tasks should have smaller maxTokens
    expect(fast.maxTokens).toBeLessThan(powerful.maxTokens);
  });
});

// ─── listTasks ────────────────────────────────────────────────────────────────

describe("AIService.listTasks", () => {
  const svc = new AIService();

  it("returns exactly one entry per task type", () => {
    const tasks = svc.listTasks();
    expect(tasks).toHaveLength(ALL_TASK_TYPES.length);
  });

  it("each entry includes task name and config fields", () => {
    const tasks = svc.listTasks();
    for (const t of tasks) {
      expect(t).toHaveProperty("task");
      expect(t).toHaveProperty("complexity");
      expect(t).toHaveProperty("model");
      expect(t).toHaveProperty("description");
    }
  });

  it("covers all expected task types", () => {
    const taskNames = svc.listTasks().map((t) => t.task);
    for (const expected of ALL_TASK_TYPES) {
      expect(taskNames, `task '${expected}' missing`).toContain(expected);
    }
  });
});

// ─── getProviderStatus ────────────────────────────────────────────────────────

describe("AIService.getProviderStatus", () => {
  let savedGroqKey: string | undefined;
  let savedOrKey: string | undefined;

  beforeEach(() => {
    savedGroqKey = process.env.GROQ_API_KEY;
    savedOrKey = process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    if (savedGroqKey === undefined) {
      delete process.env.GROQ_API_KEY;
    } else {
      process.env.GROQ_API_KEY = savedGroqKey;
    }
    if (savedOrKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = savedOrKey;
    }
  });

  it("groq shows as unavailable when GROQ_API_KEY is absent", () => {
    delete process.env.GROQ_API_KEY;
    const svc = new AIService();
    const status = svc.getProviderStatus();
    expect(status.groq.configured).toBe(false);
    expect(status.groq.available).toBe(false);
  });

  it("groq shows as available when GROQ_API_KEY is set", () => {
    process.env.GROQ_API_KEY = "test-groq-key";
    const svc = new AIService();
    const status = svc.getProviderStatus();
    expect(status.groq.configured).toBe(true);
    expect(status.groq.available).toBe(true);
  });

  it("openrouter shows as unavailable when OPENROUTER_API_KEY is absent", () => {
    delete process.env.OPENROUTER_API_KEY;
    const svc = new AIService();
    const status = svc.getProviderStatus();
    expect(status.openrouter.configured).toBe(false);
    expect(status.openrouter.available).toBe(false);
  });

  it("openrouter shows as available when OPENROUTER_API_KEY is set", () => {
    process.env.OPENROUTER_API_KEY = "test-or-key";
    const svc = new AIService();
    const status = svc.getProviderStatus();
    expect(status.openrouter.configured).toBe(true);
    expect(status.openrouter.available).toBe(true);
  });

  it("both providers available when both keys are set", () => {
    process.env.GROQ_API_KEY = "groq-key";
    process.env.OPENROUTER_API_KEY = "or-key";
    const svc = new AIService();
    const status = svc.getProviderStatus();
    expect(status.groq.available).toBe(true);
    expect(status.openrouter.available).toBe(true);
  });
});

// ─── completeJSON — JSON cleaning ────────────────────────────────────────────

describe("AIService.completeJSON", () => {
  let savedGroqKey: string | undefined;

  beforeEach(() => {
    savedGroqKey = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = "test-key";
    mockCreate.mockReset();
  });

  afterEach(() => {
    if (savedGroqKey === undefined) {
      delete process.env.GROQ_API_KEY;
    } else {
      process.env.GROQ_API_KEY = savedGroqKey;
    }
  });

  it("parses a bare JSON response", async () => {
    mockCreate.mockResolvedValueOnce(makeGroqResponse('{"ok": true, "count": 3}'));
    const svc = new AIService();
    const result = await svc.completeJSON<{ ok: boolean; count: number }>({
      task: "segment_mapping",
      messages: [{ role: "user", content: "test" }],
    });
    expect(result.ok).toBe(true);
    expect(result.count).toBe(3);
  });

  it("strips ```json ... ``` fences before parsing", async () => {
    mockCreate.mockResolvedValueOnce(
      makeGroqResponse('```json\n{"stripped": true}\n```')
    );
    const svc = new AIService();
    const result = await svc.completeJSON<{ stripped: boolean }>({
      task: "content_detection",
      messages: [{ role: "user", content: "test" }],
    });
    expect(result.stripped).toBe(true);
  });

  it("strips plain ``` fences before parsing", async () => {
    mockCreate.mockResolvedValueOnce(
      makeGroqResponse('```\n{"plain": 42}\n```')
    );
    const svc = new AIService();
    const result = await svc.completeJSON<{ plain: number }>({
      task: "segment_analysis",
      messages: [{ role: "user", content: "test" }],
    });
    expect(result.plain).toBe(42);
  });

  it("throws a descriptive error for invalid JSON", async () => {
    mockCreate.mockResolvedValueOnce(makeGroqResponse("Sorry, I cannot do that."));
    const svc = new AIService();
    await expect(
      svc.completeJSON<unknown>({
        task: "segment_mapping",
        messages: [{ role: "user", content: "test" }],
      })
    ).rejects.toThrow("Resposta da IA não é um JSON válido");
  });
});

// ─── getAIService singleton ───────────────────────────────────────────────────

describe("getAIService singleton", () => {
  it("returns the same instance on repeated calls", () => {
    const a = getAIService();
    const b = getAIService();
    expect(a).toBe(b);
  });

  it("returned instance has listTasks method", () => {
    const svc = getAIService();
    expect(typeof svc.listTasks).toBe("function");
  });
});

// ─── aiComplete convenience function ─────────────────────────────────────────

describe("aiComplete", () => {
  let completeSpy: ReturnType<typeof vi.spyOn<AIService, "complete">>;

  beforeEach(() => {
    const svc = getAIService();
    completeSpy = vi.spyOn(svc, "complete");
  });

  afterEach(() => {
    completeSpy.mockRestore();
  });

  it("returns the content string from the AI response", async () => {
    completeSpy.mockResolvedValueOnce({
      content: "Hello, world!",
      model: "mock",
      provider: "groq",
      latencyMs: 1,
    });
    const result = await aiComplete("editor_chat", "Say hello");
    expect(result).toBe("Hello, world!");
  });

  it("sends a user message with the provided prompt", async () => {
    completeSpy.mockResolvedValueOnce({
      content: "ok",
      model: "mock",
      provider: "groq",
      latencyMs: 1,
    });
    await aiComplete("segment_analysis", "Analyze this segment");
    const options = completeSpy.mock.calls[0][0];
    const userMsg = options.messages.find((m) => m.role === "user");
    expect(userMsg?.content).toBe("Analyze this segment");
  });

  it("prepends a system message when systemPrompt is provided", async () => {
    completeSpy.mockResolvedValueOnce({
      content: "ok",
      model: "mock",
      provider: "groq",
      latencyMs: 1,
    });
    await aiComplete("segment_analysis", "Analyze", "You are a podcast editor");
    const options = completeSpy.mock.calls[0][0];
    expect(options.messages[0].role).toBe("system");
    expect(options.messages[0].content).toBe("You are a podcast editor");
    expect(options.messages[1].role).toBe("user");
  });

  it("sends only one message when no systemPrompt is provided", async () => {
    completeSpy.mockResolvedValueOnce({
      content: "ok",
      model: "mock",
      provider: "groq",
      latencyMs: 1,
    });
    await aiComplete("segment_mapping", "Map segments");
    const options = completeSpy.mock.calls[0][0];
    expect(options.messages).toHaveLength(1);
    expect(options.messages[0].role).toBe("user");
  });

  it("passes the task type through to complete()", async () => {
    completeSpy.mockResolvedValueOnce({
      content: "ok",
      model: "mock",
      provider: "groq",
      latencyMs: 1,
    });
    await aiComplete("show_notes", "Generate");
    expect(completeSpy.mock.calls[0][0].task).toBe("show_notes");
  });
});

// ─── aiCompleteJSON convenience function ─────────────────────────────────────

describe("aiCompleteJSON", () => {
  let completeJSONSpy: ReturnType<typeof vi.spyOn<AIService, "completeJSON">>;

  beforeEach(() => {
    const svc = getAIService();
    completeJSONSpy = vi.spyOn(svc, "completeJSON");
  });

  afterEach(() => {
    completeJSONSpy.mockRestore();
  });

  it("returns the parsed object from completeJSON", async () => {
    completeJSONSpy.mockResolvedValueOnce({ topic: "AI", score: 8 });
    const result = await aiCompleteJSON<{ topic: string; score: number }>(
      "segment_analysis",
      "Analyze"
    );
    expect(result.topic).toBe("AI");
    expect(result.score).toBe(8);
  });

  it("sends a user message with the provided prompt", async () => {
    completeJSONSpy.mockResolvedValueOnce({ ok: true });
    await aiCompleteJSON("segment_mapping", "My prompt");
    const options = completeJSONSpy.mock.calls[0][0];
    const userMsg = options.messages.find((m) => m.role === "user");
    expect(userMsg?.content).toBe("My prompt");
  });

  it("prepends a system message when systemPrompt is provided", async () => {
    completeJSONSpy.mockResolvedValueOnce({ ok: true });
    await aiCompleteJSON("show_notes", "Generate notes", "Be concise");
    const options = completeJSONSpy.mock.calls[0][0];
    expect(options.messages[0].role).toBe("system");
    expect(options.messages[0].content).toBe("Be concise");
    expect(options.messages[1].role).toBe("user");
  });

  it("sends only one message when no systemPrompt is provided", async () => {
    completeJSONSpy.mockResolvedValueOnce({ ok: true });
    await aiCompleteJSON("segment_reorder", "Reorder");
    const options = completeJSONSpy.mock.calls[0][0];
    expect(options.messages).toHaveLength(1);
  });

  it("passes the task type through to completeJSON()", async () => {
    completeJSONSpy.mockResolvedValueOnce({ ok: true });
    await aiCompleteJSON("gap_analysis", "Find gaps");
    expect(completeJSONSpy.mock.calls[0][0].task).toBe("gap_analysis");
  });

  it("propagates rejections from completeJSON", async () => {
    completeJSONSpy.mockRejectedValueOnce(
      new Error("Resposta da IA não é um JSON válido")
    );
    await expect(aiCompleteJSON("gap_analysis", "Find gaps")).rejects.toThrow(
      "Resposta da IA não é um JSON válido"
    );
  });
});
