/**
 * Local, model-free heuristics for suggesting cut ranges.
 *
 * Two independent suggestions, both derived purely from FFmpeg's own analysis
 * filters (no external AI, no network):
 *  - {@link detectSilence}: runs the `silencedetect` audio filter and parses the
 *    silence intervals from ffmpeg stderr. {@link silenceToKeepRanges} inverts
 *    those into the ranges to KEEP.
 *  - {@link detectSceneCuts}: runs `select='gt(scene,X)'` with `showinfo` and
 *    parses the scene-change timestamps from ffmpeg stderr.
 *
 * These are optional helpers the UI may call; rendering does not depend on them.
 */

import { spawn } from "child_process";
import path from "path";
import { assertFFmpeg, FFmpegNotAvailableError } from "@/lib/audio/ffmpeg-utils";
import type { VideoCutRange } from "@/lib/video/types";

/** A detected silent interval, in seconds. */
export interface SilenceSegment {
  /** Start of the silence (seconds). */
  start: number;
  /** End of the silence (seconds). */
  end: number;
}

/** Options for {@link detectSilence}. */
export interface SilenceDetectOptions {
  /** Noise floor below which audio is considered silent, in dB. Default -30. */
  noiseDb?: number;
  /** Minimum silence duration to report, in seconds. Default 0.6. */
  minDuration?: number;
}

/**
 * Resolve a public `/uploads/...` path or absolute path into an absolute
 * filesystem path. HTTP URLs are rejected.
 */
function resolveInputPath(input: string): string {
  if (input.startsWith("http://") || input.startsWith("https://")) {
    throw new Error(
      "URLs HTTP não são suportadas aqui. Baixe o vídeo para o disco primeiro."
    );
  }
  if (input.startsWith("/uploads/") || input.startsWith("/exports/")) {
    return path.join(process.cwd(), "public", input);
  }
  if (input.startsWith("/")) return input;
  return path.resolve(input);
}

/**
 * Run an ffmpeg analysis pass that writes no output (`-f null -`) and return the
 * collected stderr (where the analysis filters print their results).
 *
 * @throws {FFmpegNotAvailableError} if ffmpeg is missing.
 */
function runAnalysis(args: string[], feature: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    proc.on("error", () => reject(new FFmpegNotAvailableError(feature)));
    proc.on("close", (code) => {
      // silencedetect/showinfo exit 0; we resolve regardless of empty matches.
      if (code === 0) resolve(stderr);
      else
        reject(
          new Error(
            `Análise falhou (ffmpeg código ${code}).${
              stderr ? ` ${stderr.trim().slice(-500)}` : ""
            }`
          )
        );
    });
  });
}

/**
 * Detect silent intervals in the audio track using FFmpeg's `silencedetect`.
 *
 * @param inputPath Absolute path or public `/uploads/...` path.
 * @param opts      Noise floor + minimum duration thresholds.
 * @returns Array of `{ start, end }` silence segments in seconds.
 * @throws {FFmpegNotAvailableError} if ffmpeg is missing.
 */
export async function detectSilence(
  inputPath: string,
  opts: SilenceDetectOptions = {}
): Promise<SilenceSegment[]> {
  const { noiseDb = -30, minDuration = 0.6 } = opts;
  await assertFFmpeg("Silence detection");

  const resolved = resolveInputPath(inputPath);
  const stderr = await runAnalysis(
    [
      "-i",
      resolved,
      "-af",
      `silencedetect=noise=${noiseDb}dB:d=${minDuration}`,
      "-f",
      "null",
      "-",
    ],
    "Silence detection"
  );

  return parseSilenceSegments(stderr);
}

/**
 * Parse `silencedetect` stderr lines into silence segments.
 * Lines look like:
 *   [silencedetect @ ...] silence_start: 12.34
 *   [silencedetect @ ...] silence_end: 15.67 | silence_duration: 3.33
 */
