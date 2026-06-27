import { describe, it, expect } from 'vitest';
import {
  detectFillerWords,
  generateFillerRemovalFilter,
} from '@/lib/audio/filler-detection';
import type { WordTimestamp } from '@/lib/db/schema';

function makeWord(word: string, start: number, end: number): WordTimestamp {
  return { word, start, end };
}

describe('detectFillerWords', () => {
  it('returns empty array for empty input', () => {
    expect(detectFillerWords([])).toEqual([]);
  });

  it('detects single Portuguese filler words', () => {
    const words: WordTimestamp[] = [
      makeWord('Hoje', 0, 0.5),
      makeWord('hum', 0.5, 0.8),
      makeWord('vamos', 0.8, 1.2),
    ];
    const result = detectFillerWords(words, 'pt');
    expect(result).toHaveLength(1);
    expect(result[0].word).toBe('hum');
    expect(result[0].startTime).toBe(0.5);
    expect(result[0].endTime).toBe(0.8);
    expect(result[0].confidence).toBeGreaterThan(0.5);
  });

  it('detects single English filler words', () => {
    const words: WordTimestamp[] = [
      makeWord('So', 0, 0.3),
      makeWord('um', 0.3, 0.5),
      makeWord('I', 0.5, 0.7),
      makeWord('think', 0.7, 1.0),
    ];
    const result = detectFillerWords(words, 'en');
    // "so" and "um" are both fillers but confidence for "so" at start is reduced
    const umFiller = result.find(r => r.word.toLowerCase() === 'um');
    expect(umFiller).toBeDefined();
    expect(umFiller!.confidence).toBeGreaterThan(0.8); // um/uh get +0.15 bonus
  });

  it('detects multi-word Portuguese filler "quer dizer"', () => {
    const words: WordTimestamp[] = [
      makeWord('Eu', 0, 0.3),
      makeWord('quer', 0.3, 0.6),
      makeWord('dizer', 0.6, 0.9),
      makeWord('fui', 0.9, 1.1),
    ];
    const result = detectFillerWords(words, 'pt');
    const multiWordFiller = result.find(r => r.word === 'quer dizer');
    expect(multiWordFiller).toBeDefined();
    expect(multiWordFiller!.startTime).toBe(0.3);
    expect(multiWordFiller!.endTime).toBe(0.9);
    expect(multiWordFiller!.confidence).toBe(0.9);
  });

  it('detects multi-word English filler "you know"', () => {
    const words: WordTimestamp[] = [
      makeWord('It', 0, 0.2),
      makeWord('is', 0.2, 0.4),
      makeWord('you', 0.4, 0.6),
      makeWord('know', 0.6, 0.8),
      makeWord('great', 0.8, 1.0),
    ];
    const result = detectFillerWords(words, 'en');
    const youKnow = result.find(r => r.word === 'you know');
    expect(youKnow).toBeDefined();
    expect(youKnow!.confidence).toBe(0.9);
  });

  it('reduces confidence for "tipo" followed by "de"', () => {
    const words: WordTimestamp[] = [
      makeWord('Um', 0, 0.3),
      makeWord('tipo', 0.3, 0.6),
      makeWord('de', 0.6, 0.8),
      makeWord('erro', 0.8, 1.0),
    ];
    const result = detectFillerWords(words, 'pt');
    const tipoFiller = result.find(r => r.word === 'tipo');
    expect(tipoFiller).toBeDefined();
    // Base 0.7, no boundary bonus, no high-confidence bonus, tipo+de penalty -0.4 = 0.3
    expect(tipoFiller!.confidence).toBeLessThan(0.5);
  });

  it('reduces confidence for "like" after comparison word', () => {
    const words: WordTimestamp[] = [
      makeWord('It', 0, 0.2),
      makeWord('looks', 0.2, 0.5),
      makeWord('like', 0.5, 0.7),
      makeWord('rain', 0.7, 1.0),
    ];
    const result = detectFillerWords(words, 'en');
    const likeFiller = result.find(r => r.word === 'like');
    expect(likeFiller).toBeDefined();
    // Should have reduced confidence because context includes "looks"
    expect(likeFiller!.confidence).toBeLessThan(0.5);
  });

  it('includes context in detected filler', () => {
    const words: WordTimestamp[] = [
      makeWord('Primeiro', 0, 0.5),
      makeWord('ne', 0.5, 0.7),
      makeWord('segundo', 0.7, 1.0),
    ];
    const result = detectFillerWords(words, 'pt');
    expect(result[0].context).toContain('ne');
  });

  it('does not detect non-filler words', () => {
    const words: WordTimestamp[] = [
      makeWord('Podcast', 0, 0.5),
      makeWord('de', 0.5, 0.7),
      makeWord('tecnologia', 0.7, 1.2),
    ];
    const result = detectFillerWords(words, 'pt');
    expect(result).toHaveLength(0);
  });

  it('detects multiple fillers in a single transcript', () => {
    const words: WordTimestamp[] = [
      makeWord('hum', 0, 0.3),
      makeWord('acho', 0.3, 0.6),
      makeWord('que', 0.6, 0.8),
      makeWord('eh', 0.8, 1.0),
      makeWord('correto', 1.0, 1.5),
    ];
    const result = detectFillerWords(words, 'pt');
    expect(result.length).toBeGreaterThanOrEqual(2);
    const fillerWords = result.map(r => r.word.toLowerCase());
    expect(fillerWords).toContain('hum');
    expect(fillerWords).toContain('eh');
  });
});

