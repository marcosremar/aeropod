import { NextRequest, NextResponse } from "next/server";
import { db, segments, chatMessages, projects, projectTemplates, projectSections, sectionSegments, templates, templateSections } from "@/lib/db";
import { eq, and, desc } from "drizzle-orm";
import { getEditorChatService } from "@/lib/ai/editor-chat";
import { z } from "zod";

// Validation schema
const chatRequestSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  message: z.string().min(1).max(5000),
  includeTemplateContext: z.boolean().optional(),
  skipAI: z.boolean().optional(),
  role: z.enum(["user", "assistant"]).optional(),
  metadata: z.object({
    type: z.string().optional(),
    segmentId: z.string().optional(),
    audioUrl: z.string().optional(),
  }).optional(),
});

// Helper to detect template-related queries
function isTemplateQuery(message: string): string | null {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("template") || lowerMessage.includes("status do template") || lowerMessage.includes("ver template")) {
    return "show_template";
  }
  if (lowerMessage.includes("auto-map") || lowerMessage.includes("auto map") || lowerMessage.includes("mapeamento") || lowerMessage.includes("mapear")) {
    return "auto_map";
  }
  if (lowerMessage.includes("gap") || lowerMessage.includes("falta") || lowerMessage.includes("precisa") || lowerMessage.includes("conteudo")) {
    return "show_gaps";
  }
  if (lowerMessage.includes("secao") || lowerMessage.includes("secoes")) {
    return "section_info";
  }
  return null;
}

// Fetch template data for a project
async function getTemplateData(projectId: string) {
  try {
    // Get project's current template
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project[0]?.currentTemplateId) {
      return null;
    }

    // Get template info
    const template = await db
      .select()
      .from(templates)
      .where(eq(templates.id, project[0].currentTemplateId))
      .limit(1);

    if (!template[0]) {
      return null;
    }

    // Get template sections
    const sections = await db
      .select()
      .from(templateSections)
      .where(eq(templateSections.templateId, template[0].id))
      .orderBy(templateSections.order);

    // Get project sections with their mappings
    const projectSectionData = await db
      .select()
      .from(projectSections)
      .where(eq(projectSections.projectId, projectId));

    // Build section status
    const sectionStatus = sections.map((section) => {
      const projectSection = projectSectionData.find(
        (ps) => ps.templateSectionId === section.id
      );

      const currentDuration = projectSection?.duration || 0;
      const targetDuration = section.suggestedDuration || section.minDuration || 60;

      let status: "empty" | "partial" | "complete" = "empty";
      if (currentDuration > 0) {
        status = currentDuration >= (section.minDuration || 0) ? "complete" : "partial";
      }

      return {
        id: section.id,
        name: section.name,
        status,
        duration: currentDuration,
        targetDuration,
        isRequired: section.isRequired,
        description: section.description,
        type: section.type,
      };
    });

    // Calculate gaps
    const gaps = sectionStatus
      .filter((s) => s.status !== "complete" && s.isRequired)
      .map((s) => ({
        sectionName: s.name,
        missingDuration: Math.max(0, s.targetDuration - s.duration),
        suggestion: getSuggestionForSection(s.type, s.targetDuration - s.duration),
      }));

    return {
      templateName: template[0].name,
      sections: sectionStatus,
      gaps,
      completionPercent: Math.round(
        (sectionStatus.filter((s) => s.status === "complete").length / sectionStatus.length) * 100
      ),
    };
  } catch (error) {
    console.error("Error fetching template data:", error);
    return null;
  }
}

function getSuggestionForSection(type: string, missingSeconds: number): string {
  const mins = Math.ceil(missingSeconds / 60);

  switch (type) {
    case "hook":
      return `Grave uma abertura cativante de ~${mins} min`;
    case "intro":
      return `Grave uma introducao de ~${mins} min`;
    case "context":
      return `Adicione ~${mins} min de contexto`;
    case "main_content":
      return `Grave mais ~${mins} min de conteudo principal`;
    case "example":
      return `Adicione ~${mins} min com exemplos praticos`;
    case "recap":
      return `Grave ~${mins} min resumindo os pontos`;
    case "cta":
      return `Adicione ~${mins} min com call-to-action`;
    case "outro":
      return `Grave um encerramento de ~${mins} min`;
    default:
      return `Adicione mais ~${mins} min de conteudo`;
  }
}

