import { describe, it, expect } from "vitest";
import { aspectToFilter } from "@/lib/video/processor";

describe("aspectToFilter", () => {
  it("produces a scale+crop filtergraph for 16:9", () => {
    const f = aspectToFilter("16:9", 1920, 1080);
    expect(f).toContain("scale=");
    expect(f).toContain("crop=");
    expect(f).toContain("setsar=1");
  });

  it("produces a vertical filtergraph for 9:16", () => {
    const f = aspectToFilter("9:16", 1920, 1080);
    expect(f).toContain("scale=");
    expect(f).toContain("crop=");
  });

  it("produces a square filtergraph for 1:1", () => {
    const f = aspectToFilter("1:1", 1920, 1080);
    expect(f).toContain("crop=");
  });

  it("returns different graphs for different aspect ratios", () => {
    const wide = aspectToFilter("16:9", 1920, 1080);
    const tall = aspectToFilter("9:16", 1920, 1080);
    const square = aspectToFilter("1:1", 1920, 1080);
    expect(new Set([wide, tall, square]).size).toBe(3);
  });
});
