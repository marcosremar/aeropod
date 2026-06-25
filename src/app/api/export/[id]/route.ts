import { NextRequest, NextResponse } from "next/server";
import { db, projects, segments } from "@/lib/db";
import { eq, and, asc } from "drizzle-orm";
import { TextCut } from "@/lib/db/schema";
import { isFFmpegAvailable, FFmpegNotAvailableError } from "@/lib/audio/ffmpeg-utils";

/**
 * POST /api/export/[id]
 * Generate final audio from selected segments
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

    // Get project
    const projectResults = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (projectResults.length === 0) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const project = projectResults[0];

    // Check if project is ready for export
    if (project.status !== "ready" && project.status !== "completed") {
      return NextResponse.json(
        {
          error: `Project is not ready for export. Current status: ${project.status}`,
        },
        { status: 400 }
      );
    }

    // Get selected segments in order
    const selectedSegments = await db
      .select()
      .from(segments)
      .where(
        and(
          eq(segments.projectId, id),
          eq(segments.isSelected, true)
        )
      )
      .orderBy(asc(segments.order));

    if (selectedSegments.length === 0) {
      return NextResponse.json(
        { error: "No segments selected for export" },
        { status: 400 }
      );
    }

    // Generate edited audio
    const editedAudioUrl = await generateEditedAudio(
      project.originalAudioUrl!,
      selectedSegments
    );

    // Update project with edited audio URL
    await db
      .update(projects)
      .set({
        editedAudioUrl,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id));

    return NextResponse.json({
      message: "Export completed successfully",
      downloadUrl: editedAudioUrl,
      projectId: id,
      segmentCount: selectedSegments.length,
    });
  } catch (error) {
    console.error("Export error:", error);
    if (error instanceof FFmpegNotAvailableError) {
      return NextResponse.json(
        { error: error.message },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Failed to export audio" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/export/[id]
 * Get export status or download URL if already exported
 */
export async function GET(
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

    // Get project
    const projectResults = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (projectResults.length === 0) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const project = projectResults[0];

    if (!project.editedAudioUrl) {
      return NextResponse.json({
        exported: false,
        message: "Project has not been exported yet",
      });
    }

    return NextResponse.json({
      exported: true,
      downloadUrl: project.editedAudioUrl,
      projectId: id,
    });
  } catch (error) {
    console.error("Export status error:", error);
    return NextResponse.json(
      { error: "Failed to get export status" },
      { status: 500 }
    );
  }
}

/**
 * Segment with text cuts for export
 */
interface SegmentWithCuts {
  startTime: number;
  endTime: number;
  order: number | null;
  textCuts?: TextCut[] | null;
}

/**
 * Generate edited audio from selected segments
 * Applies text-based cuts to remove deleted words from audio
 */
async function generateEditedAudio(
  originalAudioUrl: string,
  selectedSegments: SegmentWithCuts[]
): Promise<string> {
  console.log(`[Export] Generating edited audio from ${selectedSegments.length} segments`);
  console.log(`[Export] Original audio: ${originalAudioUrl}`);

  // Count total cuts
  const totalCuts = selectedSegments.reduce(
    (sum, seg) => sum + (seg.textCuts?.length || 0),
    0
  );
  console.log(`[Export] Total text-based cuts to apply: ${totalCuts}`);

  // Check if FFmpeg is actually installed (the binary, not just the JS wrapper).
  const ffmpegAvailable = await isFFmpegAvailable();

  // Allow an explicit opt-in to mock exports for local development/testing only.
  const allowMock = process.env.ALLOW_MOCK_EXPORT === "true";

  if (!ffmpegAvailable) {
    if (allowMock) {
      console.warn(
        "[Export] FFmpeg not available, using mock export (ALLOW_MOCK_EXPORT=true)."
      );
      return generateMockExport(originalAudioUrl, selectedSegments);
    }
    // Fail loudly instead of returning a fake download URL.
    throw new FFmpegNotAvailableError("Audio export");
  }

  // Use FFmpeg to:
  // 1. Extract each segment from the original audio
  // 2. Concatenate segments in order
  // 3. Return the download URL
  return await generateRealExport(originalAudioUrl, selectedSegments);
}

/**
 * Calculate sub-segments after applying text cuts
 * Returns array of {startTime, endTime} for parts to KEEP
 */
function calculateSubSegments(
  segmentStart: number,
  segmentEnd: number,
  textCuts: TextCut[] | null | undefined
): Array<{ startTime: number; endTime: number }> {
  if (!textCuts || textCuts.length === 0) {
    // No cuts, keep the whole segment
    return [{ startTime: segmentStart, endTime: segmentEnd }];
  }

  // Sort cuts by start time
  const sortedCuts = [...textCuts].sort((a, b) => a.startTime - b.startTime);

  const subSegments: Array<{ startTime: number; endTime: number }> = [];
  let currentStart = segmentStart;

  for (const cut of sortedCuts) {
    // Add the part before this cut (if any)
    if (cut.startTime > currentStart) {
      subSegments.push({
        startTime: currentStart,
        endTime: Math.min(cut.startTime, segmentEnd),
      });
    }
    // Move past this cut
    currentStart = Math.max(currentStart, cut.endTime);
  }

  // Add remaining part after last cut
  if (currentStart < segmentEnd) {
    subSegments.push({
      startTime: currentStart,
      endTime: segmentEnd,
    });
  }

  return subSegments;
}

