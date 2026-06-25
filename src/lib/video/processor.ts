/**
 * Core local-FFmpeg video processor.
 *
 * Provides everything the video cut editor needs without any external AI:
 *  - {@link probeVideo}: read metadata (duration/size/fps/audio) via ffprobe.
 *  - {@link generateTimelineThumbnails}: extract an evenly-spaced strip of
 *    JPEG thumbnails for the editor scrubber.
 *  - {@link renderCuts}: trim the kept ranges, concatenate them, and re-encode
 *    to a target aspect ratio (16:9 / 9:16 / 1:1) as an H.264/AAC MP4 with
 *    faststart.
 *
 * FFmpeg/ffprobe are spawned directly (mirroring `src/lib/video/youtube.ts`),
 * which keeps full control over the filtergraph. All ffmpeg-dependent functions
 * call `assertFFmpeg` first and surface `FFmpegNotAvailableError` so callers can
 * respond with a clear 503. The temp-dir + concat-demuxer flow follows the
 * proven pattern in `src/app/api/export/[id]/route.ts`.
 */

import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { assertFFmpeg, FFmpegNotAvailableError } from "@/lib/audio/ffmpeg-utils";
import { publicExportsDir, publicUploadsDir } from "@/lib/video/storage";
import type { AspectRatio, VideoCutRange } from "@/lib/video/types";

// Re-export shared types so consumers can import them from the processor too.
export type { AspectRatio, VideoCutRange } from "@/lib/video/types";

/** Metadata describing a source video. */
export interface VideoMetadata {
  /** Duration in seconds. */
  duration: number;
  /** Frame width in pixels. */
  width: number;
  /** Frame height in pixels. */
  height: number;
  /** Frames per second (averaged). */
  fps: number;
  /** Whether the file contains at least one audio stream. */
  hasAudio: boolean;
}

/** Minimal shape of the `ffprobe -show_streams -show_format` JSON we consume. */
interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  duration?: string;
}

interface FfprobeFormat {
  duration?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
}

/** Options for {@link generateTimelineThumbnails}. */
export interface ThumbnailStripOptions {
  /** Absolute path (or `/uploads/...` public path) of the source video. */
  inputPath: string;
  /** Number of thumbnails to extract. Defaults to 12. */
  count?: number;
  /** Directory to write the thumbnails into (created if missing). */
  outputDir: string;
  /** Thumbnail width in pixels (height keeps aspect). Defaults to 160. */
  width?: number;
}

/** Result of {@link generateTimelineThumbnails}. */
export interface ThumbnailStripResult {
  /** Ordered list of `{ time, url }` thumbnail entries. */
  thumbnails: Array<{ time: number; url: string }>;
}

/** Options for {@link renderCuts}. */
export interface RenderCutsOptions {
  /** Absolute path (or `/uploads/...` public path) of the source video. */
  inputPath: string;
  /** Ranges to KEEP, in output order. Empty/undefined keeps the whole clip. */
  cutRanges: VideoCutRange[];
  /** Target export aspect ratio. */
  aspectRatio: AspectRatio;
  /** Directory for the final MP4 (created if missing). Defaults to public/exports. */
  outputDir?: string;
  /** Output filename. Defaults to `video-<ts>.mp4`. */
  outputName?: string;
  /** x264 CRF (lower = higher quality/larger file). Defaults to 20. */
  crf?: number;
  /** Progress callback receiving a 0–100 percentage parsed from ffmpeg. */
  onProgress?: (pct: number) => void;
}

/** Result of {@link renderCuts}. */
export interface RenderResult {
  /** Absolute path to the rendered MP4 on disk. */
  outputPath: string;
  /** Public URL/path of the rendered MP4 (e.g. `/exports/video-<ts>.mp4`). */
  outputUrl: string;
  /** Duration of the rendered output in seconds (sum of kept ranges). */
  duration: number;
}

/** Pixel dimensions for each supported aspect ratio (1080-class output). */
const ASPECT_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};

/**
 * Resolve an input that may be a public `/uploads/...` path or an absolute path
 * into an absolute filesystem path. HTTP URLs are rejected (download first).
 */
function resolveInputPath(input: string): string {
  if (input.startsWith("http://") || input.startsWith("https://")) {
    throw new Error(
      "URLs HTTP não são suportadas aqui. Baixe o vídeo para o disco primeiro."
    );
  }
  if (input.startsWith("/")) {
    // Could be a public path (/uploads/...) or already absolute.
    const asPublic = path.join(process.cwd(), "public", input);
    // Prefer the public mapping when it looks like an app-served path.
    if (input.startsWith("/uploads/") || input.startsWith("/exports/")) {
      return asPublic;
    }
    return input;
  }
  return path.resolve(input);
}

