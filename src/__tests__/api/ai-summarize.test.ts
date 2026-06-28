import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/ai/AIService", () => ({
  aiCompleteJSON: vi.fn(),
}));

import { aiCompleteJSON } from "@/lib/ai/AIService";

describe("POST /api/ai/summarize", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("@/app/api/ai/summarize/route");
    POST = module.POST;
  });

  function makeRequest(body: Record<string, unknown>) {
    return new NextRequest("http://localhost/api/ai/summarize", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  it("returns 400 when text is missing", async () => {
    const req = makeRequest({});
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Text is required");
  });

  it("returns 400 when text is an empty string", async () => {
    const req = makeRequest({ text: "" });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Text is required");
  });

  it("returns 400 when text is only whitespace", async () => {
    const req = makeRequest({ text: "   " });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Text is required");
  });

  it("returns AI-generated summary on success", async () => {
    (aiCompleteJSON as ReturnType<typeof vi.fn>).mockResolvedValue({
      summary: "Este episodio discute inteligencia artificial.",
    });

    const req = makeRequest({ text: "Today we discussed AI and its impact on society." });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.summary).toBe("Este episodio discute inteligencia artificial.");
    expect(aiCompleteJSON).toHaveBeenCalledOnce();
    expect(aiCompleteJSON).toHaveBeenCalledWith(
      "section_summary",
      expect.stringContaining("Today we discussed AI")
    );
  });

  it("passes maxWords to the AI prompt when provided", async () => {
    (aiCompleteJSON as ReturnType<typeof vi.fn>).mockResolvedValue({
      summary: "Resumo curto.",
    });

    const req = makeRequest({ text: "Some podcast content here.", maxWords: 50 });
    await POST(req);

    expect(aiCompleteJSON).toHaveBeenCalledWith(
      "section_summary",
      expect.stringContaining("50")
    );
  });

  it("truncates text longer than 10000 characters before sending to AI", async () => {
    (aiCompleteJSON as ReturnType<typeof vi.fn>).mockResolvedValue({ summary: "ok" });

    const longText = "a".repeat(15000);
    const req = makeRequest({ text: longText });
    await POST(req);

    const promptArg = (aiCompleteJSON as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(promptArg).toContain("...");
    expect(promptArg).not.toContain("a".repeat(15000));
  });

  it("falls back to extractive summary when AI fails and text has long sentences", async () => {
    (aiCompleteJSON as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("AI service unavailable")
    );

    const text =
      "This is the first sentence of the podcast. This is the second sentence discussing important topics. This is the third sentence wrapping up the discussion. This is the fourth sentence.";
    const req = makeRequest({ text });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.summary).toContain("first sentence");
    expect(data.summary).toContain("second sentence");
    expect(data.summary).toContain("third sentence");
    expect(data.summary.endsWith(".")).toBe(true);
  });

  it("falls back to word-count summary when AI fails and no sentences are long enough", async () => {
    (aiCompleteJSON as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("AI error")
    );

    const req = makeRequest({ text: "Short. Text." });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.summary).toMatch(/Secao de audio com \d+ palavras\./);
  });

  it("returns 500 when request body cannot be parsed as JSON", async () => {
    const req = new NextRequest("http://localhost/api/ai/summarize", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe("Failed to generate summary");
  });
});
