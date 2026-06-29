import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, projects, segments } from "@/lib/db";
import { eq, and } from "drizzle-orm";

// Validation schema for updating a project
const updateProjectSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  targetDuration: z.number().int().positive().optional(),
  selectedSegments: z.array(z.string().uuid()).optional(),
  segmentOrder: z.array(z.object({
    segmentId: z.string().uuid(),
    order: z.number().int(),
  })).optional(),
});

/**
 * GET /api/projects/[id]
 * Get a single project with its segments
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

    // Get segments for this project
    const projectSegments = await db
      .select()
      .from(segments)
      .where(eq(segments.projectId, id))
      .orderBy(segments.order);

    return NextResponse.json({
      project,
      segments: projectSegments,
    });
  } catch (error) {
    console.error("Error fetching project:", error);
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/projects/[id]
 * Update a project (title, selected segments, order)
 */
export async function PATCH(
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

    const body = await request.json();

    // Validate input
    const result = updateProjectSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          error: "Invalid input",
          details: result.error.issues,
        },
        { status: 400 }
      );
    }

    const { title, targetDuration, selectedSegments, segmentOrder } = result.data;

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

    // Update project fields; always stamp updatedAt when any field changes
    const updateData: any = { updatedAt: new Date() };
    if (title !== undefined) updateData.title = title;
    if (targetDuration !== undefined) updateData.targetDuration = targetDuration;

    if (
      title !== undefined ||
      targetDuration !== undefined ||
      selectedSegments !== undefined ||
      segmentOrder !== undefined
    ) {
      await db
        .update(projects)
        .set(updateData)
        .where(eq(projects.id, id));
    }

    // Update selected segments
    if (selectedSegments !== undefined) {
      // First, deselect all segments for this project
      await db
        .update(segments)
        .set({ isSelected: false })
        .where(eq(segments.projectId, id));

      // Then, select the specified segments
      if (selectedSegments.length > 0) {
        for (const segmentId of selectedSegments) {
          await db
            .update(segments)
            .set({ isSelected: true })
            .where(
              and(
                eq(segments.id, segmentId),
                eq(segments.projectId, id)
              )
            );
        }
      }
    }

    // Update segment order
    if (segmentOrder !== undefined) {
      for (const { segmentId, order } of segmentOrder) {
        await db
          .update(segments)
          .set({ order })
          .where(
            and(
              eq(segments.id, segmentId),
              eq(segments.projectId, id)
            )
          );
      }
    }

    // Get updated project with segments
    const updatedProject = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    const updatedSegments = await db
      .select()
      .from(segments)
      .where(eq(segments.projectId, id))
      .orderBy(segments.order);

    return NextResponse.json({
      project: updatedProject[0],
      segments: updatedSegments,
      message: "Project updated successfully",
    });
  } catch (error) {
    console.error("Error updating project:", error);
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[id]
 * Delete a project and all its segments
 */
export async function DELETE(
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

    // Delete project (segments will be cascade deleted due to schema)
    await db
      .delete(projects)
      .where(eq(projects.id, id));

    return NextResponse.json({
      message: "Project deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting project:", error);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    );
  }
}
