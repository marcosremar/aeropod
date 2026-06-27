import { describe, it, expect } from "vitest";
import {
  topicsToChapters,
  topicsToShowNotes,
  type TopicSegment,
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
