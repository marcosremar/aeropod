/**
 * Unit tests for ReplicateTranscriptionService private parsing methods.
 * Tests parseSRT and parseTimestamp — pure string-to-data logic with no
 * external dependencies.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("replicate", () => ({
  default: class MockReplicate {
    constructor(_opts: unknown) {}
  },
}));

vi.mock("groq-sdk", () => ({
  default: class MockGroq {
    constructor(_opts: unknown) {}
  },
}));

vi.mock("@deepgram/sdk", () => ({
  createClient: vi.fn().mockReturnValue({}),
}));

vi.mock("@/services/deepgram", () => ({
  isDeepgramConfigured: vi.fn(),
  transcribeWithDeepgram: vi.fn(),
}));

vi.mock("@/services/crisper-whisper", () => ({
  transcribeFromUrl: vi.fn(),
}));

import { ReplicateTranscriptionService } from "@/lib/audio/transcription";

// Helper: expose private methods through `as any`
function makeSvc() {
  return new ReplicateTranscriptionService("fake-token") as any;
}

// ─── parseTimestamp ────────────────────────────────────────────────────────

describe("ReplicateTranscriptionService.parseTimestamp", () => {
  it("converts 00:00:00,000 to 0", () => {
    expect(makeSvc().parseTimestamp("00", "00", "00", "000")).toBe(0);
  });

  it("converts milliseconds correctly", () => {
    expect(makeSvc().parseTimestamp("00", "00", "00", "500")).toBeCloseTo(0.5);
  });

  it("converts seconds only", () => {
    expect(makeSvc().parseTimestamp("00", "00", "30", "000")).toBe(30);
  });

  it("converts minutes to seconds", () => {
    expect(makeSvc().parseTimestamp("00", "01", "00", "000")).toBe(60);
  });

  it("converts hours to seconds", () => {
    expect(makeSvc().parseTimestamp("01", "00", "00", "000")).toBe(3600);
  });

  it("converts a compound value correctly", () => {
    // 01:02:03,456 → 3600 + 120 + 3 + 0.456 = 3723.456
    expect(makeSvc().parseTimestamp("01", "02", "03", "456")).toBeCloseTo(3723.456);
  });

  it("handles leading zeros in all fields", () => {
    expect(makeSvc().parseTimestamp("00", "00", "09", "090")).toBeCloseTo(9.09);
  });
});

// ─── parseSRT ─────────────────────────────────────────────────────────────

describe("ReplicateTranscriptionService.parseSRT", () => {
  it("returns empty segments and text for an empty string", () => {
    const result = makeSvc().parseSRT("");
    expect(result.text).toBe("");
    expect(result.segments).toEqual([]);
    expect(result.duration).toBe(0);
  });

  it("parses a single SRT block correctly", () => {
    const srt = `1
00:00:00,000 --> 00:00:05,000
Hello world`;

    const result = makeSvc().parseSRT(srt);

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toMatchObject({
      id: 1,
      start: 0,
      end: 5,
      text: "Hello world",
    });
    expect(result.text).toBe("Hello world");
    expect(result.duration).toBe(5);
  });

  it("parses two SRT blocks and joins text with a space", () => {
    const srt = `1
00:00:00,000 --> 00:00:03,000
First sentence.

2
00:00:03,500 --> 00:00:07,000
Second sentence.`;

    const result = makeSvc().parseSRT(srt);

    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].text).toBe("First sentence.");
    expect(result.segments[1].text).toBe("Second sentence.");
    expect(result.text).toBe("First sentence. Second sentence.");
    expect(result.duration).toBe(7);
  });

  it("sets duration to the end time of the last segment", () => {
    const srt = `1
00:00:00,000 --> 00:00:10,000
Content here.`;

    const result = makeSvc().parseSRT(srt);
    expect(result.duration).toBe(10);
  });

  it("skips blocks whose time line is malformed", () => {
    const srt = `1
this is not a valid time line
Hello.

2
00:00:05,000 --> 00:00:09,000
Valid block.`;

    const result = makeSvc().parseSRT(srt);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].text).toBe("Valid block.");
  });

  it("skips blocks that have fewer than 3 lines", () => {
    // Only id + time = 2 lines, no text line
    const srt = `1
00:00:00,000 --> 00:00:05,000`;

    const result = makeSvc().parseSRT(srt);
    expect(result.segments).toHaveLength(0);
    expect(result.text).toBe("");
  });

  it("converts milliseconds in timestamps correctly", () => {
    const srt = `1
00:00:00,500 --> 00:00:01,250
Quick clip.`;

    const result = makeSvc().parseSRT(srt);
    expect(result.segments[0].start).toBeCloseTo(0.5);
    expect(result.segments[0].end).toBeCloseTo(1.25);
  });

  it("concatenates multi-line text within a block", () => {
    const srt = `1
00:00:00,000 --> 00:00:05,000
Line one
Line two`;

    const result = makeSvc().parseSRT(srt);
    expect(result.segments[0].text).toBe("Line one\nLine two");
  });

  it("handles hour-level timestamps", () => {
    const srt = `1
01:00:00,000 --> 01:30:00,000
Long content.`;

    const result = makeSvc().parseSRT(srt);
    expect(result.segments[0].start).toBe(3600);
    expect(result.segments[0].end).toBe(5400);
    expect(result.duration).toBe(5400);
  });
});

// ─── parseWhisperOutput ───────────────────────────────────────────────────

describe("ReplicateTranscriptionService.parseWhisperOutput", () => {
  it("returns empty text when given a string with no valid SRT blocks", () => {
    // parseSRT is called; since there are no valid SRT blocks, text and segments are empty
    const result = makeSvc().parseWhisperOutput("just plain text");
    expect(result.text).toBe("");
    expect(result.segments).toEqual([]);
  });

  it("uses output.segments when available", () => {
    const output = {
      text: "Hello",
      segments: [
        { id: 0, start: 0, end: 2, text: "Hello" },
      ],
      language: "en",
      duration: 2,
    };

    const result = makeSvc().parseWhisperOutput(output);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].text).toBe("Hello");
    expect(result.language).toBe("en");
    expect(result.duration).toBe(2);
  });

  it("falls back to output.transcription as SRT when segments are absent", () => {
    const srt = `1
00:00:00,000 --> 00:00:05,000
From transcription field.`;

    const output = { transcription: srt };
    const result = makeSvc().parseWhisperOutput(output);

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].text).toBe("From transcription field.");
  });

  it("parses a raw SRT string directly", () => {
    const srt = `1
00:00:00,000 --> 00:00:04,000
Parsed directly.`;

    const result = makeSvc().parseWhisperOutput(srt);
    expect(result.segments).toHaveLength(1);
    expect(result.text).toBe("Parsed directly.");
  });

  it("wraps an unrecognised object as plain text", () => {
    const result = makeSvc().parseWhisperOutput({ unknown: "data" });
    // No segments array, no transcription key → stringified as plain text
    expect(result.segments).toHaveLength(1);
    expect(result.text).toContain("[object Object]");
  });

  it("builds full text from segments when output.text is absent", () => {
    const output = {
      segments: [
        { id: 0, start: 0, end: 1, text: "Hello" },
        { id: 1, start: 1, end: 2, text: "World" },
      ],
    };

    const result = makeSvc().parseWhisperOutput(output);
    expect(result.text).toBe("Hello World");
  });
});
