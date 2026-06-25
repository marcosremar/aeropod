import { NextRequest, NextResponse } from "next/server";
import { db, projects } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { AspectRatio, VideoCutRange } from "@/lib/db/schema";
import { renderCuts } from "@/lib/video/processor";
import { publicExportsDir } from "@/lib/video/storage";
import { isFFmpegAvailable, FFmpegNotAvailableError } from "@/lib/audio/ffmpeg-utils";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ASPECTS: AspectRatio[] = ["16:9", "9:16", "1:1"];

/**
 * POST /api/video/[id]/render
 * Render the final cut (trim + concat + aspect re-encode).
 *
 * Request JSON (optional overrides): { cutRanges?: VideoCutRange[]; aspectRatio?: AspectRatio }
 * Response 200: { downloadUrl, projectId, duration }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Validate UUID
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "Formato de ID de projeto inválido" },
      { status: 400 }
    );
  }

  try {
    // Parse optional overrides.
    const body = await request.json().catch(() => ({}));
    const overrideCutRanges = Array.isArray(body?.cutRanges)
      ? (body.cutRanges as VideoCutRange[])
      : undefined;
    const overrideAspect: AspectRatio | undefined = VALID_ASPECTS.includes(
      body?.aspectRatio
    )
      ? body.aspectRatio
      : undefined;

    // Load project.
    const found = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (found.length === 0) {
      return NextResponse.json(
        { error: "Projeto não encontrado" },
        { status: 404 }
      );
    }

    const project = found[0];

    if (project.mediaType !== "video") {
      return NextResponse.json(
        { error: "Este projeto não é um projeto de vídeo" },
        { status: 400 }
      );
    }

    if (!project.videoUrl) {
      return NextResponse.json(
        { error: "O projeto não possui um vídeo de origem" },
        { status: 400 }
      );
    }

    // Persist overrides if provided.
    if (overrideCutRanges !== undefined || overrideAspect !== undefined) {
      await db
        .update(projects)
        .set({
          ...(overrideCutRanges !== undefined
            ? { cutRanges: overrideCutRanges }
            : {}),
          ...(overrideAspect !== undefined
            ? { aspectRatio: overrideAspect }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id));
    }

    const cutRanges: VideoCutRange[] =
      overrideCutRanges ??
      ((project.cutRanges as VideoCutRange[] | null) ?? []);
    const aspectRatio: AspectRatio =
      overrideAspect ??
      ((project.aspectRatio as AspectRatio | null) ?? "16:9");

    // Check FFmpeg availability before mutating status.
    if (!(await isFFmpegAvailable())) {
      return NextResponse.json(
        { error: new FFmpegNotAvailableError("Exportação de vídeo").message },
        { status: 503 }
      );
    }

    // Mark rendering.
    await db
      .update(projects)
      .set({ videoStatus: "rendering", videoError: null, updatedAt: new Date() })
      .where(eq(projects.id, id));

    // Resolve a local input path.
    const path = await import("path");
    const inputPath = project.videoUrl.startsWith("/")
      ? path.join(process.cwd(), "public", project.videoUrl)
      : project.videoUrl;

    try {
      const result = await renderCuts({
        inputPath,
        cutRanges,
        aspectRatio,
        outputDir: publicExportsDir(),
        outputName: `video-${Date.now()}.mp4`,
      });

      await db
        .update(projects)
        .set({
          exportedVideoUrl: result.outputUrl,
          videoStatus: "rendered",
          videoError: null,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id));

      return NextResponse.json({
        downloadUrl: result.outputUrl,
        projectId: id,
        duration: result.duration,
      });
    } catch (renderError) {
      const message =
        renderError instanceof Error
          ? renderError.message
          : "Falha ao renderizar o vídeo";

      await db
        .update(projects)
        .set({
          videoStatus: "error",
          videoError: message,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id));

      if (renderError instanceof FFmpegNotAvailableError) {
        return NextResponse.json({ error: message }, { status: 503 });
      }
      throw renderError;
    }
  } catch (error) {
    console.error("[Video] Render error:", error);
    if (error instanceof FFmpegNotAvailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Falha ao renderizar o vídeo" },
      { status: 500 }
    );
  }
}