/**
 * Parse an ffmpeg/ffprobe frame-rate fraction like `30000/1001` into fps.
 * Returns 0 when the value cannot be parsed.
 */
function parseFrameRate(value: string | undefined): number {
  if (!value) return 0;
  const [num, den] = value.split("/");
  const n = parseFloat(num);
  const d = den !== undefined ? parseFloat(den) : 1;
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return 0;
  return n / d;
}

/**
 * Probe a video's metadata using ffprobe.
 *
 * @param inputPath Absolute path or public `/uploads/...` path.
 * @throws {FFmpegNotAvailableError} if ffprobe is missing.
 * @throws {Error} if the file cannot be probed.
 */
export async function probeVideo(inputPath: string): Promise<VideoMetadata> {
  await assertFFmpeg("Video metadata", "ffprobe");
  const resolved = resolveInputPath(inputPath);

  const json = await new Promise<string>((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      resolved,
    ]);

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    proc.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    proc.on("error", () => reject(new FFmpegNotAvailableError("Video metadata")));
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else
        reject(
          new Error(
            `ffprobe falhou (código ${code}).${stderr ? ` ${stderr.trim()}` : ""}`
          )
        );
    });
  });

  let parsed: FfprobeOutput;
  try {
    parsed = JSON.parse(json) as FfprobeOutput;
  } catch {
    throw new Error("Não foi possível interpretar a saída do ffprobe.");
  }

  const streams = parsed.streams ?? [];
  const videoStream = streams.find((s) => s.codec_type === "video");
  const hasAudio = streams.some((s) => s.codec_type === "audio");

  if (!videoStream) {
    throw new Error("Nenhuma faixa de vídeo encontrada no arquivo.");
  }

  const duration =
    parseFloat(parsed.format?.duration ?? "") ||
    parseFloat(videoStream.duration ?? "") ||
    0;

  const fps =
    parseFrameRate(videoStream.avg_frame_rate) ||
    parseFrameRate(videoStream.r_frame_rate) ||
    0;

  return {
    duration,
    width: videoStream.width ?? 0,
    height: videoStream.height ?? 0,
    fps,
    hasAudio,
  };
}

/**
 * Generate an evenly-spaced strip of timeline thumbnails for the scrubber.
 *
 * Extracts `count` JPEG frames spread across the clip's duration into
 * `outputDir`, returning their timestamps and public URLs.
 *
 * @throws {FFmpegNotAvailableError} if ffmpeg/ffprobe are missing.
 */
export async function generateTimelineThumbnails(
  options: ThumbnailStripOptions
): Promise<ThumbnailStripResult> {
  const { inputPath, outputDir, count = 12, width = 160 } = options;
  await assertFFmpeg("Timeline thumbnails");

  const resolved = resolveInputPath(inputPath);
  const { duration } = await probeVideo(inputPath);
  await fs.mkdir(outputDir, { recursive: true });

  const safeCount = Math.max(1, Math.floor(count));
  const thumbnails: Array<{ time: number; url: string }> = [];

  // Place each thumbnail at the midpoint of its slice so it is representative.
  for (let i = 0; i < safeCount; i++) {
    const time =
      duration > 0 ? ((i + 0.5) / safeCount) * duration : 0;
    const fileName = `thumb-${String(i).padStart(3, "0")}.jpg`;
    const outPath = path.join(outputDir, fileName);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn("ffmpeg", [
        "-y",
        "-ss",
        time.toFixed(3),
        "-i",
        resolved,
        "-frames:v",
        "1",
        "-vf",
        `scale=${width}:-2`,
        "-q:v",
        "4",
        outPath,
      ]);

      let stderr = "";
      proc.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
      proc.on("error", () => reject(new FFmpegNotAvailableError("Timeline thumbnails")));
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else
          reject(
            new Error(
              `Falha ao gerar miniatura ${i} (ffmpeg código ${code}).${
                stderr ? ` ${stderr.trim()}` : ""
              }`
            )
          );
      });
    });

    thumbnails.push({ time, url: toPublicUrl(outPath) });
  }

  return { thumbnails };
}

/**
 * Build a crop+scale+pad filtergraph that fits the source frame into the target
 * aspect ratio without distortion.
 *
 * Strategy: scale the source to *cover* the target box (`force_original_aspect_
 * ratio=increase`), crop the overflow centred, then scale to the exact target
 * size and pad as a safety net for rounding. The result always matches the
 * target dimensions exactly.
 *
 * @param aspect Target aspect ratio.
 * @param _srcW  Source width (currently unused; the cover/crop math is
 *               resolution-independent, kept for signature compatibility).
 * @param _srcH  Source height (see above).
 * @returns An ffmpeg `-vf` filtergraph string.
 */
