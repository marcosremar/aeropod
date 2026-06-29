import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MockExportService,
  createExportService,
  TemplateExportService,
  FFmpegExportService,
  computePartsToKeep,
} from '@/lib/audio/export';
import type { AudioChunk } from '@/lib/audio/chunking';

// ─── MockExportService ────────────────────────────────────────────────────────

describe('MockExportService', () => {
  let service: MockExportService;

  beforeEach(() => {
    service = new MockExportService();
  });

  describe('extractSegment', () => {
    it('returns a Buffer', async () => {
      const buf = await service.extractSegment({
        inputPath: '/audio/ep1.mp3',
        startTime: 10,
        endTime: 30,
      });
      expect(buf).toBeInstanceOf(Buffer);
    });

    it('encodes inputPath, startTime, and endTime in the buffer content', async () => {
      const buf = await service.extractSegment({
        inputPath: '/audio/ep1.mp3',
        startTime: 5,
        endTime: 15,
      });
      const text = buf.toString();
      expect(text).toContain('/audio/ep1.mp3');
      expect(text).toContain('5');
      expect(text).toContain('15');
    });

    it('different segments produce different buffers', async () => {
      const buf1 = await service.extractSegment({ inputPath: 'a.mp3', startTime: 0, endTime: 10 });
      const buf2 = await service.extractSegment({ inputPath: 'b.mp3', startTime: 0, endTime: 10 });
      expect(buf1.toString()).not.toBe(buf2.toString());
    });
  });

  describe('concatenateSegments', () => {
    it('returns a Buffer', async () => {
      const buf = await service.concatenateSegments({
        segments: [
          { path: 'a.mp3', startTime: 0, endTime: 10 },
          { path: 'b.mp3', startTime: 0, endTime: 5 },
        ],
      });
      expect(buf).toBeInstanceOf(Buffer);
    });

    it('encodes all segment paths in the buffer content', async () => {
      const buf = await service.concatenateSegments({
        segments: [
          { path: 'intro.mp3', startTime: 0, endTime: 10 },
          { path: 'body.mp3', startTime: 5, endTime: 20 },
        ],
      });
      const text = buf.toString();
      expect(text).toContain('intro.mp3');
      expect(text).toContain('body.mp3');
    });

    it('encodes crossfadeDuration in the buffer content', async () => {
      const buf = await service.concatenateSegments({
        segments: [{ path: 'a.mp3', startTime: 0, endTime: 10 }],
        crossfadeDuration: 1.5,
      });
      const text = buf.toString();
      expect(text).toContain('1.5');
    });

    it('uses 0 crossfade when not provided', async () => {
      const buf = await service.concatenateSegments({
        segments: [{ path: 'a.mp3', startTime: 0, endTime: 10 }],
      });
      expect(buf.toString()).toContain('crossfade:0s');
    });
  });

  describe('extractChunks', () => {
    const makeChunk = (id: string, start: number, end: number): AudioChunk => ({
      id,
      startTime: start,
      endTime: end,
      text: 'chunk text',
      segmentIds: [],
    });

    it('returns an array with one Buffer per chunk', async () => {
      const chunks = [makeChunk('c1', 0, 10), makeChunk('c2', 10, 20)];
      const result = await service.extractChunks('/audio/ep.mp3', chunks);
      expect(result).toHaveLength(2);
      result.forEach(buf => expect(buf).toBeInstanceOf(Buffer));
    });

    it('returns empty array for zero chunks', async () => {
      const result = await service.extractChunks('/audio/ep.mp3', []);
      expect(result).toHaveLength(0);
    });

    it('encodes chunk id and inputPath in each buffer', async () => {
      const chunks = [makeChunk('my-chunk', 5, 15)];
      const [buf] = await service.extractChunks('/audio/ep.mp3', chunks);
      const text = buf.toString();
      expect(text).toContain('my-chunk');
      expect(text).toContain('/audio/ep.mp3');
    });

    it('defaults output format to mp3 when not specified', async () => {
      const [buf] = await service.extractChunks('ep.mp3', [makeChunk('c1', 0, 5)]);
      expect(buf.toString()).toContain('mp3');
    });

    it('uses the provided output format', async () => {
      const [buf] = await service.extractChunks('ep.mp3', [makeChunk('c1', 0, 5)], {
        outputFormat: 'wav',
      });
      expect(buf.toString()).toContain('wav');
    });
  });

  describe('setMockData / getMockData', () => {
    it('stores and retrieves a buffer by key', () => {
      const data = Buffer.from('custom-data');
      service.setMockData('myKey', data);
      expect(service.getMockData('myKey')).toBe(data);
    });

    it('returns undefined for an unknown key', () => {
      expect(service.getMockData('nonexistent')).toBeUndefined();
    });

    it('overwrites a previously stored key', () => {
      const first = Buffer.from('first');
      const second = Buffer.from('second');
      service.setMockData('k', first);
      service.setMockData('k', second);
      expect(service.getMockData('k')).toBe(second);
    });
  });
});

