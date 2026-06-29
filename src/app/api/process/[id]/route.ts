import { NextRequest, NextResponse } from "next/server";
import { db, projects, segments } from "@/lib/db";
import { eq } from "drizzle-orm";
import Groq from "groq-sdk";
import * as fs from "fs";
import * as path from "path";
import { aiCompleteJSON } from "@/lib/ai/AIService";
import { getForcedAlignerService } from "@/lib/audio/forced-aligner";

const GROQ_API_KEY = process.env.GROQ_API_KEY;

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  words?: WordTimestamp[];
}

interface SegmentAnalysis {
  topic: string;
  interestScore: number;
  clarityScore: number;
  isTangent: boolean;
  isRepetition: boolean;
  keyInsight: string;
  hasFactualError: boolean;
  hasContradiction: boolean;
  isConfusing: boolean;
  isIncomplete: boolean;
  needsRerecord: boolean;
  rerecordSuggestion?: string;
}

/**
 * POST /api/process/[id]
 * Start processing a project through the pipeline
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate UUID format
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json(
        { error: "Invalid project ID format" },
        { status: 400 }
      );
    }

    // Check if project exists
    const existingProject = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (existingProject.length === 0) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const project = existingProject[0];

    // Check if project has audio
    if (!project.originalAudioUrl) {
      return NextResponse.json(
        { error: "Project has no audio file" },
        { status: 400 }
      );
    }

    // Check if already processing
    const IN_PROGRESS_STATUSES = ["processing", "transcribing", "aligning", "analyzing"];
    if (IN_PROGRESS_STATUSES.includes(project.status ?? "")) {
      return NextResponse.json(
        { error: "Project is already being processed" },
        { status: 409 }
      );
    }

    // Check for Groq API key
    if (!GROQ_API_KEY) {
      return NextResponse.json(
        { error: "GROQ_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Start processing in background
    const projectLanguage = project.language || "pt";
    processInBackground(id, project.originalAudioUrl, projectLanguage);

    return NextResponse.json({
      message: "Processing started",
      projectId: id,
      status: "processing",
    });
  } catch (error) {
    console.error("Process error:", error);
    return NextResponse.json(
      { error: "Failed to start processing" },
      { status: 500 }
    );
  }
}

/**
 * Process the pipeline in the background
 */
