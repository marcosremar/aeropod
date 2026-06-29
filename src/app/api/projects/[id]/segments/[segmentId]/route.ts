import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { segments } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// PATCH - Update a segment (for text-based editing)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; segmentId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { id: projectId, segmentId } = resolvedParams;
    const updates = await request.json();

    console.log("[Segment API] PATCH received:", { projectId, segmentId, updates });

    // Validate the segment belongs to this project
    const [existingSegment] = await db
      .select()
      .from(segments)
      .where(
        and(
          eq(segments.id, segmentId),
          eq(segments.projectId, projectId)
        )
      )
      .limit(1);

    if (!existingSegment) {
      return NextResponse.json(
        { error: "Segment not found" },
        { status: 404 }
      );
    }

    // Filter allowed update fields
    const allowedFields = [
      "text",
      "editedText",
      "wordTimestamps",
      "textCuts",
      "isSelected",
      "topic",
      "interestScore",
      "clarityScore",
    ];

    const filteredUpdates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    }

    // Always stamp the modification time
    filteredUpdates.updatedAt = new Date();

    console.log("[Segment API] Filtered updates:", filteredUpdates);

    // Update the segment
    const [updatedSegment] = await db
      .update(segments)
      .set(filteredUpdates)
      .where(eq(segments.id, segmentId))
      .returning();

    return NextResponse.json({
      success: true,
      segment: updatedSegment,
    });
  } catch (error) {
    console.error("Error updating segment:", error);
    return NextResponse.json(
      { error: "Failed to update segment" },
      { status: 500 }
    );
  }
}

// GET - Get a single segment
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; segmentId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { id: projectId, segmentId } = resolvedParams;

    const [segment] = await db
      .select()
      .from(segments)
      .where(
        and(
          eq(segments.id, segmentId),
          eq(segments.projectId, projectId)
        )
      )
      .limit(1);

    if (!segment) {
      return NextResponse.json(
        { error: "Segment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ segment });
  } catch (error) {
    console.error("Error fetching segment:", error);
    return NextResponse.json(
      { error: "Failed to fetch segment" },
      { status: 500 }
    );
  }
}