// Generate rich content based on template query type
function generateRichContent(queryType: string, templateData: any) {
  if (!templateData) {
    return {
      response: "Este projeto ainda nao tem um template selecionado. Use o botao 'Mapeamento' no editor para escolher um template.",
      richContent: [
        {
          type: "quick_actions",
          data: {
            actions: [
              { id: "1", label: "Escolher Template", icon: "template", variant: "primary", action: "choose_template" },
            ],
          },
        },
      ],
    };
  }

  switch (queryType) {
    case "show_template":
      return {
        response: `Aqui esta o status do template **${templateData.templateName}**:`,
        richContent: [
          {
            type: "template_status",
            data: {
              templateName: templateData.templateName,
              sections: templateData.sections,
            },
          },
          {
            type: "progress",
            data: {
              title: "Progresso Geral",
              stats: [
                { label: "Completas", value: `${templateData.sections.filter((s: any) => s.status === "complete").length}` },
                { label: "Parciais", value: `${templateData.sections.filter((s: any) => s.status === "partial").length}` },
                { label: "Vazias", value: `${templateData.sections.filter((s: any) => s.status === "empty").length}` },
              ],
            },
          },
          {
            type: "quick_actions",
            data: {
              actions: [
                { id: "1", label: "Auto-Mapear", icon: "wand", variant: "primary", action: "auto_map" },
                { id: "2", label: "Ver Gaps", icon: "template", variant: "secondary", action: "show_gaps" },
              ],
            },
          },
        ],
      };

    case "show_gaps":
      const requiredGaps = templateData.gaps.filter((g: any) => g.missingDuration > 0);
      if (requiredGaps.length === 0) {
        return {
          response: "Todas as secoes obrigatorias estao completas! Seu podcast esta pronto para exportar.",
          richContent: [
            {
              type: "gap_analysis",
              data: { gaps: [] },
            },
            {
              type: "quick_actions",
              data: {
                actions: [
                  { id: "1", label: "Exportar", icon: "download", variant: "primary", action: "export" },
                ],
              },
            },
          ],
        };
      }
      return {
        response: `Encontrei **${requiredGaps.length} secoes** que precisam de mais conteudo:`,
        richContent: [
          {
            type: "gap_analysis",
            data: { gaps: requiredGaps },
          },
          {
            type: "quick_actions",
            data: {
              actions: [
                { id: "1", label: "Auto-Mapear", icon: "wand", variant: "primary", action: "auto_map" },
                { id: "2", label: "Gravar", icon: "mic", variant: "secondary", action: "record" },
              ],
            },
          },
        ],
      };

    case "auto_map":
      return {
        response: "Vou executar o mapeamento automatico com IA. Isso vai analisar seus segmentos e atribuir cada um a secao mais adequada do template.",
        richContent: [
          {
            type: "quick_actions",
            data: {
              actions: [
                { id: "1", label: "Confirmar Auto-Mapeamento", icon: "wand", variant: "primary", action: "confirm_auto_map" },
                { id: "2", label: "Cancelar", icon: "template", variant: "secondary", action: "cancel" },
              ],
            },
          },
        ],
        actions: [
          {
            type: "auto_map",
            message: "Executar auto-mapeamento com IA",
          },
        ],
      };

    case "section_info":
      // Show section detail for first incomplete section
      const incompleteSection = templateData.sections.find((s: any) => s.status !== "complete");
      if (incompleteSection) {
        return {
          response: `Detalhes da secao **${incompleteSection.name}**:`,
          richContent: [
            {
              type: "section_detail",
              data: {
                section: incompleteSection,
                suggestion: getSuggestionForSection(
                  incompleteSection.type,
                  incompleteSection.targetDuration - incompleteSection.duration
                ),
              },
            },
          ],
        };
      }
      return {
        response: "Todas as secoes estao completas!",
        richContent: [],
      };

    default:
      return null;
  }
}

