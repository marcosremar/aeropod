import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  TemplateStatusCard,
  QuickActionsBar,
  ProgressCard,
  SectionDetailCard,
  GapAnalysisCard,
  RecordingPreviewCard,
  MiniTimeline,
  type TemplateSection,
  type QuickAction,
} from "@/components/editor/ChatComponents";

// ─── Fixtures ─────────────────────────────────────────────────────────────

function makeSection(overrides: Partial<TemplateSection> = {}): TemplateSection {
  return {
    id: "sec-1",
    name: "Intro",
    status: "empty",
    duration: 0,
    targetDuration: 60,
    isRequired: false,
    ...overrides,
  };
}

function makeQuickAction(overrides: Partial<QuickAction> = {}): QuickAction {
  return {
    id: "action-1",
    label: "Export",
    icon: "download",
    variant: "primary",
    action: "export",
    ...overrides,
  };
}

// ─── TemplateStatusCard ────────────────────────────────────────────────────

describe("TemplateStatusCard", () => {
  it("renders the template name", () => {
    render(
      <TemplateStatusCard
        templateName="My Template"
        sections={[makeSection({ status: "complete" })]}
      />
    );
    expect(screen.getByText("My Template")).toBeInTheDocument();
  });

  it("shows 0% progress when no sections are complete", () => {
    render(
      <TemplateStatusCard
        templateName="T"
        sections={[makeSection({ status: "empty" }), makeSection({ id: "sec-2", name: "Body", status: "partial" })]}
      />
    );
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("shows 100% when all sections are complete", () => {
    render(
      <TemplateStatusCard
        templateName="T"
        sections={[
          makeSection({ status: "complete" }),
          makeSection({ id: "sec-2", name: "Body", status: "complete" }),
        ]}
      />
    );
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("shows 50% when half the sections are complete", () => {
    render(
      <TemplateStatusCard
        templateName="T"
        sections={[
          makeSection({ status: "complete" }),
          makeSection({ id: "sec-2", name: "Body", status: "empty" }),
        ]}
      />
    );
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("renders each section name", () => {
    render(
      <TemplateStatusCard
        templateName="T"
        sections={[
          makeSection({ name: "Intro" }),
          makeSection({ id: "sec-2", name: "Conclusion" }),
        ]}
      />
    );
    expect(screen.getByText("Intro")).toBeInTheDocument();
    expect(screen.getByText("Conclusion")).toBeInTheDocument();
  });

  it("shows required badge for required sections", () => {
    render(
      <TemplateStatusCard
        templateName="T"
        sections={[makeSection({ isRequired: true })]}
      />
    );
    expect(screen.getByText("Obrig.")).toBeInTheDocument();
  });

  it("does not show required badge for non-required sections", () => {
    render(
      <TemplateStatusCard
        templateName="T"
        sections={[makeSection({ isRequired: false })]}
      />
    );
    expect(screen.queryByText("Obrig.")).not.toBeInTheDocument();
  });

  it("calls onSectionClick with section id when section is clicked", () => {
    const onSectionClick = vi.fn();
    render(
      <TemplateStatusCard
        templateName="T"
        sections={[makeSection({ id: "sec-42" })]}
        onSectionClick={onSectionClick}
      />
    );
    fireEvent.click(screen.getByText("Intro"));
    expect(onSectionClick).toHaveBeenCalledWith("sec-42");
  });

  it("renders duration for each section as time/target", () => {
    render(
      <TemplateStatusCard
        templateName="T"
        sections={[makeSection({ duration: 65, targetDuration: 120 })]}
      />
    );
    expect(screen.getByText("1:05 / 2:00")).toBeInTheDocument();
  });
});

// ─── QuickActionsBar ──────────────────────────────────────────────────────

describe("QuickActionsBar", () => {
  it("renders all action labels", () => {
    const actions: QuickAction[] = [
      makeQuickAction({ label: "Export" }),
      makeQuickAction({ id: "a2", label: "Record", icon: "mic", variant: "secondary", action: "record" }),
    ];
    const onAction = vi.fn();
    render(<QuickActionsBar actions={actions} onAction={onAction} />);
    expect(screen.getByText("Export")).toBeInTheDocument();
    expect(screen.getByText("Record")).toBeInTheDocument();
  });

  it("calls onAction with the action string when button clicked", () => {
    const onAction = vi.fn();
    render(
      <QuickActionsBar
        actions={[makeQuickAction({ action: "export" })]}
        onAction={onAction}
      />
    );
    fireEvent.click(screen.getByText("Export"));
    expect(onAction).toHaveBeenCalledWith("export");
  });

  it("calls the correct action for each button independently", () => {
    const onAction = vi.fn();
    render(
      <QuickActionsBar
        actions={[
          makeQuickAction({ id: "a1", label: "Export", action: "export" }),
          makeQuickAction({ id: "a2", label: "Record", icon: "mic", variant: "secondary", action: "record" }),
        ]}
        onAction={onAction}
      />
    );
    fireEvent.click(screen.getByText("Record"));
    expect(onAction).toHaveBeenCalledWith("record");
    expect(onAction).not.toHaveBeenCalledWith("export");
  });

  it("renders zero buttons when actions array is empty", () => {
    const onAction = vi.fn();
    const { container } = render(<QuickActionsBar actions={[]} onAction={onAction} />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });
});

// ─── ProgressCard ─────────────────────────────────────────────────────────

describe("ProgressCard", () => {
  it("renders the card title", () => {
    render(<ProgressCard title="Progresso geral" stats={[]} />);
    expect(screen.getByText("Progresso geral")).toBeInTheDocument();
  });

  it("renders all stat labels and values", () => {
    render(
      <ProgressCard
        title="T"
        stats={[
          { label: "Duration", value: "5:00" },
          { label: "Sections", value: "3" },
          { label: "Complete", value: "2" },
        ]}
      />
    );
    expect(screen.getByText("Duration")).toBeInTheDocument();
    expect(screen.getByText("5:00")).toBeInTheDocument();
    expect(screen.getByText("Sections")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders nothing extra when stats array is empty", () => {
    render(<ProgressCard title="Empty" stats={[]} />);
    expect(screen.getByText("Empty")).toBeInTheDocument();
  });
});

// ─── SectionDetailCard ────────────────────────────────────────────────────

describe("SectionDetailCard", () => {
  it("renders the section name", () => {
    render(<SectionDetailCard section={makeSection({ name: "Introduction" })} />);
    expect(screen.getByText("Introduction")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(
      <SectionDetailCard
        section={{ ...makeSection(), description: "Opening segment" }}
      />
    );
    expect(screen.getByText("Opening segment")).toBeInTheDocument();
  });

  it("does not render description when not provided", () => {
    render(<SectionDetailCard section={makeSection()} />);
    expect(screen.queryByText("Opening segment")).not.toBeInTheDocument();
  });

  it("shows required badge when isRequired is true", () => {
    render(<SectionDetailCard section={makeSection({ isRequired: true })} />);
    expect(screen.getByText("Obrigatorio")).toBeInTheDocument();
  });

  it("does not show required badge when isRequired is false", () => {
    render(<SectionDetailCard section={makeSection({ isRequired: false })} />);
    expect(screen.queryByText("Obrigatorio")).not.toBeInTheDocument();
  });

  it("shows suggestion when status is empty", () => {
    render(
      <SectionDetailCard
        section={makeSection({ status: "empty" })}
        suggestion="Record your intro"
      />
    );
    expect(screen.getByText("Record your intro")).toBeInTheDocument();
  });

  it("shows suggestion when status is partial", () => {
    render(
      <SectionDetailCard
        section={makeSection({ status: "partial", duration: 30 })}
        suggestion="Add 30 more seconds"
      />
    );
    expect(screen.getByText("Add 30 more seconds")).toBeInTheDocument();
  });

  it("does not show suggestion when status is complete", () => {
    render(
      <SectionDetailCard
        section={makeSection({ status: "complete", duration: 60 })}
        suggestion="This won't show"
      />
    );
    expect(screen.queryByText("This won't show")).not.toBeInTheDocument();
  });

  it("shows Gravar button when onRecord provided and status is not complete", () => {
    render(
      <SectionDetailCard
        section={makeSection({ status: "empty" })}
        onRecord={vi.fn()}
      />
    );
    expect(screen.getByText("Gravar")).toBeInTheDocument();
  });

  it("shows Auto-preencher button when onAutoFill provided and status is not complete", () => {
    render(
      <SectionDetailCard
        section={makeSection({ status: "empty" })}
        onAutoFill={vi.fn()}
      />
    );
    expect(screen.getByText("Auto-preencher")).toBeInTheDocument();
  });

  it("does not show action buttons when status is complete", () => {
    render(
      <SectionDetailCard
        section={makeSection({ status: "complete", duration: 60 })}
        onRecord={vi.fn()}
        onAutoFill={vi.fn()}
      />
    );
    expect(screen.queryByText("Gravar")).not.toBeInTheDocument();
    expect(screen.queryByText("Auto-preencher")).not.toBeInTheDocument();
  });

  it("calls onRecord when Gravar button is clicked", () => {
    const onRecord = vi.fn();
    render(
      <SectionDetailCard section={makeSection({ status: "empty" })} onRecord={onRecord} />
    );
    fireEvent.click(screen.getByText("Gravar"));
    expect(onRecord).toHaveBeenCalledTimes(1);
  });

  it("calls onAutoFill when Auto-preencher button is clicked", () => {
    const onAutoFill = vi.fn();
    render(
      <SectionDetailCard section={makeSection({ status: "empty" })} onAutoFill={onAutoFill} />
    );
    fireEvent.click(screen.getByText("Auto-preencher"));
    expect(onAutoFill).toHaveBeenCalledTimes(1);
  });

  it("renders progress time as duration / target", () => {
    render(
      <SectionDetailCard
        section={makeSection({ duration: 90, targetDuration: 180 })}
      />
    );
    expect(screen.getByText("1:30 / 3:00")).toBeInTheDocument();
  });
});

// ─── GapAnalysisCard ──────────────────────────────────────────────────────

describe("GapAnalysisCard", () => {
  it("shows 'Tudo completo!' when gaps array is empty", () => {
    render(<GapAnalysisCard gaps={[]} />);
    expect(screen.getByText("Tudo completo!")).toBeInTheDocument();
  });

  it("shows gap count header when gaps exist", () => {
    render(
      <GapAnalysisCard
        gaps={[
          { sectionName: "Intro", missingDuration: 30, suggestion: "Record intro" },
          { sectionName: "Outro", missingDuration: 20, suggestion: "Record outro" },
        ]}
      />
    );
    expect(screen.getByText("2 secoes precisam de conteudo")).toBeInTheDocument();
  });

  it("shows each gap's section name", () => {
    render(
      <GapAnalysisCard
        gaps={[
          { sectionName: "Intro", missingDuration: 30, suggestion: "s" },
          { sectionName: "Body", missingDuration: 60, suggestion: "s" },
        ]}
      />
    );
    expect(screen.getByText("Intro")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("shows missing duration for each gap", () => {
    render(
      <GapAnalysisCard
        gaps={[{ sectionName: "Intro", missingDuration: 65, suggestion: "s" }]}
      />
    );
    expect(screen.getByText("Faltam 1:05")).toBeInTheDocument();
  });

  it("shows Gravar button for each gap when onFillGap provided", () => {
    render(
      <GapAnalysisCard
        gaps={[
          { sectionName: "Intro", missingDuration: 30, suggestion: "s" },
          { sectionName: "Outro", missingDuration: 20, suggestion: "s" },
        ]}
        onFillGap={vi.fn()}
      />
    );
    expect(screen.getAllByText("Gravar")).toHaveLength(2);
  });

  it("calls onFillGap with section name when Gravar is clicked", () => {
    const onFillGap = vi.fn();
    render(
      <GapAnalysisCard
        gaps={[{ sectionName: "Intro", missingDuration: 30, suggestion: "s" }]}
        onFillGap={onFillGap}
      />
    );
    fireEvent.click(screen.getByText("Gravar"));
    expect(onFillGap).toHaveBeenCalledWith("Intro");
  });

  it("does not render Gravar buttons when onFillGap is not provided", () => {
    render(
      <GapAnalysisCard
        gaps={[{ sectionName: "Intro", missingDuration: 30, suggestion: "s" }]}
      />
    );
    expect(screen.queryByText("Gravar")).not.toBeInTheDocument();
  });
});

// ─── RecordingPreviewCard ─────────────────────────────────────────────────

const defaultRecordingProps = {
  transcription: "Hello this is a test recording",
  duration: 30,
  segmentId: "seg-1",
  sections: [
    { id: "sec-1", name: "Intro", status: "empty" as const },
    { id: "sec-2", name: "Body", status: "partial" as const },
  ],
  onInsert: vi.fn(),
  onDiscard: vi.fn(),
};

describe("RecordingPreviewCard", () => {
  it("renders the transcription text", () => {
    render(<RecordingPreviewCard {...defaultRecordingProps} />);
    expect(screen.getByText(/"Hello this is a test recording"/)).toBeInTheDocument();
  });

  it("renders the duration in the header", () => {
    render(<RecordingPreviewCard {...defaultRecordingProps} duration={90} />);
    expect(screen.getByText("1:30")).toBeInTheDocument();
  });

  it("shows topic badge when topic prop is provided", () => {
    render(<RecordingPreviewCard {...defaultRecordingProps} topic="Marketing" />);
    expect(screen.getByText("Marketing")).toBeInTheDocument();
  });

  it("does not show topic badge when topic is not provided", () => {
    render(<RecordingPreviewCard {...defaultRecordingProps} />);
    expect(screen.queryByText("Marketing")).not.toBeInTheDocument();
  });

  it("renders all section options", () => {
    render(<RecordingPreviewCard {...defaultRecordingProps} />);
    expect(screen.getByText("Intro")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("renders the 'add to end' option", () => {
    render(<RecordingPreviewCard {...defaultRecordingProps} />);
    expect(screen.getByText("Adicionar ao final (sem secao especifica)")).toBeInTheDocument();
  });

  it("Insert button is disabled before a section is selected", () => {
    render(<RecordingPreviewCard {...defaultRecordingProps} />);
    const insertBtn = screen.getByText("Inserir").closest("button")!;
    expect(insertBtn).toBeDisabled();
  });

  it("Insert button is enabled after selecting a section", () => {
    render(<RecordingPreviewCard {...defaultRecordingProps} />);
    fireEvent.click(screen.getByText("Intro"));
    const insertBtn = screen.getByText("Inserir").closest("button")!;
    expect(insertBtn).not.toBeDisabled();
  });

  it("calls onDiscard when Descartar button is clicked", () => {
    const onDiscard = vi.fn();
    render(<RecordingPreviewCard {...defaultRecordingProps} onDiscard={onDiscard} />);
    fireEvent.click(screen.getByText("Descartar"));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("calls onInsert with selected section id when Inserir is clicked", async () => {
    const onInsert = vi.fn().mockResolvedValue(undefined);
    render(<RecordingPreviewCard {...defaultRecordingProps} onInsert={onInsert} />);
    fireEvent.click(screen.getByText("Intro"));
    fireEvent.click(screen.getByText("Inserir"));
    await waitFor(() => expect(onInsert).toHaveBeenCalledWith("sec-1"));
  });

  it("calls onInsert with __end__ when 'add to end' option is selected", async () => {
    const onInsert = vi.fn().mockResolvedValue(undefined);
    render(<RecordingPreviewCard {...defaultRecordingProps} onInsert={onInsert} />);
    fireEvent.click(screen.getByText("Adicionar ao final (sem secao especifica)"));
    fireEvent.click(screen.getByText("Inserir"));
    await waitFor(() => expect(onInsert).toHaveBeenCalledWith("__end__"));
  });

  it("shows required badge for sections with isRequired", () => {
    render(
      <RecordingPreviewCard
        {...defaultRecordingProps}
        sections={[{ id: "s1", name: "Intro", status: "empty", isRequired: true }]}
      />
    );
    expect(screen.getByText("Obrig.")).toBeInTheDocument();
  });
});

// ─── MiniTimeline ─────────────────────────────────────────────────────────

describe("MiniTimeline", () => {
  it("renders the Timeline label", () => {
    render(<MiniTimeline segments={[]} totalDuration={60} />);
    expect(screen.getByText("Timeline")).toBeInTheDocument();
  });

  it("renders the total duration", () => {
    render(<MiniTimeline segments={[]} totalDuration={120} />);
    expect(screen.getByText("2:00")).toBeInTheDocument();
  });

  it("renders start time as 0:00", () => {
    render(<MiniTimeline segments={[]} totalDuration={60} />);
    expect(screen.getByText("0:00")).toBeInTheDocument();
  });

  it("renders without error when segments array is empty", () => {
    const { container } = render(<MiniTimeline segments={[]} totalDuration={60} />);
    expect(container).toBeTruthy();
  });

  it("renders one segment bar per segment", () => {
    const { container } = render(
      <MiniTimeline
        segments={[
          { id: "s1", start: 0, end: 30, status: "selected" },
          { id: "s2", start: 30, end: 60, status: "available" },
        ]}
        totalDuration={60}
      />
    );
    // Each segment becomes an absolute-positioned div inside the timeline bar
    const timelineBar = container.querySelector(".h-6.bg-zinc-900")!;
    expect(timelineBar.children).toHaveLength(2);
  });
});
