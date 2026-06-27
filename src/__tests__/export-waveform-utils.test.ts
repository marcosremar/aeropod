import { describe, it, expect } from 'vitest';
import { computePartsToKeep } from '@/lib/audio/export';
import { getPeaksForTimeRange, type WaveformData } from '@/lib/audio/waveform';

describe('computePartsToKeep', () => {
  it('returns the full range when there are no cuts', () => {
    const parts = computePartsToKeep(10, 30, []);
    expect(parts).toEqual([{ start: 10, end: 30 }]);
  });

  it('returns empty array when a single cut covers the full range', () => {
    const parts = computePartsToKeep(10, 30, [{ startPercent: 0, endPercent: 1 }]);
    expect(parts).toEqual([]);
  });

  it('returns one part after a cut at the start', () => {
    const parts = computePartsToKeep(0, 100, [{ startPercent: 0, endPercent: 0.25 }]);
    expect(parts).toEqual([{ start: 25, end: 100 }]);
  });

  it('returns one part before a cut at the end', () => {
    const parts = computePartsToKeep(0, 100, [{ startPercent: 0.75, endPercent: 1 }]);
    expect(parts).toEqual([{ start: 0, end: 75 }]);
  });

  it('returns two parts when a single cut is in the middle', () => {
    const parts = computePartsToKeep(0, 100, [{ startPercent: 0.25, endPercent: 0.75 }]);
    expect(parts).toEqual([
      { start: 0, end: 25 },
      { start: 75, end: 100 },
    ]);
  });

  it('handles multiple non-overlapping cuts', () => {
    const parts = computePartsToKeep(0, 100, [
      { startPercent: 0.2, endPercent: 0.3 },
      { startPercent: 0.6, endPercent: 0.7 },
    ]);
    expect(parts).toEqual([
      { start: 0, end: 20 },
      { start: 30, end: 60 },
      { start: 70, end: 100 },
    ]);
  });

  it('handles overlapping cuts by merging them', () => {
    const parts = computePartsToKeep(0, 100, [
      { startPercent: 0.2, endPercent: 0.6 },
      { startPercent: 0.4, endPercent: 0.8 },
    ]);
    expect(parts).toEqual([
      { start: 0, end: 20 },
      { start: 80, end: 100 },
    ]);
  });

  it('sorts cuts by startPercent before processing', () => {
    const parts = computePartsToKeep(0, 100, [
      { startPercent: 0.6, endPercent: 0.7 },
      { startPercent: 0.1, endPercent: 0.2 },
    ]);
    expect(parts).toEqual([
      { start: 0, end: 10 },
      { start: 20, end: 60 },
      { start: 70, end: 100 },
    ]);
  });

  it('works with non-zero startTime offset', () => {
    const parts = computePartsToKeep(50, 150, [{ startPercent: 0.5, endPercent: 1 }]);
    expect(parts).toEqual([{ start: 50, end: 100 }]);
  });
});

describe('getPeaksForTimeRange', () => {
  const makeWaveform = (peaks: number[], samplesPerSecond: number): WaveformData => ({
    peaks,
    duration: peaks.length / samplesPerSecond,
    samplesPerSecond,
  });

  it('returns peaks within the specified time range', () => {
    // samplesPerSecond=2: t=1→index 2, t=3→ceil(6)=6; slice(2,6) = indices 2-5
    const waveform = makeWaveform([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0], 2);
    const result = getPeaksForTimeRange(waveform, 1, 3);
    expect(result).toEqual([0.3, 0.4, 0.5, 0.6]);
  });

  it('returns all peaks when range covers full duration', () => {
    const peaks = [0.1, 0.5, 0.9, 0.4, 0.2];
    const waveform = makeWaveform(peaks, 1);
    expect(getPeaksForTimeRange(waveform, 0, 5)).toEqual(peaks);
  });

  it('clamps to array bounds when startTime is negative', () => {
    const peaks = [0.1, 0.2, 0.3];
    const waveform = makeWaveform(peaks, 1);
    const result = getPeaksForTimeRange(waveform, -5, 2);
    expect(result).toEqual([0.1, 0.2]);
  });

  it('clamps to array bounds when endTime exceeds duration', () => {
    const peaks = [0.1, 0.2, 0.3];
    const waveform = makeWaveform(peaks, 1);
    const result = getPeaksForTimeRange(waveform, 1, 100);
    expect(result).toEqual([0.2, 0.3]);
  });

  it('returns empty array when startTime equals endTime', () => {
    const waveform = makeWaveform([0.1, 0.2, 0.3], 1);
    const result = getPeaksForTimeRange(waveform, 1, 1);
    expect(result.length).toBe(0);
  });

  it('returns empty array for empty peaks', () => {
    const waveform = makeWaveform([], 10);
    expect(getPeaksForTimeRange(waveform, 0, 5)).toEqual([]);
  });

  it('uses Math.floor for startIndex and Math.ceil for endIndex', () => {
    // samplesPerSecond=4: index = time * 4
    // startTime=0.3 → floor(1.2)=1, endTime=0.6 → ceil(2.4)=3
    const waveform = makeWaveform([0.1, 0.2, 0.3, 0.4, 0.5], 4);
    const result = getPeaksForTimeRange(waveform, 0.3, 0.6);
    expect(result).toEqual([0.2, 0.3]);
  });
});
