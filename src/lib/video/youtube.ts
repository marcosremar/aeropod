/**
 * yt-dlp YouTube importer.
 *
 * Downloads the best mp4-compatible stream of a YouTube video into
 * `public/uploads` using the `yt-dlp` CLI (spawned as a child process — no
 * external AI models), probes its duration with ffprobe, and extracts a poster
 * frame with ffmpeg.
 *
 * Reuses `isBinaryAvailable('yt-dlp')` and the ffmpeg helpers from
 * `src/lib/audio/ffmpeg-utils.ts`. If `yt-dlp` (or ffmpeg) is missing it throws
 * a clear, actionable error, mirroring the `assertFFmpeg` pattern.
 */

import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import {
  isBinaryAvailable,
  assertFFmpeg,
  FFmpegNotAvailableError,
} from "@/lib/audio/ffmpeg-utils";
import { publicUploadsDir } from "@/lib/video/storage";
import { probeVideo } from "@/lib/video/processor";

/** Error thrown when a YouTube import is attempted without `yt-dlp` installed. */
export class YtDlpNotAvailableError extends Error {
  constructor(feature = "YouTube import") {
    super(
      `${feature} requires yt-dlp, which is not installed or not on the PATH. ` +
        `Install yt-dlp (https://github.com/yt-dlp/yt-dlp#installation) and ensure 'yt-dlp' is runnable.`
    );
    this.name = "YtDlpNotAvailableError";
  }
}

/** Result of a successful YouTube import. */
export interface YouTubeImportResult {
  /** Absolute path to the downloaded video file on disk. */
  videoPath: string;
  /** Public URL/path of the downloaded video (e.g. `/uploads/<ts>-source.mp4`). */
  videoUrl: string;
  /** Absolute path to the generated poster image on disk. */
  thumbnailPath: string;
  /** Public URL/path of the poster image (e.g. `/uploads/<ts>-poster.jpg`). */
  thumbnailUrl: string;
  /** Source video duration in seconds (from ffprobe). */
  duration: number;
  /** Video title as reported by yt-dlp (best effort). */
  title: string;
}

/** Options for {@link importFromYouTube}. */
export interface YouTubeImportOptions {
  /** The YouTube watch URL. */
  url: string;
  /** Output directory for the downloaded files. Defaults to `public/uploads`. */
  outputDir?: string;
  /** Cap on vertical resolution to download. Defaults to 1080. */
  maxHeight?: number;
  /** Progress callback receiving a 0–100 percentage parsed from yt-dlp output. */
  onProgress?: (pct: number) => void;
}

const YOUTUBE_URL_REGEX =
  /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^&]*&)*v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#].*)?$/;

/**
 * Validate that `url` is a real YouTube watch/short/youtu.be link with an
 * 11-character video id.
 */
export function isValidYouTubeUrl(url: string): boolean {
  if (typeof url !== "string" || url.trim().length === 0) return false;
  return YOUTUBE_URL_REGEX.test(url.trim());
}

/**
 * Extract the 11-character YouTube video id from a URL, or null if invalid.
 */
export function extractYouTubeId(url: string): string | null {
  const match = YOUTUBE_URL_REGEX.exec(url.trim());
  return match ? match[1] : null;
}

/** Whether the `yt-dlp` binary is available on the PATH (cached). */
export function isYtDlpAvailable(): Promise<boolean> {
  return isBinaryAvailable("yt-dlp");
}

/**
 * Throw {@link YtDlpNotAvailableError} if `yt-dlp` is not installed.
 */
async function assertYtDlp(feature = "YouTube import"): Promise<void> {
  if (!(await isYtDlpAvailable())) {
    throw new YtDlpNotAvailableError(feature);
  }
}

/**
 * Import a video from YouTube via yt-dlp.
 *
 * Steps:
 *  1. Validate the URL and required binaries.
 *  2. Download the best <=maxHeight mp4-compatible stream into `outputDir`.
 *  3. Probe duration with ffprobe.
 *  4. Extract a poster frame (~1s in) with ffmpeg.
 *
 * @throws {YtDlpNotAvailableError} if yt-dlp is missing.
 * @throws {FFmpegNotAvailableError} if ffmpeg is missing.
 * @throws {Error} for invalid URLs or download/processing failures.
 */
