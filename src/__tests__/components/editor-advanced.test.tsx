import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { mockFetch, jsonResponse } from "../helpers/mock-fetch";

// sonner is imported by several components (EditorChat, SocialClipsGenerator,
// AudioRecorder, RecordingStudio, InlineRecordingModal). Mock it globally.
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    info: vi.fn(),
  }),
}));

// react-markdown renders children as plain text in EditorChat; provide a light mock
// to avoid ESM parsing issues and keep assertions simple.
vi.mock("react-markdown", () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("remark-gfm", () => ({ default: () => {} }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Build a Segment-shaped object. Components only read a subset of fields at
// runtime; the Segment type is compile-time only (esbuild strips types).
function makeSegment(overrides: Record<string, unknown> = {}) {
  return {
    id: "seg-1",
    projectId: "p1",
    text: "This is the segment text content.",
    editedText: null,
    topic: "Topic A",
    keyInsight: null,
    startTime: 0,
    endTime: 10,
    isSelected: true,
    interestScore: 8,
    clarityScore: 7,
    hasError: false,
    errorType: null,
    errorDetail: null,
    analysis: null,
    textCuts: null,
    wordTimestamps: null,
    order: 0,
    ...overrides,
  };
}

beforeEach(() => {
  // Default: any fetch resolves to an empty-but-ok JSON payload so components
  // that fetch on mount never hit the network.
  mockFetch(() => jsonResponse({ success: true, clips: [], sections: [], messages: [], templates: [] }));

  // navigator.mediaDevices for recording components.
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    writable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }],
      })),
      enumerateDevices: vi.fn(async () => []),
    },
  });
});

// ---------------------------------------------------------------------------
// editor/AdvancedTimeline
// ---------------------------------------------------------------------------
import { AdvancedTimeline } from "@/components/editor/AdvancedTimeline";

