import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb, resetDb, queueResults, getInserts } from "../helpers/mock-db";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, db: mockDb, getDb: () => mockDb };
});

import { socialClipService } from "@/lib/clips/social-clip-service";

const baseSuggestion = {
  segmentIds: ["s1"],
  startTime: 0,
  endTime: 30,
  duration: 30,
  title: "Como aprender programacao rapido",
  description: "dicas de estudo",
  hookScore: 7,
  viralPotential: 6,
  hookText: "Voce sabia que",
  reason: "conteudo educativo",
};

beforeEach(() => resetDb());

describe("SocialClipService.saveClip metadata", () => {
  it("generates podcast hashtags and persists the clip", async () => {
    queueResults([{ id: "clip1" }]); // insert returning
    await socialClipService.saveClip("p1", baseSuggestion);

    const inserted = getInserts()[0] as {
      metadata: { suggestedHashtags: string[]; emotionalTone: string };
    };
    expect(inserted.metadata.suggestedHashtags).toContain("#podcast");
    // title-derived hashtag (words > 4 chars)
    expect(
      inserted.metadata.suggestedHashtags.some((h) => h.includes("programacao"))
    ).toBe(true);
  });

  it("derives 'funny' emotional tone from playful content", async () => {
    queueResults([{ id: "clip2" }]);
    await socialClipService.saveClip("p1", {
      ...baseSuggestion,
      title: "Momento muito engracado do podcast",
      reason: "deu muita risada",
    });
    const inserted = getInserts()[0] as {
      metadata: { emotionalTone: string };
    };
    expect(inserted.metadata.emotionalTone).toBe("funny");
  });

  it("derives 'inspiring' tone for high-potential clips", async () => {
    queueResults([{ id: "clip3" }]);
    await socialClipService.saveClip("p1", {
      ...baseSuggestion,
      hookScore: 9,
      viralPotential: 9,
    });
    const inserted = getInserts()[0] as { metadata: { emotionalTone: string } };
    expect(inserted.metadata.emotionalTone).toBe("inspiring");
  });

  it("defaults to 'educational' tone", async () => {
    queueResults([{ id: "clip4" }]);
    await socialClipService.saveClip("p1", baseSuggestion);
    const inserted = getInserts()[0] as { metadata: { emotionalTone: string } };
    expect(inserted.metadata.emotionalTone).toBe("educational");
  });
});
