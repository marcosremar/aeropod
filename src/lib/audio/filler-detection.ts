/**
 * Filler Word Detection Service
 * Detects and manages filler words (ums, ahs, tipo, ne) in podcast audio
 */

import { WordTimestamp, FILLER_PATTERNS, FillerWord, NewFillerWord } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { fillerWords, segments, projects } from "@/lib/db/schema";
import { eq, and, gte } from "drizzle-orm";

export interface DetectedFiller {
  word: string;
  startTime: number;
  endTime: number;
  confidence: number;
  segmentId: string;
  context?: string; // Words before and after for context
}

export interface FillerStats {
  totalCount: number;
  removedCount: number;
  timeSaved: number; // seconds
  byType: Record<string, number>;
}

export interface FillerDetectionResult {
  fillers: DetectedFiller[];
  stats: FillerStats;
}

/**
 * Detects filler words from word timestamps
 */
export function detectFillerWords(
  wordTimestamps: WordTimestamp[],
  language: "pt" | "en" = "pt"
): DetectedFiller[] {
  const patterns = FILLER_PATTERNS[language];
  const detectedFillers: DetectedFiller[] = [];

  for (let i = 0; i < wordTimestamps.length; i++) {
    const wordData = wordTimestamps[i];
    const word = wordData.word.toLowerCase().trim();

    // Check single word fillers
    if ((patterns as readonly string[]).includes(word)) {
      // Get context (2 words before and after)
      const contextBefore = wordTimestamps
        .slice(Math.max(0, i - 2), i)
        .map((w) => w.word)
        .join(" ");
      const contextAfter = wordTimestamps
        .slice(i + 1, i + 3)
        .map((w) => w.word)
        .join(" ");

      detectedFillers.push({
        word: wordData.word,
        startTime: wordData.start,
        endTime: wordData.end,
        confidence: calculateFillerConfidence(word, contextBefore, contextAfter),
        segmentId: "", // Will be filled when saving
        context: `${contextBefore} [${wordData.word}] ${contextAfter}`.trim(),
      });
    }

    // Check multi-word fillers (e.g., "you know", "quer dizer")
    for (const pattern of patterns) {
      if (pattern.includes(" ")) {
        const patternWords = pattern.split(" ");
        const matchWords = wordTimestamps.slice(i, i + patternWords.length);

        if (matchWords.length === patternWords.length) {
          const matches = matchWords.every(
            (w, idx) => w.word.toLowerCase().trim() === patternWords[idx]
          );

          if (matches) {
            const ctxBefore = wordTimestamps
              .slice(Math.max(0, i - 2), i)
              .map((w) => w.word)
              .join(" ");
            const ctxAfter = wordTimestamps
              .slice(i + patternWords.length, i + patternWords.length + 2)
              .map((w) => w.word)
              .join(" ");

            detectedFillers.push({
              word: pattern,
              startTime: matchWords[0].start,
              endTime: matchWords[matchWords.length - 1].end,
              confidence: 0.9, // Multi-word patterns are usually intentional fillers
              segmentId: "",
              context: `${ctxBefore} [${pattern}] ${ctxAfter}`.trim(),
            });
          }
        }
      }
    }
  }

  return detectedFillers;
}

/**
 * Calculate confidence that a word is a filler (not intentional usage)
 */
function calculateFillerConfidence(
  word: string,
  contextBefore: string,
  contextAfter: string
): number {
  let confidence = 0.7; // Base confidence

  // Higher confidence if at sentence boundaries
  if (!contextBefore || contextBefore.endsWith(".") || contextBefore.endsWith("?")) {
    confidence += 0.1;
  }

  // Higher confidence for classic fillers
  const highConfidenceFillers = ["hum", "eh", "ah", "um", "uh"];
  if (highConfidenceFillers.includes(word)) {
    confidence += 0.15;
  }

  // Lower confidence if "tipo" is used as "type" (followed by "de")
  if (word === "tipo" && contextAfter.toLowerCase().startsWith("de")) {
    confidence -= 0.4;
  }

  // Lower confidence for "like" if in comparison context
  if (word === "like" && (contextBefore.includes("looks") || contextBefore.includes("sounds"))) {
    confidence -= 0.5;
  }

  // Lower confidence for "so" at beginning of explanation
  if (word === "so" && !contextBefore) {
    confidence -= 0.3;
  }

  return Math.max(0.1, Math.min(1, confidence));
}

/**
 * Save detected fillers to database
 */
export async function saveFillers(
  projectId: string,
  segmentId: string,
  fillers: DetectedFiller[]
): Promise<FillerWord[]> {
  if (fillers.length === 0) return [];

  const fillersToInsert: NewFillerWord[] = fillers.map((filler) => ({
    projectId,
    segmentId,
    word: filler.word,
    startTime: filler.startTime,
    endTime: filler.endTime,
    confidence: filler.confidence,
    isRemoved: false,
  }));

  const inserted = await db.insert(fillerWords).values(fillersToInsert).returning();

  // Update project stats
  await updateProjectFillerStats(projectId);

  return inserted;
}

