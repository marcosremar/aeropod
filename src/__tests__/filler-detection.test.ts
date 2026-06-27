import { describe, it, expect } from 'vitest';
import { detectFillerWords, generateFillerRemovalFilter } from '@/lib/audio/filler-detection';
import type { WordTimestamp } from '@/lib/db/schema';
import type { FillerWord } from '@/lib/db/schema';

const makeWord = (word: string, start: number, end: number): WordTimestamp => ({
  word,
  start,
  end,
});

const makeFillerWord = (
  word: string,
  startTime: number,
  endTime: number,
  isRemoved: boolean
): FillerWord => ({
  id: `${word}-${startTime}`,
  segmentId: 'seg-1',
  projectId: 'proj-1',
  word,
  startTime,
  endTime,
  confidence: 0.9,
  isRemoved,
  createdAt: new Date(),
});

describe('detectFillerWords', () => {
  describe('Portuguese fillers', () => {
    it('detects single-word fillers in pt', () => {
      const words: WordTimestamp[] = [
        makeWord('Hello', 0, 0.5),
        makeWord('hum', 0.5, 0.9),
        makeWord('world', 0.9, 1.5),
      ];

      const result = detectFillerWords(words, 'pt');

      expect(result).toHaveLength(1);
      expect(result[0].word).toBe('hum');
      expect(result[0].startTime).toBe(0.5);
      expect(result[0].endTime).toBe(0.9);
    });

    it('detects multi-word fillers in pt', () => {
      const words: WordTimestamp[] = [
        makeWord('isso', 0, 0.5),
        makeWord('quer', 0.5, 0.9),
        makeWord('dizer', 0.9, 1.3),
        makeWord('tudo', 1.3, 1.8),
      ];

      const result = detectFillerWords(words, 'pt');

      const multiWordFiller = result.find((f) => f.word === 'quer dizer');
      expect(multiWordFiller).toBeDefined();
      expect(multiWordFiller!.startTime).toBe(0.5);
      expect(multiWordFiller!.endTime).toBe(1.3);
      expect(multiWordFiller!.confidence).toBe(0.9);
    });

    it('is case-insensitive', () => {
      const words: WordTimestamp[] = [
        makeWord('HUM', 0, 0.5),
        makeWord('Tipo', 0.5, 0.9),
      ];

      const result = detectFillerWords(words, 'pt');

      expect(result).toHaveLength(2);
    });

    it('includes context in filler result', () => {
      const words: WordTimestamp[] = [
        makeWord('before', 0, 0.5),
        makeWord('eh', 0.5, 0.8),
        makeWord('after', 0.8, 1.2),
      ];

      const result = detectFillerWords(words, 'pt');

      expect(result[0].context).toContain('before');
      expect(result[0].context).toContain('after');
      expect(result[0].context).toContain('[eh]');
    });

    it('returns empty array when no fillers found', () => {
      const words: WordTimestamp[] = [
        makeWord('This', 0, 0.3),
        makeWord('is', 0.3, 0.5),
        makeWord('clean', 0.5, 0.9),
      ];

      const result = detectFillerWords(words, 'pt');

      expect(result).toHaveLength(0);
    });
  });

  describe('English fillers', () => {
    it('detects English filler words', () => {
      const words: WordTimestamp[] = [
        makeWord('it', 0, 0.3),
        makeWord('was', 0.3, 0.6),
        makeWord('um', 0.6, 0.9),
        makeWord('great', 0.9, 1.3),
      ];

      const result = detectFillerWords(words, 'en');

      expect(result).toHaveLength(1);
      expect(result[0].word).toBe('um');
    });

    it('detects multi-word English fillers', () => {
      const words: WordTimestamp[] = [
        makeWord('you', 0, 0.4),
        makeWord('know', 0.4, 0.8),
        makeWord('the', 0.8, 1.0),
      ];

      const result = detectFillerWords(words, 'en');

      const youKnow = result.find((f) => f.word === 'you know');
      expect(youKnow).toBeDefined();
    });

    it('does not cross-contaminate languages', () => {
      // "tipo" is a pt filler but not en
      const words: WordTimestamp[] = [
        makeWord('tipo', 0, 0.5),
      ];

      const ptResult = detectFillerWords(words, 'pt');
      const enResult = detectFillerWords(words, 'en');

      expect(ptResult).toHaveLength(1);
      expect(enResult).toHaveLength(0);
    });
  });

  describe('confidence calculation', () => {
    it('assigns higher confidence to classic fillers like hum', () => {
      const words: WordTimestamp[] = [makeWord('hum', 0, 0.5)];
      const result = detectFillerWords(words, 'pt');

      expect(result[0].confidence).toBeGreaterThan(0.7);
    });

    it('reduces confidence for "tipo" followed by "de"', () => {
      const words: WordTimestamp[] = [
        makeWord('tipo', 0, 0.4),
        makeWord('de', 0.4, 0.7),
        makeWord('coisa', 0.7, 1.0),
      ];

      const result = detectFillerWords(words, 'pt');
      const tipoFiller = result.find((f) => f.word.toLowerCase() === 'tipo');

      // "tipo de" means "type of" — should have lower confidence
      expect(tipoFiller!.confidence).toBeLessThan(0.7);
    });
  });

  describe('edge cases', () => {
    it('handles empty word list', () => {
      const result = detectFillerWords([], 'pt');
      expect(result).toHaveLength(0);
    });

    it('handles single word list that is a filler', () => {
      const words: WordTimestamp[] = [makeWord('um', 0, 0.5)];
      const result = detectFillerWords(words, 'en');

      expect(result).toHaveLength(1);
      expect(result[0].context).toBe('[um]');
    });

    it('detects multiple fillers in one utterance', () => {
      const words: WordTimestamp[] = [
        makeWord('so', 0, 0.3),
        makeWord('we', 0.3, 0.6),
        makeWord('um', 0.6, 0.9),
        makeWord('like', 0.9, 1.2),
        makeWord('went', 1.2, 1.5),
      ];

      const result = detectFillerWords(words, 'en');

      const fillerWords = result.map((f) => f.word.toLowerCase());
      expect(fillerWords).toContain('so');
      expect(fillerWords).toContain('um');
      expect(fillerWords).toContain('like');
    });
  });
});

