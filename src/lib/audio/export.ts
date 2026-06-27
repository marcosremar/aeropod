import { PassThrough } from 'stream';
import { AudioChunk } from './chunking';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpeg = require('fluent-ffmpeg');

export interface ExportOptions {
  outputFormat?: 'mp3' | 'wav' | 'aac' | 'ogg';
  bitrate?: string; // e.g., '128k', '192k', '320k'
  sampleRate?: number; // e.g., 44100, 48000
  channels?: number; // 1 for mono, 2 for stereo
}

export interface TextCutRange {
  startPercent: number; // 0-1, percentage of segment duration
  endPercent: number; // 0-1, percentage of segment duration
}

export interface SegmentExportOptions {
  inputPath: string;
  startTime: number; // seconds
  endTime: number; // seconds
  outputFormat?: 'mp3' | 'wav' | 'aac' | 'ogg';
  textCuts?: TextCutRange[]; // Ranges to cut from this segment
}

export interface ConcatenateOptions {
  segments: {
    path: string;
    startTime?: number;
    endTime?: number;
  }[];
  crossfadeDuration?: number; // seconds, default 0.5
  outputFormat?: 'mp3' | 'wav' | 'aac' | 'ogg';
  bitrate?: string;
}

export interface ExportService {
  extractSegment(options: SegmentExportOptions): Promise<Buffer>;
  concatenateSegments(options: ConcatenateOptions): Promise<Buffer>;
  extractChunks(inputPath: string, chunks: AudioChunk[], exportOptions?: ExportOptions): Promise<Buffer[]>;
}

/**
 * Computes the time ranges to KEEP given a set of percentage-based cuts.
 * The inverse of the cuts — what's left after removing them.
 * Handles overlapping cuts and edge cases (cuts at start/end).
 */
export function computePartsToKeep(
  startTime: number,
  endTime: number,
  cuts: TextCutRange[]
): Array<{ start: number; end: number }> {
  const duration = endTime - startTime;
  const sortedCuts = [...cuts].sort((a, b) => a.startPercent - b.startPercent);
  const partsToKeep: { start: number; end: number }[] = [];
  let lastEnd = 0;

  for (const cut of sortedCuts) {
    if (cut.startPercent > lastEnd) {
      partsToKeep.push({
        start: startTime + lastEnd * duration,
        end: startTime + cut.startPercent * duration,
      });
    }
    lastEnd = Math.max(lastEnd, cut.endPercent);
  }

  if (lastEnd < 1) {
    partsToKeep.push({
      start: startTime + lastEnd * duration,
      end: endTime,
    });
  }

  return partsToKeep;
}

export class FFmpegExportService implements ExportService {
  /**
   * Extracts a segment from an audio file, optionally with text cuts removed
   */
  async extractSegment(options: SegmentExportOptions): Promise<Buffer> {
    const { textCuts } = options;

    // If there are text cuts, we need to extract parts and concatenate
    if (textCuts && textCuts.length > 0) {
      return this.extractSegmentWithCuts(options);
    }

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = new PassThrough();

      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);

      const command = ffmpeg(options.inputPath)
        .setStartTime(options.startTime)
        .setDuration(options.endTime - options.startTime)
        .audioCodec(this.getCodec(options.outputFormat || 'mp3'))
        .format(options.outputFormat || 'mp3')
        .on('error', reject);