/**
 * Generate real audio export using FFmpeg
 * Applies text-based cuts to remove deleted words
 */
async function generateRealExport(
  originalAudioUrl: string,
  selectedSegments: SegmentWithCuts[]
): Promise<string> {
  const ffmpeg = (await import("fluent-ffmpeg")).default;
  const fs = await import("fs/promises");
  const path = await import("path");

  // Resolve original audio file path
  let audioPath: string;
  if (originalAudioUrl.startsWith("/")) {
    // Relative to public directory
    audioPath = path.join(process.cwd(), "public", originalAudioUrl);
  } else if (originalAudioUrl.startsWith("http")) {
    throw new Error("HTTP URLs not supported yet. Use local files.");
  } else {
    audioPath = originalAudioUrl;
  }

  console.log(`[Export] Processing audio file: ${audioPath}`);

  // Create exports directory
  const exportsDir = path.join(process.cwd(), "public", "exports");
  await fs.mkdir(exportsDir, { recursive: true });

  // Generate unique filename
  const timestamp = Date.now();
  const segmentCount = selectedSegments.length;

  // Calculate all sub-segments (applying text cuts)
  const allSubSegments: Array<{ startTime: number; endTime: number }> = [];
  for (const segment of selectedSegments) {
    const subSegs = calculateSubSegments(
      segment.startTime,
      segment.endTime,
      segment.textCuts as TextCut[] | null
    );
    allSubSegments.push(...subSegs);
  }

  const totalDuration = allSubSegments.reduce(
    (sum, seg) => sum + (seg.endTime - seg.startTime),
    0
  );

  console.log(`[Export] After applying cuts: ${allSubSegments.length} sub-segments, ${totalDuration.toFixed(2)}s total`);

  const outputFilename = `edited-${timestamp}-${segmentCount}seg-${Math.floor(totalDuration)}s.mp3`;
  const outputPath = path.join(exportsDir, outputFilename);
  const tempDir = path.join(exportsDir, `temp-${timestamp}`);

  try {
    // Create temp directory for segment files
    await fs.mkdir(tempDir, { recursive: true });

    console.log(`[Export] Extracting ${allSubSegments.length} sub-segments...`);

    // Extract each sub-segment
    const segmentFiles: string[] = [];
    for (let i = 0; i < allSubSegments.length; i++) {
      const subSeg = allSubSegments[i];
      const duration = subSeg.endTime - subSeg.startTime;

      // Skip very short segments (less than 50ms)
      if (duration < 0.05) {
        console.log(`[Export] Skipping sub-segment ${i + 1} (too short: ${duration.toFixed(3)}s)`);
        continue;
      }

      const segmentPath = path.join(tempDir, `segment-${i}.mp3`);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(audioPath)
          .setStartTime(subSeg.startTime)
          .setDuration(duration)
          .output(segmentPath)
          .on("end", () => {
            console.log(`[Export] Extracted sub-segment ${i + 1}/${allSubSegments.length} (${subSeg.startTime.toFixed(2)}s - ${subSeg.endTime.toFixed(2)}s)`);
            resolve();
          })
          .on("error", (err: Error) => {
            console.error(`[Export] Error extracting sub-segment ${i}:`, err);
            reject(err);
          })
          .run();
      });

      segmentFiles.push(segmentPath);
    }

    console.log(`[Export] Concatenating ${segmentFiles.length} sub-segments...`);

    // Create concat file list
    const concatListPath = path.join(tempDir, "concat-list.txt");
    const concatListContent = segmentFiles
      .map((f) => `file '${f}'`)
      .join("\n");
    await fs.writeFile(concatListPath, concatListContent);

    // Concatenate all segments
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(["-f", "concat", "-safe", "0"])
        .outputOptions(["-c", "copy"])
        .output(outputPath)
        .on("end", () => {
          console.log(`[Export] Concatenation complete`);
          resolve();
        })
        .on("error", (err) => {
          console.error(`[Export] Error concatenating:`, err);
          reject(err);
        })
        .run();
    });

    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });

    const downloadUrl = `/exports/${outputFilename}`;
    console.log(`[Export] Export complete: ${downloadUrl}`);

    return downloadUrl;
  } catch (error) {
    // Clean up on error
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error("[Export] Error during cleanup:", cleanupError);
    }
    throw error;
  }
}

/**
 * Generate mock export URL for development
 */
function generateMockExport(
  originalAudioUrl: string,
  selectedSegments: SegmentWithCuts[]
): string {
  const segmentCount = selectedSegments.length;

  // Calculate duration after applying text cuts
  let totalDuration = 0;
  for (const segment of selectedSegments) {
    const subSegs = calculateSubSegments(
      segment.startTime,
      segment.endTime,
      segment.textCuts as TextCut[] | null
    );
    totalDuration += subSegs.reduce((sum, seg) => sum + (seg.endTime - seg.startTime), 0);
  }

  const totalCuts = selectedSegments.reduce(
    (sum, seg) => sum + (seg.textCuts?.length || 0),
    0
  );

  const mockUrl = `http://localhost:3000/exports/${Date.now()}-edited-${segmentCount}segments-${Math.floor(totalDuration)}s.mp3`;

  console.log(`[Export] Mock export URL: ${mockUrl}`);
  console.log(`[Export] Segments: ${segmentCount}, Text cuts: ${totalCuts}, Duration: ${totalDuration.toFixed(2)}s`);

  return mockUrl;
}
