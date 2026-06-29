import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  detectTopics,
  topicsToChapters,
  topicsToShowNotes,
  type TopicSegment,
  type TranscriptSegment,
} from "@/services/topic-segmentation";

const makeTopics = (overrides: Partial<TopicSegment>[] = []): TopicSegment[] =>
  overrides.map((o, i) => ({
    id: i,
    title: `Topic ${i + 1}`,
    start: i * 60,
    end: (i + 1) * 60,
    startSegmentIndex: i * 2,
    endSegmentIndex: i * 2 + 1,
    ...o,
  }));

describe("topicsToChapters", () => {
  it("returns empty string for empty topic list", () => {
    expect(topicsToChapters([])).toBe("");
  });

  it("formats a single topic as MM:SS timestamp + title", () => {
    const topics = makeTopics([{ start: 0, title: "Introduction" }]);
    expect(topicsToChapters(topics)).toBe("00:00 Introduction");
  });

  it("formats multiple topics separated by newlines", () => {
    const topics = makeTopics([
      { start: 0, title: "Intro" },
      { start: 90, title: "Main Topic" },
    ]);
    const result = topicsToChapters(topics);
    expect(result).toBe("00:00 Intro\n01:30 Main Topic");
  });

  it("uses HH:MM:SS format for topics starting at or beyond one hour", () => {
    const topics = makeTopics([{ start: 3661, title: "Late Topic" }]);
    expect(topicsToChapters(topics)).toBe("01:01:01 Late Topic");
  });

  it("pads minutes and seconds with leading zeros", () => {
    const topics = makeTopics([{ start: 65, title: "Short" }]);
    expect(topicsToChapters(topics)).toBe("01:05 Short");
  });
});

describe("topicsToShowNotes", () => {
  it("returns a chapters section for basic topics", () => {
    const topics = makeTopics([{ start: 0, title: "Intro" }]);
    const result = topicsToShowNotes(topics);
    expect(result).toContain("## Capítulos");
    expect(result).toContain("### 00:00 - Intro");
  });

  it("includes description when present on a topic", () => {
    const topics = makeTopics([
      { start: 0, title: "Intro", description: "We discuss goals." },
    ]);
    const result = topicsToShowNotes(topics);
    expect(result).toContain("We discuss goals.");
  });

  it("includes keywords as tags when present", () => {
    const topics = makeTopics([
      { start: 0, title: "Tech", keywords: ["ai", "ml", "data"] },
    ]);
    const result = topicsToShowNotes(topics);
    expect(result).toContain("*Tags: ai, ml, data*");
  });

  it("omits tags line when keywords array is empty", () => {
    const topics = makeTopics([{ start: 0, title: "Bare", keywords: [] }]);
    const result = topicsToShowNotes(topics);
    expect(result).not.toContain("*Tags:");
  });

  it("does not include summary section when includeSummary is false", () => {
    const topics = makeTopics([{ start: 0, title: "Topic" }]);
    const result = topicsToShowNotes(topics, {
      includeSummary: false,
      summary: "A great episode.",
    });
    expect(result).not.toContain("## Resumo");
  });

  it("includes summary section when includeSummary is true and summary provided", () => {
    const topics = makeTopics([{ start: 0, title: "Topic" }]);
    const result = topicsToShowNotes(topics, {
      includeSummary: true,
      summary: "A great episode.",
    });
    expect(result).toContain("## Resumo");
    expect(result).toContain("A great episode.");
  });

  it("does not include summary section when includeSummary is true but summary is absent", () => {
    const topics = makeTopics([{ start: 0, title: "Topic" }]);
    const result = topicsToShowNotes(topics, { includeSummary: true });
    expect(result).not.toContain("## Resumo");
  });

  it("lists all topics in chapter order", () => {
    const topics = makeTopics([
      { start: 0, title: "First" },
      { start: 300, title: "Second" },
      { start: 600, title: "Third" },
    ]);
    const result = topicsToShowNotes(topics);
    const firstIdx = result.indexOf("First");
    const secondIdx = result.indexOf("Second");
    const thirdIdx = result.indexOf("Third");
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });

  it("returns empty string for empty topic list", () => {
    const result = topicsToShowNotes([]);
    expect(result).toContain("## Capítulos");
  });
});

