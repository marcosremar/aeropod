import { TranscriptionSegment } from './transcription';

export interface AudioChunk {
  id: string;
  startTime: number; // seconds
  endTime: number; // seconds
  text: string;
  segmentIds: number[]; // IDs of segments included in this chunk
}

export interface ChunkingOptions {
  minDuration?: number; // minimum chunk duration in seconds (default: 30)
  maxDuration?: number; // maximum chunk duration in seconds (default: 60)
  preferSentenceBoundaries?: boolean; // prefer to break at sentence boundaries (default: true)
}

const DEFAULT_OPTIONS: Required<ChunkingOptions> = {
  minDuration: 30,
  maxDuration: 60,
  preferSentenceBoundaries: true,
};

/**
 * Splits transcription segments into chunks of 30-60 seconds,
 * respecting natural pauses and sentence boundaries
 */
export function chunkTranscription(
  segments: TranscriptionSegment[],
  options: ChunkingOptions = {}
): AudioChunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const chunks: AudioChunk[] = [];

  if (segments.length === 0) {
    return chunks;
  }

  let currentChunk: {
    startTime: number;
    endTime: number;
    text: string;
    segmentIds: number[];
  } = {
    startTime: segments[0].start,
    endTime: segments[0].end,
    text: segments[0].text,
    segmentIds: [segments[0].id],
  };

  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i];
    const chunkDuration = currentChunk.endTime - currentChunk.startTime;
    const potentialDuration = segment.end - currentChunk.startTime;

    // Check if adding this segment would exceed max duration
    if (potentialDuration > opts.maxDuration) {
      // Finalize current chunk if it meets minimum duration
      if (chunkDuration >= opts.minDuration) {
        chunks.push(finalizeChunk(currentChunk, chunks.length));
        currentChunk = {
          startTime: segment.start,
          endTime: segment.end,
          text: segment.text,
          segmentIds: [segment.id],
        };
      } else {
        // Force include this segment even if it exceeds max duration
        currentChunk.endTime = segment.end;
        currentChunk.text += ' ' + segment.text;
        currentChunk.segmentIds.push(segment.id);
        chunks.push(finalizeChunk(currentChunk, chunks.length));

        // Start new chunk with next segment
        if (i + 1 < segments.length) {
          const nextSegment = segments[i + 1];
          currentChunk = {
            startTime: nextSegment.start,
            endTime: nextSegment.end,
            text: nextSegment.text,
            segmentIds: [nextSegment.id],
          };
          i++; // Skip the next segment since we've already added it
        } else {
          break;
        }
      }
      continue;
    }

    // Check if we should break at a natural boundary
    if (opts.preferSentenceBoundaries && chunkDuration >= opts.minDuration) {
      const shouldBreak = isSentenceBoundary(segment.text) || hasLongPause(segments[i - 1], segment);

      if (shouldBreak) {
        chunks.push(finalizeChunk(currentChunk, chunks.length));
        currentChunk = {
          startTime: segment.start,
          endTime: segment.end,
          text: segment.text,
          segmentIds: [segment.id],
        };
        continue;
      }
    }

    // Add segment to current chunk
    currentChunk.endTime = segment.end;
    currentChunk.text += ' ' + segment.text;
    currentChunk.segmentIds.push(segment.id);
  }

  // Add the last chunk if it has content
  if (currentChunk.segmentIds.length > 0) {
    chunks.push(finalizeChunk(currentChunk, chunks.length));
  }

  return chunks;
}

/**
 * Checks if the text ends with a sentence-ending punctuation
 */
function isSentenceBoundary(text: string): boolean {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed);
}

/**
 * Checks if there's a long pause between segments (> 1 second)
 */
function hasLongPause(prevSegment: TranscriptionSegment, currentSegment: TranscriptionSegment): boolean {
  const pause = currentSegment.start - prevSegment.end;
  return pause > 1.0; // More than 1 second pause
}