async function processInBackground(projectId: string, audioUrl: string, language: string = "pt") {
  const groq = new Groq({ apiKey: GROQ_API_KEY });

  // Determine which transcription service to use
  const useCrisperWhisper = process.env.USE_CRISPER_WHISPER === "true";
  console.log(`[Pipeline] Using ${useCrisperWhisper ? 'CrisperWhisper' : 'Groq Whisper'} for transcription, language: ${language}`);

  try {
    console.log(`[Pipeline] Starting processing for project ${projectId}`);

    // Update status to transcribing
    await db
      .update(projects)
      .set({ status: "transcribing", progress: 10, updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    // 1. Transcribe audio
    console.log(`[Pipeline] Transcribing audio...`);
    let transcription: TranscriptionSegment[];
    let detectedFillers: Array<{ word: string; start: number; end: number; confidence: number }> = [];

    if (useCrisperWhisper) {
      // Use CrisperWhisper for verbatim transcription with filler detection
      const { transcribeFromUrl, transcribeFromBase64 } = await import("@/services/crisper-whisper");

      let crisperResult;

      if (audioUrl.startsWith('http')) {
        // External URL - pass directly
        crisperResult = await transcribeFromUrl(audioUrl, language as "pt" | "en" | "es");
      } else {
        // Local file - read and send as base64
        const relativePath = audioUrl.startsWith('/') ? audioUrl.slice(1) : audioUrl;
        const filePath = path.join(process.cwd(), 'public', relativePath);

        if (!fs.existsSync(filePath)) {
          throw new Error(`Audio file not found: ${filePath}`);
        }

        const audioBuffer = fs.readFileSync(filePath);
        const audioBase64 = audioBuffer.toString('base64');
        console.log(`[Pipeline] Sending audio to CrisperWhisper: ${audioBuffer.length} bytes`);

        crisperResult = await transcribeFromBase64(audioBase64, language as "pt" | "en" | "es");
      }

      if (!crisperResult.success) {
        throw new Error(`CrisperWhisper transcription failed: ${crisperResult.error}`);
      }

      // Convert CrisperWhisper segments to pipeline format
      transcription = (crisperResult.segments || []).map((seg, idx) => ({
        start: seg.start,
        end: seg.end,
        text: seg.text,
        words: seg.words?.map(w => ({
          word: w.word,
          start: w.start,
          end: w.end,
        })),
      }));

      // Store detected fillers for later use
      detectedFillers = crisperResult.fillers || [];
      console.log(`[Pipeline] CrisperWhisper detected ${detectedFillers.length} filler words`);
    } else {
      // Use Groq Whisper
      transcription = await transcribeAudio(groq, audioUrl, language);
    }
    console.log(`[Pipeline] Transcription complete: ${transcription.length} segments`);

    // Calculate duration
    const audioDuration = Math.ceil(transcription[transcription.length - 1]?.end || 0);

    // Update project with transcription text
    const fullText = transcription.map(s => s.text).join(" ");
    await db
      .update(projects)
      .set({
        transcription: fullText,
        originalDuration: audioDuration,
        status: "aligning",
        progress: 20,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    // 1.5. Refine word timestamps with Forced Aligner (~20ms precision vs ~100-200ms from Whisper)
    console.log(`[Pipeline] Refining word timestamps with Forced Aligner...`);
    try {
      const forcedAligner = getForcedAlignerService();

      // Read audio file directly and convert to base64
      let audioBase64: string | null = null;
      if (!audioUrl.startsWith('http')) {
        const relativePath = audioUrl.startsWith('/') ? audioUrl.slice(1) : audioUrl;
        const filePath = path.join(process.cwd(), 'public', relativePath);
        if (fs.existsSync(filePath)) {
          const audioBuffer = fs.readFileSync(filePath);
          audioBase64 = audioBuffer.toString('base64');
          console.log(`[Pipeline] Read audio file: ${filePath}, size: ${audioBuffer.length} bytes`);
        }
      }

      // Use file:// URL with base64 data for the aligner
      const absoluteAudioUrl = audioBase64
        ? `data:audio/mpeg;base64,${audioBase64}`
        : (audioUrl.startsWith('http') ? audioUrl : `http://localhost:3000${audioUrl}`);

      const alignmentResult = await forcedAligner.alignSegments(
        absoluteAudioUrl,
        transcription.map(s => ({ start: s.start, end: s.end, text: s.text })),
        "por"
      );

      if (alignmentResult.success) {
        // Update transcription with precise word timestamps
        transcription = transcription.map((seg, idx) => {
          const aligned = alignmentResult.segments[idx];
          if (aligned && aligned.word_timestamps && aligned.word_timestamps.length > 0) {
            return {
              ...seg,
              words: aligned.word_timestamps.map(wt => ({
                word: wt.word,
                start: wt.start,
                end: wt.end,
              })),
            };
          }
          return seg;
        });
        console.log(`[Pipeline] Forced alignment complete: ${alignmentResult.segments.length} segments refined`);
      } else {
        console.warn(`[Pipeline] Forced alignment failed: ${alignmentResult.error}`);
        console.warn(`[Pipeline] Falling back to Whisper word timestamps`);
      }
    } catch (alignError) {
      console.warn(`[Pipeline] Forced alignment error (non-critical):`, alignError);
      console.warn(`[Pipeline] Falling back to Whisper word timestamps`);
    }

    // Update status to analyzing
    await db
      .update(projects)
      .set({
        status: "analyzing",
        progress: 25,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    // 1.6. Extract waveform peaks (for timeline visualization)
    console.log(`[Pipeline] Extracting waveform peaks...`);
    try {
      const { extractWaveformPeaks } = await import("@/lib/audio/waveform");
      const waveformData = await extractWaveformPeaks(audioUrl, audioDuration);
      console.log(`[Pipeline] Waveform extracted: ${waveformData.peaks.length} peaks`);

      // Save waveform peaks to project
      await db
        .update(projects)
        .set({
          waveformPeaks: waveformData.peaks as any,
          progress: 30,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId));
    } catch (waveformError) {
      console.warn(`[Pipeline] Waveform extraction failed (non-critical):`, waveformError);
      // Continue pipeline even if waveform extraction fails
    }

    // 2. Analyze segments
    console.log(`[Pipeline] Analyzing segments...`);
    const context = transcription.slice(0, 5).map(s => s.text).join(" ").substring(0, 500);
    const previousTopics: string[] = [];
    const analyzedSegments: Array<TranscriptionSegment & { analysis: SegmentAnalysis; words?: WordTimestamp[] }> = [];

    for (let i = 0; i < transcription.length; i++) {
      const seg = transcription[i];
      console.log(`[Pipeline] Analyzing segment ${i + 1}/${transcription.length}`);

      try {
        const analysis = await analyzeSegment(seg, context, previousTopics.slice(-5));
        analyzedSegments.push({ ...seg, analysis, words: seg.words });
        previousTopics.push(analysis.topic);
      } catch (error) {
        console.error(`[Pipeline] Error analyzing segment ${i}:`, error);
        analyzedSegments.push({
          ...seg,
          analysis: {
            topic: "Erro na analise",
            interestScore: 5,
            clarityScore: 5,
            isTangent: false,
            isRepetition: false,
            keyInsight: "",
            hasFactualError: false,
            hasContradiction: false,
            isConfusing: false,
            isIncomplete: false,
            needsRerecord: false,
          },
          words: seg.words,
        });
      }

      // Update progress (30% to 80% during analysis)
      const analysisProgress = Math.floor(30 + ((i + 1) / transcription.length) * 50);
      await db
        .update(projects)
        .set({ progress: analysisProgress, updatedAt: new Date() })
        .where(eq(projects.id, projectId));

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 100));
    }

    // 3. Select best segments
    console.log(`[Pipeline] Selecting best segments...`);
    const selectedSegments = selectBestSegments(analyzedSegments);

    // 4. Delete existing segments for this project
    await db.delete(segments).where(eq(segments.projectId, projectId));

    // 5. Insert new segments with word timestamps
    console.log(`[Pipeline] Saving ${analyzedSegments.length} segments to database...`);
    for (let i = 0; i < analyzedSegments.length; i++) {
      const seg = analyzedSegments[i];
      const isSelected = selectedSegments.some(s => s.start === seg.start && s.end === seg.end);

      await db.insert(segments).values({
        projectId,
        startTime: seg.start,
        endTime: seg.end,
        text: seg.text,
        topic: seg.analysis.topic,
        interestScore: seg.analysis.interestScore,
        clarityScore: seg.analysis.clarityScore,
        keyInsight: seg.analysis.keyInsight,
        isSelected,
        order: isSelected ? selectedSegments.findIndex(s => s.start === seg.start) : null,
        analysis: seg.analysis as any,
        hasError: seg.analysis.hasFactualError || seg.analysis.hasContradiction,
        errorType: seg.analysis.hasFactualError ? "factual" : seg.analysis.hasContradiction ? "contradiction" : null,
        errorDetail: seg.analysis.hasFactualError ? "Erro factual detectado" : seg.analysis.hasContradiction ? "Contradicao detectada" : null,
        wordTimestamps: seg.words as any, // Save word-level timestamps for text-based editing
      });
    }

    // 6. Detect filler words
    console.log(`[Pipeline] Detecting filler words...`);
    try {
      let fillerCount = 0;

      if (useCrisperWhisper && detectedFillers.length > 0) {
        // Use fillers already detected by CrisperWhisper
        fillerCount = detectedFillers.length;
        console.log(`[Pipeline] Using ${fillerCount} fillers from CrisperWhisper`);
      } else {
        // Fall back to text-based detection
        const { processProjectFillers } = await import("@/lib/audio/filler-detection");
        const fillerResult = await processProjectFillers(projectId);
        fillerCount = fillerResult.stats.totalCount;
        console.log(`[Pipeline] Detected ${fillerCount} filler words via text matching`);
      }

      // Update filler count in project
      await db
        .update(projects)
        .set({ fillerWordsCount: fillerCount, updatedAt: new Date() })
        .where(eq(projects.id, projectId));
    } catch (fillerError) {
      console.warn(`[Pipeline] Filler detection failed (non-critical):`, fillerError);
      // Continue pipeline even if filler detection fails
    }

    // 7. Update project status
    await db
      .update(projects)
      .set({ status: "completed", progress: 100, updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    console.log(`[Pipeline] Processing complete for project ${projectId}`);
  } catch (error) {
    console.error(`[Pipeline] Error processing project ${projectId}:`, error);

    // Extract error message
    let errorMessage = "Unknown error occurred";
    if (error instanceof Error) {
      errorMessage = error.message;
      // If it's a Groq API error, extract the message
      if ('error' in error && typeof error.error === 'object' && error.error !== null) {
        const apiError = error.error as any;
        if (apiError.message) {
          errorMessage = `API Error: ${apiError.message}`;
        }
      }
    }

    // Update project status to failed with error message
    await db
      .update(projects)
      .set({
        status: "failed",
        errorMessage,
        progress: 0, // Reset progress on failure
        updatedAt: new Date()
      })
      .where(eq(projects.id, projectId));
  }
}

/**
 * Transcribe audio using Groq Whisper
 */
async function transcribeAudio(groq: Groq, audioUrl: string, language: string = "pt"): Promise<TranscriptionSegment[]> {
  // If it's a local file path, read it
  let audioData: Buffer;

  if (audioUrl.startsWith("file://")) {
    const filePath = audioUrl.replace("file://", "");
    audioData = fs.readFileSync(filePath);
  } else if (audioUrl.startsWith("http")) {
    // Fetch from URL
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    audioData = Buffer.from(arrayBuffer);
  } else {
    // Assume it's a relative path in public folder (e.g., /uploads/audio.mp3)
    // Remove leading slash if present for path.join to work correctly
    const relativePath = audioUrl.startsWith("/") ? audioUrl.slice(1) : audioUrl;
    const filePath = path.join(process.cwd(), "public", relativePath);
    console.log(`[Pipeline] Looking for audio at: ${filePath}`);
    if (fs.existsSync(filePath)) {
      audioData = fs.readFileSync(filePath);
    } else {
      throw new Error(`Audio file not found: ${filePath}`);
    }
  }

  const transcription = await groq.audio.transcriptions.create({
    file: new File([new Uint8Array(audioData)], "audio.mp3", { type: "audio/mpeg" }),
    model: "whisper-large-v3",
    response_format: "verbose_json",
    language: language,
    timestamp_granularities: ["word", "segment"], // Enable word-level timestamps
  });

  const result = transcription as unknown as {
    segments: Array<{ start: number; end: number; text: string }>;
    words?: Array<{ word: string; start: number; end: number }>;
  };

  const words = result.words || [];

  return (result.segments || []).map((s) => {
    // Find words that belong to this segment
    const segmentWords: WordTimestamp[] = words
      .filter(w => w.start >= s.start && w.end <= s.end)
      .map(w => ({
        word: w.word,
        start: Math.round(w.start * 100) / 100,
        end: Math.round(w.end * 100) / 100,
      }));

    return {
      start: Math.round(s.start * 100) / 100,
      end: Math.round(s.end * 100) / 100,
      text: s.text.trim(),
      words: segmentWords.length > 0 ? segmentWords : undefined,
    };
  });
}

/**
 * Analyze a segment using AIService
 */
async function analyzeSegment(
  segment: TranscriptionSegment,
  context: string,
  previousTopics: string[]
): Promise<SegmentAnalysis> {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const prompt = `Voce e um editor de podcast experiente. Analise este segmento de audio transcrito.

CONTEXTO DO EPISODIO:
${context}

TOPICOS JA DISCUTIDOS:
${previousTopics.length > 0 ? previousTopics.join(", ") : "Nenhum ainda"}

SEGMENTO A ANALISAR (${formatTime(segment.start)} - ${formatTime(segment.end)}):
"${segment.text}"

Retorne APENAS um JSON valido:
{
  "topic": "topico principal (2-4 palavras)",
  "interestScore": 1-10,
  "clarityScore": 1-10,
  "isTangent": true/false,
  "isRepetition": true/false,
  "keyInsight": "insight principal ou vazio",
  "hasFactualError": true/false,
  "hasContradiction": true/false,
  "isConfusing": true/false,
  "isIncomplete": true/false,
  "needsRerecord": true/false,
  "rerecordSuggestion": "sugestao se precisar regravar"
}`;

  return await aiCompleteJSON<SegmentAnalysis>("segment_analysis", prompt);
}

/**
 * Select best segments for the final podcast
 */
function selectBestSegments(
  segments: Array<TranscriptionSegment & { analysis: SegmentAnalysis }>
): Array<TranscriptionSegment & { analysis: SegmentAnalysis }> {
  // Filter out tangents, repetitions, and errors
  const validSegments = segments.filter((seg) => {
    if (seg.analysis.isTangent) return false;
    if (seg.analysis.isRepetition) return false;
    if (seg.analysis.hasFactualError) return false;
    if (seg.analysis.hasContradiction) return false;
    if (seg.analysis.interestScore < 5) return false;
    return true;
  });

  // Sort by combined score
  const scored = validSegments.map((s) => ({
    ...s,
    score: s.analysis.interestScore * 0.6 + s.analysis.clarityScore * 0.4,
  }));
  scored.sort((a, b) => b.score - a.score);

  // Calculate target duration (aim for ~60% of original)
  const originalDuration = segments.reduce((sum, s) => sum + (s.end - s.start), 0);
  const targetDuration = originalDuration * 0.6;

  // Select segments up to target duration
  const selected: typeof scored = [];
  let totalDuration = 0;

  for (const seg of scored) {
    const duration = seg.end - seg.start;
    if (totalDuration + duration <= targetDuration) {
      selected.push(seg);
      totalDuration += duration;
    }
  }

  // Re-sort by original time order
  selected.sort((a, b) => a.start - b.start);

  return selected;
}
