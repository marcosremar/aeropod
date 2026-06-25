import { eq, and, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  segments,
  templateSections,
  projectSections,
  sectionSegments,
  projectTemplates,
  type Segment,
  type TemplateSection,
  type ProjectSection,
} from "@/lib/db/schema";
import { getAIService, aiCompleteJSON } from "@/lib/ai/AIService";

// Mapping result for a single segment → section pair
export interface SegmentSectionMapping {
  segmentId: string;
  sectionId: string; // projectSection ID
  templateSectionId: string;
  confidence: number; // 0-1
  reasoning: string;
}

// Validation issue types
export type ValidationIssueType =
  | "missing_required"
  | "duration_too_short"
  | "duration_too_long"
  | "no_segments"
  | "low_confidence";

export interface ValidationIssue {
  type: ValidationIssueType;
  sectionId: string;
  sectionName: string;
  message: string;
  severity: "error" | "warning";
  suggestion?: string;
}

// Full mapping result
export interface MappingResult {
  projectId: string;
  templateId: string;
  mappings: SegmentSectionMapping[];
  unmappedSegments: string[]; // Segment IDs not mapped to any section
  issues: ValidationIssue[];
  overallConfidence: number;
}

// Section with template details for analysis
interface SectionWithTemplate {
  projectSection: ProjectSection;
  templateSection: TemplateSection;
}

// AI analysis result for a segment
interface SegmentAnalysisResult {
  bestMatchSectionType: string;
  confidence: number;
  alternativeMatches: Array<{
    sectionType: string;
    confidence: number;
  }>;
  reasoning: string;
}

export class SegmentMappingService {
  constructor(private db: PostgresJsDatabase<any>) {
    // AIService é inicializado automaticamente via singleton
  }

  /**
   * Main method: Auto-map all segments to template sections using AI
   */
  async autoMapSegments(
    projectId: string,
    templateId: string
  ): Promise<MappingResult> {
    console.log(
      `[SegmentMapping] Starting auto-mapping for project ${projectId} with template ${templateId}`
    );

    // 1. Get all segments for this project
    const projectSegments = await this.db
      .select()
      .from(segments)
      .where(eq(segments.projectId, projectId))
      .orderBy(segments.startTime);

    if (projectSegments.length === 0) {
      return {
        projectId,
        templateId,
        mappings: [],
        unmappedSegments: [],
        issues: [
          {
            type: "no_segments",
            sectionId: "",
            sectionName: "",
            message: "Nenhum segmento encontrado neste projeto",
            severity: "error",
          },
        ],
        overallConfidence: 0,
      };
    }

    // 2. Get project sections with template details
    const sectionsWithTemplate = await this.getProjectSectionsWithTemplate(
      projectId,
      templateId
    );

    // 3. Analyze each segment and determine best section match
    const mappings: SegmentSectionMapping[] = [];
    const unmappedSegments: string[] = [];

    for (const segment of projectSegments) {
      const analysis = await this.analyzeSegmentForSections(
        segment,
        sectionsWithTemplate
      );

      if (analysis && analysis.confidence >= 0.3) {
        // Find the project section that matches the best section type
        const matchingSection = sectionsWithTemplate.find(
          (s) => s.templateSection.type === analysis.bestMatchSectionType
        );

        if (matchingSection) {
          mappings.push({
            segmentId: segment.id,
            sectionId: matchingSection.projectSection.id,
            templateSectionId: matchingSection.templateSection.id,
            confidence: analysis.confidence,
            reasoning: analysis.reasoning,
          });
        } else {
          unmappedSegments.push(segment.id);
        }
      } else {
        unmappedSegments.push(segment.id);
      }
    }

    // 4. Validate the mapping
    const issues = this.validateMapping(mappings, sectionsWithTemplate);

    // 5. Calculate overall confidence
    const overallConfidence =
      mappings.length > 0
        ? mappings.reduce((sum, m) => sum + m.confidence, 0) / mappings.length
        : 0;

    console.log(
      `[SegmentMapping] Completed: ${mappings.length} mapped, ${unmappedSegments.length} unmapped, ${issues.length} issues`
    );

    return {
      projectId,
      templateId,
      mappings,
      unmappedSegments,
      issues,
      overallConfidence,
    };
  }