/**
 * POST /api/chat
 * Chat para edicao do podcast com IA
 * Suporta queries de template com rich content
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const result = chatRequestSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          error: "Invalid input",
          details: result.error.issues,
        },
        { status: 400 }
      );
    }

    const { projectId, userId, message, includeTemplateContext, skipAI, role, metadata } = result.data;

    // If skipAI is true, just save the message without AI processing
    if (skipAI) {
      await db.insert(chatMessages).values({
        projectId,
        userId,
        role: role || "user",
        content: message,
        metadata: metadata as any,
      });

      return NextResponse.json({
        success: true,
        message: "Message saved",
      });
    }

    // 1. Salvar mensagem do usuario no banco
    await db.insert(chatMessages).values({
      projectId,
      userId,
      role: "user",
      content: message,
    });

    // 2. Check if this is a template-related query
    const templateQueryType = isTemplateQuery(message);

    if (templateQueryType && includeTemplateContext) {
      // Fetch template data and generate rich response
      const templateData = await getTemplateData(projectId);
      const richResponse = generateRichContent(templateQueryType, templateData);

      if (richResponse) {
        // Save assistant response
        await db.insert(chatMessages).values({
          projectId,
          userId,
          role: "assistant",
          content: richResponse.response,
          actions: richResponse.actions || [],
        });

        return NextResponse.json({
          response: richResponse.response,
          actions: richResponse.actions || [],
          richContent: richResponse.richContent || [],
        });
      }
    }

    // 3. Buscar historico do banco
    const historyFromDb = await db
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.projectId, projectId),
          eq(chatMessages.isDeleted, false)
        )
      )
      .orderBy(desc(chatMessages.createdAt))
      .limit(20);

    const history = historyFromDb.reverse().map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // 4. Buscar segmentos do projeto
    const projectSegments = await db
      .select()
      .from(segments)
      .where(eq(segments.projectId, projectId))
      .orderBy(segments.startTime);

    if (projectSegments.length === 0) {
      const noSegmentsResponse = "Este projeto ainda nao tem segmentos processados. Aguarde o processamento ou faca upload de um audio.";

      await db.insert(chatMessages).values({
        projectId,
        userId,
        role: "assistant",
        content: noSegmentsResponse,
        actions: [],
      });

      return NextResponse.json({
        response: noSegmentsResponse,
        actions: [],
        richContent: [
          {
            type: "quick_actions",
            data: {
              actions: [
                { id: "1", label: "Ver Status", icon: "template", variant: "secondary", action: "show_template" },
              ],
            },
          },
        ],
      });
    }

    // 5. Processar mensagem com o servico de chat
    const chatService = getEditorChatService();
    const chatResult = await chatService.processMessage(
      message,
      projectSegments.map((s) => ({
        id: s.id,
        text: s.text,
        topic: s.topic,
        startTime: s.startTime,
        endTime: s.endTime,
        isSelected: s.isSelected || false,
        interestScore: s.interestScore,
      })),
      history
    );

    // 6. Salvar resposta do assistente no banco
    await db.insert(chatMessages).values({
      projectId,
      userId,
      role: "assistant",
      content: chatResult.response,
      actions: chatResult.actions,
    });

    // 7. Add quick actions to response
    const quickActions = [
      { id: "1", label: "Status Template", icon: "template", variant: "secondary", action: "show_template" },
      { id: "2", label: "Ver Gaps", icon: "template", variant: "secondary", action: "show_gaps" },
    ];

    return NextResponse.json({
      response: chatResult.response,
      actions: chatResult.actions,
      richContent: [
        {
          type: "quick_actions",
          data: { actions: quickActions },
        },
      ],
    });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { error: "Chat processing failed", details: String(error) },
      { status: 500 }
    );
  }
}
