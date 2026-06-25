/**
 * Audio Enhancement Service
 * Provides audio processing features: normalization, noise reduction, EQ, compression
 */

import { EnhancementSettings } from "@/lib/db/schema";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { assertFFmpeg } from "@/lib/audio/ffmpeg-utils";

export interface EnhancementOptions extends EnhancementSettings {
  inputPath: string;
  outputPath?: string;
}

export interface EnhancementResult {
  success: boolean;
  outputPath: string;
  appliedFilters: string[];
  error?: string;
}

export interface PreviewResult {
  success: boolean;
  previewPath: string;
  duration: number; // seconds
  error?: string;
}

/**
 * Audio Enhancement Service using FFmpeg
 */
export class AudioEnhancementService {
  private ffmpegPath: string;

  constructor(ffmpegPath: string = "ffmpeg") {
    this.ffmpegPath = ffmpegPath;
  }

  /**
   * Apply audio enhancements to a file
   */
  async enhance(options: EnhancementOptions): Promise<EnhancementResult> {
    const filters = this.buildFilterChain(options);
    const outputPath = options.outputPath || this.generateOutputPath(options.inputPath);

    try {
      await assertFFmpeg("Audio enhancement", this.ffmpegPath);
      await this.runFFmpeg(options.inputPath, outputPath, filters);

      return {
        success: true,
        outputPath,
        appliedFilters: filters,
      };
    } catch (error) {
      return {
        success: false,
        outputPath: "",
        appliedFilters: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Generate a short preview of enhanced audio
   */
  async preview(
    options: EnhancementOptions,
    startTime: number = 0,
    duration: number = 10
  ): Promise<PreviewResult> {
    const filters = this.buildFilterChain(options);
    const previewPath = path.join(os.tmpdir(), `preview-${Date.now()}.mp3`);

    try {
      await assertFFmpeg("Audio enhancement preview", this.ffmpegPath);
      // Add time limiting to filters
      const previewFilters = [`atrim=start=${startTime}:duration=${duration}`, ...filters];

      await this.runFFmpeg(options.inputPath, previewPath, previewFilters);

      return {
        success: true,
        previewPath,
        duration,
      };
    } catch (error) {
      return {
        success: false,
        previewPath: "",
        duration: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Build FFmpeg filter chain from options
   */
  buildFilterChain(options: EnhancementSettings): string[] {
    const filters: string[] = [];

    // 1. High-pass filter to remove rumble (always apply for voice)
    filters.push("highpass=f=80");

    // 2. Noise reduction
    if (options.denoise?.enabled) {
      const strength = this.getDenoiseStrength(options.denoise.strength);
      filters.push(`afftdn=nf=${strength}`);
    }

    // 3. EQ
    if (options.eq?.enabled) {
      const eqFilter = this.getEQFilter(options.eq.preset, options.eq.customBands);
      if (eqFilter) filters.push(eqFilter);
    }

    // 4. Compression
    if (options.compress?.enabled) {
      const compFilter = this.getCompressionFilter(options.compress.preset);
      filters.push(compFilter);
    }

    // 5. Normalization (always last for consistent levels)
    if (options.normalize?.enabled) {
      const lufs = options.normalize.targetLufs || -16;
      filters.push(`loudnorm=I=${lufs}:LRA=11:TP=-1.5`);
    }

    return filters;
  }

  /**
   * Get noise reduction strength parameter
   */
  private getDenoiseStrength(strength: "light" | "medium" | "aggressive"): number {
    switch (strength) {
      case "light":
        return -20;
      case "medium":
        return -25;
      case "aggressive":
        return -35;
      default:
        return -25;
    }
  }

  /**
   * Get EQ filter based on preset
   */
  private getEQFilter(
    preset: "voice" | "clarity" | "warmth" | "custom",
    customBands?: number[]
  ): string {
    switch (preset) {
      case "voice":
        // Cut low frequencies, boost presence (2-4kHz), slight air boost (10kHz)
        return "equalizer=f=100:t=h:w=200:g=-3,equalizer=f=3000:t=h:w=1000:g=3,equalizer=f=10000:t=h:w=2000:g=1";

      case "clarity":
        // More aggressive high-mid boost for clarity
        return "equalizer=f=150:t=h:w=100:g=-4,equalizer=f=2500:t=h:w=1500:g=4,equalizer=f=5000:t=h:w=1000:g=2";

      case "warmth":
        // Boost low-mids, reduce harsh frequencies
        return "equalizer=f=200:t=h:w=150:g=2,equalizer=f=3500:t=h:w=1000:g=-2,equalizer=f=8000:t=h:w=2000:g=-1";

      case "custom":
        if (customBands && customBands.length >= 5) {
          // Assume 5-band EQ: 100Hz, 500Hz, 2kHz, 5kHz, 10kHz
          const bands = [100, 500, 2000, 5000, 10000];
          return bands
            .map((freq, i) => `equalizer=f=${freq}:t=h:w=${freq / 2}:g=${customBands[i]}`)
            .join(",");
        }
        return "";

      default:
        return "";
    }
  }

  /**
   * Get compression filter based on preset
   */
  private getCompressionFilter(preset: "light" | "medium" | "broadcast"): string {
    switch (preset) {
      case "light":
        // Gentle compression for natural sound
        return "acompressor=threshold=-20dB:ratio=2:attack=10:release=100";

      case "medium":
        // Standard podcast compression
        return "acompressor=threshold=-16dB:ratio=3:attack=5:release=80";

      case "broadcast":
        // Heavy compression for consistent levels (radio style)
        return "acompressor=threshold=-12dB:ratio=4:attack=3:release=50,alimiter=limit=-1dB";

      default:
        return "acompressor=threshold=-16dB:ratio=3:attack=5:release=80";
    }
  }

  /**
   * Run FFmpeg with filters
   */
  private runFFmpeg(
    inputPath: string,
    outputPath: string,
    filters: string[]
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const filterString = filters.join(",");

      const args = [
        "-i", inputPath,
        "-af", filterString,
        "-c:a", "libmp3lame",
        "-b:a", "192k",
        "-y", // Overwrite output
        outputPath,
      ];

      const ffmpeg = spawn(this.ffmpegPath, args);

      let stderr = "";
      ffmpeg.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
        }
      });

      ffmpeg.on("error", (error) => {
        reject(error);
      });
    });
  }

  /**
   * Generate output path for enhanced audio
   */
  private generateOutputPath(inputPath: string): string {
    const parsed = path.parse(inputPath);
    return path.join(parsed.dir, `${parsed.name}-enhanced${parsed.ext}`);
  }

  /**
   * Get default enhancement settings for podcasts
   */
  static getDefaultSettings(): EnhancementSettings {
    return {
      normalize: {
        enabled: true,
        targetLufs: -16, // Podcast standard
      },
      denoise: {
        enabled: true,
        strength: "medium",
      },
      eq: {
        enabled: true,
        preset: "voice",
      },
      compress: {
        enabled: true,
        preset: "medium",
      },
      removeFillers: false,
    };
  }

  /**
   * Analyze audio levels (for showing before/after comparison)
   */
  async analyzeAudio(inputPath: string): Promise<{
    peakDb: number;
    rmsDb: number;
    lufs: number;
  }> {
    return new Promise((resolve, reject) => {
      const args = [
        "-i", inputPath,
        "-af", "volumedetect,ebur128=peak=true",
        "-f", "null",
        "-",
      ];

      const ffmpeg = spawn(this.ffmpegPath, args);

      let output = "";
      ffmpeg.stderr.on("data", (data) => {
        output += data.toString();
      });

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          // Parse output for levels
          const peakMatch = output.match(/max_volume: ([-\d.]+) dB/);
          const rmsMatch = output.match(/mean_volume: ([-\d.]+) dB/);
          const lufsMatch = output.match(/I:\s+([-\d.]+) LUFS/);

          resolve({
            peakDb: peakMatch ? parseFloat(peakMatch[1]) : 0,
            rmsDb: rmsMatch ? parseFloat(rmsMatch[1]) : 0,
            lufs: lufsMatch ? parseFloat(lufsMatch[1]) : -23,
          });
        } else {
          reject(new Error("Failed to analyze audio"));
        }
      });

      ffmpeg.on("error", reject);
    });
  }
}