      command.pipe(stream, { end: true });
    });
  }

  /**
   * Extracts a segment with text cuts removed
   * Calculates which parts to keep and concatenates them
   */
  private async extractSegmentWithCuts(options: SegmentExportOptions): Promise<Buffer> {
    const { inputPath, startTime, endTime, textCuts = [], outputFormat = 'mp3' } = options;

    const partsToKeep = computePartsToKeep(startTime, endTime, textCuts);

    // If no parts to keep (unlikely), return empty buffer
    if (partsToKeep.length === 0) {
      return Buffer.alloc(0);
    }

    // If only one part, extract it directly
    if (partsToKeep.length === 1) {
      const part = partsToKeep[0];
      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const stream = new PassThrough();

        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);

        const command = ffmpeg(inputPath)
          .setStartTime(part.start)
          .setDuration(part.end - part.start)
          .audioCodec(this.getCodec(outputFormat))
          .format(outputFormat)
          .on('error', reject);

        command.pipe(stream, { end: true });
      });
    }

    // Multiple parts - concatenate them
    return this.concatenateSegments({
      segments: partsToKeep.map(part => ({
        path: inputPath,
        startTime: part.start,
        endTime: part.end
      })),
      crossfadeDuration: 0.05, // Very small crossfade for seamless cuts
      outputFormat
    });
  }

  /**
   * Concatenates multiple audio segments with optional crossfade
   */
  async concatenateSegments(options: ConcatenateOptions): Promise<Buffer> {
    if (options.segments.length === 0) {
      throw new Error('No segments to concatenate');
    }

    if (options.segments.length === 1) {
      // If only one segment, just extract it
      const segment = options.segments[0];
      return this.extractSegment({
        inputPath: segment.path,
        startTime: segment.startTime || 0,
        endTime: segment.endTime || 0,
        outputFormat: options.outputFormat,
      });
    }

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = new PassThrough();

      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);

      const crossfade = options.crossfadeDuration || 0.5;
      const hasMultipleSources = new Set(options.segments.map(s => s.path)).size > 1;

      if (!hasMultipleSources || crossfade === 0) {
        // Simple concatenation without crossfade
        this.simpleConcatenate(options, stream, reject);
      } else {
        // Concatenation with crossfade
        this.crossfadeConcatenate(options, stream, reject, crossfade);
      }
    });
  }

  /**
   * Extracts multiple chunks from a single audio file
   */
  async extractChunks(
    inputPath: string,
    chunks: AudioChunk[],
    exportOptions: ExportOptions = {}
  ): Promise<Buffer[]> {
    const promises = chunks.map(chunk =>
      this.extractSegment({
        inputPath,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
        outputFormat: exportOptions.outputFormat || 'mp3',
      })
    );

    return Promise.all(promises);
  }

  private simpleConcatenate(
    options: ConcatenateOptions,
    stream: PassThrough,
    reject: (error: Error) => void
  ): void {
    const command = ffmpeg();

    // Add all segments as inputs
    options.segments.forEach(segment => {
      const input = command.input(segment.path);
      if (segment.startTime !== undefined && segment.endTime !== undefined) {
        input.setStartTime(segment.startTime);
        input.setDuration(segment.endTime - segment.startTime);
      }
    });

    // Create filter complex for concatenation
    const filterComplex = options.segments
      .map((_, i) => `[${i}:a]`)
      .join('') + `concat=n=${options.segments.length}:v=0:a=1[out]`;

    command
      .complexFilter(filterComplex)
      .outputOptions(['-map', '[out]'])
      .audioCodec(this.getCodec(options.outputFormat || 'mp3'))
      .format(options.outputFormat || 'mp3');

    if (options.bitrate) {
      command.audioBitrate(options.bitrate);
    }

    command.on('error', reject);
    command.pipe(stream, { end: true });
  }

  private crossfadeConcatenate(
    options: ConcatenateOptions,
    stream: PassThrough,
    reject: (error: Error) => void,
    crossfade: number
  ): void {
    const command = ffmpeg();

    // Add all segments as inputs
    options.segments.forEach(segment => {
      const input = command.input(segment.path);
      if (segment.startTime !== undefined && segment.endTime !== undefined) {
        input.setStartTime(segment.startTime);
        input.setDuration(segment.endTime - segment.startTime);
      }
    });

    // Build complex filter for crossfading
    let filterComplex = '';
    let previousOutput = '[0:a]';

    for (let i = 1; i < options.segments.length; i++) {
      const currentInput = `[${i}:a]`;
      const outputLabel = i === options.segments.length - 1 ? '[out]' : `[a${i}]`;

      filterComplex += `${previousOutput}${currentInput}acrossfade=d=${crossfade}:c1=tri:c2=tri${outputLabel};`;
      previousOutput = outputLabel;
    }

    // Remove trailing semicolon
    filterComplex = filterComplex.slice(0, -1);

    command
      .complexFilter(filterComplex)
      .outputOptions(['-map', '[out]'])
      .audioCodec(this.getCodec(options.outputFormat || 'mp3'))
      .format(options.outputFormat || 'mp3');

    if (options.bitrate) {
      command.audioBitrate(options.bitrate);
    }

    command.on('error', reject);
    command.pipe(stream, { end: true });
  }

  private getCodec(format: string): string {
    const codecs: Record<string, string> = {
      mp3: 'libmp3lame',
      wav: 'pcm_s16le',
      aac: 'aac',
      ogg: 'libvorbis',
    };
    return codecs[format] || 'libmp3lame';
  }
}

export class MockExportService implements ExportService {
  private mockData: Map<string, Buffer> = new Map();

  constructor() {
    // Initialize with some mock data
    this.mockData.set('default', Buffer.from('mock-audio-data'));
  }

