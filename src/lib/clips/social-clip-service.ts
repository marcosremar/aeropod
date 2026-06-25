/**
 * Social Clip Service
 * Generates viral-ready clips for TikTok, Reels, and Shorts
 */

import { Segment, SocialClip, NewSocialClip, SocialClipMetadata, WordTimestamp } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { socialClips, segments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { spawn } from "child_process";
import path from "path";
import os from "os";
import { assertFFmpeg } from "@/lib/audio/ffmpeg-utils";

export interface ClipSuggestion {
  segmentIds: string[];
  startTime: number;
  endTime: number;
  duration: number;
  title: string;
  description: string;
  hookScore: number; // 1-10
  viralPotential: number; // 1-10
  hookText: string;
  reason: string;
}

export interface ClipExportOptions {
  format: "9:16" | "1:1" | "16:9";
  addCaptions: boolean;
  captionStyle: "animated" | "static";
  backgroundColor?: string;
  fontFamily?: string;
  fontSize?: number;
  outputPath?: string;
}

export interface ExportedClip {
  success: boolean;
  clipUrl: string;
  thumbnailUrl?: string;
  duration: number;
  error?: string;
}

/**
 * Social Clip Service
 */
export class SocialClipService {
  private ffmpegPath: string;

  constructor(ffmpegPath: string = "ffmpeg") {
    this.ffmpegPath = ffmpegPath;
  }

  /**
   * Analyze segments and suggest viral clips
   */
  async generateSuggestions(
    projectSegments: Segment[],
    count: number = 5
  ): Promise<ClipSuggestion[]> {
    const suggestions: ClipSuggestion[] = [];

    // Score each segment for clip potential
    const scoredSegments = projectSegments.map((segment) => ({
      segment,
      score: this.calculateClipScore(segment),
    }));

    // Sort by score
    scoredSegments.sort((a, b) => b.score - a.score);

    // Generate clip suggestions from top segments
    const topSegments = scoredSegments.slice(0, count * 2); // Get more to filter

    for (const { segment } of topSegments) {
      if (suggestions.length >= count) break;

      // Skip if segment is too short or too long for social
      const duration = segment.endTime - segment.startTime;
      if (duration < 10 || duration > 90) continue;

      const suggestion = this.createClipSuggestion(segment, projectSegments);
      if (suggestion) {
        suggestions.push(suggestion);
      }
    }

    // Also look for multi-segment clips (consecutive high-score segments)
    const multiSegmentClips = this.findMultiSegmentClips(projectSegments, count - suggestions.length);
    suggestions.push(...multiSegmentClips);

    return suggestions.slice(0, count);
  }

  /**
   * Calculate viral potential score for a segment
   */
  private calculateClipScore(segment: Segment): number {
    let score = 0;

    // Interest score (0-10) - major factor
    if (segment.interestScore) {
      score += segment.interestScore * 3;
    }

    // Clarity score (0-10) - important for social
    if (segment.clarityScore) {
      score += segment.clarityScore * 2;
    }

    // Standalone value - clips should make sense alone
    const analysis = segment.analysis as any;
    if (analysis?.standalone) {
      score += 15;
    }

    // Penalty for issues
    if (analysis?.isTangent) score -= 10;
    if (analysis?.isRepetition) score -= 10;
    if (analysis?.hasFactualError) score -= 20;

    // Bonus for key insights
    if (segment.keyInsight && segment.keyInsight.length > 20) {
      score += 10;
    }

    // Optimal duration bonus (30-60 seconds is ideal)
    const duration = segment.endTime - segment.startTime;
    if (duration >= 30 && duration <= 60) {
      score += 10;
    } else if (duration >= 15 && duration <= 90) {
      score += 5;
    }

    return Math.max(0, score);
  }

  /**
   * Create a clip suggestion from a segment
   */
  private createClipSuggestion(
    segment: Segment,
    allSegments: Segment[]
  ): ClipSuggestion | null {
    const duration = segment.endTime - segment.startTime;

    // Extract hook (first 5 seconds worth of text)
    const hookText = this.extractHook(segment);

    // Generate title from topic or key insight
    const title = segment.topic || this.generateTitle(segment);

    // Calculate scores
    const hookScore = this.calculateHookScore(hookText, segment);
    const viralPotential = this.calculateViralPotential(segment);

    return {
      segmentIds: [segment.id],
      startTime: segment.startTime,
      endTime: segment.endTime,
      duration,
      title,
      description: segment.keyInsight || segment.text.slice(0, 200),
      hookScore,
      viralPotential,
      hookText,
      reason: this.generateReason(segment, hookScore, viralPotential),
    };
  }

  /**
   * Find good multi-segment clips
   */
  private findMultiSegmentClips(
    segments: Segment[],
    maxClips: number
  ): ClipSuggestion[] {
    const clips: ClipSuggestion[] = [];
    const sortedSegments = [...segments].sort((a, b) => a.startTime - b.startTime);

    for (let i = 0; i < sortedSegments.length - 1 && clips.length < maxClips; i++) {
      const seg1 = sortedSegments[i];
      const seg2 = sortedSegments[i + 1];

      // Check if consecutive and both high quality
      if (
        seg2.startTime - seg1.endTime < 2 && // Less than 2 second gap
        (seg1.interestScore || 0) >= 7 &&
        (seg2.interestScore || 0) >= 7
      ) {
        const totalDuration = seg2.endTime - seg1.startTime;

        // Only if combined duration is good for social
        if (totalDuration >= 20 && totalDuration <= 90) {
          clips.push({
            segmentIds: [seg1.id, seg2.id],
            startTime: seg1.startTime,
            endTime: seg2.endTime,
            duration: totalDuration,
            title: `${seg1.topic || "Clip"} + ${seg2.topic || "mais"}`,
            description: `${seg1.keyInsight || ""} ${seg2.keyInsight || ""}`.trim(),
            hookScore: this.calculateHookScore(this.extractHook(seg1), seg1),
            viralPotential: Math.round(
              ((this.calculateViralPotential(seg1) + this.calculateViralPotential(seg2)) / 2)
            ),
            hookText: this.extractHook(seg1),
            reason: "Segmentos consecutivos de alta qualidade",
          });
        }
      }
    }

    return clips;
  }

  /**
   * Extract hook text (first ~5 seconds of speech)
   */
  private extractHook(segment: Segment): string {
    const words = segment.text.split(" ");
    // Assume ~2.5 words per second
    const hookWords = words.slice(0, 12);
    return hookWords.join(" ");
  }

  /**
   * Generate title from segment content
   */
  private generateTitle(segment: Segment): string {
    if (segment.keyInsight) {
      // Use first sentence of key insight
      const firstSentence = segment.keyInsight.split(/[.!?]/)[0];
      return firstSentence.slice(0, 50) + (firstSentence.length > 50 ? "..." : "");
    }

    // Use first meaningful words of text
    const words = segment.text.split(" ").slice(0, 6);
    return words.join(" ") + "...";
  }

  /**
   * Calculate hook score (how strong is the opening)
   */
  private calculateHookScore(hookText: string, segment: Segment): number {
    let score = 5; // Base score

    // Starts with question
    if (hookText.includes("?")) score += 2;

    // Contains attention-grabbing words
    const attentionWords = ["incrível", "segredo", "verdade", "nunca", "sempre", "importante", "amazing", "secret", "truth"];
    if (attentionWords.some((w) => hookText.toLowerCase().includes(w))) {
      score += 2;
    }

    // Short, punchy opening
    const wordCount = hookText.split(" ").length;
    if (wordCount <= 8) score += 1;

    // High interest score suggests good content
    if ((segment.interestScore || 0) >= 8) score += 1;

    return Math.min(10, score);
  }

  /**
   * Calculate viral potential
   */
  private calculateViralPotential(segment: Segment): number {
    let score = 5;

    // Interest score impact
    score += Math.min(3, Math.floor((segment.interestScore || 0) / 3));

    // Clarity impact
    score += Math.min(2, Math.floor((segment.clarityScore || 0) / 5));

    // Standalone content is more shareable
    const analysis = segment.analysis as any;
    if (analysis?.standalone) score += 1;

    // Key insight suggests quotable content
    if (segment.keyInsight && segment.keyInsight.length > 30) score += 1;

    return Math.min(10, Math.max(1, score));
  }

  /**
   * Generate reason for suggestion
   */
  private generateReason(
    segment: Segment,
    hookScore: number,
    viralPotential: number
  ): string {
    const reasons: string[] = [];

    if (hookScore >= 8) reasons.push("abertura forte");
    if (viralPotential >= 8) reasons.push("alto potencial viral");
    if ((segment.interestScore || 0) >= 8) reasons.push("conteudo muito interessante");
    if ((segment.clarityScore || 0) >= 8) reasons.push("comunicacao clara");
    if (segment.keyInsight) reasons.push("insight quotavel");

    const analysis = segment.analysis as any;
    if (analysis?.standalone) reasons.push("funciona sozinho");

    return reasons.length > 0
      ? `Motivo: ${reasons.join(", ")}`
      : "Bom candidato para clip social";
  }

  /**
   * Save clip suggestion to database
   */
  async saveClip(
    projectId: string,
    suggestion: ClipSuggestion
  ): Promise<SocialClip> {
    const metadata: SocialClipMetadata = {
      generatedTitle: suggestion.title,
      generatedDescription: suggestion.description,
      suggestedHashtags: this.generateHashtags(suggestion),
      hookText: suggestion.hookText,
      emotionalTone: this.detectEmotionalTone(suggestion),
      targetPlatform: "all",
    };

    const newClip: NewSocialClip = {
      projectId,
      segmentIds: suggestion.segmentIds,
      title: suggestion.title,
      description: suggestion.description,
      startTime: suggestion.startTime,
      endTime: suggestion.endTime,
      duration: Math.round(suggestion.duration),
      format: "9:16",
      hookScore: suggestion.hookScore,
      viralPotential: suggestion.viralPotential,
      status: "pending",
      captionsEnabled: true,
      captionStyle: "animated",
      metadata,
    };

    const [inserted] = await db.insert(socialClips).values(newClip).returning();
    return inserted;
  }

  /**
   * Generate hashtags for clip
   */
  private generateHashtags(suggestion: ClipSuggestion): string[] {
    const hashtags = ["#podcast", "#podcasting", "#podcastbrasil"];

    // Add topic-based hashtags
    if (suggestion.title) {
      const words = suggestion.title.toLowerCase().split(" ");
      for (const word of words) {
        if (word.length > 4 && !["sobre", "quando", "porque", "então"].includes(word)) {
          hashtags.push(`#${word}`);
        }
      }
    }

    return hashtags.slice(0, 10);
  }

  /**
   * Detect the emotional tone of a clip from its content and scores.
   * Returns one of: funny, inspiring, controversial, educational.
   */
  private detectEmotionalTone(suggestion: ClipSuggestion): string {
    const text = `${suggestion.title} ${suggestion.description} ${suggestion.hookText} ${suggestion.reason}`.toLowerCase();

    const matches = (words: string[]) => words.some((w) => text.includes(w));

    // Funny / entertaining
    if (matches(["engraçad", "piada", "risada", "humor", "hilári", "comédia", "kkk", "rir"])) {
      return "funny";
    }

    // Controversial / debate
    if (matches(["polêmic", "controvers", "discord", "debate", "contra", "errado", "polemic"])) {
      return "controversial";
    }

    // Inspiring / motivational — also implied by very high viral/hook potential
    if (
      matches(["inspir", "motiva", "superaç", "sonho", "transform", "lição", "história de"]) ||
      (suggestion.viralPotential >= 8 && suggestion.hookScore >= 8)
    ) {
      return "inspiring";
    }

    // Default: educational/informative content
    return "educational";
  }

  /**
   * Export clip to video file with captions
   */
  async exportClip(
    clipId: string,
    audioPath: string,
    options: ClipExportOptions
  ): Promise<ExportedClip> {
    // Get clip from database
    const [clip] = await db
      .select()
      .from(socialClips)
      .where(eq(socialClips.id, clipId));

    if (!clip) {
      return { success: false, clipUrl: "", duration: 0, error: "Clip not found" };
    }

    try {
      // FFmpeg is required to render the video clip — fail clearly if missing.
      await assertFFmpeg("Social clip export");

      // Get word timestamps for captions
      let wordTimestamps: WordTimestamp[] = [];
      if (options.addCaptions) {
        const clipSegments = await db
          .select()
          .from(segments)
          .where(eq(segments.projectId, clip.projectId));

        for (const seg of clipSegments) {
          if (
            (clip.segmentIds as string[]).includes(seg.id) &&
            seg.wordTimestamps
          ) {
            wordTimestamps.push(...(seg.wordTimestamps as WordTimestamp[]));
          }
        }
      }

      // Generate output path
      const outputPath = options.outputPath || path.join(
        os.tmpdir(),
        `clip-${clipId}-${Date.now()}.mp4`
      );

      // Export with FFmpeg
      await this.runFFmpegExport(
        audioPath,
        outputPath,
        clip.startTime,
        clip.endTime,
        options,
        wordTimestamps
      );

      // Update clip status
      await db
        .update(socialClips)
        .set({
          status: "ready",
          clipUrl: outputPath,
        })
        .where(eq(socialClips.id, clipId));

      return {
        success: true,
        clipUrl: outputPath,
        duration: clip.duration,
      };
    } catch (error) {
      // Update status to failed
      await db
        .update(socialClips)
        .set({ status: "pending" })
        .where(eq(socialClips.id, clipId));

      return {
        success: false,
        clipUrl: "",
        duration: 0,
        error: error instanceof Error ? error.message : "Export failed",
      };
    }
  }

  /**
   * Run FFmpeg to create video with captions
   */
  private async runFFmpegExport(
    audioPath: string,
    outputPath: string,
    startTime: number,
    endTime: number,
    options: ClipExportOptions,
    wordTimestamps: WordTimestamp[]
  ): Promise<void> {
    // Get dimensions based on format
    const dimensions = this.getDimensions(options.format);

    // Build filter complex
    const filters: string[] = [];

    // Create background color
    const bgColor = options.backgroundColor || "black";
    filters.push(
      `color=c=${bgColor}:s=${dimensions.width}x${dimensions.height}:d=${endTime - startTime}[bg]`
    );

    // Add waveform visualization
    filters.push(
      `[0:a]showwaves=s=${dimensions.width}x200:mode=cline:colors=white@0.5[waves]`
    );

    // Overlay waveform on background
    filters.push(
      `[bg][waves]overlay=(W-w)/2:(H-h)/2[v1]`
    );

    // Add captions if enabled
    if (options.addCaptions && wordTimestamps.length > 0) {
      const captionFilter = this.buildCaptionFilter(
        wordTimestamps,
        startTime,
        endTime,
        options,
        dimensions
      );
      if (captionFilter) {
        filters.push(`[v1]${captionFilter}[vout]`);
      } else {
        filters.push(`[v1]copy[vout]`);
      }
    } else {
      filters.push(`[v1]copy[vout]`);
    }

    const filterComplex = filters.join(";");

    return new Promise((resolve, reject) => {
      const args = [
        "-ss", startTime.toString(),
        "-t", (endTime - startTime).toString(),
        "-i", audioPath,
        "-filter_complex", filterComplex,
        "-map", "[vout]",
        "-map", "0:a",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "128k",
        "-y",
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
          reject(new Error(`FFmpeg failed: ${stderr}`));
        }
      });

      ffmpeg.on("error", reject);
    });
  }

  /**
   * Build caption filter for animated text
   */
  private buildCaptionFilter(
    wordTimestamps: WordTimestamp[],
    clipStart: number,
    clipEnd: number,
    options: ClipExportOptions,
    dimensions: { width: number; height: number }
  ): string {
    // Filter words within clip range
    const clipWords = wordTimestamps.filter(
      (w) => w.start >= clipStart && w.end <= clipEnd
    );

    if (clipWords.length === 0) return "";

    const fontSize = options.fontSize || 48;
    const fontFamily = options.fontFamily || "Arial";
    const yPosition = Math.round(dimensions.height * 0.75);

    if (options.captionStyle === "animated") {
      // Word-by-word animation (TikTok style)
      const drawTextFilters = clipWords.map((word, i) => {
        const relStart = word.start - clipStart;
        const relEnd = word.end - clipStart;

        // Show word with scale animation
        return `drawtext=text='${word.word.replace(/'/g, "\\'")}':` +
          `fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:` +
          `fontsize=${fontSize}:` +
          `fontcolor=white:` +
          `borderw=2:bordercolor=black:` +
          `x=(w-text_w)/2:y=${yPosition}:` +
          `enable='between(t,${relStart},${relEnd})'`;
      });

      return drawTextFilters.join(",");
    } else {
      // Static captions - show current sentence
      // Group words into sentences/phrases
      const phrases = this.groupWordsIntoPhrases(clipWords, 6);

      const drawTextFilters = phrases.map((phrase) => {
        const relStart = phrase.start - clipStart;
        const relEnd = phrase.end - clipStart;
        const text = phrase.words.join(" ");

        return `drawtext=text='${text.replace(/'/g, "\\'")}':` +
          `fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:` +
          `fontsize=${fontSize}:` +
          `fontcolor=white:` +
          `borderw=2:bordercolor=black:` +
          `x=(w-text_w)/2:y=${yPosition}:` +
          `enable='between(t,${relStart},${relEnd})'`;
      });

      return drawTextFilters.join(",");
    }
  }

  /**
   * Group words into display phrases
   */
  private groupWordsIntoPhrases(
    words: WordTimestamp[],
    maxWords: number
  ): { words: string[]; start: number; end: number }[] {
    const phrases: { words: string[]; start: number; end: number }[] = [];
    let currentPhrase: string[] = [];
    let phraseStart = 0;
    let phraseEnd = 0;

    for (const word of words) {
      if (currentPhrase.length === 0) {
        phraseStart = word.start;
      }

      currentPhrase.push(word.word);
      phraseEnd = word.end;

      if (currentPhrase.length >= maxWords || word.word.match(/[.!?]$/)) {
        phrases.push({
          words: currentPhrase,
          start: phraseStart,
          end: phraseEnd,
        });
        currentPhrase = [];
      }
    }

    // Add remaining words
    if (currentPhrase.length > 0) {
      phrases.push({
        words: currentPhrase,
        start: phraseStart,
        end: phraseEnd,
      });
    }

    return phrases;
  }

  /**
   * Get dimensions for video format
   */
  private getDimensions(format: "9:16" | "1:1" | "16:9"): {
    width: number;
    height: number;
  } {
    switch (format) {
      case "9:16":
        return { width: 1080, height: 1920 }; // TikTok/Reels
      case "1:1":
        return { width: 1080, height: 1080 }; // Instagram feed
      case "16:9":
        return { width: 1920, height: 1080 }; // YouTube
      default:
        return { width: 1080, height: 1920 };
    }
  }

  /**
   * Get all clips for a project
   */
  async getProjectClips(projectId: string): Promise<SocialClip[]> {
    return db
      .select()
      .from(socialClips)
      .where(eq(socialClips.projectId, projectId))
      .orderBy(socialClips.viralPotential);
  }

  /**
   * Delete a clip
   */
  async deleteClip(clipId: string): Promise<void> {
    await db.delete(socialClips).where(eq(socialClips.id, clipId));
  }
}

// Export singleton
export const socialClipService = new SocialClipService();
