/**
 * FFmpeg availability utilities
 *
 * Centralizes detection of the FFmpeg/ffprobe binaries so that every feature
 * that depends on them (export, audio enhancement, waveform, social clips)
 * fails with a clear, actionable error instead of silently returning fake data.
 */

import { spawn } from "child_process";

// Cache results so we don't spawn a process on every call.
const availabilityCache = new Map<string, boolean>();

/**
 * Check whether a binary (ffmpeg/ffprobe) is installed and runnable.
 * Result is cached per binary name for the lifetime of the process.
 */
export async function isBinaryAvailable(binary: string): Promise<boolean> {
  if (availabilityCache.has(binary)) {
    return availabilityCache.get(binary)!;
  }

  const available = await new Promise<boolean>((resolve) => {
    try {
      const proc = spawn(binary, ["-version"], { stdio: "ignore" });
      proc.on("error", () => resolve(false));
      proc.on("close", (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });

  availabilityCache.set(binary, available);
  return available;
}

/**
 * Check whether ffmpeg is available on the system PATH.
 */
export function isFFmpegAvailable(binary = "ffmpeg"): Promise<boolean> {
  return isBinaryAvailable(binary);
}

/**
 * Check whether ffprobe is available on the system PATH.
 */
export function isFFprobeAvailable(binary = "ffprobe"): Promise<boolean> {
  return isBinaryAvailable(binary);
}

/** Error thrown when an FFmpeg-dependent feature is used without FFmpeg. */
export class FFmpegNotAvailableError extends Error {
  constructor(feature = "This feature") {
    super(
      `${feature} requires FFmpeg, which is not installed or not on the PATH. ` +
        `Install FFmpeg (https://ffmpeg.org/download.html) and ensure 'ffmpeg' is runnable.`
    );
    this.name = "FFmpegNotAvailableError";
  }
}

/**
 * Throw a descriptive error if ffmpeg is not available.
 */
export async function assertFFmpeg(feature = "This feature", binary = "ffmpeg"): Promise<void> {
  if (!(await isFFmpegAvailable(binary))) {
    throw new FFmpegNotAvailableError(feature);
  }
}
