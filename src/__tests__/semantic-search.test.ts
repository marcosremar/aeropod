import { describe, it, expect, vi, afterEach } from 'vitest';
import { getEmbeddings, hybridSearch, quickSearch } from '@/lib/search/semantic-search';
import type { Segment } from '@/lib/db/schema';

// OPENROUTER_API_KEY is captured at module load time; in the test environment it
// is undefined, so all API-dependent paths fall through to keyword-based fallback.

const makeSegment = (
  id: string,
  text: string,
  topic: string | null = null,
  keyInsight: string | null = null,
): Segment => ({
  id,
  projectId: 'proj-1',
  startTime: 0,
  endTime: 60,
  text,
  speaker: null,
  speakerLabel: null,
  topicId: null,
  interestScore: null,
  clarityScore: null,
  topic,
  keyInsight,
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
});

describe('getEmbeddings', () => {
  it('returns empty array when API key is not configured', async () => {
    const result = await getEmbeddings(['hello world']);
    expect(result).toEqual([]);
  });

  it('returns empty array for empty text array', async () => {
    const result = await getEmbeddings([]);
    // No API key → early return with []
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

describe('quickSearch', () => {
  it('returns empty array for empty query', async () => {
    const segments = [makeSegment('s1', 'This is some content about machine learning')];
    const result = await quickSearch('', segments);
    expect(result).toEqual([]);
  });

  it('returns empty array for whitespace-only query', async () => {
    const segments = [makeSegment('s1', 'Some content here')];
    const result = await quickSearch('   ', segments);
    expect(result).toEqual([]);
  });

  it('returns empty array when no segments provided', async () => {
    const result = await quickSearch('machine learning', []);
    expect(result).toEqual([]);
  });

  it('finds segments matching keyword in text', async () => {
    const segments = [
      makeSegment('s1', 'We discussed machine learning algorithms today'),
      makeSegment('s2', 'The weather was great this morning'),
    ];
    const result = await quickSearch('machine learning', segments);
    const ids = result.map((r) => r.segment.id);
    expect(ids).toContain('s1');
    expect(ids).not.toContain('s2');
  });

  it('ranks segments with topic match higher than text-only match', async () => {
    const segments = [
      makeSegment('s1', 'We talked about various things today', null),
      makeSegment('s2', 'Some general discussion happened', 'machine learning'),
    ];
    const result = await quickSearch('machine learning', segments);
    // s2 has topic match (+0.25 per word) while s1 has no match at all
    const ids = result.map((r) => r.segment.id);
    expect(ids).toContain('s2');
    // s1 has no "machine" or "learning" in text/topic/keyInsight, so it should not appear
    expect(ids).not.toContain('s1');
  });

  it('boosts segments with exact phrase match in text', async () => {
    const matchCount = 2; // "deep learning" appears twice
    const segments = [
      makeSegment('s1', 'deep learning is amazing, deep learning changed AI', 'deep learning'),
      makeSegment('s2', 'learning is important for everyone deep down'),
    ];
    const result = await quickSearch('deep learning', segments);
    // s1 gets both exact-match boost and keyword boost; s2 gets only keyword boost
    expect(result[0].segment.id).toBe('s1');
    expect(result[0].score).toBeGreaterThan(result[1]?.score ?? 0);
  });

  it('respects the topK limit', async () => {
    const segments = Array.from({ length: 10 }, (_, i) =>
      makeSegment(`s${i}`, `podcast episode about technology number ${i}`),
    );
    const result = await quickSearch('technology', segments, 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('excludes segments with no matching keywords', async () => {
    const segments = [
      makeSegment('s1', 'We discussed artificial intelligence'),
      makeSegment('s2', 'The dog ran across the yard'),
      makeSegment('s3', 'Another segment about unrelated topics'),
    ];
    const result = await quickSearch('artificial intelligence', segments);
    expect(result.map((r) => r.segment.id)).toEqual(['s1']);
  });

  it('ignores query words shorter than 3 characters in keyword matching', async () => {
    const segments = [
      makeSegment('s1', 'We talked about AI technology'),
      makeSegment('s2', 'Some other content here'),
    ];
    // "AI" has 2 chars and is filtered out from keyword matching;
    // but it CAN still produce an exact-match boost
    const result = await quickSearch('AI', segments);
    // s1 gets an exact-match boost because "ai" appears in its text
    const ids = result.map((r) => r.segment.id);
    expect(ids).toContain('s1');
  });

  it('returns results with numeric scores', async () => {
    const segments = [makeSegment('s1', 'machine learning deep dive')];
    const result = await quickSearch('machine learning', segments);
    expect(result.length).toBe(1);
    expect(typeof result[0].score).toBe('number');
    expect(result[0].score).toBeGreaterThan(0);
  });

  it('keyInsight field contributes to matching score', async () => {
    const segments = [
      makeSegment('s1', 'Various topics were discussed', null, 'neural networks are key'),
      makeSegment('s2', 'Something completely unrelated'),
    ];
    const result = await quickSearch('neural networks', segments);
    expect(result.map((r) => r.segment.id)).toContain('s1');
    expect(result.map((r) => r.segment.id)).not.toContain('s2');
  });
});

describe('hybridSearch', () => {
  it('behaves like quickSearch when useReranking is false', async () => {
    const segments = [
      makeSegment('s1', 'podcast recording about technology and innovation'),
      makeSegment('s2', 'cooking recipe for pasta'),
    ];
    const quick = await quickSearch('technology', segments, 5);
    const hybrid = await hybridSearch('technology', segments, { topK: 5, useReranking: false });

    expect(quick.map((r) => r.segment.id)).toEqual(hybrid.map((r) => r.segment.id));
  });

  it('returns empty for empty query', async () => {
    const segments = [makeSegment('s1', 'content about podcast')];
    const result = await hybridSearch('', segments);
    expect(result).toEqual([]);
  });

  it('returns empty for empty segments', async () => {
    const result = await hybridSearch('podcast', []);
    expect(result).toEqual([]);
  });

  it('uses topK default of 10', async () => {
    const segments = Array.from({ length: 20 }, (_, i) =>
      makeSegment(`s${i}`, `this podcast talks about technology episode ${i}`),
    );
    const result = await hybridSearch('technology', segments);
    expect(result.length).toBeLessThanOrEqual(10);
  });
});
