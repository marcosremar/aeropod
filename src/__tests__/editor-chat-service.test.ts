import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditorChatService, type Segment } from '@/lib/ai/editor-chat';

// completeMock is shared so individual tests can override its return value.
const completeMock = vi.fn().mockResolvedValue({ content: '' });

// processMessage calls AIService (Groq) — mock the entire module so only
// pure methods are exercised without network.
vi.mock('@/lib/ai/AIService', () => ({
  getAIService: () => ({
    complete: completeMock,
  }),
  aiCompleteJSON: vi.fn(),
}));

vi.mock('@/lib/ai/semantic-search', () => ({
  getSemanticSearchService: () => ({
    search: vi.fn().mockResolvedValue([]),
  }),
}));

const makeSegment = (
  overrides: Partial<Segment> & { startTime: number; endTime: number; text: string; isSelected: boolean }
): Segment => ({
  id: 'seg-' + Math.random().toString(36).slice(2, 8),
  topic: null,
  interestScore: null,
  ...overrides,
});

describe('EditorChatService.generateSuggestions', () => {
  let service: EditorChatService;

  beforeEach(() => {
    service = new EditorChatService();
  });

  it('returns an empty array when there are no segments', async () => {
    const suggestions = await service.generateSuggestions([]);
    expect(suggestions).toEqual([]);
  });

  it('suggests removing low-interest segments when more than 5 have score < 5', async () => {
    const segments = Array.from({ length: 6 }, (_, i) =>
      makeSegment({ startTime: i * 10, endTime: i * 10 + 9, text: 'hello', isSelected: true, interestScore: 3 })
    );
    const suggestions = await service.generateSuggestions(segments);
    expect(suggestions.some(s => s.includes('baixo interesse'))).toBe(true);
  });

  it('does NOT suggest removing low-interest segments when exactly 5 have score < 5', async () => {
    const segments = Array.from({ length: 5 }, (_, i) =>
      makeSegment({ startTime: i * 10, endTime: i * 10 + 9, text: 'hello', isSelected: true, interestScore: 3 })
    );
    const suggestions = await service.generateSuggestions(segments);
    expect(suggestions.some(s => s.includes('baixo interesse'))).toBe(false);
  });

  it('suggests focusing on a specific topic when there are more than 3 distinct topics', async () => {
    const topics = ['intro', 'tech', 'history', 'future'];
    const segments = topics.map((topic, i) =>
      makeSegment({ startTime: i * 10, endTime: i * 10 + 9, text: 'text', isSelected: true, topic })
    );
    const suggestions = await service.generateSuggestions(segments);
    expect(suggestions.some(s => s.includes('topico especifico'))).toBe(true);
  });

  it('does NOT suggest focusing on a topic when there are exactly 3 distinct topics', async () => {
    const topics = ['intro', 'tech', 'history'];
    const segments = topics.map((topic, i) =>
      makeSegment({ startTime: i * 10, endTime: i * 10 + 9, text: 'text', isSelected: true, topic })
    );
    const suggestions = await service.generateSuggestions(segments);
    expect(suggestions.some(s => s.includes('topico especifico'))).toBe(false);
  });

  it('suggests adding more segments when selectedCount < 30% of total', async () => {
    // 10 segments total, only 2 selected (20% < 30%)
    const segments = Array.from({ length: 10 }, (_, i) =>
      makeSegment({ startTime: i * 10, endTime: i * 10 + 9, text: 'text', isSelected: i < 2 })
    );
    const suggestions = await service.generateSuggestions(segments);
    expect(suggestions.some(s => s.includes('Adicionar mais segmentos'))).toBe(true);
  });

  it('does NOT suggest adding more segments when selectedCount >= 30% of total', async () => {
    // 10 segments, 3 selected (exactly 30%)
    const segments = Array.from({ length: 10 }, (_, i) =>
      makeSegment({ startTime: i * 10, endTime: i * 10 + 9, text: 'text', isSelected: i < 3 })
    );
    const suggestions = await service.generateSuggestions(segments);
    expect(suggestions.some(s => s.includes('Adicionar mais segmentos'))).toBe(false);
  });

  it('suggests reducing length when selectedCount > 80% of total', async () => {
    // 10 segments, 9 selected (90% > 80%)
    const segments = Array.from({ length: 10 }, (_, i) =>
      makeSegment({ startTime: i * 10, endTime: i * 10 + 9, text: 'text', isSelected: i < 9 })
    );
    const suggestions = await service.generateSuggestions(segments);
    expect(suggestions.some(s => s.includes('conciso'))).toBe(true);
  });

  it('does NOT suggest reducing length when selectedCount <= 80% of total', async () => {
    // 10 segments, 8 selected (exactly 80%)
    const segments = Array.from({ length: 10 }, (_, i) =>
      makeSegment({ startTime: i * 10, endTime: i * 10 + 9, text: 'text', isSelected: i < 8 })
    );
    const suggestions = await service.generateSuggestions(segments);
    expect(suggestions.some(s => s.includes('conciso'))).toBe(false);
  });

  it('can return multiple suggestions at once', async () => {
    // Triggers: low-interest (6 segs with score < 5) + too many topics (4) + all selected (100% > 80%)
    const topics = ['a', 'b', 'c', 'd', 'e', 'f'];
    const segments = topics.map((topic, i) =>
      makeSegment({ startTime: i * 10, endTime: i * 10 + 9, text: 'text', isSelected: true, topic, interestScore: 2 })
    );
    const suggestions = await service.generateSuggestions(segments);
    expect(suggestions.length).toBeGreaterThanOrEqual(3);
  });

  it('segments with null interestScore count as score 0 (< 5) for the low-interest check', async () => {
    // 6 segments with no interestScore → all treated as 0 → triggers suggestion
    const segments = Array.from({ length: 6 }, (_, i) =>
      makeSegment({ startTime: i * 10, endTime: i * 10 + 9, text: 'text', isSelected: true, interestScore: null })
    );
    const suggestions = await service.generateSuggestions(segments);
    expect(suggestions.some(s => s.includes('baixo interesse'))).toBe(true);
  });

  it('ignores null topics when counting distinct topics', async () => {
    // 4 non-null topics, but 2 nulls that should be filtered out (still 4 distinct topics → suggest)
    const segments = [
      makeSegment({ startTime: 0, endTime: 9, text: 't', isSelected: true, topic: 'a' }),
      makeSegment({ startTime: 10, endTime: 19, text: 't', isSelected: true, topic: 'b' }),
      makeSegment({ startTime: 20, endTime: 29, text: 't', isSelected: true, topic: 'c' }),
      makeSegment({ startTime: 30, endTime: 39, text: 't', isSelected: true, topic: 'd' }),
      makeSegment({ startTime: 40, endTime: 49, text: 't', isSelected: true, topic: null }),
      makeSegment({ startTime: 50, endTime: 59, text: 't', isSelected: true, topic: null }),
    ];
    const suggestions = await service.generateSuggestions(segments);
    expect(suggestions.some(s => s.includes('topico especifico'))).toBe(true);
  });
});

