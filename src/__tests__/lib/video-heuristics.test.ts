import { describe, it, expect } from "vitest";
import { silenceToKeepRanges } from "@/lib/video/heuristics";

describe("silenceToKeepRanges", () => {
  it("returns an empty array for non-positive duration", () => {
    expect(silenceToKeepRanges(0, [])).toEqual([]);
    expect(silenceToKeepRanges(-5, [])).toEqual([]);
  });

  it("keeps the whole clip when there are no silences", () => {
    const ranges = silenceToKeepRanges(60, []);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBe(0);
    expect(ranges[0].end).toBe(60);
  });

  it("splits around a silence in the middle", () => {
    const ranges = silenceToKeepRanges(60, [{ start: 20, end: 30 }]);
    expect(ranges).toHaveLength(2);
    expect(ranges[0].start).toBe(0);
    expect(ranges[0].end).toBeCloseTo(20, 3);
    expect(ranges[1].start).toBeCloseTo(30, 3);
    expect(ranges[1].end).toBe(60);
    // sequential order
    expect(ranges.map((r) => r.order)).toEqual([0, 1]);
  });

  it("drops silence intervals shorter than the gap threshold at the edges", () => {
    const ranges = silenceToKeepRanges(60, [{ start: 0, end: 5 }]);
    // leading silence removed -> single keep range from 5..60
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBeCloseTo(5, 3);
    expect(ranges[0].end).toBe(60);
  });

  it("falls back to the whole clip if silence covers everything", () => {
    const ranges = silenceToKeepRanges(30, [{ start: 0, end: 30 }]);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBe(0);
    expect(ranges[0].end).toBe(30);
  });

  it("assigns a unique id to each range", () => {
    const ranges = silenceToKeepRanges(60, [{ start: 20, end: 30 }]);
    expect(ranges[0].id).toBeDefined();
    expect(ranges[0].id).not.toBe(ranges[1].id);
  });
});