  /**
   * Analyze a segment and determine which template section it best matches
   */
  private async analyzeSegmentForSections(
    segment: Segment,
    sections: SectionWithTemplate[]
  ): Promise<SegmentAnalysisResult | null> {
    // Build section descriptions for the prompt
    const sectionDescriptions = sections
      .map(
        (s) =>
          `- ${s.templateSection.type}: ${s.templateSection.name} (${s.templateSection.description || "Sem descrição"})`
      )
      .join("\n");

    const segmentDuration = segment.endTime - segment.startTime;
    const segmentText =
      segment.text.length > 500
        ? segment.text.substring(0, 500) + "..."
        : segment.text;

    const prompt = `Analyze this podcast segment and determine which section type it belongs to.

SEGMENT INFO:
- Duration: ${segmentDuration.toFixed(1)} seconds
- Topic: ${segment.topic || "Not detected"}
- Text: "${segmentText}"

AVAILABLE SECTION TYPES:
${sectionDescriptions}

Respond with ONLY a valid JSON object (no markdown, no code blocks):
{
  "bestMatchSectionType": "intro|main_content|outro|cta|transition|custom",
  "confidence": 0.85,
  "alternativeMatches": [
    {"sectionType": "outro", "confidence": 0.4}
  ],
  "reasoning": "Brief explanation of why this section type was chosen"
}

Rules:
- bestMatchSectionType MUST be one of the section types listed above
- confidence should be 0-1 (0.7+ for good matches, 0.3-0.7 for uncertain, <0.3 for poor)
- Be precise about section matching based on content, not just duration`;

    try {
      // Usar AIService centralizado
      const result = await aiCompleteJSON<SegmentAnalysisResult>(
        "segment_mapping",
        prompt
      );

      // Validate result
      if (!result.bestMatchSectionType || result.confidence === undefined) {
        console.warn(
          `[SegmentMapping] Invalid analysis result for segment ${segment.id}`
        );
        return null;
      }

      return result;
    } catch (error) {
      console.error(
        `[SegmentMapping] Error analyzing segment ${segment.id}:`,
        error
      );
      return null;
    }
  }

  /**
   * Get project sections with their template section details
   */
  private async getProjectSectionsWithTemplate(
    projectId: string,
    templateId: string
  ): Promise<SectionWithTemplate[]> {
    const result = await this.db
      .select({
        projectSection: projectSections,
        templateSection: templateSections,
      })
      .from(projectSections)
      .innerJoin(
        templateSections,
        eq(projectSections.templateSectionId, templateSections.id)
      )
      .where(
        and(
          eq(projectSections.projectId, projectId),
          eq(templateSections.templateId, templateId)
        )
      )
      .orderBy(projectSections.order);

    return result;
  }

  /**
   * Validate a mapping against template requirements
   */
  validateMapping(
    mappings: SegmentSectionMapping[],
    sections: SectionWithTemplate[]
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Group mappings by section
    const mappingsBySection = new Map<string, SegmentSectionMapping[]>();
    for (const mapping of mappings) {
      const existing = mappingsBySection.get(mapping.sectionId) || [];
      existing.push(mapping);
      mappingsBySection.set(mapping.sectionId, existing);
    }

    for (const { projectSection, templateSection } of sections) {
      const sectionMappings = mappingsBySection.get(projectSection.id) || [];

      // Check for required sections without content
      if (templateSection.isRequired && sectionMappings.length === 0) {
        issues.push({
          type: "missing_required",
          sectionId: projectSection.id,
          sectionName: templateSection.name,
          message: `Seção obrigatória "${templateSection.name}" não tem conteúdo mapeado`,
          severity: "error",
          suggestion: templateSection.exampleText || undefined,
        });
      }

      // Check for low confidence mappings
      const avgConfidence =
        sectionMappings.length > 0
          ? sectionMappings.reduce((sum, m) => sum + m.confidence, 0) /
            sectionMappings.length
          : 0;

      if (sectionMappings.length > 0 && avgConfidence < 0.5) {
        issues.push({
          type: "low_confidence",
          sectionId: projectSection.id,
          sectionName: templateSection.name,
          message: `Mapeamento de "${templateSection.name}" tem baixa confiança (${Math.round(avgConfidence * 100)}%)`,
          severity: "warning",
          suggestion: "Revise manualmente os segmentos mapeados para esta seção",
        });
      }

      // Note: Duration validation would require fetching segment durations
      // This can be added later when we have segment duration data available
    }

    return issues;
  }

  /**
   * Save mapping to database (sectionSegments table)
   */
  async saveMapping(
    projectId: string,
    mappings: SegmentSectionMapping[]
  ): Promise<void> {
    // First, clear existing mappings for this project's sections
    const projectSectionIds = await this.db
      .select({ id: projectSections.id })
      .from(projectSections)
      .where(eq(projectSections.projectId, projectId));

    const sectionIds = projectSectionIds.map((s) => s.id);

    if (sectionIds.length > 0) {
      await this.db
        .delete(sectionSegments)
        .where(inArray(sectionSegments.sectionId, sectionIds));
    }

    // Group mappings by section and add with order
    const mappingsBySection = new Map<string, SegmentSectionMapping[]>();
    for (const mapping of mappings) {
      const existing = mappingsBySection.get(mapping.sectionId) || [];
      existing.push(mapping);
      mappingsBySection.set(mapping.sectionId, existing);
    }

    // Insert new mappings
    for (const [sectionId, sectionMappings] of mappingsBySection) {
      for (let i = 0; i < sectionMappings.length; i++) {
        await this.db.insert(sectionSegments).values({
          sectionId,
          segmentId: sectionMappings[i].segmentId,
          order: i,
          confidence: sectionMappings[i].confidence,
        });
      }

      // Update section status to "review" since it now has content
      await this.db
        .update(projectSections)
        .set({
          status: "review",
          updatedAt: new Date(),
        })
        .where(eq(projectSections.id, sectionId));
    }

    console.log(
      `[SegmentMapping] Saved ${mappings.length} mappings for project ${projectId}`
    );
  }