export async function importFromYouTube(
  options: YouTubeImportOptions
): Promise<YouTubeImportResult> {
  const { url, maxHeight = 1080, onProgress } = options;

  if (!isValidYouTubeUrl(url)) {
    throw new Error("URL inválida. Forneça um link válido do YouTube.");
  }

  await assertYtDlp();
  await assertFFmpeg("YouTube import");

  const outputDir = options.outputDir ?? publicUploadsDir();
  await fs.mkdir(outputDir, { recursive: true });

  const videoId = extractYouTubeId(url) ?? "video";
  const timestamp = Date.now();
  const baseName = `${timestamp}-yt-${videoId}`;
  const videoPath = path.join(outputDir, `${baseName}.mp4`);

  // Download. We force an mp4 container so the output extension is predictable.
  const title = await runYtDlp({
    url,
    outputPath: videoPath,
    maxHeight,
    onProgress,
  });

  // Confirm the file exists (yt-dlp may merge formats and pick the extension).
  const finalVideoPath = await resolveDownloadedFile(videoPath, outputDir, baseName);
  const videoUrl = toPublicUrl(finalVideoPath, outputDir);

  // Probe duration.
  const metadata = await probeVideo(finalVideoPath);

  // Extract poster frame.
  const thumbnailPath = path.join(outputDir, `${baseName}-poster.jpg`);
  await extractPoster(finalVideoPath, thumbnailPath, metadata.duration);
  const thumbnailUrl = toPublicUrl(thumbnailPath, outputDir);

  if (onProgress) onProgress(100);

  return {
    videoPath: finalVideoPath,
    videoUrl,
    thumbnailPath,
    thumbnailUrl,
    duration: metadata.duration,
    title: title || `YouTube ${videoId}`,
  };
}

/**
 * Spawn yt-dlp to download the video. Resolves with the parsed title (best
 * effort) once the process exits successfully.
 */
function runYtDlp(args: {
  url: string;
  outputPath: string;
  maxHeight: number;
  onProgress?: (pct: number) => void;
}): Promise<string> {
  const { url, outputPath, maxHeight, onProgress } = args;

  return new Promise<string>((resolve, reject) => {
    // Prefer best video<=maxHeight + best audio, merged into mp4.
    const formatSelector = `bestvideo[height<=${maxHeight}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${maxHeight}][ext=mp4]/best[height<=${maxHeight}]/best`;

    const ytdlpArgs = [
      "--no-playlist",
      "--no-warnings",
      "--newline",
      "-f",
      formatSelector,
      "--merge-output-format",
      "mp4",
      "--print",
      "after_move:title",
      "-o",
      outputPath,
      url,
    ];

    const proc = spawn("yt-dlp", ytdlpArgs);

    let title = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      // Parse download progress lines like: "[download]  42.3% of ..."
      if (onProgress) {
        const progressMatch = text.match(/\[download\]\s+([\d.]+)%/);
        if (progressMatch) {
          const pct = parseFloat(progressMatch[1]);
          if (!Number.isNaN(pct)) onProgress(Math.min(99, pct));
        }
      }
      // The --print line emits the title (anything that isn't a progress/log line).
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("[")) {
          title = trimmed;
        }
      }
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => {
      reject(
        new Error(`Falha ao executar yt-dlp: ${err.message}`)
      );
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(title);
      } else {
        reject(
          new Error(
            `yt-dlp falhou (código ${code}).${stderr ? ` ${stderr.trim()}` : ""}`
          )
        );
      }
    });
  });
}

/**
 * yt-dlp may produce a file with a slightly different extension than requested
 * (depending on merge behaviour). Verify the expected path or fall back to the
 * newest matching `<baseName>.*` file in the output dir.
 */
async function resolveDownloadedFile(
  expectedPath: string,
  outputDir: string,
  baseName: string
): Promise<string> {
  try {
    await fs.access(expectedPath);
    return expectedPath;
  } catch {
    // Search for any file starting with baseName.
    const entries = await fs.readdir(outputDir);
    const candidates = entries.filter(
      (name) => name.startsWith(baseName) && !name.includes("-poster")
    );
    if (candidates.length > 0) {
      return path.join(outputDir, candidates[0]);
    }
    throw new Error(
      "Download concluído mas o arquivo de vídeo não foi encontrado."
    );
  }
}

/**
 * Extract a single poster frame from the video using ffmpeg.
 * Seeks to ~1s (or the midpoint for very short clips) to avoid black frames.
 */
function extractPoster(
  videoPath: string,
  posterPath: string,
  duration: number
): Promise<void> {
  const seek = duration > 2 ? 1 : Math.max(0, duration / 2);

  return new Promise<void>((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-y",
      "-ss",
      seek.toString(),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      posterPath,
    ]);

    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", () => reject(new FFmpegNotAvailableError("Poster extraction")));
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Falha ao gerar a miniatura (ffmpeg código ${code}).${
              stderr ? ` ${stderr.trim()}` : ""
            }`
          )
        );
      }
    });
  });
}

/**
 * Convert an absolute file path inside `public/uploads` into a public URL.
 * If the path is not under the public uploads dir, returns the basename-based
 * `/uploads/...` path as a best effort.
 */
function toPublicUrl(filePath: string, outputDir: string): string {
  const uploadsDir = publicUploadsDir();
  // When the output dir is the standard uploads dir, derive a clean URL.
  if (path.resolve(outputDir) === path.resolve(uploadsDir)) {
    return `/uploads/${path.basename(filePath)}`;
  }
  // Otherwise, attempt to express relative to the `public/` root.
  const publicDir = path.join(process.cwd(), "public");
  const rel = path.relative(publicDir, filePath);
  if (!rel.startsWith("..")) {
    return `/${rel.split(path.sep).join("/")}`;
  }
  return `/uploads/${path.basename(filePath)}`;
}