export function aspectToFilter(
  aspect: AspectRatio,
  _srcW: number,
  _srcH: number
): string {
  const { width, height } = ASPECT_DIMENSIONS[aspect];
  return [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    // Pad is a no-op safety net guaranteeing exact dimensions after rounding.
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
    "setsar=1",
  ].join(",");
}

/**
 * Normalize and validate cut ranges against the source duration.
 * Returns ranges sorted by `order` (then `start`), clamped to [0, duration],
 * dropping any zero/negative-length ranges.
 */
function normalizeCutRanges(
  cutRanges: VideoCutRange[] | undefined | null,
  duration: number
): Array<{ start: number; end: number }> {
  if (!cutRanges || cutRanges.length === 0) {
    // Keep the whole clip.
    return [{ start: 0, end: duration }];
  }

  const sorted = [...cutRanges].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.start - b.start;
  });

  const result: Array<{ start: number; end: number }> = [];
  for (const range of sorted) {
    const start = Math.max(0, Math.min(range.start, duration));
    const end = Math.max(0, Math.min(range.end, duration));
    if (end - start > 0.05) {
      result.push({ start, end });
    }
  }

  if (result.length === 0) {
    return [{ start: 0, end: duration }];
  }
  return result;
}

/**
 * Render the final cut: trim each kept range, concatenate them, and re-encode to
 * the target aspect ratio as an H.264/AAC MP4 with faststart.
 *
 * Implementation notes:
 *  - Each kept range is trimmed to a temp mp4 (stream-copy where possible) into
 *    a per-run temp directory.
 *  - The trimmed parts are concatenated with the concat demuxer.
 *  - A single final re-encode applies the aspect filtergraph so the whole
 *    output is consistent (one re-encode pass, not per-segment).
 *  - The temp directory is always cleaned up (success or failure).
 *
 * @throws {FFmpegNotAvailableError} if ffmpeg is missing.
 */
export async function renderCuts(
  options: RenderCutsOptions
): Promise<RenderResult> {
  const {
    inputPath,
    cutRanges,
    aspectRatio,
    crf = 20,
    onProgress,
  } = options;

  await assertFFmpeg("Video export");

  const resolved = resolveInputPath(inputPath);
  const metadata = await probeVideo(inputPath);

  const ranges = normalizeCutRanges(cutRanges, metadata.duration);
  const outputDuration = ranges.reduce((sum, r) => sum + (r.end - r.start), 0);

  const outputDir = options.outputDir ?? publicExportsDir();
  await fs.mkdir(outputDir, { recursive: true });

  const timestamp = Date.now();
  const outputName = options.outputName ?? `video-${timestamp}.mp4`;
  const outputPath = path.join(outputDir, outputName);
  const tempDir = path.join(outputDir, `temp-video-${timestamp}`);

  const filter = aspectToFilter(aspectRatio, metadata.width, metadata.height);

  try {
    await fs.mkdir(tempDir, { recursive: true });

    // 1. Trim each kept range into its own temp mp4.
    const partFiles: string[] = [];
    for (let i = 0; i < ranges.length; i++) {
      const { start, end } = ranges[i];
      const partPath = path.join(tempDir, `part-${i}.mp4`);
      await trimRange(resolved, start, end - start, partPath, metadata.hasAudio);
      partFiles.push(partPath);
    }

    // 2. Concatenate trimmed parts (concat demuxer, stream copy).
    let concatInput: string;
    if (partFiles.length === 1) {
      concatInput = partFiles[0];
    } else {
      const concatListPath = path.join(tempDir, "concat-list.txt");
      const concatContent = partFiles
        .map((f) => `file '${f.replace(/'/g, "'\\''")}'`)
        .join("\n");
      await fs.writeFile(concatListPath, concatContent);
      concatInput = path.join(tempDir, "concat.mp4");
      await concatParts(concatListPath, concatInput);
    }

    // 3. Single re-encode pass applying the aspect filtergraph.
    await encodeFinal({
      inputPath: concatInput,
      outputPath,
      filter,
      crf,
      hasAudio: metadata.hasAudio,
      totalDuration: outputDuration,
      onProgress,
    });

    await fs.rm(tempDir, { recursive: true, force: true });
    if (onProgress) onProgress(100);

    return {
      outputPath,
      outputUrl: toPublicUrl(outputPath),
      duration: outputDuration,
    };
  } catch (error) {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup; ignore secondary errors.
    }
    throw error;
  }
}