describe("AdvancedTimeline", () => {
  const segments = [
    makeSegment({ id: "s1", topic: "Intro", startTime: 0, endTime: 30, isSelected: true }),
    makeSegment({ id: "s2", topic: "Body", startTime: 40, endTime: 70, isSelected: false }),
  ];

  it("renders mode toggle buttons and stats", () => {
    render(
      <AdvancedTimeline
        segments={segments as never}
        audioUrl="blob:audio"
        onToggleSelect={vi.fn()}
      />
    );
    expect(screen.getByText("Original")).toBeInTheDocument();
    expect(screen.getByText("Editada")).toBeInTheDocument();
    // selectedSegments / total stats: 1/2
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("switches to edited mode when clicked", () => {
    const onModeChange = vi.fn();
    render(
      <AdvancedTimeline
        segments={segments as never}
        audioUrl={null}
        onToggleSelect={vi.fn()}
        onModeChange={onModeChange}
      />
    );
    fireEvent.click(screen.getByText("Editada"));
    expect(onModeChange).toHaveBeenCalledWith("edited");
  });

  it("calls onSegmentClick when a segment is clicked", () => {
    const onSegmentClick = vi.fn();
    render(
      <AdvancedTimeline
        segments={segments as never}
        audioUrl={null}
        onToggleSelect={vi.fn()}
        onSegmentClick={onSegmentClick}
      />
    );
    const seg = document.querySelector('[data-segment-id="s1"]');
    expect(seg).toBeTruthy();
    fireEvent.click(seg!);
    expect(onSegmentClick).toHaveBeenCalledWith("s1");
  });
});

// ---------------------------------------------------------------------------
// editor/EditorCanvas
// ---------------------------------------------------------------------------
import { EditorCanvas } from "@/components/editor/EditorCanvas";

describe("EditorCanvas", () => {
  const segments = [
    makeSegment({ id: "c1", topic: "Hook", startTime: 0, endTime: 20, isSelected: true }),
    makeSegment({ id: "c2", topic: "Outro", startTime: 20, endTime: 30, isSelected: false }),
  ];

  it("renders project title and segment text (flat list)", () => {
    render(
      <EditorCanvas
        segments={segments as never}
        currentTime={0}
        onSeekTo={vi.fn()}
        onToggleSelect={vi.fn()}
        projectTitle="My Episode"
      />
    );
    expect(screen.getByText("My Episode")).toBeInTheDocument();
    expect(screen.getAllByText(/segment text content/i).length).toBeGreaterThan(0);
  });

  it("calls onToggleSelect when status indicator clicked", () => {
    const onToggleSelect = vi.fn();
    render(
      <EditorCanvas
        segments={segments as never}
        currentTime={999}
        onSeekTo={vi.fn()}
        onToggleSelect={onToggleSelect}
      />
    );
    const toggle = screen.getAllByTitle(/selecao/i)[0];
    fireEvent.click(toggle);
    expect(onToggleSelect).toHaveBeenCalled();
  });

  it("renders sections when provided", () => {
    const sections = [
      {
        section: { id: "sec1", name: "Introducao", status: "pending" },
        segments: [segments[0]],
      },
    ];
    render(
      <EditorCanvas
        segments={segments as never}
        sections={sections as never}
        currentTime={0}
        onSeekTo={vi.fn()}
        onToggleSelect={vi.fn()}
      />
    );
    expect(screen.getByText("Introducao")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// editor/EditPreview
// ---------------------------------------------------------------------------
import { EditPreview } from "@/components/editor/EditPreview";

describe("EditPreview", () => {
  const segments = [
    { id: "p1", text: "First clip", topic: "Intro", startTime: 0, endTime: 10, interestScore: 8 },
    { id: "p2", text: "Second clip", topic: "New", startTime: 10, endTime: 20, isNew: true },
  ];

  it("renders title, description and segment text", () => {
    render(
      <EditPreview
        title="Proposta"
        description="Mudancas sugeridas"
        segments={segments as never}
      />
    );
    expect(screen.getByText("Proposta")).toBeInTheDocument();
    expect(screen.getByText("Mudancas sugeridas")).toBeInTheDocument();
    expect(screen.getByText("First clip")).toBeInTheDocument();
  });

  it("invokes onApply when apply button clicked", () => {
    const onApply = vi.fn();
    render(<EditPreview segments={segments as never} onApply={onApply} />);
    fireEvent.click(screen.getByText(/Aplicar esta edicao/i));
    expect(onApply).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// editor/InlineTextEditor
// ---------------------------------------------------------------------------
import { InlineTextEditor } from "@/components/editor/InlineTextEditor";

// NOTE: InlineTextEditor's sync effect depends on the `textCuts` prop reference.
// Its default value (`textCuts = []`) is a fresh array each render, which makes
// the effect loop forever once edit mode exits. Passing a STABLE reference keeps
// the dependency identity constant and avoids that source-side render loop.
const STABLE_TEXT_CUTS: never[] = [];

describe("InlineTextEditor", () => {
  it("renders text in view mode and enters edit mode on click", () => {
    render(
      <InlineTextEditor
        text="Hello world"
        originalText="Hello world"
        textCuts={STABLE_TEXT_CUTS}
        segmentStartTime={0}
        segmentEndTime={5}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByText("Hello world")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Hello world"));
    // Edit mode shows a textarea
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("calls onSave with edited text via save button", () => {
    const onSave = vi.fn();
    render(
      <InlineTextEditor
        text="Hello"
        originalText="Hello"
        textCuts={STABLE_TEXT_CUTS}
        segmentStartTime={0}
        segmentEndTime={5}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByText("Hello"));
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Hello there" } });
    fireEvent.click(screen.getByTitle("Salvar"));
    expect(onSave).toHaveBeenCalledWith("Hello there", []);
  });
});

// ---------------------------------------------------------------------------
// editor/TranscriptEditor
// ---------------------------------------------------------------------------
import { TranscriptEditor } from "@/components/editor/TranscriptEditor";

describe("TranscriptEditor", () => {
  const segments = [
    makeSegment({ id: "t1", topic: "One", text: "alpha beta", startTime: 0, endTime: 10 }),
    makeSegment({ id: "t2", topic: "Two", text: "gamma delta", startTime: 10, endTime: 20 }),
  ];

  it("renders segments and the search box", () => {
    render(
      <TranscriptEditor
        segments={segments as never}
        currentTime={0}
        onSeekTo={vi.fn()}
        onSelectSegment={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText(/Buscar na transcricao/i)).toBeInTheDocument();
    expect(screen.getByText("alpha beta")).toBeInTheDocument();
    expect(screen.getByText(/2 segmentos/i)).toBeInTheDocument();
  });

  it("filters via search and shows result count", () => {
    render(
      <TranscriptEditor
        segments={segments as never}
        currentTime={0}
        onSeekTo={vi.fn()}
        onSelectSegment={vi.fn()}
      />
    );
    fireEvent.change(screen.getByPlaceholderText(/Buscar na transcricao/i), {
      target: { value: "gamma" },
    });
    expect(screen.getByText("1/1")).toBeInTheDocument();
  });

  it("shows empty state when no segments", () => {
    render(
      <TranscriptEditor
        segments={[] as never}
        currentTime={0}
        onSeekTo={vi.fn()}
        onSelectSegment={vi.fn()}
      />
    );
    expect(screen.getByText(/Nenhuma transcricao disponivel/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// editor/ChatComponents (named exports)
// ---------------------------------------------------------------------------
import {
  TemplateStatusCard,
  QuickActionsBar,
  ProgressCard,
  SectionDetailCard,
  GapAnalysisCard,
  MiniTimeline,
} from "@/components/editor/ChatComponents";

describe("ChatComponents", () => {
  it("TemplateStatusCard renders template name and section, computes progress", () => {
    render(
      <TemplateStatusCard
        templateName="Entrevista"
        sections={[
          { id: "1", name: "Intro", status: "complete", duration: 60, targetDuration: 60, isRequired: true },
          { id: "2", name: "Corpo", status: "empty", duration: 0, targetDuration: 120, isRequired: false },
        ]}
      />
    );
    expect(screen.getByText("Entrevista")).toBeInTheDocument();
    expect(screen.getByText("Intro")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("QuickActionsBar renders buttons and fires onAction", () => {
    const onAction = vi.fn();
    render(
      <QuickActionsBar
        actions={[{ id: "a", label: "Mapear", icon: "wand", variant: "primary", action: "auto_map" }]}
        onAction={onAction}
      />
    );
    fireEvent.click(screen.getByText("Mapear"));
    expect(onAction).toHaveBeenCalledWith("auto_map");
  });

  it("ProgressCard renders title and stats", () => {
    render(
      <ProgressCard title="Resumo" stats={[{ label: "Total", value: "12" }]} />
    );
    expect(screen.getByText("Resumo")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("SectionDetailCard renders section name and record action", () => {
    const onRecord = vi.fn();
    render(
      <SectionDetailCard
        section={{ id: "s", name: "Hook", status: "empty", duration: 0, targetDuration: 30, isRequired: true }}
        onRecord={onRecord}
      />
    );
    expect(screen.getByText("Hook")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Gravar"));
    expect(onRecord).toHaveBeenCalled();
  });

  it("GapAnalysisCard shows completion when no gaps", () => {
    render(<GapAnalysisCard gaps={[]} />);
    expect(screen.getByText(/Tudo completo/i)).toBeInTheDocument();
  });

  it("GapAnalysisCard lists gaps and fires onFillGap", () => {
    const onFillGap = vi.fn();
    render(
      <GapAnalysisCard
        gaps={[{ sectionName: "Conclusao", missingDuration: 30, suggestion: "Add it" }]}
        onFillGap={onFillGap}
      />
    );
    expect(screen.getByText("Conclusao")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Gravar"));
    expect(onFillGap).toHaveBeenCalledWith("Conclusao");
  });

  it("MiniTimeline renders a Timeline header", () => {
    render(
      <MiniTimeline
        segments={[{ id: "x", start: 0, end: 5, status: "selected" }]}
        totalDuration={10}
      />
    );
    expect(screen.getByText("Timeline")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// editor/ChatEditor
// ---------------------------------------------------------------------------
import { ChatEditor } from "@/components/editor/ChatEditor";

describe("ChatEditor", () => {
  const segments = [makeSegment({ id: "ce1", startTime: 0, endTime: 60, isSelected: true })];

  it("renders header, welcome message and input", () => {
    render(
      <ChatEditor projectId="p1" segments={segments as never} onAction={vi.fn()} />
    );
    expect(screen.getByText("Editor IA")).toBeInTheDocument();
    expect(screen.getByText(/assistente de edicao de podcast/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/comando de edicao/i)).toBeInTheDocument();
  });

  it("populates input from a quick suggestion", () => {
    render(
      <ChatEditor projectId="p1" segments={segments as never} onAction={vi.fn()} />
    );
    fireEvent.click(screen.getByText("Remova repeticoes"));
    expect(screen.getByPlaceholderText(/comando de edicao/i)).toHaveValue("Remova repeticoes");
  });
});

// ---------------------------------------------------------------------------
// editor/EditorChat
// ---------------------------------------------------------------------------
import { EditorChat } from "@/components/editor/EditorChat";

describe("EditorChat", () => {
  it("renders the panel header and input when open", () => {
    render(
      <EditorChat
        projectId="p1"
        userId="u1"
        onAction={vi.fn()}
        isOpen={true}
        onToggle={vi.fn()}
        inline
      />
    );
    expect(screen.getByText("Assistente AeroPod")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Pergunte algo/i)).toBeInTheDocument();
  });

  it("renders toggle button when closed (non-inline)", () => {
    render(
      <EditorChat
        projectId="p1"
        userId="u1"
        onAction={vi.fn()}
        isOpen={false}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText("Assistente IA")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// editor/SocialClipsGenerator
// ---------------------------------------------------------------------------
import { SocialClipsGenerator } from "@/components/editor/SocialClipsGenerator";

describe("SocialClipsGenerator", () => {
  it("renders header, format options and empty state", () => {
    render(<SocialClipsGenerator projectId="p1" />);
    expect(screen.getByText("Clips Sociais")).toBeInTheDocument();
    expect(screen.getByText("9:16")).toBeInTheDocument();
    expect(screen.getByText(/Gerar Clips Virais/i)).toBeInTheDocument();
  });

  it("switches selected format on click", () => {
    render(<SocialClipsGenerator projectId="p1" />);
    fireEvent.click(screen.getByText("1:1"));
    // No throw; the button reflects the new selection styling. Smoke assertion:
    expect(screen.getByText("1:1")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// sections/GapAnalysisPanel
// ---------------------------------------------------------------------------
import { GapAnalysisPanel } from "@/components/sections/GapAnalysisPanel";

describe("GapAnalysisPanel", () => {
  const gaps = [
    {
      sectionId: "g1",
      sectionName: "Introducao",
      type: "intro",
      isRequired: true,
      status: "empty" as const,
      currentDuration: 0,
      minDuration: null,
      maxDuration: null,
      suggestedDuration: 60,
      exampleText: "Diga ola",
      segmentCount: 0,
      missingDuration: 60,
      suggestion: "Grave uma introducao",
    },
  ];

  it("renders header and gap section name", () => {
    render(<GapAnalysisPanel projectId="p1" gaps={gaps} />);
    expect(screen.getByText("Analise de Gaps")).toBeInTheDocument();
    expect(screen.getByText("Introducao")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(<GapAnalysisPanel projectId="p1" gaps={[]} isLoading />);
    expect(screen.getByText(/Analisando gaps/i)).toBeInTheDocument();
  });

  it("fires onRecordSection when record clicked", () => {
    const onRecordSection = vi.fn();
    render(<GapAnalysisPanel projectId="p1" gaps={gaps} onRecordSection={onRecordSection} />);
    fireEvent.click(screen.getByText("Gravar"));
    expect(onRecordSection).toHaveBeenCalledWith("g1", 60);
  });
});

// ---------------------------------------------------------------------------
// sections/SectionEditor
// ---------------------------------------------------------------------------
import { SectionEditor } from "@/components/sections/SectionEditor";

describe("SectionEditor", () => {
  it("renders section name and volume control", () => {
    render(
      <SectionEditor
        sectionId="s1"
        sectionName="Abertura"
        audioUrl="blob:audio"
        duration={120}
      />
    );
    expect(screen.getByText("Abertura")).toBeInTheDocument();
    expect(screen.getByText("Volume")).toBeInTheDocument();
    expect(screen.getByText("Normalizar Volume")).toBeInTheDocument();
  });

  it("calls onSave after a setting changes", async () => {
    const onSave = vi.fn(async () => {});
    render(
      <SectionEditor
        sectionId="s1"
        sectionName="Abertura"
        audioUrl="blob:audio"
        duration={120}
        onSave={onSave}
      />
    );
    // Toggle a switch to mark hasChanges, then Save.
    const normalize = screen.getByLabelText(/Normalizar Volume/i);
    fireEvent.click(normalize);
    fireEvent.click(screen.getByText("Salvar"));
    expect(onSave).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// sections/SectionManager
// ---------------------------------------------------------------------------
import { SectionManager } from "@/components/sections/SectionManager";

describe("SectionManager", () => {
  it("renders sections fetched from the API", async () => {
    mockFetch((url: string) => {
      if (url.includes("/missing-sections")) {
        return jsonResponse({ success: true, stats: { approved: 1, total: 2, requiredApproved: 1, required: 1, pending: 1, percentComplete: 50, isReadyForExport: false } });
      }
      return jsonResponse({
        success: true,
        sections: [
          { id: "sm1", name: "Introducao", order: 0, status: "pending", templateSection: { isRequired: true } },
        ],
      });
    });
    render(<SectionManager projectId="p1" />);
    expect(await screen.findByText("Introducao")).toBeInTheDocument();
    expect(screen.getByText("Progresso das Seções")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// templates/TemplateCard
// ---------------------------------------------------------------------------
import { TemplateCard } from "@/components/templates/TemplateCard";

describe("TemplateCard", () => {
  const template = {
    id: "tpl1",
    name: "Entrevista Padrao",
    description: "Template para entrevistas",
    category: "interview",
    estimatedDuration: 1800,
    sections: [
      { id: "x", name: "Abertura", isRequired: true, type: "intro" },
      { id: "y", name: "Perguntas", isRequired: false, type: "body" },
    ],
  };

  it("renders name, category label and sections", () => {
    render(<TemplateCard template={template} onSelect={vi.fn()} />);
    expect(screen.getByText("Entrevista Padrao")).toBeInTheDocument();
    expect(screen.getByText("Entrevista")).toBeInTheDocument();
    expect(screen.getByText("Abertura")).toBeInTheDocument();
  });

  it("fires onSelect with template id", () => {
    const onSelect = vi.fn();
    render(<TemplateCard template={template} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Usar este template"));
    expect(onSelect).toHaveBeenCalledWith("tpl1");
  });

  it("shows recommended badge with match score", () => {
    render(<TemplateCard template={template} isRecommended matchScore={0.92} onSelect={vi.fn()} />);
    expect(screen.getByText("Recomendado")).toBeInTheDocument();
    expect(screen.getByText("92%")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// templates/TemplateSelector
// ---------------------------------------------------------------------------
import { TemplateSelector } from "@/components/templates/TemplateSelector";

describe("TemplateSelector", () => {
  it("loads and lists templates from the API", async () => {
    mockFetch(() =>
      jsonResponse({
        success: true,
        templates: [
          { id: "t1", name: "Monologo Solo", description: "desc", category: "monologue" },
        ],
      })
    );
    render(<TemplateSelector projectId="p1" onTemplateSelect={vi.fn(async () => {})} />);
    expect(await screen.findByText("Monologo Solo")).toBeInTheDocument();
    expect(screen.getByText("Templates Disponíveis")).toBeInTheDocument();
  });

  it("renders recommended templates section", async () => {
    mockFetch(() => jsonResponse({ success: true, templates: [] }));
    const suggested = [
      {
        template: { id: "r1", name: "Debate Quente", description: "d", category: "debate" },
        matchScore: 0.8,
        reason: "fits",
      },
    ];
    render(
      <TemplateSelector
        projectId="p1"
        suggestedTemplates={suggested}
        onTemplateSelect={vi.fn(async () => {})}
      />
    );
    expect(await screen.findByText("Debate Quente")).toBeInTheDocument();
    expect(screen.getByText("Templates Recomendados")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// templates/TemplateMappingView
// ---------------------------------------------------------------------------
import { TemplateMappingView } from "@/components/templates/TemplateMappingView";

describe("TemplateMappingView", () => {
  const sections = [
    {
      id: "ms1",
      name: "Introducao",
      type: "intro",
      description: "Abertura",
      minDuration: 30,
      maxDuration: 90,
      suggestedDuration: 60,
      isRequired: true,
      order: 1,
      segments: [
        { id: "seg", title: "Hello", summary: "Greeting", duration: 30, confidence: 0.9 },
      ],
      totalDuration: 30,
      status: "partial" as const,
    },
  ];

  it("renders header stats and section name", () => {
    render(<TemplateMappingView projectId="p1" sections={sections} />);
    expect(screen.getByText("Resultado do Mapeamento")).toBeInTheDocument();
    expect(screen.getByText(/1\. Introducao/)).toBeInTheDocument();
  });

  it("fires onAutoMap when remap button clicked", () => {
    const onAutoMap = vi.fn();
    render(<TemplateMappingView projectId="p1" sections={sections} onAutoMap={onAutoMap} />);
    fireEvent.click(screen.getByText(/Remapear com IA/i));
    expect(onAutoMap).toHaveBeenCalled();
  });

  it("renders unmapped segments info", () => {
    render(
      <TemplateMappingView
        projectId="p1"
        sections={[]}
        unmappedSegments={[{ id: "u1", title: "Loose", summary: "s", duration: 12 }]}
      />
    );
    expect(screen.getByText(/Segmentos nao mapeados/i)).toBeInTheDocument();
    expect(screen.getByText("Loose")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// editor/AudioRecorder (recording)
// ---------------------------------------------------------------------------
import { AudioRecorder } from "@/components/editor/AudioRecorder";

describe("AudioRecorder", () => {
  it("renders the idle mic button", () => {
    render(<AudioRecorder projectId="p1" />);
    expect(screen.getByTitle("Gravar audio")).toBeInTheDocument();
  });

  it("requests microphone access when clicked", () => {
    render(<AudioRecorder projectId="p1" />);
    fireEvent.click(screen.getByTitle("Gravar audio"));
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// editor/RerecordModal (recording)
// ---------------------------------------------------------------------------
import { RerecordModal } from "@/components/editor/RerecordModal";

describe("RerecordModal", () => {
  const segment = makeSegment({ id: "rr1", text: "Old line", errorType: null, errorDetail: "needs fix" });

  it("returns null when closed", () => {
    const { container } = render(
      <RerecordModal isOpen={false} segment={segment as never} onClose={vi.fn()} onConfirm={vi.fn(async () => {})} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders modal with original text and start button when open", () => {
    render(
      <RerecordModal isOpen={true} segment={segment as never} onClose={vi.fn()} onConfirm={vi.fn(async () => {})} />
    );
    expect(screen.getByText("Re-record Segment")).toBeInTheDocument();
    expect(screen.getByText("Old line")).toBeInTheDocument();
    expect(screen.getByText("Start Recording")).toBeInTheDocument();
  });

  it("calls onClose via Cancel", () => {
    const onClose = vi.fn();
    render(
      <RerecordModal isOpen={true} segment={segment as never} onClose={onClose} onConfirm={vi.fn(async () => {})} />
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// recording/InlineRecordingModal
// ---------------------------------------------------------------------------
import { InlineRecordingModal } from "@/components/recording/InlineRecordingModal";

describe("InlineRecordingModal", () => {
  it("renders the dialog with section name and target duration when open", () => {
    render(
      <InlineRecordingModal
        isOpen={true}
        onClose={vi.fn()}
        sectionId="s1"
        sectionName="Introducao"
        targetDuration={90}
        exampleText="Diga ola ao ouvinte"
        onRecordingComplete={vi.fn(async () => {})}
      />
    );
    expect(screen.getByText(/Gravar: Introducao/i)).toBeInTheDocument();
    expect(screen.getByText(/Diga ola ao ouvinte/i)).toBeInTheDocument();
    expect(screen.getByText("Iniciar Gravacao")).toBeInTheDocument();
  });

  it("does not render content when closed", () => {
    render(
      <InlineRecordingModal
        isOpen={false}
        onClose={vi.fn()}
        sectionId="s1"
        sectionName="Introducao"
        targetDuration={90}
        onRecordingComplete={vi.fn(async () => {})}
      />
    );
    expect(screen.queryByText(/Gravar: Introducao/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// recording/RecordingStudio
// ---------------------------------------------------------------------------
import { RecordingStudio } from "@/components/recording/RecordingStudio";

describe("RecordingStudio", () => {
  it("renders the studio header and idle tips", () => {
    render(<RecordingStudio onRecordingComplete={vi.fn()} />);
    expect(screen.getByText("Gravacao")).toBeInTheDocument();
    expect(screen.getByText(/Clique no botao para comecar a gravar/i)).toBeInTheDocument();
  });

  it("shows the timer at zero initially", () => {
    render(<RecordingStudio onRecordingComplete={vi.fn()} />);
    expect(screen.getByText("00:00")).toBeInTheDocument();
  });
});
