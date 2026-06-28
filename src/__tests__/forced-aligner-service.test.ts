/**
 * Unit tests for ForcedAlignerService (src/lib/audio/forced-aligner.ts).
 * All network calls are intercepted via vi.stubGlobal('fetch') so no real
 * HTTP requests are made.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ForcedAlignerService,
  getForcedAlignerService,
  type SegmentForAlignment,
  type AlignSegmentsResult,
} from "@/lib/audio/forced-aligner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockFetchOk(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new ArrayBuffer(8),
  });
}

function mockFetchFail(status = 500, text = "Internal Server Error") {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ error: text }),
    text: async () => text,
    arrayBuffer: async () => new ArrayBuffer(0),
  });
}

function makeFetchThrow(message = "Network error") {
  return vi.fn().mockRejectedValue(new Error(message));
}

const SAMPLE_SEGMENTS: SegmentForAlignment[] = [
  { start: 0.0, end: 2.5, text: "Hello world" },
  { start: 2.5, end: 5.0, text: "How are you" },
];

const SAMPLE_ALIGNED_RESULT: AlignSegmentsResult = {
  success: true,
  segments: [
    {
      start: 0.0,
      end: 2.5,
      text: "Hello world",
      word_timestamps: [
        { word: "Hello", start: 0.0, end: 1.0, score: 0.99 },
        { word: "world", start: 1.1, end: 2.5, score: 0.98 },
      ],
    },
    {
      start: 2.5,
      end: 5.0,
      text: "How are you",
      word_timestamps: [
        { word: "How", start: 2.5, end: 3.0, score: 0.97 },
        { word: "are", start: 3.1, end: 3.5, score: 0.96 },
        { word: "you", start: 3.6, end: 5.0, score: 0.95 },
      ],
    },
  ],
};

// A valid base64 data URL for a tiny fake audio payload
const FAKE_DATA_URL = "data:audio/mpeg;base64,AAAA";

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── isHealthy ────────────────────────────────────────────────────────────────

describe("ForcedAlignerService.isHealthy", () => {
  it("returns true when health endpoint responds with { status: 'ok' }", async () => {
    vi.stubGlobal("fetch", mockFetchOk({ status: "ok" }));
    const svc = new ForcedAlignerService();
    expect(await svc.isHealthy()).toBe(true);
  });

  it("returns false when health endpoint responds with status != 'ok'", async () => {
    vi.stubGlobal("fetch", mockFetchOk({ status: "degraded" }));
    const svc = new ForcedAlignerService();
    expect(await svc.isHealthy()).toBe(false);
  });

  it("returns false when health endpoint returns a non-2xx response", async () => {
    vi.stubGlobal("fetch", mockFetchFail(503, "Service Unavailable"));
    const svc = new ForcedAlignerService();
    expect(await svc.isHealthy()).toBe(false);
  });

  it("returns false when fetch throws a network error", async () => {
    vi.stubGlobal("fetch", makeFetchThrow("Connection refused"));
    const svc = new ForcedAlignerService();
    expect(await svc.isHealthy()).toBe(false);
  });
});

// ─── alignSegments — data-URL path (single fetch call) ───────────────────────

describe("ForcedAlignerService.alignSegments — data URL", () => {
  it("extracts base64 from data URL and returns successful alignment", async () => {
    vi.stubGlobal("fetch", mockFetchOk(SAMPLE_ALIGNED_RESULT));
    const svc = new ForcedAlignerService();
    const result = await svc.alignSegments(FAKE_DATA_URL, SAMPLE_SEGMENTS);

    expect(result.success).toBe(true);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].word_timestamps).toHaveLength(2);
  });

  it("only calls fetch once (for the API) when a data URL is provided", async () => {
    const fetchMock = mockFetchOk(SAMPLE_ALIGNED_RESULT);
    vi.stubGlobal("fetch", fetchMock);
    const svc = new ForcedAlignerService();
    await svc.alignSegments(FAKE_DATA_URL, SAMPLE_SEGMENTS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends the extracted base64 payload to the alignment API", async () => {
    const fetchMock = mockFetchOk(SAMPLE_ALIGNED_RESULT);
    vi.stubGlobal("fetch", fetchMock);
    const svc = new ForcedAlignerService();
    await svc.alignSegments(FAKE_DATA_URL, SAMPLE_SEGMENTS, "eng");

    const [, callOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(callOpts.body as string);
    expect(body.audio_base64).toBe("AAAA");
    expect(body.language).toBe("eng");
    expect(body.segments).toHaveLength(2);
  });

  it("returns error result when alignment API returns non-2xx", async () => {
    vi.stubGlobal("fetch", mockFetchFail(422, "Unprocessable Entity"));
    const svc = new ForcedAlignerService();
    const result = await svc.alignSegments(FAKE_DATA_URL, SAMPLE_SEGMENTS);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/422/);
    // Each segment should still be present (with empty word_timestamps)
    expect(result.segments).toHaveLength(SAMPLE_SEGMENTS.length);
    result.segments.forEach((seg) => {
      expect(seg.word_timestamps).toEqual([]);
    });
  });

  it("returns error result when alignment API throws", async () => {
    vi.stubGlobal("fetch", makeFetchThrow("Alignment service down"));
    const svc = new ForcedAlignerService();
    const result = await svc.alignSegments(FAKE_DATA_URL, SAMPLE_SEGMENTS);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Alignment service down");
    expect(result.segments).toHaveLength(SAMPLE_SEGMENTS.length);
  });

  it("passes through a success:false result returned by the API", async () => {
    const apiError: AlignSegmentsResult = {
      success: false,
      segments: SAMPLE_SEGMENTS.map((s) => ({ ...s, word_timestamps: [] })),
      error: "Model could not align audio",
    };
    vi.stubGlobal("fetch", mockFetchOk(apiError));
    const svc = new ForcedAlignerService();
    const result = await svc.alignSegments(FAKE_DATA_URL, SAMPLE_SEGMENTS);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Model could not align audio");
  });

  it("uses 'por' as the default language", async () => {
    const fetchMock = mockFetchOk(SAMPLE_ALIGNED_RESULT);
    vi.stubGlobal("fetch", fetchMock);
    const svc = new ForcedAlignerService();
    await svc.alignSegments(FAKE_DATA_URL, SAMPLE_SEGMENTS);

    const [, callOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(callOpts.body as string);
    expect(body.language).toBe("por");
  });
});

// ─── alignSegments — remote URL path (two fetch calls) ───────────────────────

describe("ForcedAlignerService.alignSegments — remote URL", () => {
  it("returns error result when audio fetch returns non-2xx", async () => {
    vi.stubGlobal("fetch", mockFetchFail(404, "Not Found"));
    const svc = new ForcedAlignerService();
    const result = await svc.alignSegments(
      "https://cdn.example.com/audio.mp3",
      SAMPLE_SEGMENTS
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to fetch audio");
    expect(result.segments).toHaveLength(SAMPLE_SEGMENTS.length);
  });

  it("returns error result when audio fetch throws", async () => {
    vi.stubGlobal("fetch", makeFetchThrow("DNS lookup failed"));
    const svc = new ForcedAlignerService();
    const result = await svc.alignSegments(
      "https://cdn.example.com/audio.mp3",
      SAMPLE_SEGMENTS
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to fetch audio");
  });

  it("converts audio bytes to base64 and calls the alignment API", async () => {
    // First call: audio download; second call: alignment API
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.from("fake-audio-bytes"),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => SAMPLE_ALIGNED_RESULT,
        text: async () => JSON.stringify(SAMPLE_ALIGNED_RESULT),
      });
    vi.stubGlobal("fetch", fetchMock);

    const svc = new ForcedAlignerService();
    const result = await svc.alignSegments(
      "https://cdn.example.com/audio.mp3",
      SAMPLE_SEGMENTS
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);

    const [, alignCallOpts] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(alignCallOpts.body as string);
    // Buffer.from("fake-audio-bytes").toString("base64") is deterministic
    expect(body.audio_base64).toBe(
      Buffer.from("fake-audio-bytes").toString("base64")
    );
  });
});

// ─── getForcedAlignerService singleton ───────────────────────────────────────

describe("getForcedAlignerService", () => {
  it("returns a ForcedAlignerService instance", () => {
    const svc = getForcedAlignerService();
    expect(svc).toBeInstanceOf(ForcedAlignerService);
  });

  it("returns the same instance on repeated calls", () => {
    const a = getForcedAlignerService();
    const b = getForcedAlignerService();
    expect(a).toBe(b);
  });
});
