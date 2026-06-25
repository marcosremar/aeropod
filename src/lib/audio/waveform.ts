/**
 * Waveform Extraction Service
 *
 * Extracts amplitude peaks from audio files using FFmpeg for visualization.
 * The peaks are normalized values (0-1) that can be used to render waveforms.
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { isFFmpegAvailable, isFFprobeAvailable, FFmpegNotAvailableError } from "./ffmpeg-utils";

const execAsync = promisify(exec);

/**
 * Number of samples per second of audio.
 * Higher = more detail, but larger data size.
 * 10 samples/sec is good for timeline visualization.
 */
const SAMPLES_PER_SECOND = 10;

/**
 * Maximum number of peaks to generate.
 * For a 1-hour podcast at 10 samples/sec = 36,000 peaks (~144KB JSON)
 */
const MAX_PEAKS = 50000;

export interface WaveformData {
  peaks: number[]; // Normalized amplitudes (0-1)
  duration: number; // Duration in seconds
  samplesPerSecond: number;
}

/**
 * Extract waveform peaks from an audio file using FFmpeg.
 *
 * Uses the 'astats' filter to get amplitude statistics for small chunks,
 * then normalizes the RMS values to 0-1 range.
 */
export async function extractWaveformPeaks(
  audioPath: string,
  duration?: number
): Promise<WaveformData> {
  console.log(`[Waveform] Extracting peaks from: ${audioPath}`);

  // Waveform extraction relies on ffmpeg + ffprobe. Bail out early with a clear
  // error (the caller treats this as non-critical) instead of failing deep in
  // an exec() call with a cryptic "command not found".
  const [hasFFmpeg, hasFFprobe] = await Promise.all([
    isFFmpegAvailable(),
    isFFprobeAvailable(),
  ]);
  if (!hasFFmpeg || !hasFFprobe) {
    throw new FFmpegNotAvailableError("Waveform extraction");
  }

  // Resolve the audio path
  let resolvedPath = audioPath;
  if (audioPath.startsWith("file://")) {
    resolvedPath = audioPath.replace("file://", "");
  } else if (!audioPath.startsWith("http") && !path.isAbsolute(audioPath)) {
    // Assume relative to public folder
    const relativePath = audioPath.startsWith("/") ? audioPath.slice(1) : audioPath;
    resolvedPath = path.join(process.cwd(), "public", relativePath);
  }

  // For remote URLs, we need to download first
  if (audioPath.startsWith("http")) {
    console.log(`[Waveform] Downloading remote audio...`);
    const tempPath = path.join(os.tmpdir(), `waveform_${Date.now()}.mp3`);
    const response = await fetch(audioPath);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(tempPath, buffer);
    resolvedPath = tempPath;
  }

  // Check if file exists
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Audio file not found: ${resolvedPath}`);
  }

  // Get duration if not provided
  let audioDuration = duration;
  if (!audioDuration) {
    audioDuration = await getAudioDuration(resolvedPath);
  }

  console.log(`[Waveform] Audio duration: ${audioDuration}s`);

  // Calculate number of samples
  const numSamples = Math.min(
    Math.ceil(audioDuration * SAMPLES_PER_SECOND),
    MAX_PEAKS
  );
  const actualSamplesPerSecond = numSamples / audioDuration;

  console.log(`[Waveform] Generating ${numSamples} peaks...`);

  // Use FFmpeg to extract amplitude data
  // This creates raw PCM data that we can analyze
  const peaks = await extractPeaksWithFFmpeg(resolvedPath, numSamples, audioDuration);

  // Clean up temp file if we downloaded it
  if (audioPath.startsWith("http") && resolvedPath.includes(os.tmpdir())) {
    fs.unlinkSync(resolvedPath);
  }

  console.log(`[Waveform] Extraction complete: ${peaks.length} peaks`);

  return {
    peaks,
    duration: audioDuration,
    samplesPerSecond: actualSamplesPerSecond,
  };
}

/**
 * Get audio duration using FFprobe
 */
async function getAudioDuration(audioPath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
    );
    return parseFloat(stdout.trim());
  } catch (error) {
    console.error("[Waveform] Error getting duration:", error);
    throw new Error("Failed to get audio duration");
  }
}

/**
 * Extract peaks using FFmpeg's volumedetect and custom processing
 */
async function extractPeaksWithFFmpeg(
  audioPath: string,
  numSamples: number,
  duration: number
): Promise<number[]> {
  const tempRawPath = path.join(os.tmpdir(), `waveform_raw_${Date.now()}.raw`);

  try {
    // Convert to mono raw PCM, downsampled to reduce processing
    // We use a sample rate that gives us roughly the number of samples we want
    const targetSampleRate = Math.max(100, Math.ceil(numSamples / duration * 10));

    await execAsync(
      `ffmpeg -i "${audioPath}" -ac 1 -ar ${targetSampleRate} -f s16le -y "${tempRawPath}"`,
      { maxBuffer: 50 * 1024 * 1024 } // 50MB buffer for large files
    );

    // Read the raw PCM data
    const rawData = fs.readFileSync(tempRawPath);
    const samples = new Int16Array(rawData.buffer, rawData.byteOffset, rawData.length / 2);

    // Calculate peaks by grouping samples
    const samplesPerPeak = Math.max(1, Math.floor(samples.length / numSamples));
    const peaks: number[] = [];
    let maxAmplitude = 0;

    // First pass: find max amplitude and calculate RMS for each chunk
    const rmsValues: number[] = [];
    for (let i = 0; i < numSamples && i * samplesPerPeak < samples.length; i++) {
      const start = i * samplesPerPeak;
      const end = Math.min(start + samplesPerPeak, samples.length);

      // Calculate RMS (Root Mean Square) for this chunk
      let sumSquares = 0;
      for (let j = start; j < end; j++) {
        sumSquares += samples[j] * samples[j];
      }
      const rms = Math.sqrt(sumSquares / (end - start));
      rmsValues.push(rms);

      if (rms > maxAmplitude) {
        maxAmplitude = rms;
      }
    }

    // Second pass: normalize to 0-1 range
    for (const rms of rmsValues) {
      const normalized = maxAmplitude > 0 ? rms / maxAmplitude : 0;
      // Apply slight curve to make quieter parts more visible
      const curved = Math.pow(normalized, 0.7);
      peaks.push(Math.round(curved * 100) / 100); // Round to 2 decimal places
    }

    // Clean up
    fs.unlinkSync(tempRawPath);

    return peaks;
  } catch (error) {
    // Clean up on error
    if (fs.existsSync(tempRawPath)) {
      fs.unlinkSync(tempRawPath);
    }
    console.error("[Waveform] FFmpeg extraction error:", error);
    throw new Error("Failed to extract waveform peaks");
  }
}

/**
 * Get peaks for a specific time range (for segment visualization)
 */
export function getPeaksForTimeRange(
  waveformData: WaveformData,
  startTime: number,
  endTime: number
): number[] {
  const startIndex = Math.floor(startTime * waveformData.samplesPerSecond);
  const endIndex = Math.ceil(endTime * waveformData.samplesPerSecond);

  return waveformData.peaks.slice(
    Math.max(0, startIndex),
    Math.min(waveformData.peaks.length, endIndex)
  );
}