/**
 * Trim a single range from the source into a temp mp4.
 * Uses an accurate seek (`-ss` after `-i`) and re-encodes the segment so that
 * the subsequent concat is frame-accurate and gap-free across cut boundaries.
 */
function trimRange(
  inputPath: string,
  start: number,
  duration: number,
  outputPath: string,
  hasAudio: boolean
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const args = [
      "-y",
      "-ss",
      start.toFixed(3),
      "-i",
      inputPath,
      "-t",
      duration.toFixed(3),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
    ];
    if (hasAudio) {
      args.push("-c:a", "aac", "-b:a", "192k");
    } else {
      args.push("-an");
    }
    args.push(outputPath);

    runFfmpeg(args, "Trim", resolve, reject);
  });
}

/** Concatenate trimmed parts via the concat demuxer (stream copy). */
function concatParts(concatListPath: string, outputPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const args = [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath,
      "-c",
      "copy",
      outputPath,
    ];
    runFfmpeg(args, "Concat", resolve, reject);
  });
}

/** Final single-pass re-encode applying the aspect filtergraph + faststart. */
function encodeFinal(args: {
  inputPath: string;
  outputPath: string;
  filter: string;
  crf: number;
  hasAudio: boolean;
  totalDuration: number;
  onProgress?: (pct: number) => void;
}): Promise<void> {
  const { inputPath, outputPath, filter, crf, hasAudio, totalDuration, onProgress } =
    args;

  return new Promise<void>((resolve, reject) => {
    const ffArgs = [
      "-y",
      "-i",
      inputPath,
      "-vf",
      filter,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      crf.toString(),
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
    ];
    if (hasAudio) {
      ffArgs.push("-c:a", "aac", "-b:a", "192k");
    } else {
      ffArgs.push("-an");
    }
    // Emit progress on stderr's `-progress` pipe via time= parsing instead.
    ffArgs.push(outputPath);

    runFfmpeg(
      ffArgs,
      "Encode",
      resolve,
      reject,
      onProgress
        ? (stderrChunk) => {
            const pct = parseFfmpegProgress(stderrChunk, totalDuration);
            if (pct !== null) onProgress(Math.min(99, pct));
          }
        : undefined
    );
  });
}

/**
 * Shared ffmpeg spawn helper: runs `ffmpeg <args>`, rejecting with a clear
 * error on non-zero exit and `FFmpegNotAvailableError` if the binary is absent.
 */
function runFfmpeg(
  args: string[],
  label: string,
  resolve: () => void,
  reject: (err: Error) => void,
  onStderr?: (chunk: string) => void
): void {
  const proc = spawn("ffmpeg", args);
  let stderr = "";

  proc.stderr.on("data", (c: Buffer) => {
    const text = c.toString();
    stderr += text;
    if (onStderr) onStderr(text);
  });

  proc.on("error", () => reject(new FFmpegNotAvailableError(`${label} (vídeo)`)));
  proc.on("close", (code) => {
    if (code === 0) resolve();
    else
      reject(
        new Error(
          `${label} falhou (ffmpeg código ${code}).${
            stderr ? ` ${stderr.trim().slice(-500)}` : ""
          }`
        )
      );
  });
}

/**
 * Parse an ffmpeg stderr chunk for a `time=HH:MM:SS.ms` token and convert it to
 * a percentage of `totalDuration`. Returns null if no time token is present.
 */
function parseFfmpegProgress(
  chunk: string,
  totalDuration: number
): number | null {
  if (totalDuration <= 0) return null;
  const match = chunk.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseFloat(match[3]);
  const elapsed = hours * 3600 + minutes * 60 + seconds;
  return (elapsed / totalDuration) * 100;
}

/**
 * Convert an absolute path under `public/` into a public URL.
 * Falls back to an `/uploads/...` or `/exports/...` path based on the directory.
 */
function toPublicUrl(filePath: string): string {
  const publicDir = path.join(process.cwd(), "public");
  const rel = path.relative(publicDir, filePath);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
    return `/${rel.split(path.sep).join("/")}`;
  }
  // Best-effort fallback based on which known dir contains the file.
  if (filePath.startsWith(publicExportsDir())) {
    return `/exports/${path.basename(filePath)}`;
  }
  if (filePath.startsWith(publicUploadsDir())) {
    return `/uploads/${path.basename(filePath)}`;
  }
  return `/uploads/${path.basename(filePath)}`;
}
