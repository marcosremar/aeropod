import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import {
  projects,
  projectTemplates,
  projectSections,
  sectionSegments,
} from "@/lib/db/schema";
import { TemplateService } from "@/lib/templates/TemplateService";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = await request.json();
    const { templateId, autoDetected = false, detectionConfidence = null } = body;

    if (!templateId) {
      return NextResponse.json(
        { success: false, error: "Template ID is required" },
        { status: 400 }
      );
    }

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

    // Get template with sections
    const templateService = new TemplateService(db);
    const template = await templateService.getTemplateWithSections(templateId);

    if (!template) {
      return NextResponse.json(
        { success: false, error: "Template not found" },
        { status: 404 }
      );
    }

    // Always clean up existing sections before applying a new template.
    // Guarding on currentTemplateId would leave orphaned rows if a previous
    // call failed after inserting sections but before updating currentTemplateId.
    const oldSections = await db
      .select()
      .from(projectSections)
      .where(eq(projectSections.projectId, projectId));

    for (const section of oldSections) {
      await db
        .delete(sectionSegments)
        .where(eq(sectionSegments.sectionId, section.id));
    }

    await db
      .delete(projectSections)
      .where(eq(projectSections.projectId, projectId));

    await db
      .delete(projectTemplates)
      .where(eq(projectTemplates.projectId, projectId));

    // Create new project_template association
    const [projectTemplate] = await db
      .insert(projectTemplates)
      .values({
        projectId,
        templateId,
        autoDetected,
        detectionConfidence,
      })
      .returning();

    // Create project sections based on template sections
    const createdSections = [];
    for (const section of template.sections) {
      const [projectSection] = await db
        .insert(projectSections)
        .values({
          projectId,
          templateSectionId: section.id,
          name: section.name,
          order: section.order,
          status: "pending",
        })
        .returning();

      createdSections.push(projectSection);
    }

    // Update project's currentTemplateId
    await db
      .update(projects)
      .set({
        currentTemplateId: templateId,
        detectionStatus: autoDetected ? "detected" : "user_selected",
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    return NextResponse.json({
      success: true,
      projectTemplate,
      sections: createdSections,
      message: `Template "${template.name}" selected successfully`,
    });
  } catch (error: any) {
    console.error("Error selecting template:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to select template",
      },
      { status: 500 }
    );
  }
}