// ─── helpers ──────────────────────────────────────────────────────────────

const SAMPLE_SEGMENTS: TranscriptSegment[] = [
  { id: 0, start: 0, end: 30, text: "Welcome to the podcast today." },
  { id: 1, start: 30, end: 60, text: "Let us introduce ourselves quickly." },
  { id: 2, start: 60, end: 120, text: "Today we talk about machine learning." },
  { id: 3, start: 120, end: 180, text: "Specifically we cover neural networks." },
  { id: 4, start: 180, end: 240, text: "Thanks for joining us, see you next week." },
];

function makeGroqResponse(payload: unknown) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(payload) } }],
    }),
    text: vi.fn().mockResolvedValue(""),
  };
}

function makeErrorResponse(status = 500) {
  return {
    ok: false,
    status,
    text: vi.fn().mockResolvedValue("Internal Server Error"),
    json: vi.fn().mockResolvedValue({}),
  };
}

const GROQ_PAYLOAD = {
  topics: [
    {
      title: "Introducao",
      description: "Apresentacao dos participantes",
      startSegmentIndex: 0,
      endSegmentIndex: 1,
      keywords: ["intro", "boas-vindas"],
    },
    {
      title: "Machine Learning",
      description: "Discussao sobre ML e redes neurais",
      startSegmentIndex: 2,
      endSegmentIndex: 3,
      keywords: ["ml", "ia", "redes"],
    },
  ],
  summary: "Episodio sobre machine learning e redes neurais.",
};