function parseSilenceSegments(stderr: string): SilenceSegment[] {
  const segments: SilenceSegment[] = [];
  let pendingStart: number | null = null;

  for (const line of stderr.split("\n")) {
    const startMatch = line.match(/silence_start:\s*([-\d.]+)/);
    if (startMatch) {
      pendingStart = parseFloat(startMatch[1]);
      continue;
    }
    const endMatch = line.match(/silence_end:\s*([-\d.]+)/);
    if (endMatch && pendingStart !== null) {
      const end = parseFloat(endMatch[1]);
      if (Number.isFinite(pendingStart) && Number.isFinite(end) && end > pendingStart) {
        segments.push({ start: Math.max(0, pendingStart), end });
      }
      pendingStart = null;
    }
  }

  return segments;
}

/**
 * Invert detected silences into the ranges to KEEP (the speech/active parts).
 *
 * Produces a `VideoCutRange[]` covering everything between/around the silences,
 * with sequential `order` and fresh ids. Returns a single whole-clip range when
 * there are no silences. Zero-length gaps are dropped.
 *
 * @param duration Total source duration in seconds.
 * @param silences Silence segments from {@link detectSilence}.
 */
export function silenceToKeepRanges(
  duration: number,
  silences: SilenceSegment[]
): VideoCutRange[] {
  if (duration <= 0) return [];

  const sorted = [...silences]
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  if (sorted.length === 0) {
    return [makeRange(0, duration, 0)];
  }

  const keeps: VideoCutRange[] = [];
  let cursor = 0;
  let order = 0;

  for (const silence of sorted) {
    const segEnd = Math.min(silence.start, duration);
    if (segEnd - cursor > 0.05) {
      keeps.push(makeRange(cursor, segEnd, order++));
    }
    cursor = Math.max(cursor, Math.min(silence.end, duration));
  }

  if (duration - cursor > 0.05) {
    keeps.push(makeRange(cursor, duration, order++));
  }

  // If silence covered everything, fall back to keeping the whole clip.
  if (keeps.length === 0) {
    return [makeRange(0, duration, 0)];
  }

  return keeps;
}

/** Construct a {@link VideoCutRange} with a fresh id. */
function makeRange(start: number, end: number, order: number): VideoCutRange {
  return {
    id: randomId(),
    start: roundTime(start),
    end: roundTime(end),
    order,
  };
}

/** Round a timestamp to millisecond precision. */
function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Generate a stable random id. Prefers `crypto.randomUUID` when available and
 * falls back to a timestamp+random string for older runtimes.
 */
function randomId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Detect scene-change timestamps using FFmpeg's `select='gt(scene,X)'` filter
 * with `showinfo`. Useful for snapping trim handles to natural boundaries.
 *
 * @param inputPath Absolute path or public `/uploads/...` path.
 * @param threshold Scene-change sensitivity in [0,1]. Higher = fewer cuts.
 *                  Default 0.4.
 * @returns Sorted array of scene-cut timestamps in seconds.
 * @throws {FFmpegNotAvailableError} if ffmpeg is missing.
 */
export async function detectSceneCuts(
  inputPath: string,
  threshold = 0.4
): Promise<number[]> {
  await assertFFmpeg("Scene detection");

  const resolved = resolveInputPath(inputPath);
  const clamped = Math.min(1, Math.max(0, threshold));

  const stderr = await runAnalysis(
    [
      "-i",
      resolved,
      "-vf",
      `select='gt(scene,${clamped})',showinfo`,
      "-f",
      "null",
      "-",
    ],
    "Scene detection"
  );

  return parseSceneTimestamps(stderr);
}

/**
 * Parse `showinfo` stderr lines into scene-cut timestamps.
 * Lines contain `pts_time:<seconds>` for each selected (scene-change) frame.
 */
function parseSceneTimestamps(stderr: string): number[] {
  const times: number[] = [];
  const regex = /pts_time:\s*([-\d.]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(stderr)) !== null) {
    const t = parseFloat(match[1]);
    if (Number.isFinite(t) && t >= 0) times.push(roundTime(t));
  }
  // Deduplicate and sort.
  return Array.from(new Set(times)).sort((a, b) => a - b);
}