/**
 * Get all fillers for a project
 */
export async function getProjectFillers(projectId: string): Promise<FillerWord[]> {
  return db
    .select()
    .from(fillerWords)
    .where(eq(fillerWords.projectId, projectId))
    .orderBy(fillerWords.startTime);
}

/**
 * Get fillers for a specific segment
 */
export async function getSegmentFillers(segmentId: string): Promise<FillerWord[]> {
  return db
    .select()
    .from(fillerWords)
    .where(eq(fillerWords.segmentId, segmentId))
    .orderBy(fillerWords.startTime);
}

/**
 * Mark fillers for removal
 */
export async function markFillersForRemoval(
  fillerIds: string[],
  remove: boolean = true
): Promise<void> {
  for (const id of fillerIds) {
    await db
      .update(fillerWords)
      .set({ isRemoved: remove })
      .where(eq(fillerWords.id, id));
  }
}

/**
 * Mark all fillers in a project for removal
 */
export async function markAllFillersForRemoval(
  projectId: string,
  minConfidence: number = 0.7
): Promise<number> {
  const result = await db
    .update(fillerWords)
    .set({ isRemoved: true })
    .where(
      and(
        eq(fillerWords.projectId, projectId),
        gte(fillerWords.confidence, minConfidence)
      )
    )
    .returning();

  await updateProjectFillerStats(projectId);

  return result.length;
}

/**
 * Get filler statistics for a project
 */
export async function getFillerStats(projectId: string): Promise<FillerStats> {
  const allFillers = await getProjectFillers(projectId);

  const byType: Record<string, number> = {};
  let removedCount = 0;
  let timeSaved = 0;

  for (const filler of allFillers) {
    // Count by type
    byType[filler.word] = (byType[filler.word] || 0) + 1;

    // Count removed
    if (filler.isRemoved) {
      removedCount++;
      timeSaved += filler.endTime - filler.startTime;
    }
  }

  return {
    totalCount: allFillers.length,
    removedCount,
    timeSaved,
    byType,
  };
}

/**
 * Update project filler word counts
 */
async function updateProjectFillerStats(projectId: string): Promise<void> {
  const stats = await getFillerStats(projectId);

  await db
    .update(projects)
    .set({
      fillerWordsCount: stats.totalCount,
      fillerWordsRemoved: stats.removedCount,
    })
    .where(eq(projects.id, projectId));
}

/**
 * Generate FFmpeg filter to remove fillers from audio
 */
export function generateFillerRemovalFilter(
  fillers: FillerWord[],
  audioDuration: number
): string {
  const removedFillers = fillers.filter((f) => f.isRemoved);
  if (removedFillers.length === 0) return "";

  // Sort by start time
  const sorted = [...removedFillers].sort((a, b) => a.startTime - b.startTime);

  // Build segments to keep (inverse of fillers)
  const keepSegments: { start: number; end: number }[] = [];
  let lastEnd = 0;

  for (const filler of sorted) {
    if (filler.startTime > lastEnd) {
      keepSegments.push({ start: lastEnd, end: filler.startTime });
    }
    lastEnd = Math.max(lastEnd, filler.endTime);
  }

  // Add final segment
  if (lastEnd < audioDuration) {
    keepSegments.push({ start: lastEnd, end: audioDuration });
  }

  // Generate FFmpeg filter
  // Using atrim and concat filters
  const filterParts = keepSegments.map(
    (seg, i) => `[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[a${i}]`
  );

  const concatInputs = keepSegments.map((_, i) => `[a${i}]`).join("");
  const concatFilter = `${concatInputs}concat=n=${keepSegments.length}:v=0:a=1[out]`;

  return `${filterParts.join(";")};${concatFilter}`;
}

/**
 * Process all segments in a project for filler detection
 */
export async function processProjectFillers(
  projectId: string,
  language: "pt" | "en" = "pt"
): Promise<FillerDetectionResult> {
  // Get all segments with word timestamps
  const projectSegments = await db
    .select()
    .from(segments)
    .where(eq(segments.projectId, projectId));

  const allFillers: DetectedFiller[] = [];

  for (const segment of projectSegments) {
    if (!segment.wordTimestamps) continue;

    const wordTimestamps = segment.wordTimestamps as WordTimestamp[];
    const detected = detectFillerWords(wordTimestamps, language);

    // Set segment ID and adjust times (word timestamps are segment-relative)
    for (const filler of detected) {
      filler.segmentId = segment.id;
      // Times are already absolute if stored that way
    }

    allFillers.push(...detected);

    // Save to database
    await saveFillers(projectId, segment.id, detected);
  }

  const stats = await getFillerStats(projectId);

  return {
    fillers: allFillers,
    stats,
  };
}