  async extractSegment(options: SegmentExportOptions): Promise<Buffer> {
    // Simulate processing delay
    await this.delay(100);

    const duration = options.endTime - options.startTime;
    const mockData = Buffer.from(
      `mock-segment-${options.inputPath}-${options.startTime}-${options.endTime}-${duration}s`
    );

    return mockData;
  }

  async concatenateSegments(options: ConcatenateOptions): Promise<Buffer> {
    // Simulate processing delay
    await this.delay(200);

    const segmentDescriptions = options.segments
      .map(s => `${s.path}:${s.startTime || 0}-${s.endTime || 'end'}`)
      .join('|');

    const mockData = Buffer.from(
      `mock-concatenated-${segmentDescriptions}-crossfade:${options.crossfadeDuration || 0}s`
    );

    return mockData;
  }

  async extractChunks(
    inputPath: string,
    chunks: AudioChunk[],
    exportOptions: ExportOptions = {}
  ): Promise<Buffer[]> {
    // Simulate processing delay
    await this.delay(150);

    return chunks.map(chunk =>
      Buffer.from(
        `mock-chunk-${chunk.id}-${inputPath}-${chunk.startTime}-${chunk.endTime}-${exportOptions.outputFormat || 'mp3'}`
      )
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Helper methods for testing
  setMockData(key: string, data: Buffer): void {
    this.mockData.set(key, data);
  }

  getMockData(key: string): Buffer | undefined {
    return this.mockData.get(key);
  }
}

// Factory function to create export service
export function createExportService(useMock = false): ExportService {
  if (useMock) {
    return new MockExportService();
  }

  return new FFmpegExportService();
}

// ============================================
// Template-Based Export Service
// ============================================

export interface SectionExportSettings {
  sectionId: string;
  volume: number; // 0-200 (percentage)
  fadeIn: number; // seconds
  fadeOut: number; // seconds
  trimStart: number; // seconds
  trimEnd: number; // seconds
  normalizeVolume: boolean;
}

export interface TemplateExportOptions {
  projectId: string;
  sections: Array<{
    sectionId: string;
    order: number;
    segments: Array<{
      audioPath: string;
      startTime: number;
      endTime: number;
    }>;
    settings?: SectionExportSettings;
  }>;
  outputFormat?: 'mp3' | 'wav' | 'aac' | 'ogg';
  bitrate?: string;
  crossfadeDuration?: number;
  normalizeOutput?: boolean;
}

export class TemplateExportService {
  private ffmpegService: FFmpegExportService;

  constructor() {
    this.ffmpegService = new FFmpegExportService();
  }

  /**
   * Export a project based on template section ordering
   * Processes each section with its editing rules and concatenates
   */
  async exportTemplateBasedProject(options: TemplateExportOptions): Promise<Buffer> {
    const { sections, outputFormat = 'mp3', bitrate = '192k', crossfadeDuration = 0.3 } = options;

    if (sections.length === 0) {
      throw new Error('No sections to export');
    }

    // Sort sections by order
    const sortedSections = [...sections].sort((a, b) => a.order - b.order);

    // Process each section
    const sectionBuffers: Buffer[] = [];

    for (const section of sortedSections) {
      if (section.segments.length === 0) {
        console.warn(`Section ${section.sectionId} has no segments, skipping`);
        continue;
      }

      // Concatenate segments within this section
      const sectionBuffer = await this.processSectionSegments(section, outputFormat);

      // Apply section-level settings if provided
      if (section.settings) {
        const processedBuffer = await this.applySectionSettings(
          sectionBuffer,
          section.settings,
          outputFormat
        );
        sectionBuffers.push(processedBuffer);
      } else {
        sectionBuffers.push(sectionBuffer);
      }
    }

    if (sectionBuffers.length === 0) {
      throw new Error('No sections with content to export');
    }

    if (sectionBuffers.length === 1) {
      return sectionBuffers[0];
    }

    // Concatenate all sections with crossfade
    return this.concatenateSectionBuffers(sectionBuffers, {
      crossfadeDuration,
      outputFormat,
      bitrate,
    });
  }

  /**
   * Process segments within a section
   */
  private async processSectionSegments(
    section: TemplateExportOptions['sections'][0],
    outputFormat: string
  ): Promise<Buffer> {
    const { segments } = section;

    if (segments.length === 1) {
      const seg = segments[0];
      return this.ffmpegService.extractSegment({
        inputPath: seg.audioPath,
        startTime: seg.startTime,
        endTime: seg.endTime,
        outputFormat: outputFormat as any,
      });
    }

    // Multiple segments - concatenate them
    return this.ffmpegService.concatenateSegments({
      segments: segments.map(seg => ({
        path: seg.audioPath,
        startTime: seg.startTime,
        endTime: seg.endTime,
      })),
      crossfadeDuration: 0.1, // Small crossfade within section
      outputFormat: outputFormat as any,
    });
  }

  /**
   * Apply section-level editing settings (volume, fade, trim)
   */
  private async applySectionSettings(
    inputBuffer: Buffer,
    settings: SectionExportSettings,
    outputFormat: string
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const { PassThrough } = require('stream');
      const chunks: Buffer[] = [];
      const stream = new PassThrough();

      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);

      // Create input stream from buffer
      const inputStream = new PassThrough();
      inputStream.end(inputBuffer);

      const ffmpeg = require('fluent-ffmpeg');
      const command = ffmpeg(inputStream);

      // Build audio filters
      const audioFilters: string[] = [];

      // Volume adjustment
      if (settings.volume !== 100) {
        const volumeMultiplier = settings.volume / 100;
        audioFilters.push(`volume=${volumeMultiplier}`);
      }

      // Fade in
      if (settings.fadeIn > 0) {
        audioFilters.push(`afade=t=in:st=0:d=${settings.fadeIn}`);
      }

      // Fade out (requires duration - will be calculated from input)
      if (settings.fadeOut > 0) {
        // Note: For proper fade out, we'd need to know duration
        // For now, we apply a generic fade out at the end
        audioFilters.push(`afade=t=out:st=-${settings.fadeOut}:d=${settings.fadeOut}`);
      }

      // Normalize volume
      if (settings.normalizeVolume) {
        audioFilters.push('loudnorm=I=-16:LRA=11:TP=-1.5');
      }

      // Trim
      if (settings.trimStart > 0 || settings.trimEnd > 0) {
        command.setStartTime(settings.trimStart);
        // Note: For trim end, we'd need to calculate based on duration
      }

      if (audioFilters.length > 0) {
        command.audioFilters(audioFilters);
      }

      command
        .audioCodec(this.getCodec(outputFormat))
        .format(outputFormat)
        .on('error', reject);

      command.pipe(stream, { end: true });
    });
  }

  /**
   * Concatenate section buffers with crossfade
   */
  private async concatenateSectionBuffers(
    buffers: Buffer[],
    options: {
      crossfadeDuration: number;
      outputFormat: string;
      bitrate: string;
    }
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const { PassThrough } = require('stream');
      const chunks: Buffer[] = [];
      const stream = new PassThrough();

      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);

      const ffmpeg = require('fluent-ffmpeg');
      const command = ffmpeg();

      // Add each buffer as an input
      buffers.forEach((buffer, index) => {
        const inputStream = new PassThrough();
        inputStream.end(buffer);
        command.input(inputStream);
      });

      // Build concatenation filter
      if (options.crossfadeDuration > 0 && buffers.length > 1) {
        // Crossfade between sections
        let filterComplex = '';
        let previousOutput = '[0:a]';

        for (let i = 1; i < buffers.length; i++) {
          const currentInput = `[${i}:a]`;
          const outputLabel = i === buffers.length - 1 ? '[out]' : `[a${i}]`;
          filterComplex += `${previousOutput}${currentInput}acrossfade=d=${options.crossfadeDuration}:c1=tri:c2=tri${outputLabel};`;
          previousOutput = outputLabel;
        }

        filterComplex = filterComplex.slice(0, -1);

        command
          .complexFilter(filterComplex)
          .outputOptions(['-map', '[out]']);
      } else {
        // Simple concatenation
        const filterComplex = buffers
          .map((_, i) => `[${i}:a]`)
          .join('') + `concat=n=${buffers.length}:v=0:a=1[out]`;

        command
          .complexFilter(filterComplex)
          .outputOptions(['-map', '[out]']);
      }

      command
        .audioCodec(this.getCodec(options.outputFormat))
        .audioBitrate(options.bitrate)
        .format(options.outputFormat)
        .on('error', reject);

      command.pipe(stream, { end: true });
    });
  }

  private getCodec(format: string): string {
    const codecs: Record<string, string> = {
      mp3: 'libmp3lame',
      wav: 'pcm_s16le',
      aac: 'aac',
      ogg: 'libvorbis',
    };
    return codecs[format] || 'libmp3lame';
  }
}

// Factory for template export service
export function createTemplateExportService(): TemplateExportService {
  return new TemplateExportService();
}
