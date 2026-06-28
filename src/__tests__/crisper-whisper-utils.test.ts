import { describe, it, expect } from 'vitest';
import {
  extractFillers,
  getFillerDuration,
  groupFillersByType,
  getFillerStats,
  convertToSegments,
} from '@/services/crisper-whisper';
import type {
  CrisperWhisperResult,
  DetectedFiller,
  TranscriptionSegment,
} from '@/services/crisper-whisper';

const makeFiller = (word: string, start: number, end: number): DetectedFiller => ({
  word,
  start,
  end,
  confidence: 0.9,
});

const makeSegment = (
  text: string,
  start: number,
  end: number,
  words: Array<{ word: string; start: number; end: number }> = []
): TranscriptionSegment => ({
  text,
  start,
  end,
  words,
});

describe('extractFillers', () => {
  it('returns empty array when result is not successful', () => {
    const result: CrisperWhisperResult = { success: false };
    expect(extractFillers(result)).toEqual([]);
  });

  it('returns empty array when result has no fillers field', () => {
    const result: CrisperWhisperResult = { success: true };
    expect(extractFillers(result)).toEqual([]);
  });

  it('returns fillers from a successful result', () => {
    const fillers = [makeFiller('um', 1.0, 1.3), makeFiller('uh', 2.0, 2.2)];
    const result: CrisperWhisperResult = { success: true, fillers };
    expect(extractFillers(result)).toEqual(fillers);
  });

  it('returns empty array from a successful result with empty fillers list', () => {
    const result: CrisperWhisperResult = { success: true, fillers: [] };
    expect(extractFillers(result)).toEqual([]);
  });

  it('does not return fillers from a failed result even if fillers field exists', () => {
    const fillers = [makeFiller('um', 1.0, 1.3)];
    const result: CrisperWhisperResult = { success: false, fillers };
    expect(extractFillers(result)).toEqual([]);
  });
});

describe('getFillerDuration', () => {
  it('returns 0 for an empty list', () => {
    expect(getFillerDuration([])).toBe(0);
  });

  it('returns the duration of a single filler', () => {
    expect(getFillerDuration([makeFiller('um', 1.0, 1.5)])).toBeCloseTo(0.5);
  });

  it('returns the sum of durations of multiple fillers', () => {
    const fillers = [
      makeFiller('um', 1.0, 1.5),
      makeFiller('uh', 3.0, 3.2),
      makeFiller('tipo', 5.0, 5.4),
    ];
    expect(getFillerDuration(fillers)).toBeCloseTo(1.1);
  });

  it('handles zero-duration fillers gracefully', () => {
    expect(getFillerDuration([makeFiller('um', 2.0, 2.0)])).toBe(0);
  });
});

describe('groupFillersByType', () => {
  it('returns an empty object for an empty list', () => {
    expect(groupFillersByType([])).toEqual({});
  });

  it('groups fillers by their lowercased word', () => {
    const fillers = [
      makeFiller('Um', 1.0, 1.3),
      makeFiller('um', 2.0, 2.2),
      makeFiller('Uh', 3.0, 3.2),
    ];
    const grouped = groupFillersByType(fillers);
    expect(Object.keys(grouped).sort()).toEqual(['uh', 'um']);
    expect(grouped['um']).toHaveLength(2);
    expect(grouped['uh']).toHaveLength(1);
  });

  it('places each filler in the correct group', () => {
    const f1 = makeFiller('tipo', 1.0, 1.4);
    const f2 = makeFiller('TIPO', 2.0, 2.4);
    const grouped = groupFillersByType([f1, f2]);
    expect(grouped['tipo']).toEqual([f1, f2]);
  });

  it('creates one key per distinct word (case-insensitive)', () => {
    const fillers = [
      makeFiller('né', 0.5, 0.7),
      makeFiller('né', 1.0, 1.2),
      makeFiller('né', 1.5, 1.7),
    ];
    const grouped = groupFillersByType(fillers);
    expect(Object.keys(grouped)).toHaveLength(1);
    expect(grouped['né']).toHaveLength(3);
  });
});

describe('getFillerStats', () => {
  it('returns zero counts and duration for an empty list', () => {
    const stats = getFillerStats([]);
    expect(stats.totalCount).toBe(0);
    expect(stats.totalDuration).toBe(0);
    expect(stats.byType).toEqual({});
  });

  it('reports correct totalCount', () => {
    const fillers = [
      makeFiller('um', 1.0, 1.3),
      makeFiller('uh', 2.0, 2.2),
      makeFiller('um', 3.0, 3.2),
    ];
    expect(getFillerStats(fillers).totalCount).toBe(3);
  });

  it('reports correct totalDuration', () => {
    const fillers = [makeFiller('um', 0.0, 0.5), makeFiller('uh', 1.0, 1.3)];
    expect(getFillerStats(fillers).totalDuration).toBeCloseTo(0.8);
  });

  it('reports per-type count and duration', () => {
    const fillers = [
      makeFiller('um', 1.0, 1.5),
      makeFiller('um', 2.0, 2.3),
      makeFiller('uh', 3.0, 3.2),
    ];
    const stats = getFillerStats(fillers);
    expect(stats.byType['um'].count).toBe(2);
    expect(stats.byType['um'].duration).toBeCloseTo(0.8);
    expect(stats.byType['uh'].count).toBe(1);
    expect(stats.byType['uh'].duration).toBeCloseTo(0.2);
  });

  it('normalises word case in byType keys', () => {
    const fillers = [makeFiller('Né', 1.0, 1.2), makeFiller('né', 2.0, 2.2)];
    const stats = getFillerStats(fillers);
    expect(Object.keys(stats.byType)).toEqual(['né']);
    expect(stats.byType['né'].count).toBe(2);
  });
});

describe('convertToSegments', () => {
  it('returns empty array when result is not successful', () => {
    const result: CrisperWhisperResult = { success: false };
    expect(convertToSegments(result)).toEqual([]);
  });

  it('returns empty array when result has no segments field', () => {
    const result: CrisperWhisperResult = { success: true };
    expect(convertToSegments(result)).toEqual([]);
  });

  it('returns empty array when segments list is empty', () => {
    const result: CrisperWhisperResult = { success: true, segments: [] };
    expect(convertToSegments(result)).toEqual([]);
  });

  it('maps segments preserving start, end, text, and words', () => {
    const words = [{ word: 'hello', start: 0.0, end: 0.5 }];
    const result: CrisperWhisperResult = {
      success: true,
      segments: [makeSegment('hello world', 0.0, 1.0, words)],
    };
    expect(convertToSegments(result)).toEqual([
      { start: 0.0, end: 1.0, text: 'hello world', words },
    ]);
  });

  it('converts multiple segments correctly', () => {
    const result: CrisperWhisperResult = {
      success: true,
      segments: [
        makeSegment('first segment', 0.0, 2.0),
        makeSegment('second segment', 2.5, 5.0),
      ],
    };
    const converted = convertToSegments(result);
    expect(converted).toHaveLength(2);
    expect(converted[0].text).toBe('first segment');
    expect(converted[1].start).toBe(2.5);
  });

  it('does not include extra fields from the source segment', () => {
    const result: CrisperWhisperResult = {
      success: true,
      segments: [makeSegment('test', 0.0, 1.0)],
    };
    const converted = convertToSegments(result);
    expect(converted[0]).toEqual({ start: 0.0, end: 1.0, text: 'test', words: [] });
  });
});
