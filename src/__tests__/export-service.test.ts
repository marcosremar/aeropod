import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MockExportService,
  createExportService,
  TemplateExportService,
  FFmpegExportService,
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