describe("detectTopics", () => {
  beforeEach(() => {
    vi.stubEnv("GROQ_API_KEY", "test-groq-key");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns error when no API key is configured", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");

    const result = await detectTopics(SAMPLE_SEGMENTS);

    expect(result.success).toBe(false);
    expect(result.topics).toHaveLength(0);
    expect(result.error).toMatch(/no llm provider/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls Groq API when GROQ_API_KEY is set", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(makeGroqResponse(GROQ_PAYLOAD));

    const result = await detectTopics(SAMPLE_SEGMENTS);

    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("groq.com");
  });

  it("maps segment indices to start/end times correctly", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(makeGroqResponse(GROQ_PAYLOAD));

    const result = await detectTopics(SAMPLE_SEGMENTS);

    expect(result.success).toBe(true);
    // First topic: segments 0-1 → start=0, end=60
    expect(result.topics[0].start).toBe(0);
    expect(result.topics[0].end).toBe(60);
    // Second topic: segments 2-3 → start=60, end=180
    expect(result.topics[1].start).toBe(60);
    expect(result.topics[1].end).toBe(180);
  });

  it("includes summary from API response", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(makeGroqResponse(GROQ_PAYLOAD));

    const result = await detectTopics(SAMPLE_SEGMENTS);

    expect(result.summary).toBe("Episodio sobre machine learning e redes neurais.");
  });

  it("filters out topics shorter than minTopicDuration", async () => {
    const payloadWithShortTopic = {
      topics: [
        {
          title: "Short",
          description: "Very short",
          startSegmentIndex: 0,
          endSegmentIndex: 0, // start=0, end=30 → 30s duration
          keywords: [],
        },
        {
          title: "Long",
          description: "Long enough",
          startSegmentIndex: 2,
          endSegmentIndex: 3, // start=60, end=180 → 120s duration
          keywords: [],
        },
      ],
      summary: "",
    };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeGroqResponse(payloadWithShortTopic)
    );

    // minTopicDuration defaults to 30; topic with exactly 30s is filtered (< 30 fails, == 30 passes)
    const result = await detectTopics(SAMPLE_SEGMENTS, { minTopicDuration: 60 });

    expect(result.success).toBe(true);
    expect(result.topics).toHaveLength(1);
    expect(result.topics[0].title).toBe("Long");
  });

  it("limits results to maxTopics", async () => {
    const manyTopics = Array.from({ length: 5 }, (_, i) => ({
      title: `Topic ${i}`,
      description: "",
      startSegmentIndex: 0,
      endSegmentIndex: 4, // all cover full range → 240s, pass any minDuration
      keywords: [],
    }));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeGroqResponse({ topics: manyTopics, summary: "" })
    );

    const result = await detectTopics(SAMPLE_SEGMENTS, { maxTopics: 3 });

    expect(result.success).toBe(true);
    expect(result.topics).toHaveLength(3);
  });

  it("parses JSON wrapped in markdown code fences", async () => {
    const fenced = `\`\`\`json\n${JSON.stringify(GROQ_PAYLOAD)}\n\`\`\``;
    const fencedResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: fenced } }],
      }),
      text: vi.fn().mockResolvedValue(""),
    };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(fencedResponse);

    const result = await detectTopics(SAMPLE_SEGMENTS);

    expect(result.success).toBe(true);
    expect(result.topics).toHaveLength(2);
  });

  it("falls back to OpenRouter when Groq returns a non-ok response", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");

    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeErrorResponse(503))       // Groq fails
      .mockResolvedValueOnce(makeGroqResponse(GROQ_PAYLOAD)); // OpenRouter succeeds

    const result = await detectTopics(SAMPLE_SEGMENTS);

    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    const openRouterUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[1][0] as string;
    expect(openRouterUrl).toContain("openrouter.ai");
  });

  it("returns error when both providers fail", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");

    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeErrorResponse(500))
      .mockResolvedValueOnce(makeErrorResponse(500));

    const result = await detectTopics(SAMPLE_SEGMENTS);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no llm provider/i);
  });

  it("returns error when API returns invalid JSON", async () => {
    const badJsonResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: "not valid json {{{" } }],
      }),
      text: vi.fn().mockResolvedValue(""),
    };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(badJsonResponse);

    const result = await detectTopics(SAMPLE_SEGMENTS);

    expect(result.success).toBe(false);
    expect(result.topics).toHaveLength(0);
    expect(result.error).toBeDefined();
  });

  it("only calls Groq when provider='groq' even if OpenRouter key is set", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(makeGroqResponse(GROQ_PAYLOAD));

    await detectTopics(SAMPLE_SEGMENTS, { provider: "groq" });

    expect(fetch).toHaveBeenCalledOnce();
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("groq.com");
  });

  it("only calls OpenRouter when provider='openrouter' even if Groq key is set", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(makeGroqResponse(GROQ_PAYLOAD));

    await detectTopics(SAMPLE_SEGMENTS, { provider: "openrouter" });

    expect(fetch).toHaveBeenCalledOnce();
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("openrouter.ai");
  });

  it("clamps out-of-range segment indices to valid bounds", async () => {
    const outOfBoundsPayload = {
      topics: [
        {
          title: "Clamped",
          description: "Uses out-of-bounds indices",
          startSegmentIndex: -5,
          endSegmentIndex: 999,
          keywords: [],
        },
      ],
      summary: "",
    };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeGroqResponse(outOfBoundsPayload)
    );

    const result = await detectTopics(SAMPLE_SEGMENTS);

    expect(result.success).toBe(true);
    // startSegmentIndex clamped to 0 → start=SAMPLE_SEGMENTS[0].start
    expect(result.topics[0].start).toBe(SAMPLE_SEGMENTS[0].start);
    // endSegmentIndex clamped to last valid index (4) → end=SAMPLE_SEGMENTS[4].end
    expect(result.topics[0].end).toBe(SAMPLE_SEGMENTS[4].end);
  });
});
