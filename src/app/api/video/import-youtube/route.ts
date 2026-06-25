import { NextRequest, NextResponse } from "next/server";
import { db, projects } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { AspectRatio } from "@/lib/db/schema";
import {
  isValidYouTubeUrl,
  isYtDlpAvailable,
  importFromYouTube,
  YtDlpNotAvailableError,
} from "@/lib/video/youtube";
import { isFFmpegAvailable, FFmpegNotAvailableError } from "@/lib/audio/ffmpeg-utils";

const VALID_ASPECTS: AspectRatio[] = ["16:9", "9:16", "1:1"];

/**
 * POST /api/video/import-youtube
 * Import a video from a YouTube URL via yt-dlp.
 *
 * Request JSON: { url: string; title?: string; userId?: string; aspectRatio?: '16:9'|'9:16'|'1:1' }
 * Response 201: { projectId, project }
 */
export async function POST(request: NextRequest) {
  let projectId: string | null = null;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Corpo da requisição inválido" },
        { status: 400 }
      );
    }

    const url = typeof body.url === "string" ? body.url.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const userId = typeof body.userId === "string" ? body.userId : null;
    const aspectRatio: AspectRatio = VALID_ASPECTS.includes(body.aspectRatio)
      ? body.aspectRatio
      : "16:9";

    // Validate URL
    if (!url || !isValidYouTubeUrl(url)) {
      return NextResponse.json(
        { error: "URL do YouTube inválida" },
        { status: 400 }
      );
    }

    // Check required binaries up front, return 503 with a clear message.
    if (!(await isYtDlpAvailable())) {
      return NextResponse.json(
        {
          error:
            "yt-dlp não está instalado no servidor. Instale o yt-dlp (https://github.com/yt-dlp/yt-dlp) para importar do YouTube.",
        },
        { status: 503 }
      );
    }

    if (!(await isFFmpegAvailable())) {
      return NextResponse.json(
        { error: new FFmpegNotAvailableError("Importação de vídeo").message },
        { status: 503 }
      );
    }

    // Create the project row first (status 'importing') so the client can poll.
    const created = await db
      .insert(projects)
      .values({
        title: title || "Vídeo do YouTube",
        userId,
        status: "uploaded",
        mediaType: "video",
        sourceType: "youtube",
        sourceUrl: url,
        aspectRatio,
        videoStatus: "importing",
      })
      .returning();

    projectId = created[0].id;

    // Run the import inline for MVP, updating the row on completion/failure.
    try {
      const result = await importFromYouTube({ url });

      const updated = await db
        .update(projects)
        .set({
          title: title || result.title || "Vídeo do YouTube",
          videoUrl: result.videoUrl,
          thumbnailUrl: result.thumbnailUrl,
          videoDuration: result.duration,
          videoStatus: "imported",
          videoError: null,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId))
        .returning();

      return NextResponse.json(
        { projectId, project: updated[0] },
        { status: 201 }
      );
    } catch (importError) {
      const message =
        importError instanceof Error
          ? importError.message
          : "Falha ao importar o vídeo do YouTube";

      await db
        .update(projects)
        .set({
          videoStatus: "error",
          videoError: message,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId));

      if (
        importError instanceof YtDlpNotAvailableError ||
        importError instanceof FFmpegNotAvailableError
      ) {
        return NextResponse.json({ error: message, projectId }, { status: 503 });
      }

      return NextResponse.json({ error: message, projectId }, { status: 500 });
    }
  } catch (error) {
    console.error("[Video] YouTube import error:", error);
    return NextResponse.json(
      { error: "Falha ao importar o vídeo do YouTube" },
      { status: 500 }
    );
  }
}