// Export singleton instance
export const audioEnhancementService = new AudioEnhancementService();

// Export preset configurations
export const ENHANCEMENT_PRESETS = {
  podcast_standard: {
    name: "Podcast Padrao",
    description: "Configuracao otimizada para podcasts",
    settings: AudioEnhancementService.getDefaultSettings(),
  },
  voice_clarity: {
    name: "Voz Clara",
    description: "Maximiza clareza da voz",
    settings: {
      normalize: { enabled: true, targetLufs: -16 },
      denoise: { enabled: true, strength: "medium" as const },
      eq: { enabled: true, preset: "clarity" as const },
      compress: { enabled: true, preset: "medium" as const },
      removeFillers: false,
    },
  },
  broadcast_ready: {
    name: "Pronto para Radio",
    description: "Niveis consistentes estilo broadcast",
    settings: {
      normalize: { enabled: true, targetLufs: -14 },
      denoise: { enabled: true, strength: "aggressive" as const },
      eq: { enabled: true, preset: "voice" as const },
      compress: { enabled: true, preset: "broadcast" as const },
      removeFillers: true,
    },
  },
  minimal: {
    name: "Minimo",
    description: "Apenas normalizacao basica",
    settings: {
      normalize: { enabled: true, targetLufs: -16 },
      denoise: { enabled: false, strength: "light" as const },
      eq: { enabled: false, preset: "voice" as const },
      compress: { enabled: false, preset: "light" as const },
      removeFillers: false,
    },
  },
} as const;
