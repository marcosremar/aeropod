import { describe, it, expect } from 'vitest';
import { detectFillerWords, generateFillerRemovalFilter } from '@/lib/audio/filler-detection';
import type { WordTimestamp } from '@/lib/db/schema';

function makeWord(word: string, start: number, end: number): WordTimestamp {
  return { word, start, end };
}

describe('detectFillerWords', () => {
  describe('Portuguese filler detection', () => {
    it('detects a single Portuguese filler word', () => {
      const words: WordTimestamp[] = [
        makeWord('Olá', 0, 0.5),
        makeWord('hum', 0.5, 0.8),
        makeWord('tudo', 0.8, 1.2),
        makeWord('bem', 1.2, 1.5),
      ];

      const result = detectFillerWords(words, 'pt');

      expect(result).toHaveLength(1);
      expect(result[0].word).toBe('hum');
      expect(result[0].startTime).toBe(0.5);
      expect(result[0].endTime).toBe(0.8);
    });

    it('detects multiple filler words', () => {
      const words: WordTimestamp[] = [
        makeWord('eh', 0, 0.3),
        makeWord('vamos', 0.3, 0.7),
        makeWord('ah', 0.7, 1.0),
        makeWord('falar', 1.0, 1.4),
      ];

      const result = detectFillerWords(words, 'pt');

      expect(result).toHaveLength(2);
      expect(result.map((f) => f.word)).toEqual(['eh', 'ah']);
    });

    it('detects multi-word Portuguese filler "quer dizer"', () => {
      const words: WordTimestamp[] = [
        makeWord('ele', 0, 0.4),
        makeWord('quer', 0.4, 0.7),
        makeWord('dizer', 0.7, 1.1),
        makeWord('isso', 1.1, 1.5),
      ];

      const result = detectFillerWords(words, 'pt');

      expect(result).toHaveLength(1);
      expect(result[0].word).toBe('quer dizer');
      expect(result[0].startTime).toBe(0.4);
      expect(result[0].endTime).toBe(1.1);
    });

    it('returns empty array when no fillers present', () => {
      const words: WordTimestamp[] = [
        makeWord('Hoje', 0, 0.4),
        makeWord('foi', 0.4, 0.7),
        makeWord('um', 0.7, 0.9),
        makeWord('bom', 0.9, 1.2),
        makeWord('dia', 1.2, 1.6),
      ];

      const result = detectFillerWords(words, 'pt');
      expect(result).toHaveLength(0);
    });

    it('is case-insensitive', () => {
      const words: WordTimestamp[] = [
        makeWord('HUM', 0, 0.5),
        makeWord('Tipo', 0.5, 0.9),
      ];

      const result = detectFillerWords(words, 'pt');
      expect(result).toHaveLength(2);
    });
  });

  describe('English filler detection', () => {
    it('detects English filler words', () => {
      const words: WordTimestamp[] = [
        makeWord('I', 0, 0.2),
        makeWord('um', 0.2, 0.5),
        makeWord('think', 0.5, 0.9),
        makeWord('uh', 0.9, 1.1),
        makeWord('yes', 1.1, 1.5),
      ];

      const result = detectFillerWords(words, 'en');

      expect(result).toHaveLength(2);
      expect(result.map((f) => f.word)).toEqual(['um', 'uh']);
    });

    it('detects multi-word English filler "you know"', () => {
      const words: WordTimestamp[] = [
        makeWord('It', 0, 0.3),
        makeWord('is', 0.3, 0.5),
        makeWord('you', 0.5, 0.8),
        makeWord('know', 0.8, 1.1),
        makeWord('great', 1.1, 1.5),
      ];

      const result = detectFillerWords(words, 'en');

      expect(result).toHaveLength(1);
      expect(result[0].word).toBe('you know');
      expect(result[0].startTime).toBe(0.5);
      expect(result[0].endTime).toBe(1.1);
    });

    it('detects multi-word English filler "i mean"', () => {
      const words: WordTimestamp[] = [
        makeWord('i', 0, 0.2),
        makeWord('mean', 0.2, 0.5),
        makeWord('it', 0.5, 0.8),
      ];

      const result = detectFillerWords(words, 'en');
      const iMean = result.find((f) => f.word === 'i mean');
      expect(iMean).toBeDefined();
    });
  });

  describe('confidence scoring', () => {
    it('assigns higher confidence to classic fillers like "hum"', () => {
      const words: WordTimestamp[] = [
        makeWord('hum', 0, 0.3),
        makeWord('tipo', 0.3, 0.6),
      ];

      const result = detectFillerWords(words, 'pt');
      const hum = result.find((f) => f.word === 'hum');
      const tipo = result.find((f) => f.word === 'tipo');

      expect(hum).toBeDefined();
      expect(tipo).toBeDefined();
      expect(hum!.confidence).toBeGreaterThan(tipo!.confidence);
    });

    it('lowers confidence for "tipo" when followed by "de"', () => {
      const tipoFiller: WordTimestamp[] = [
        makeWord('tipo', 0, 0.3),
        makeWord('assim', 0.3, 0.7),
      ];
      const tipoNonFiller: WordTimestamp[] = [
        makeWord('tipo', 0, 0.3),
        makeWord('de', 0.3, 0.5),
        makeWord('coisa', 0.5, 0.9),
      ];

      const fillerResult = detectFillerWords(tipoFiller, 'pt');
      const nonFillerResult = detectFillerWords(tipoNonFiller, 'pt');

      expect(fillerResult[0].confidence).toBeGreaterThan(nonFillerResult[0].confidence);
    });

    it('confidence is always between 0.1 and 1', () => {
      const words: WordTimestamp[] = [
        makeWord('um', 0, 0.3),
        makeWord('like', 0.3, 0.6),
        makeWord('so', 0.6, 0.8),
        makeWord('uh', 0.8, 1.0),
      ];

      const result = detectFillerWords(words, 'en');
      for (const filler of result) {
        expect(filler.confidence).toBeGreaterThanOrEqual(0.1);
        expect(filler.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('includes surrounding words in context', () => {
      const words: WordTimestamp[] = [
        makeWord('Olá', 0, 0.4),
        makeWord('hum', 0.4, 0.7),
        makeWord('tudo', 0.7, 1.0),
      ];

      const result = detectFillerWords(words, 'pt');
      expect(result[0].context).toContain('hum');
      expect(result[0].context).toContain('Olá');
    });

    it('assigns segmentId as empty string (caller must set it)', () => {
      const words: WordTimestamp[] = [makeWord('hum', 0, 0.3)];
      const result = detectFillerWords(words, 'pt');
      expect(result[0].segmentId).toBe('');
    });
  });

  describe('edge cases', () => {
    it('handles empty word list', () => {
      const result = detectFillerWords([], 'pt');
      expect(result).toHaveLength(0);
    });

    it('handles single filler word', () => {
      const words: WordTimestamp[] = [makeWord('uh', 0, 0.3)];
      const result = detectFillerWords(words, 'en');
      expect(result).toHaveLength(1);
    });

    it('does not double-count when single word is also start of multi-word filler', () => {
      // "you know" is a multi-word filler; "you" alone is not a filler in EN
      const words: WordTimestamp[] = [
        makeWord('you', 0, 0.4),
        makeWord('know', 0.4, 0.8),
      ];

      const result = detectFillerWords(words, 'en');
      // Should find the multi-word filler, not "you" as a single-word filler
      const youKnow = result.filter((f) => f.word === 'you know');
      expect(youKnow).toHaveLength(1);
    });
  });
});

describe('generateFillerRemovalFilter', () => {
  it('returns empty string when no fillers are marked removed', () => {
    const fillers = [
      { id: '1', word: 'um', startTime: 1, endTime: 1.5, isRemoved: false } as never,
    ];

    const result = generateFillerRemovalFilter(fillers, 10);
    expect(result).toBe('');
  });

  it('generates filter keeping audio before and after a removed filler', () => {
    const fillers = [
      { id: '1', word: 'um', startTime: 2, endTime: 2.5, isRemoved: true } as never,
    ];

    const result = generateFillerRemovalFilter(fillers, 10);

    // Should include atrim filters and concat
    expect(result).toContain('atrim');
    expect(result).toContain('concat');
    // Should keep 0-2 and 2.5-10
    expect(result).toContain('start=0');
    expect(result).toContain('end=2');
    expect(result).toContain('start=2.5');
    expect(result).toContain('end=10');
  });

  it('handles filler at the very start of audio', () => {
    const fillers = [
      { id: '1', word: 'uh', startTime: 0, endTime: 0.5, isRemoved: true } as never,
    ];

    const result = generateFillerRemovalFilter(fillers, 5);
    // Should only keep 0.5-5 (no leading segment needed since filler starts at 0)
    expect(result).toContain('start=0.5');
    expect(result).toContain('end=5');
  });

  it('handles filler at the very end of audio', () => {
    const fillers = [
      { id: '1', word: 'uh', startTime: 9, endTime: 10, isRemoved: true } as never,
    ];

    const result = generateFillerRemovalFilter(fillers, 10);
    expect(result).toContain('start=0');
    expect(result).toContain('end=9');
    // No segment after the filler since it ends at audioDuration
  });

  it('handles multiple non-overlapping removed fillers', () => {
    const fillers = [
      { id: '1', word: 'um', startTime: 1, endTime: 1.5, isRemoved: true } as never,
      { id: '2', word: 'uh', startTime: 4, endTime: 4.3, isRemoved: true } as never,
    ];

    const result = generateFillerRemovalFilter(fillers, 8);

    // Expect 3 kept segments: [0-1], [1.5-4], [4.3-8]
    expect(result).toContain('concat=n=3');
  });
});
