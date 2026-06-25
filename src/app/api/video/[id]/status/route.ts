import { NextRequest, NextResponse } from "next/server";
import { db, projects } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { AspectRatio, VideoCutRange } from "@/lib/db/schema";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/video/[id]/status
 * Poll import/render progress for the editor UI.
 *
 * Response 200: {
 *   videoStatus, videoError, videoUrl, thumbnailUrl,
 *   exportedVideoUrl, videoDuration, aspectRatio, cutRanges
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "Formato de ID de projeto inválido" },
      { status: 400 }
    );
  }

  try {
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

    return NextResponse.json({
      videoStatus: project.videoStatus ?? null,
      videoError: project.videoError ?? null,
      videoUrl: project.videoUrl ?? null,
      thumbnailUrl: project.thumbnailUrl ?? null,
      exportedVideoUrl: project.exportedVideoUrl ?? null,
      videoDuration: project.videoDuration ?? null,
      aspectRatio: (project.aspectRatio as AspectRatio | null) ?? null,
      cutRanges: (project.cutRanges as VideoCutRange[] | null) ?? null,
    });
  } catch (error) {
    console.error("[Video] Status error:", error);
    return NextResponse.json(
      { error: "Falha ao obter o status do vídeo" },
      { status: 500 }
    );
  }
}