/**
 * Finalizes a chunk by creating an AudioChunk object with a unique ID
 */
function finalizeChunk(
  chunk: {
    startTime: number;
    endTime: number;
    text: string;
    segmentIds: number[];
  },
  index: number
): AudioChunk {
  return {
    id: `chunk-${index}`,
    startTime: chunk.startTime,
    endTime: chunk.endTime,
    text: chunk.text.trim(),
    segmentIds: [...chunk.segmentIds],
  };
}

/**
 * Merges multiple chunks into a single chunk
 */
export function mergeChunks(chunks: AudioChunk[]): AudioChunk | null {
  if (chunks.length === 0) return null;
  if (chunks.length === 1) return chunks[0];

  const sortedChunks = [...chunks].sort((a, b) => a.startTime - b.startTime);

  return {
    id: `merged-${sortedChunks.map(c => c.id).join('-')}`,
    startTime: sortedChunks[0].startTime,
    endTime: sortedChunks[sortedChunks.length - 1].endTime,
    text: sortedChunks.map(c => c.text).join(' '),
    segmentIds: sortedChunks.flatMap(c => c.segmentIds),
  };
}

/**
 * Splits a chunk at a specific time
 */
export function splitChunkAtTime(
  chunk: AudioChunk,
  segments: TranscriptionSegment[],
  splitTime: number
): [AudioChunk, AudioChunk] | null {
  if (splitTime <= chunk.startTime || splitTime >= chunk.endTime) {
    return null; // Split time is outside chunk boundaries
  }

  // Find the segment that contains the split time
  const chunkSegments = segments.filter(s => chunk.segmentIds.includes(s.id));
  const splitIndex = chunkSegments.findIndex(s => s.start <= splitTime && s.end > splitTime);

  if (splitIndex === -1) {
    // Split at the nearest segment boundary
    const nearestIndex = chunkSegments.findIndex(s => s.start > splitTime);
    if (nearestIndex === -1 || nearestIndex === 0) return null;

    const firstPart = chunkSegments.slice(0, nearestIndex);
    const secondPart = chunkSegments.slice(nearestIndex);

    return [
      {
        id: `${chunk.id}-a`,
        startTime: chunk.startTime,
        endTime: firstPart[firstPart.length - 1].end,
        text: firstPart.map(s => s.text).join(' '),
        segmentIds: firstPart.map(s => s.id),
      },
      {
        id: `${chunk.id}-b`,
        startTime: secondPart[0].start,
        endTime: chunk.endTime,
        text: secondPart.map(s => s.text).join(' '),
        segmentIds: secondPart.map(s => s.id),
      },
    ];
  }

  // Split within a segment
  const firstPart = chunkSegments.slice(0, splitIndex + 1);
  const secondPart = chunkSegments.slice(splitIndex + 1);

  return [
    {
      id: `${chunk.id}-a`,
      startTime: chunk.startTime,
      endTime: splitTime,
      text: firstPart.map(s => s.text).join(' '),
      segmentIds: firstPart.map(s => s.id),
    },
    {
      id: `${chunk.id}-b`,
      startTime: splitTime,
      endTime: chunk.endTime,
      text: secondPart.map(s => s.text).join(' '),
      segmentIds: secondPart.map(s => s.id),
    },
  ];
}

/**
 * Validates that chunks are properly ordered and don't overlap
 */
export function validateChunks(chunks: AudioChunk[]): boolean {
  if (chunks.length === 0) return true;

  for (let i = 0; i < chunks.length; i++) {
    const current = chunks[i];

    // Check that every chunk has valid times
    if (current.startTime >= current.endTime) return false;

    // Check that consecutive chunks don't overlap
    if (i < chunks.length - 1) {
      const next = chunks[i + 1];
      if (next.startTime >= next.endTime) return false;
      if (current.endTime > next.startTime) return false;
    }
  }

  return true;
}
