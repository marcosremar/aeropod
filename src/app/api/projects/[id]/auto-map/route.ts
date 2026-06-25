import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, asc } from "drizzle-orm";
import { projects, projectTemplates, templateSections, segments, sectionSegments } from "@/lib/db/schema";
import { SegmentMappingService } from "@/lib/sections/SegmentMappingService";

/**
 * POST /api/projects/[id]/auto-map
 * Automatically map segments to template sections using AI
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = await request.json().catch(() => ({}));
    const { templateId: explicitTemplateId, save = true } = body;

    // Verify project exists
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    // Get template ID from request or project's current template
    let templateId = explicitTemplateId;

    if (!templateId) {
      // Get from projectTemplates
      const [projectTemplate] = await db
        .select()
        .from(projectTemplates)
        .where(eq(projectTemplates.projectId, projectId))
        .limit(1);

      if (projectTemplate) {
        templateId = projectTemplate.templateId;
      } else if (project.currentTemplateId) {
        templateId = project.currentTemplateId;
      }
    }

    if (!templateId) {
      return NextResponse.json(
        {
          success: false,
          error: "No template selected for this project. Please select a template first.",
        },
        { status: 400 }
      );
    }

    // Create mapping service and run auto-mapping
    const mappingService = new SegmentMappingService(db);
    const result = await mappingService.autoMapSegments(projectId, templateId);

    // Save mappings if requested (default: true)
    if (save && result.mappings.length > 0) {
      await mappingService.saveMapping(projectId, result.mappings);
    }

    return NextResponse.json({
      success: true,
      projectId,
      templateId,
      mappings: result.mappings,
      unmappedSegments: result.unmappedSegments,
      issues: result.issues,
      overallConfidence: result.overallConfidence,
      saved: save && result.mappings.length > 0,
      message:
        result.mappings.length > 0
          ? `Mapeados ${result.mappings.length} segmentos com ${Math.round(result.overallConfidence * 100)}% de confiança`
          : "Nenhum segmento foi mapeado",
    });
  } catch (error: any) {
    console.error("Error auto-mapping segments:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to auto-map segments",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/projects/[id]/auto-map
 * Get current mapping for a project with full section details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // Verify project exists
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    // Get template ID
    let templateId = project.currentTemplateId;
    if (!templateId) {
      const [projectTemplate] = await db
        .select()
        .from(projectTemplates)
        .where(eq(projectTemplates.projectId, projectId))
        .limit(1);

      if (projectTemplate) {
        templateId = projectTemplate.templateId;
      }
    }

    if (!templateId) {
      return NextResponse.json({
        success: true,
        projectId,
        sections: [],
        mappings: [],
        unmappedSegments: [],
        issues: [],
        overallConfidence: 0,
        message: "Nenhum template selecionado para este projeto",
      });
    }

    // Get template sections
    const sections = await db
      .select()
      .from(templateSections)
      .where(eq(templateSections.templateId, templateId))
      .orderBy(asc(templateSections.order));

    // Get all project segments
    const projectSegments = await db
      .select()
      .from(segments)
      .where(eq(segments.projectId, projectId));

    // Get all section-segment mappings
    const mappings = await db
      .select({
        sectionSegment: sectionSegments,
        segment: segments,
      })
      .from(sectionSegments)
      .innerJoin(segments, eq(sectionSegments.segmentId, segments.id))
      .where(eq(segments.projectId, projectId));

    // Transform mappings
    const mappingsList = mappings.map((m) => ({
      sectionId: m.sectionSegment.sectionId,
      segmentId: m.segment.id,
      segmentTitle: m.segment.topic,
      segmentSummary: m.segment.keyInsight,
      startTime: m.segment.startTime,
      endTime: m.segment.endTime,
      confidence: m.sectionSegment.confidence || 0,
      order: m.sectionSegment.order || 0,
    }));

    // Get mapped segment IDs
    const mappedSegmentIds = new Set(mappings.map((m) => m.segment.id));

    // Get unmapped segments
    const unmappedSegments = projectSegments.filter(
      (s) => !mappedSegmentIds.has(s.id)
    );

    // Calculate overall confidence
    const totalConfidence = mappingsList.reduce(
      (sum, m) => sum + (m.confidence || 0),
      0
    );
    const overallConfidence =
      mappingsList.length > 0 ? totalConfidence / mappingsList.length : 0;

    return NextResponse.json({
      success: true,
      projectId,
      templateId,
      sections: sections.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        description: s.description,
        minDuration: s.minDuration,
        maxDuration: s.maxDuration,
        suggestedDuration: s.suggestedDuration,
        isRequired: s.isRequired,
        order: s.order,
        exampleText: s.exampleText,
      })),
      mappings: mappingsList,
      unmappedSegments: unmappedSegments.map((s) => ({
        id: s.id,
        title: s.topic,
        summary: s.keyInsight,
        startTime: s.startTime,
        endTime: s.endTime,
        topic: s.topic,
      })),
      issues: [],
      overallConfidence,
    });
  } catch (error: any) {
    console.error("Error getting mapping:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to get mapping",
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/projects/[id]/auto-map
 * Manually update segment-section mapping
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = await request.json();
    const { action, segmentId, sectionId, segmentIds, order } = body;

    // Verify project exists
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    const mappingService = new SegmentMappingService(db);

    switch (action) {
      case "assign":
        // Assign segment to section
        if (!segmentId || !sectionId) {
          return NextResponse.json(
            { success: false, error: "segmentId and sectionId are required" },
            { status: 400 }
          );
        }
        await mappingService.assignSegmentToSection(segmentId, sectionId, order);
        return NextResponse.json({
          success: true,
          message: "Segmento atribuído com sucesso",
        });

      case "remove":
        // Remove segment from section
        if (!segmentId || !sectionId) {
          return NextResponse.json(
            { success: false, error: "segmentId and sectionId are required" },
            { status: 400 }
          );
        }
        await mappingService.removeSegmentFromSection(segmentId, sectionId);
        return NextResponse.json({
          success: true,
          message: "Segmento removido com sucesso",
        });

      case "reorder":
        // Reorder segments within section
        if (!sectionId || !segmentIds || !Array.isArray(segmentIds)) {
          return NextResponse.json(
            {
              success: false,
              error: "sectionId and segmentIds array are required",
            },
            { status: 400 }
          );
        }
        await mappingService.reorderSectionSegments(sectionId, segmentIds);
        return NextResponse.json({
          success: true,
          message: "Segmentos reordenados com sucesso",
        });

      default:
        return NextResponse.json(
          {
            success: false,
            error: "Invalid action. Use: assign, remove, or reorder",
          },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error("Error updating mapping:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to update mapping",
      },
      { status: 500 }
    );
  }
}