// ─── EditorChatService.processMessage ────────────────────────────────────────

describe('EditorChatService.processMessage', () => {
  let service: EditorChatService;

  const seg = makeSegment({ startTime: 0, endTime: 30, text: 'Hello world', isSelected: true });

  beforeEach(() => {
    completeMock.mockReset();
    service = new EditorChatService();
  });

  it('returns empty actions and the response text when AI returns no JSON block', async () => {
    completeMock.mockResolvedValue({ content: 'Aqui está minha resposta simples.' });

    const result = await service.processMessage('olá', [seg]);

    expect(result.actions).toEqual([]);
    expect(result.response).toBe('Aqui está minha resposta simples.');
  });

  it('returns default message when AI response is empty', async () => {
    completeMock.mockResolvedValue({ content: '' });

    const result = await service.processMessage('olá', [seg]);

    expect(result.actions).toEqual([]);
    expect(result.response).toBe('Entendido! Processando sua solicitacao...');
  });

  it('extracts a single focus action from a valid JSON block', async () => {
    const aiResponse = [
      'Encontrei os segmentos relevantes.',
      '',
      '```json',
      JSON.stringify({
        actions: [
          { type: 'focus', segmentIds: ['seg-001', 'seg-002'], message: 'Destacando tópico' },
        ],
      }),
      '```',
    ].join('\n');
    completeMock.mockResolvedValue({ content: aiResponse });

    const result = await service.processMessage('me mostra a introducao', [seg]);

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe('focus');
    expect(result.actions[0].segmentIds).toEqual(['seg-001', 'seg-002']);
    expect(result.actions[0].message).toBe('Destacando tópico');
  });

  it('strips the JSON block from the returned response text', async () => {
    const aiResponse = [
      'Veja os segmentos.',
      '```json',
      JSON.stringify({ actions: [{ type: 'info', segmentIds: [], message: 'ok' }] }),
      '```',
    ].join('\n');
    completeMock.mockResolvedValue({ content: aiResponse });

    const result = await service.processMessage('busca', [seg]);

    expect(result.response).toBe('Veja os segmentos.');
    expect(result.response).not.toContain('```json');
  });

  it('extracts multiple actions from one JSON block', async () => {
    const aiResponse = [
      'Executando ações.',
      '```json',
      JSON.stringify({
        actions: [
          { type: 'select', segmentIds: ['seg-a'], message: 'Selecionando' },
          { type: 'deselect', segmentIds: ['seg-b'], message: 'Removendo' },
        ],
      }),
      '```',
    ].join('\n');
    completeMock.mockResolvedValue({ content: aiResponse });

    const result = await service.processMessage('seleciona intro, remove outro', [seg]);

    expect(result.actions).toHaveLength(2);
    expect(result.actions[0].type).toBe('select');
    expect(result.actions[1].type).toBe('deselect');
  });

  it('returns empty actions when the JSON block contains invalid JSON', async () => {
    const aiResponse = [
      'Resposta com JSON inválido.',
      '```json',
      '{ broken json :::',
      '```',
    ].join('\n');
    completeMock.mockResolvedValue({ content: aiResponse });

    const result = await service.processMessage('busca', [seg]);

    expect(result.actions).toEqual([]);
  });

  it('returns empty actions when JSON has no "actions" key', async () => {
    const aiResponse = [
      'Resposta.',
      '```json',
      JSON.stringify({ something: 'else' }),
      '```',
    ].join('\n');
    completeMock.mockResolvedValue({ content: aiResponse });

    const result = await service.processMessage('busca', [seg]);

    expect(result.actions).toEqual([]);
  });

  it('returns empty actions when JSON "actions" value is not an array', async () => {
    const aiResponse = [
      'Resposta.',
      '```json',
      JSON.stringify({ actions: { type: 'focus' } }),
      '```',
    ].join('\n');
    completeMock.mockResolvedValue({ content: aiResponse });

    const result = await service.processMessage('busca', [seg]);

    expect(result.actions).toEqual([]);
  });

  it('falls back gracefully when action is missing type or message fields', async () => {
    const aiResponse = [
      'Resposta.',
      '```json',
      JSON.stringify({ actions: [{ segmentIds: ['seg-x'] }] }),
      '```',
    ].join('\n');
    completeMock.mockResolvedValue({ content: aiResponse });

    const result = await service.processMessage('busca', [seg]);

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe('info');
    expect(result.actions[0].segmentIds).toEqual(['seg-x']);
    expect(result.actions[0].message).toBe('');
  });
});