// ─── createExportService ──────────────────────────────────────────────────────

describe('createExportService', () => {
  it('returns a MockExportService when useMock=true', () => {
    const svc = createExportService(true);
    expect(svc).toBeInstanceOf(MockExportService);
  });

  it('returns an FFmpegExportService when useMock=false', () => {
    const svc = createExportService(false);
    expect(svc).toBeInstanceOf(FFmpegExportService);
  });

  it('returns an FFmpegExportService when called with no argument', () => {
    const svc = createExportService();
    expect(svc).toBeInstanceOf(FFmpegExportService);
  });
});

// ─── TemplateExportService – error / sort logic ───────────────────────────────

describe('TemplateExportService.exportTemplateBasedProject', () => {
  let svc: TemplateExportService;

  beforeEach(() => {
    svc = new TemplateExportService();
    // Stub the private ffmpegService so we don't invoke real FFmpeg.
    // Cast to any to reach the private field.
    const mockFfmpeg = {
      extractSegment: vi.fn().mockResolvedValue(Buffer.from('audio')),
      concatenateSegments: vi.fn().mockResolvedValue(Buffer.from('concat-audio')),
      extractChunks: vi.fn().mockResolvedValue([]),
    };
    (svc as any).ffmpegService = mockFfmpeg;
  });

  it('throws when sections array is empty', async () => {
    await expect(
      svc.exportTemplateBasedProject({ projectId: 'p1', sections: [] })
    ).rejects.toThrow('No sections to export');
  });

  it('throws when all sections have zero segments', async () => {
    await expect(
      svc.exportTemplateBasedProject({
        projectId: 'p1',
        sections: [{ sectionId: 's1', order: 1, segments: [] }],
      })
    ).rejects.toThrow('No sections with content to export');
  });

  it('skips sections with no segments and processes the rest', async () => {
    const result = await svc.exportTemplateBasedProject({
      projectId: 'p1',
      sections: [
        { sectionId: 's-empty', order: 1, segments: [] },
        {
          sectionId: 's-real',
          order: 2,
          segments: [{ audioPath: '/a.mp3', startTime: 0, endTime: 10 }],
        },
      ],
    });
    expect(result).toBeInstanceOf(Buffer);
  });

  it('returns a Buffer on success with one valid section', async () => {
    const result = await svc.exportTemplateBasedProject({
      projectId: 'p1',
      sections: [
        {
          sectionId: 's1',
          order: 1,
          segments: [{ audioPath: '/intro.mp3', startTime: 0, endTime: 30 }],
        },
      ],
    });
    expect(result).toBeInstanceOf(Buffer);
  });

  it('processes sections sorted by order, not insertion order', async () => {
    const extractCalls: number[] = [];
    (svc as any).ffmpegService.extractSegment = vi.fn().mockImplementation(
      ({ startTime }: { startTime: number }) => {
        extractCalls.push(startTime);
        return Promise.resolve(Buffer.from('audio'));
      }
    );
    // Stub private concatenation so we don't invoke real ffmpeg with streams
    (svc as any).concatenateSectionBuffers = vi
      .fn()
      .mockResolvedValue(Buffer.from('final'));

    await svc.exportTemplateBasedProject({
      projectId: 'p1',
      sections: [
        // Provided out of order: order 2 first, then order 1
        {
          sectionId: 's2',
          order: 2,
          segments: [{ audioPath: '/b.mp3', startTime: 200, endTime: 210 }],
        },
        {
          sectionId: 's1',
          order: 1,
          segments: [{ audioPath: '/a.mp3', startTime: 100, endTime: 110 }],
        },
      ],
    });

    // Section with order=1 (startTime=100) should be processed first
    expect(extractCalls[0]).toBe(100);
    expect(extractCalls[1]).toBe(200);
  });
});

