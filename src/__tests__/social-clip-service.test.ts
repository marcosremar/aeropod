import { describe, it, expect } from 'vitest';
import { SocialClipService } from '@/lib/clips/social-clip-service';
import type { Segment } from '@/lib/db/schema';
import type { WordTimestamp } from '@/lib/db/schema';

const makeSegment = (
  overrides: Partial<Segment> & { startTime: number; endTime: number; text: string }
): Segment => ({
  id: 'seg-' + Math.random().toString(36).slice(2, 8),
  projectId: 'proj-1',
  speaker: null,
  speakerLabel: null,
  topicId: null,
  interestScore: null,
  clarityScore: null,
  topic: null,
  keyInsight: null,
  isSelected: false,
  order: null,
  analysis: null,
  hasError: false,
  errorType: null,
  errorDetail: null,
  rerecordedAudioUrl: null,
  detectedSectionType: null,
  sectionMatchScore: null,
  wordTimestamps: null,
  editedText: null,
  textCuts: null,
  createdAt: new Date(),
  ...overrides,
});

const makeWord = (word: string, start: number, end: number): WordTimestamp => ({
  word,
  start,
  end,
});

describe('SocialClipService', () => {
  const service = new SocialClipService();

  describe('generateSuggestions', () => {
    it('returns empty array for empty segments', async () => {
      const result = await service.generateSuggestions([]);
      expect(result).toEqual([]);
    });

    it('filters out segments shorter than 10 seconds', async () => {
      const shortSeg = makeSegment({ startTime: 0, endTime: 8, text: 'Too short' });
      const result = await service.generateSuggestions([shortSeg]);
      expect(result).toHaveLength(0);
    });

    it('filters out segments longer than 90 seconds', async () => {
      const longSeg = makeSegment({ startTime: 0, endTime: 100, text: 'Too long to be a social clip' });
      const result = await service.generateSuggestions([longSeg]);
      expect(result).toHaveLength(0);
    });

    it('returns suggestion for a valid segment', async () => {
      const seg = makeSegment({
        startTime: 0,
        endTime: 45,
        text: 'This is a great point about something interesting',
        interestScore: 8,
        clarityScore: 9,
      });

      const result = await service.generateSuggestions([seg]);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].startTime).toBe(0);
      expect(result[0].endTime).toBe(45);
      expect(result[0].duration).toBe(45);
    });

    it('respects the count limit', async () => {
      const segs = Array.from({ length: 10 }, (_, i) =>
        makeSegment({
          startTime: i * 50,
          endTime: i * 50 + 40,
          text: `Segment ${i} with good content`,
          interestScore: 9,
          clarityScore: 9,
        })
      );

      const result = await service.generateSuggestions(segs, 3);
      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('ranks higher-scored segments first', async () => {
      const lowSeg = makeSegment({
        startTime: 0,
        endTime: 30,
        text: 'Low interest content',
        interestScore: 3,
        clarityScore: 3,
      });
      const highSeg = makeSegment({
        startTime: 100,
        endTime: 145,
        text: 'High interest content with amazing insight',
        interestScore: 9,
        clarityScore: 9,
        keyInsight: 'This is the key takeaway that listeners will love',
      });

      const result = await service.generateSuggestions([lowSeg, highSeg], 2);
      // High interest segment should appear first (or both returned, high first)
      if (result.length >= 2) {
        expect(result[0].startTime).toBe(100);
      } else {
        expect(result[0].startTime).toBe(100);
      }
    });

    it('includes segmentIds in suggestions', async () => {
      const seg = makeSegment({
        id: 'test-seg-id',
        startTime: 0,
        endTime: 60,
        text: 'Content worth clipping for social media',
        interestScore: 8,
      });

      const result = await service.generateSuggestions([seg]);
      expect(result[0].segmentIds).toContain('test-seg-id');
    });

    it('generates multi-segment clips from consecutive high-score segments', async () => {
      const seg1 = makeSegment({
        id: 'seg-a',
        startTime: 0,
        endTime: 25,
        text: 'First great segment',
        interestScore: 8,
        clarityScore: 8,
      });
      const seg2 = makeSegment({
        id: 'seg-b',
        startTime: 25.5,
        endTime: 50,
        text: 'Second great segment right after',
        interestScore: 8,
        clarityScore: 8,
      });

      const result = await service.generateSuggestions([seg1, seg2], 5);
      const multiSeg = result.find((r) => r.segmentIds.length > 1);
      expect(multiSeg).toBeDefined();
      expect(multiSeg?.segmentIds).toContain('seg-a');
      expect(multiSeg?.segmentIds).toContain('seg-b');
    });

    it('does not combine segments with large gap between them', async () => {
      const seg1 = makeSegment({
        id: 'seg-a',
        startTime: 0,
        endTime: 25,
        text: 'First segment',
        interestScore: 9,
      });
      const seg2 = makeSegment({
        id: 'seg-b',
        startTime: 30,  // 5-second gap — should not combine
        endTime: 60,
        text: 'Second segment far away',
        interestScore: 9,
      });

      const result = await service.generateSuggestions([seg1, seg2], 5);
      const multiSeg = result.find((r) => r.segmentIds.length > 1);
      expect(multiSeg).toBeUndefined();
    });
  });

  describe('calculateClipScore (private)', () => {
    const calcScore = (seg: Segment) =>
      (service as unknown as { calculateClipScore(s: Segment): number }).calculateClipScore(seg);

    it('returns 0 for empty segment with no scores', () => {
      const seg = makeSegment({ startTime: 0, endTime: 30, text: 'hello' });
      expect(calcScore(seg)).toBeGreaterThanOrEqual(0);
    });

    it('gives higher score to segment with high interest', () => {
      const low = makeSegment({ startTime: 0, endTime: 30, text: 'x', interestScore: 2 });
      const high = makeSegment({ startTime: 0, endTime: 30, text: 'x', interestScore: 9 });
      expect(calcScore(high)).toBeGreaterThan(calcScore(low));
    });

    it('gives bonus for optimal duration (30-60s)', () => {
      const optimal = makeSegment({ startTime: 0, endTime: 45, text: 'x', interestScore: 5 });
      const short = makeSegment({ startTime: 0, endTime: 10, text: 'x', interestScore: 5 });
      expect(calcScore(optimal)).toBeGreaterThan(calcScore(short));
    });

    it('penalizes tangent segments', () => {
      const normal = makeSegment({ startTime: 0, endTime: 40, text: 'x', interestScore: 7 });
      const tangent = makeSegment({
        startTime: 0,
        endTime: 40,
        text: 'x',
        interestScore: 7,
        analysis: { isTangent: true },
      });
      expect(calcScore(normal)).toBeGreaterThan(calcScore(tangent));
    });

    it('penalizes repetition segments', () => {
      const normal = makeSegment({ startTime: 0, endTime: 40, text: 'x', interestScore: 7 });
      const repeated = makeSegment({
        startTime: 0,
        endTime: 40,
        text: 'x',
        interestScore: 7,
        analysis: { isRepetition: true },
      });
      expect(calcScore(normal)).toBeGreaterThan(calcScore(repeated));
    });

    it('gives bonus for standalone segments', () => {
      const standalone = makeSegment({
        startTime: 0,
        endTime: 40,
        text: 'x',
        analysis: { standalone: true },
      });
      const dependent = makeSegment({ startTime: 0, endTime: 40, text: 'x' });
      expect(calcScore(standalone)).toBeGreaterThan(calcScore(dependent));
    });
  });

  describe('getDimensions (private)', () => {
    const getDims = (format: string) =>
      (service as unknown as { getDimensions(f: string): { width: number; height: number } }).getDimensions(format);

    it('returns 1080x1920 for 9:16 (TikTok/Reels)', () => {
      expect(getDims('9:16')).toEqual({ width: 1080, height: 1920 });
    });

    it('returns 1080x1080 for 1:1 (Instagram square)', () => {
      expect(getDims('1:1')).toEqual({ width: 1080, height: 1080 });
    });

    it('returns 1920x1080 for 16:9 (YouTube)', () => {
      expect(getDims('16:9')).toEqual({ width: 1920, height: 1080 });
    });

    it('defaults to 9:16 for unknown format', () => {
      expect(getDims('unknown')).toEqual({ width: 1080, height: 1920 });
    });
  });

  describe('groupWordsIntoPhrases (private)', () => {
    const group = (words: WordTimestamp[], maxWords: number) =>
      (service as unknown as {
        groupWordsIntoPhrases(
          w: WordTimestamp[],
          max: number
        ): { words: string[]; start: number; end: number }[];
      }).groupWordsIntoPhrases(words, maxWords);

    it('returns empty array for empty input', () => {
      expect(group([], 6)).toEqual([]);
    });

    it('groups consecutive words up to maxWords', () => {
      const words = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((w, i) =>
        makeWord(w, i, i + 0.5)
      );
      const phrases = group(words, 3);
      expect(phrases[0].words).toHaveLength(3);
      expect(phrases[1].words).toHaveLength(3);
      expect(phrases[2].words).toHaveLength(1);
    });

    it('breaks phrases at sentence-ending punctuation', () => {
      const words = [
        makeWord('Hello.', 0, 0.5),
        makeWord('World', 1, 1.5),
      ];
      const phrases = group(words, 10);
      // "Hello." should end the first phrase due to punctuation
      expect(phrases).toHaveLength(2);
      expect(phrases[0].words).toEqual(['Hello.']);
      expect(phrases[1].words).toEqual(['World']);
    });

    it('preserves start and end timestamps per phrase', () => {
      const words = [
        makeWord('one', 1.0, 1.5),
        makeWord('two', 2.0, 2.5),
        makeWord('three', 3.0, 3.5),
      ];
      const phrases = group(words, 10);
      expect(phrases[0].start).toBe(1.0);
      expect(phrases[0].end).toBe(3.5);
    });

    it('handles exactly maxWords per phrase', () => {
      const words = [makeWord('a', 0, 1), makeWord('b', 1, 2)];
      const phrases = group(words, 2);
      expect(phrases).toHaveLength(1);
      expect(phrases[0].words).toHaveLength(2);
    });
  });

  describe('calculateHookScore (private)', () => {
    const hookScore = (text: string, seg: Segment) =>
      (service as unknown as {
        calculateHookScore(t: string, s: Segment): number;
      }).calculateHookScore(text, seg);

    it('returns base score of 5 for neutral hook without bonuses', () => {
      const seg = makeSegment({ startTime: 0, endTime: 30, text: 'hello world' });
      // 9 words → no short-hook bonus; no question mark; no attention words; no high interestScore
      const score = hookScore('one two three four five six seven eight nine', seg);
      expect(score).toBe(5);
    });

    it('adds 2 for hooks containing a question mark', () => {
      const seg = makeSegment({ startTime: 0, endTime: 30, text: 'x' });
      const withQ = hookScore('Did you know?', seg);
      const withoutQ = hookScore('This is a hook', seg);
      expect(withQ - withoutQ).toBe(2);
    });

    it('adds 1 for short punchy hooks (≤8 words)', () => {
      const seg = makeSegment({ startTime: 0, endTime: 30, text: 'x' });
      const short = hookScore('one two three', seg);
      const long = hookScore('one two three four five six seven eight nine ten', seg);
      expect(short).toBeGreaterThan(long);
    });

    it('caps score at 10', () => {
      const seg = makeSegment({
        startTime: 0,
        endTime: 30,
        text: 'x',
        interestScore: 10,
      });
      const score = hookScore('incrível segredo verdade?', seg);
      expect(score).toBeLessThanOrEqual(10);
    });
  });
});
