import { NextRequest, NextResponse } from "next/server";
import { db, projects } from "@/lib/db";
import type { AspectRatio } from "@/lib/db/schema";
import { saveVideoBuffer, publicUploadsDir } from "@/lib/video/storage";
import { probeVideo } from "@/lib/video/processor";
import { isFFmpegAvailable, FFmpegNotAvailableError } from "@/lib/audio/ffmpeg-utils";

// Allowed video file types (some browsers omit the MIME type)
const ALLOWED_TYPES = ["video/quicktime", "video/mp4"];
const ALLOWED_EXTENSIONS = ["mov", "mp4"];

// Maximum file size: 1GB
const MAX_FILE_SIZE = 1024 * 1024 * 1024;

const VALID_ASPECTS: AspectRatio[] = ["16:9", "9:16", "1:1"];

/**
 * POST /api/video/upload
 * Upload a phone video (.mov/.mp4) and create a video project.
 *
 * Multipart form-data: file, title, userId?, aspectRatio?
 * Response 201: { projectId, project }
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = formData.get("title") as string | null;
    const userId = formData.get("userId") as string | null;
    const aspectRatioRaw = formData.get("aspectRatio") as string | null;

    const aspectRatio: AspectRatio = VALID_ASPECTS.includes(
      aspectRatioRaw as AspectRatio
    )
      ? (aspectRatioRaw as AspectRatio)
      : "16:9";

    // Validate file
    if (!file) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado" },
        { status: 400 }
      );
    }

    // Validate extension
    const fileExtension = file.name.split(".").pop()?.toLowerCase();
    if (!fileExtension || !ALLOWED_EXTENSIONS.includes(fileExtension)) {
      return NextResponse.json(
        {
          error: `Tipo de arquivo inválido. Tipos permitidos: ${ALLOWED_EXTENSIONS.join(
            ", "
          )}`,
        },
        { status: 400 }
      );
    }

    // Validate MIME type (allow empty type if extension is valid, like the audio route)
    if (file.type !== "" && !ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Tipo MIME inválido. Tipos permitidos: ${ALLOWED_TYPES.join(
            ", "
          )}`,
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `Arquivo muito grande. Tamanho máximo: ${
            MAX_FILE_SIZE / (1024 * 1024)
          }MB`,
        },
        { status: 400 }
      );
    }

    // Validate title
    if (!title || title.trim().length === 0) {
      return NextResponse.json(
        { error: "O título é obrigatório" },
        { status: 400 }
      );
    }

    // ffmpeg/ffprobe is needed to probe duration + generate a poster.
    if (!(await isFFmpegAvailable())) {
      return NextResponse.json(
        { error: new FFmpegNotAvailableError("Upload de vídeo").message },
        { status: 503 }
      );
    }

    // Persist the file via the shared storage helper.
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = file.type || "video/mp4";
    const uniqueName = `${Date.now()}-source.${fileExtension}`;
    const videoUrl = await saveVideoBuffer(buffer, uniqueName, contentType);

    // Resolve a local path for probing/poster generation.
    const path = await import("path");
    const localVideoPath = videoUrl.startsWith("/")
      ? path.join(process.cwd(), "public", videoUrl)
      : path.join(publicUploadsDir(), uniqueName);

    // Probe metadata + generate poster frame.
    let videoDuration: number | null = null;
    let thumbnailUrl: string | null = null;

    try {
      const meta = await probeVideo(localVideoPath);
      videoDuration = meta.duration;

      // Generate a poster frame using a single-thumbnail strip.
      const { generateTimelineThumbnails } = await import("@/lib/video/processor");
      const fs = await import("fs/promises");
      const posterDir = path.join(publicUploadsDir(), "posters");
      await fs.mkdir(posterDir, { recursive: true });
      const strip = await generateTimelineThumbnails({
        inputPath: localVideoPath,
        count: 1,
        outputDir: posterDir,
      });
      thumbnailUrl = strip.thumbnails[0]?.url ?? null;
    } catch (probeError) {
      console.warn("[Video] Upload probe/poster failed:", probeError);
    }

    // Create the project row.
    const created = await db
      .insert(projects)
      .values({
        title: title.trim(),
        userId: userId || null,
        status: "uploaded",
        mediaType: "video",
        sourceType: "upload",
        videoUrl,
        thumbnailUrl,
        videoDuration,
        aspectRatio,
        videoStatus: "imported",
      })
      .returning();

    return NextResponse.json(
      { projectId: created[0].id, project: created[0] },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Video] Upload error:", error);
    if (error instanceof FFmpegNotAvailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Falha ao enviar o vídeo" },
      { status: 500 }
    );
  }
}
