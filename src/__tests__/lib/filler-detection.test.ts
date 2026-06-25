import { describe, it, expect } from "vitest";
import { detectFillerWords, generateFillerRemovalFilter } from "@/lib/audio/filler-detection";
import type { WordTimestamp } from "@/lib/db/schema";

const w = (word: string, start: number): WordTimestamp => ({
  word,
  start,
  end: start + 0.3,
});

describe("detectFillerWords", () => {
  it("detects single-word Portuguese fillers", () => {
    const words: WordTimestamp[] = [
      w("Eu", 0),
      w("acho", 1),
      w("tipo", 2), // filler
      w("que", 3),
      w("sim", 4),
    ];
    const fillers = detectFillerWords(words, "pt");
    const detectedWords = fillers.map((f) => f.word.toLowerCase());
    expect(detectedWords).toContain("tipo");
  });

  it("does not flag normal words", () => {
    const words: WordTimestamp[] = [w("casa", 0), w("verde", 1), w("grande", 2)];
    const fillers = detectFillerWords(words, "pt");
    expect(fillers).toHaveLength(0);
  });

  it("detects English fillers when language is en", () => {
    const words: WordTimestamp[] = [w("I", 0), w("um", 1), w("think", 2)];
    const fillers = detectFillerWords(words, "en");
    expect(fillers.map((f) => f.word.toLowerCase())).toContain("um");
  });

  it("captures timing and context for each filler", () => {
    const words: WordTimestamp[] = [w("entao", 0), w("vamos", 1)];
    const fillers = detectFillerWords(words, "pt");
    expect(fillers.length).toBeGreaterThan(0);
    const f = fillers[0];
    expect(f.startTime).toBe(0);
    expect(f.endTime).toBeGreaterThan(f.startTime);
    expect(typeof f.confidence).toBe("number");
  });

  it("generateFillerRemovalFilter returns a string filter expression", () => {
    const words: WordTimestamp[] = [w("ok", 0), w("eh", 1), w("legal", 2)];
    const fillers = detectFillerWords(words, "pt").map((f) => ({
      ...f,
      isRemoved: true,
    }));
    const filter = generateFillerRemovalFilter(fillers as never, 3);
    expect(typeof filter).toBe("string");
  });
});
