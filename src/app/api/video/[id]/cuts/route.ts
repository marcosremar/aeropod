import { NextRequest, NextResponse } from "next/server";
import { db, projects } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { AspectRatio, VideoCutRange } from "@/lib/db/schema";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ASPECTS: AspectRatio[] = ["16:9", "9:16", "1:1"];

/**
 * Validate that an unknown value is a well-formed VideoCutRange[].
 * Each entry must have a string id and numeric start/end/order.
 */
function isValidCutRanges(value: unknown): value is VideoCutRange[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (r) =>
      r !== null &&
      typeof r === "object" &&
      typeof (r as VideoCutRange).id === "string" &&
      typeof (r as VideoCutRange).start === "number" &&
      typeof (r as VideoCutRange).end === "number" &&
      typeof (r as VideoCutRange).order === "number"
  );
}

/**
 * PUT /api/video/[id]/cuts
 * Persist edit state without rendering (autosave).
 *
 * Request JSON: { cutRanges: VideoCutRange[]; aspectRatio?: AspectRatio }
 * Response 200: { ok: true }
 */
export async function PUT(
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
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Corpo da requisição inválido" },
        { status: 400 }
      );
    }

    if (!isValidCutRanges(body.cutRanges)) {
      return NextResponse.json(
        { error: "cutRanges inválido" },
        { status: 400 }
      );
    }

    const cutRanges = body.cutRanges as VideoCutRange[];
    const aspectRatio: AspectRatio | undefined = VALID_ASPECTS.includes(
      body.aspectRatio
    )
      ? body.aspectRatio
      : undefined;

    // Ensure the project exists and is a video project.
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

    if (found[0].mediaType !== "video") {
      return NextResponse.json(
        { error: "Este projeto não é um projeto de vídeo" },
        { status: 400 }
      );
    }

    await db
      .update(projects)
      .set({
        cutRanges,
        ...(aspectRatio !== undefined ? { aspectRatio } : {}),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Video] Cuts autosave error:", error);
    return NextResponse.json(
      { error: "Falha ao salvar as edições" },
      { status: 500 }
    );
  }
}