describe('generateFillerRemovalFilter', () => {
  const makeFillerWord = (startTime: number, endTime: number, isRemoved: boolean) => ({
    id: `filler-${startTime}`,
    segmentId: 'seg-1',
    projectId: 'proj-1',
    word: 'um',
    startTime,
    endTime,
    confidence: 0.9,
    isRemoved,
    createdAt: new Date(),
  });

  it('returns empty string when no fillers are marked for removal', () => {
    const fillers = [makeFillerWord(5, 5.5, false), makeFillerWord(10, 10.3, false)];
    expect(generateFillerRemovalFilter(fillers, 60)).toBe('');
  });

  it('returns empty string when fillers array is empty', () => {
    expect(generateFillerRemovalFilter([], 60)).toBe('');
  });

  it('generates valid FFmpeg filter for a single removed filler', () => {
    const fillers = [makeFillerWord(5, 5.5, true)];
    const filter = generateFillerRemovalFilter(fillers, 30);

    expect(filter).toBeTruthy();
    // Should include atrim sections that skip 5-5.5
    expect(filter).toContain('atrim');
    expect(filter).toContain('concat');
    // Segments to keep: 0-5 and 5.5-30
    expect(filter).toContain('start=0');
    expect(filter).toContain('end=5');
    expect(filter).toContain('start=5.5');
    expect(filter).toContain('end=30');
  });

  it('generates filter only for fillers marked for removal', () => {
    const fillers = [
      makeFillerWord(5, 5.5, true),
      makeFillerWord(10, 10.3, false), // not removed
    ];
    const filter = generateFillerRemovalFilter(fillers, 30);

    expect(filter).toBeTruthy();
    // Should only have 2 keep-segments (0-5 and 5.5-30), not 3
    expect(filter).toContain('concat=n=2');
  });

  it('handles multiple removed fillers', () => {
    const fillers = [
      makeFillerWord(5, 5.5, true),
      makeFillerWord(15, 15.3, true),
    ];
    const filter = generateFillerRemovalFilter(fillers, 60);

    expect(filter).toBeTruthy();
    // 3 keep-segments: 0-5, 5.5-15, 15.3-60
    expect(filter).toContain('concat=n=3');
  });

  it('handles a filler at the very start of audio', () => {
    const fillers = [makeFillerWord(0, 0.5, true)];
    const filter = generateFillerRemovalFilter(fillers, 30);

    expect(filter).toBeTruthy();
    // Only one keep-segment: 0.5-30
    expect(filter).toContain('concat=n=1');
    expect(filter).toContain('start=0.5');
  });

  it('handles a filler at the very end of audio', () => {
    const fillers = [makeFillerWord(29, 30, true)];
    const filter = generateFillerRemovalFilter(fillers, 30);

    expect(filter).toBeTruthy();
    // Only one keep-segment: 0-29
    expect(filter).toContain('concat=n=1');
    expect(filter).toContain('end=29');
  });
});