describe('generateFillerRemovalFilter', () => {
  it('returns empty string when no fillers are removed', () => {
    const fillers: FillerWord[] = [
      makeFillerWord('um', 5, 6, false),
      makeFillerWord('uh', 10, 11, false),
    ];

    const result = generateFillerRemovalFilter(fillers, 60);

    expect(result).toBe('');
  });

  it('generates a valid FFmpeg filter for a single filler', () => {
    const fillers: FillerWord[] = [
      makeFillerWord('um', 5, 6, true),
    ];

    const result = generateFillerRemovalFilter(fillers, 30);

    // Should keep [0, 5) and [6, 30)
    expect(result).toContain('atrim=start=0:end=5');
    expect(result).toContain('atrim=start=6:end=30');
    expect(result).toContain('concat=n=2:v=0:a=1');
  });

  it('generates correct segments when filler is at the start', () => {
    const fillers: FillerWord[] = [
      makeFillerWord('um', 0, 2, true),
    ];

    const result = generateFillerRemovalFilter(fillers, 30);

    // Only one keep segment: [2, 30)
    expect(result).toContain('atrim=start=2:end=30');
    expect(result).toContain('concat=n=1:v=0:a=1');
  });

  it('generates correct segments when filler is at the end', () => {
    const fillers: FillerWord[] = [
      makeFillerWord('uh', 28, 30, true),
    ];

    const result = generateFillerRemovalFilter(fillers, 30);

    // Only one keep segment: [0, 28)
    expect(result).toContain('atrim=start=0:end=28');
    expect(result).toContain('concat=n=1:v=0:a=1');
  });

  it('handles multiple removed fillers in order', () => {
    const fillers: FillerWord[] = [
      makeFillerWord('um', 5, 6, true),
      makeFillerWord('like', 15, 16, true),
    ];

    const result = generateFillerRemovalFilter(fillers, 60);

    // Keep [0,5), [6,15), [16,60)
    expect(result).toContain('atrim=start=0:end=5');
    expect(result).toContain('atrim=start=6:end=15');
    expect(result).toContain('atrim=start=16:end=60');
    expect(result).toContain('concat=n=3:v=0:a=1');
  });

  it('only removes fillers marked isRemoved=true', () => {
    const fillers: FillerWord[] = [
      makeFillerWord('um', 5, 6, true),
      makeFillerWord('like', 15, 16, false), // not removed
    ];

    const result = generateFillerRemovalFilter(fillers, 60);

    // Should only cut [5,6), keeping [0,5) and [6,60)
    expect(result).toContain('concat=n=2:v=0:a=1');
    expect(result).not.toContain('atrim=start=16');
  });

  it('produces output label in concat filter', () => {
    const fillers: FillerWord[] = [
      makeFillerWord('um', 5, 6, true),
    ];

    const result = generateFillerRemovalFilter(fillers, 30);

    expect(result).toContain('[out]');
  });
});