// ─── computePartsToKeep ───────────────────────────────────────────────────────

describe('computePartsToKeep', () => {
  it('returns the full segment when there are no cuts', () => {
    const result = computePartsToKeep(10, 50, []);
    expect(result).toEqual([{ start: 10, end: 50 }]);
  });

  it('returns two parts when a single cut is in the middle', () => {
    // Segment: 0–100s; cut the middle 25–75%
    const result = computePartsToKeep(0, 100, [{ startPercent: 0.25, endPercent: 0.75 }]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ start: 0, end: 25 });
    expect(result[1]).toEqual({ start: 75, end: 100 });
  });

  it('returns one trailing part when cut covers the start', () => {
    const result = computePartsToKeep(0, 100, [{ startPercent: 0, endPercent: 0.4 }]);
    expect(result).toEqual([{ start: 40, end: 100 }]);
  });

  it('returns one leading part when cut covers the end', () => {
    const result = computePartsToKeep(0, 100, [{ startPercent: 0.6, endPercent: 1 }]);
    expect(result).toEqual([{ start: 0, end: 60 }]);
  });

  it('returns empty array when a single cut spans the entire segment', () => {
    const result = computePartsToKeep(0, 100, [{ startPercent: 0, endPercent: 1 }]);
    expect(result).toHaveLength(0);
  });

  it('merges overlapping cuts and returns correct kept ranges', () => {
    // cuts: 0.1–0.5 and 0.4–0.8 (overlap at 0.4–0.5)
    const result = computePartsToKeep(0, 100, [
      { startPercent: 0.1, endPercent: 0.5 },
      { startPercent: 0.4, endPercent: 0.8 },
    ]);
    // Keep: 0–10, 80–100
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ start: 0, end: 10 });
    expect(result[1]).toEqual({ start: 80, end: 100 });
  });

  it('handles cuts provided out of order by sorting them first', () => {
    // Same as previous test but cuts given in reverse order
    const result = computePartsToKeep(0, 100, [
      { startPercent: 0.4, endPercent: 0.8 },
      { startPercent: 0.1, endPercent: 0.5 },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ start: 0, end: 10 });
    expect(result[1]).toEqual({ start: 80, end: 100 });
  });

  it('handles two non-overlapping cuts and returns three parts', () => {
    const result = computePartsToKeep(0, 100, [
      { startPercent: 0.2, endPercent: 0.4 },
      { startPercent: 0.6, endPercent: 0.8 },
    ]);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ start: 0, end: 20 });
    expect(result[1]).toEqual({ start: 40, end: 60 });
    expect(result[2]).toEqual({ start: 80, end: 100 });
  });

  it('respects a non-zero startTime offset correctly', () => {
    // Segment starts at 30s, ends at 130s (100s duration)
    // Cut the first 50%: absolute range 30–80s removed, keep 80–130s
    const result = computePartsToKeep(30, 130, [{ startPercent: 0, endPercent: 0.5 }]);
    expect(result).toEqual([{ start: 80, end: 130 }]);
  });

  it('handles adjacent (touching) cuts as a single contiguous cut', () => {
    // Adjacent: first cut ends at 0.5, second starts at 0.5 — effectively one big cut
    const result = computePartsToKeep(0, 100, [
      { startPercent: 0.2, endPercent: 0.5 },
      { startPercent: 0.5, endPercent: 0.8 },
    ]);
    // The second cut starts exactly at lastEnd (0.5), so condition cut.startPercent > lastEnd is false
    // Keep: 0–20, 80–100
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ start: 0, end: 20 });
    expect(result[1]).toEqual({ start: 80, end: 100 });
  });

  it('does not mutate the original cuts array', () => {
    const cuts = [
      { startPercent: 0.6, endPercent: 0.8 },
      { startPercent: 0.2, endPercent: 0.4 },
    ];
    const original = cuts.map(c => ({ ...c }));
    computePartsToKeep(0, 100, cuts);
    expect(cuts).toEqual(original);
  });

  it('returns correct absolute times for a fractional segment', () => {
    // Segment: 5.5–15.5s (10s duration), cut 50–100%
    const result = computePartsToKeep(5.5, 15.5, [{ startPercent: 0.5, endPercent: 1 }]);
    expect(result).toEqual([{ start: 5.5, end: 10.5 }]);
  });
});
