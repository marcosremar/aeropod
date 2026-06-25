import { NextRequest, NextResponse } from "next/server";
import { db, projects } from "@/lib/db";
import { eq } from "drizzle-orm";
import { generateTimelineThumbnails, probeVideo } from "@/lib/video/processor";
import { publicUploadsDir } from "@/lib/video/storage";
import { isFFmpegAvailable, FFmpegNotAvailableError } from "@/lib/audio/ffmpeg-utils";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/video/[id]/thumbnails
 * Lazily generate (and cache on disk) the timeline thumbnail strip for the editor.
 *
 * Response 200: { duration, thumbnails: Array<{ time, url }> }
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

    if (project.mediaType !== "video" || !project.videoUrl) {
      return NextResponse.json(
        { error: "O projeto não possui um vídeo de origem" },
        { status: 400 }
      );
    }

    if (!(await isFFmpegAvailable())) {
      return NextResponse.json(
        { error: new FFmpegNotAvailableError("Miniaturas de vídeo").message },
        { status: 503 }
      );
    }

    const path = await import("path");
    const fs = await import("fs/promises");

    const inputPath = project.videoUrl.startsWith("/")
      ? path.join(process.cwd(), "public", project.videoUrl)
      : project.videoUrl;

    // Cache dir on disk: public/uploads/thumbs/<id>/
    const thumbsDir = path.join(publicUploadsDir(), "thumbs", id);
    await fs.mkdir(thumbsDir, { recursive: true });

    // Determine duration (prefer stored, else probe).
    let duration = project.videoDuration ?? 0;
    if (!duration) {
      try {
        const meta = await probeVideo(inputPath);
        duration = meta.duration;
      } catch {
        duration = 0;
      }
    }

    const result = await generateTimelineThumbnails({
      inputPath,
      outputDir: thumbsDir,
    });

    return NextResponse.json({
      duration,
      thumbnails: result.thumbnails,
    });
  } catch (error) {
    console.error("[Video] Thumbnails error:", error);
    if (error instanceof FFmpegNotAvailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Falha ao gerar miniaturas" },
      { status: 500 }
    );
  }
}