  /**
   * Get current mapping for a project
   */
  async getCurrentMapping(projectId: string): Promise<MappingResult | null> {
    // Get project's current template
    const [projectTemplate] = await this.db
      .select()
      .from(projectTemplates)
      .where(eq(projectTemplates.projectId, projectId))
      .limit(1);

    if (!projectTemplate) {
      return null;
    }

    // Get sections with template details
    const sectionsWithTemplate = await this.getProjectSectionsWithTemplate(
      projectId,
      projectTemplate.templateId
    );

    // Get all current mappings
    const sectionIds = sectionsWithTemplate.map((s) => s.projectSection.id);

    if (sectionIds.length === 0) {
      return null;
    }

    const currentMappings = await this.db
      .select({
        sectionSegment: sectionSegments,
        segment: segments,
      })
      .from(sectionSegments)
      .innerJoin(segments, eq(sectionSegments.segmentId, segments.id))
      .where(inArray(sectionSegments.sectionId, sectionIds))
      .orderBy(sectionSegments.order);

    // Build mapping result
    const mappings: SegmentSectionMapping[] = currentMappings.map((m) => {
      const sectionWithTemplate = sectionsWithTemplate.find(
        (s) => s.projectSection.id === m.sectionSegment.sectionId
      );
      return {
        segmentId: m.segment.id,
        sectionId: m.sectionSegment.sectionId,
        templateSectionId: sectionWithTemplate?.templateSection.id || "",
        confidence: m.sectionSegment.confidence ?? m.segment.sectionMatchScore ?? 0.5,
        reasoning: "Mapeamento existente",
      };
    });

    // Get unmapped segments
    const mappedSegmentIds = new Set(mappings.map((m) => m.segmentId));
    const allSegments = await this.db
      .select()
      .from(segments)
      .where(eq(segments.projectId, projectId));

    const unmappedSegments = allSegments
      .filter((s) => !mappedSegmentIds.has(s.id))
      .map((s) => s.id);

    // Validate
    const issues = this.validateMapping(mappings, sectionsWithTemplate);

    const overallConfidence =
      mappings.length > 0
        ? mappings.reduce((sum, m) => sum + m.confidence, 0) / mappings.length
        : 0;

    return {
      projectId,
      templateId: projectTemplate.templateId,
      mappings,
      unmappedSegments,
      issues,
      overallConfidence,
    };
  }

  /**
   * Manually assign a segment to a section
   */
  async assignSegmentToSection(
    segmentId: string,
    sectionId: string,
    order?: number
  ): Promise<void> {
    // Remove any existing assignment for this segment
    await this.db
      .delete(sectionSegments)
      .where(eq(sectionSegments.segmentId, segmentId));

    // Get current max order in section
    const existingAssignments = await this.db
      .select()
      .from(sectionSegments)
      .where(eq(sectionSegments.sectionId, sectionId));

    const newOrder =
      order !== undefined ? order : existingAssignments.length;

    // Add new assignment
    await this.db.insert(sectionSegments).values({
      sectionId,
      segmentId,
      order: newOrder,
    });

    // Update section status
    await this.db
      .update(projectSections)
      .set({
        status: "review",
        updatedAt: new Date(),
      })
      .where(eq(projectSections.id, sectionId));
  }

  /**
   * Remove segment from section
   */
  async removeSegmentFromSection(
    segmentId: string,
    sectionId: string
  ): Promise<void> {
    await this.db
      .delete(sectionSegments)
      .where(
        and(
          eq(sectionSegments.segmentId, segmentId),
          eq(sectionSegments.sectionId, sectionId)
        )
      );
  }

  /**
   * Reorder segments within a section
   */
  async reorderSectionSegments(
    sectionId: string,
    segmentIds: string[]
  ): Promise<void> {
    // Delete existing assignments
    await this.db
      .delete(sectionSegments)
      .where(eq(sectionSegments.sectionId, sectionId));

    // Insert in new order
    for (let i = 0; i < segmentIds.length; i++) {
      await this.db.insert(sectionSegments).values({
        sectionId,
        segmentId: segmentIds[i],
        order: i,
      });
    }
  }
}
