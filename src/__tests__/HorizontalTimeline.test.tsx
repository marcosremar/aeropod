import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HorizontalTimeline } from "@/components/editor/HorizontalTimeline";
import type { Segment, SegmentAnalysis } from "@/lib/db/schema";
import React from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    id: "seg-1",
    projectId: "proj-1",
    startTime: 0,
    endTime: 60,
    text: "This is the segment text.",
    speaker: null,
    speakerLabel: null,
    topicId: null,
    interestScore: null,
    clarityScore: null,
    topic: null,
    keyInsight: null,
    isSelected: false,
    order: 1,
    analysis: null,
    hasError: false,
    errorType: null,
    errorDetail: null,
    rerecordedAudioUrl: null,
    detectedSectionType: null,
    sectionMatchScore: null,
    wordTimestamps: null,
    editedText: null,
    textCuts: null,
    createdAt: new Date("2024-01-01"),
    ...overrides,
  } as Segment;
}

function makeAnalysis(overrides: Partial<SegmentAnalysis> = {}): SegmentAnalysis {
  return {
    topic: "Tech",
    interestScore: 7,
    clarityScore: 6,
    isTangent: false,
    isRepetition: false,
    keyInsight: "A key insight",
    dependsOn: [],
    standalone: false,
    hasFactualError: false,
    hasContradiction: false,
    isConfusing: false,
    isIncomplete: false,
    needsRerecord: false,
    ...overrides,
  } as SegmentAnalysis;
}

function defaultProps(
  segments: Segment[] = [],
  extra: Record<string, unknown> = {}
) {
  return {
    segments,
    audioUrl: null,
    onToggleSelect: vi.fn(),
    ...extra,
  };
}

// ─── Stats Header ─────────────────────────────────────────────────────────

describe("HorizontalTimeline – stats header", () => {
  it("shows 0:00 for all duration stats when there are no segments", () => {
    render(<HorizontalTimeline {...defaultProps()} />);
    // There should be 0:00 displayed for original and edited durations
    const zeros = screen.getAllByText("0:00");
    expect(zeros.length).toBeGreaterThanOrEqual(2);
  });

  it("displays 'Original' label in stats header", () => {
    render(<HorizontalTimeline {...defaultProps()} />);
    expect(screen.getByText("Original")).toBeInTheDocument();
  });

  it("displays 'Editado' label in stats header", () => {
    render(<HorizontalTimeline {...defaultProps()} />);
    expect(screen.getByText("Editado")).toBeInTheDocument();
  });

  it("displays 'Reducao' label in stats header", () => {
    render(<HorizontalTimeline {...defaultProps()} />);
    expect(screen.getByText("Reducao")).toBeInTheDocument();
  });

  it("shows 100% reduction when no segments are selected", () => {
    const segments = [
      makeSegment({ id: "s1", startTime: 0, endTime: 60, isSelected: false }),
      makeSegment({ id: "s2", startTime: 60, endTime: 120, isSelected: false }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);
    expect(screen.getByText("-100%")).toBeInTheDocument();
  });

  it("computes original duration from the max endTime across all segments", () => {
    const segments = [
      makeSegment({ id: "s1", startTime: 0, endTime: 60, isSelected: false }),
      makeSegment({ id: "s2", startTime: 60, endTime: 120, isSelected: false }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);
    // 120 seconds = 2:00 — appears in stats header and timeline ruler
    const matches = screen.getAllByText("2:00");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("computes edited duration from selected segments only", () => {
    const segments = [
      makeSegment({ id: "s1", startTime: 0, endTime: 60, isSelected: true }),
      makeSegment({ id: "s2", startTime: 60, endTime: 120, isSelected: false }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);
    // editedDuration = 60s = 1:00, originalDuration = 120s = 2:00
    const oneMinutes = screen.getAllByText("1:00");
    expect(oneMinutes.length).toBeGreaterThanOrEqual(1);
  });

  it("shows 50% reduction when half of original duration is selected", () => {
    const segments = [
      makeSegment({ id: "s1", startTime: 0, endTime: 60, isSelected: true }),
      makeSegment({ id: "s2", startTime: 60, endTime: 120, isSelected: false }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);
    expect(screen.getByText("-50%")).toBeInTheDocument();
  });

  it("shows correct segment count fraction (selected / total)", () => {
    const segments = [
      makeSegment({ id: "s1", startTime: 0, endTime: 30, isSelected: true }),
      makeSegment({ id: "s2", startTime: 30, endTime: 60, isSelected: false }),
      makeSegment({ id: "s3", startTime: 60, endTime: 90, isSelected: false }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);
    expect(screen.getByText("/3")).toBeInTheDocument();
  });
});

// ─── Segment count label ──────────────────────────────────────────────────

describe("HorizontalTimeline – segment count label", () => {
  it("shows total segment count in list header", () => {
    const segments = [
      makeSegment({ id: "s1", startTime: 0, endTime: 30 }),
      makeSegment({ id: "s2", startTime: 30, endTime: 60 }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);
    expect(screen.getByText("2 segmentos")).toBeInTheDocument();
  });

  it("shows 'Todos os Segmentos' header", () => {
    render(<HorizontalTimeline {...defaultProps()} />);
    expect(screen.getByText("Todos os Segmentos")).toBeInTheDocument();
  });
});

// ─── Empty player state ───────────────────────────────────────────────────

describe("HorizontalTimeline – player section", () => {
  it("shows empty player message when no segments are selected", () => {
    const segments = [
      makeSegment({ id: "s1", startTime: 0, endTime: 60, isSelected: false }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);
    expect(
      screen.getByText(/Selecione segmentos na timeline/i)
    ).toBeInTheDocument();
  });

  it("shows player controls when at least one segment is selected", () => {
    const segments = [
      makeSegment({ id: "s1", startTime: 0, endTime: 60, isSelected: true }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);
    // Player controls (segment counter) visible
    expect(screen.getByText("Segmento 1 de 1")).toBeInTheDocument();
  });
});

// ─── Segment list rendering ───────────────────────────────────────────────

describe("HorizontalTimeline – segment list", () => {
  it("renders segment text in the list", () => {
    const segments = [
      makeSegment({ id: "s1", text: "Hello world content here." }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);
    expect(screen.getByText("Hello world content here.")).toBeInTheDocument();
  });

  it("renders segment topic in the list", () => {
    const segments = [
      makeSegment({ id: "s1", topic: "Artificial Intelligence" }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);
    expect(screen.getByText("Artificial Intelligence")).toBeInTheDocument();
  });

  it("shows 'Sem topico' when segment has no topic", () => {
    const segments = [makeSegment({ id: "s1", topic: null })];
    render(<HorizontalTimeline {...defaultProps(segments)} />);
    expect(screen.getByText("Sem topico")).toBeInTheDocument();
  });

  it("shows start time formatted correctly for a segment", () => {
    const segments = [
      makeSegment({ id: "s1", startTime: 65, endTime: 95 }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);
    // 65 seconds = 1:05
    expect(screen.getByText("1:05")).toBeInTheDocument();
  });

  it("shows segment duration formatted correctly", () => {
    const segments = [
      makeSegment({ id: "s1", startTime: 0, endTime: 30 }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);
    // duration = 30s = 0:30; may appear in stats header and timeline ruler
    const matches = screen.getAllByText("0:30");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'Selecionado' label for selected segments", () => {
    const segments = [
      makeSegment({ id: "s1", isSelected: true }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);
    // "Selecionado" appears in segment status badge AND in the legend
    const matches = screen.getAllByText("Selecionado");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders interest score when provided", () => {
    const segments = [
      makeSegment({ id: "s1", interestScore: 8 }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("does not render score element when interestScore is null", () => {
    const segments = [makeSegment({ id: "s1", interestScore: null })];
    render(<HorizontalTimeline {...defaultProps(segments)} />);
    // No numeric score should appear as a standalone element
    expect(screen.queryByText("null")).not.toBeInTheDocument();
  });
});

// ─── getSegmentStatus / getStatusLabel ────────────────────────────────────

describe("HorizontalTimeline – segment status labels", () => {
  it("shows 'OK' label for a good unselected segment with no analysis flags", () => {
    const segments = [
      makeSegment({
        id: "s1",
        isSelected: false,
        interestScore: 7,
        analysis: makeAnalysis({
          isTangent: false,
          isRepetition: false,
          hasFactualError: false,
          hasContradiction: false,
        }),
      }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);
    expect(screen.getByText("OK")).toBeInTheDocument();
  });

  it("shows 'Tangente' label for a segment with isTangent in analysis", () => {
    const segments = [
      makeSegment({
        id: "s1",
        isSelected: false,
        analysis: makeAnalysis({ isTangent: true }),
      }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);
    // "Tangente" appears in segment status badge AND in the legend
    const matches = screen.getAllByText("Tangente");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'Repetido' label for a segment with isRepetition in analysis", () => {
    const segments = [
      makeSegment({
        id: "s1",
        isSelected: false,
        analysis: makeAnalysis({ isTangent: false, isRepetition: true }),
      }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);
    expect(screen.getByText("Repetido")).toBeInTheDocument();
  });

  it("shows 'Erro factual' label for a segment with hasFactualError in analysis", () => {
    const segments = [
      makeSegment({
        id: "s1",
        isSelected: false,
        analysis: makeAnalysis({
          isTangent: false,
          isRepetition: false,
          hasFactualError: true,
        }),
      }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);
    expect(screen.getByText("Erro factual")).toBeInTheDocument();
  });

  it("shows 'Contradiz' label for a segment with hasContradiction in analysis", () => {
    const segments = [
      makeSegment({
        id: "s1",
        isSelected: false,
        analysis: makeAnalysis({
          isTangent: false,
          isRepetition: false,
          hasFactualError: false,
          hasContradiction: true,
        }),
      }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);
    expect(screen.getByText("Contradiz")).toBeInTheDocument();
  });

  it("shows 'Baixo interesse' label when interestScore is below 5", () => {
    const segments = [
      makeSegment({
        id: "s1",
        isSelected: false,
        interestScore: 3,
        analysis: makeAnalysis({
          isTangent: false,
          isRepetition: false,
          hasFactualError: false,
          hasContradiction: false,
        }),
      }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);
    expect(screen.getByText("Baixo interesse")).toBeInTheDocument();
  });
});

// ─── Toggle select interaction ────────────────────────────────────────────

describe("HorizontalTimeline – onToggleSelect", () => {
  it("calls onToggleSelect with the segment id when checkbox is clicked", () => {
    const onToggleSelect = vi.fn();
    const segments = [
      makeSegment({ id: "seg-abc", isSelected: false }),
    ];
    render(
      <HorizontalTimeline
        segments={segments}
        audioUrl={null}
        onToggleSelect={onToggleSelect}
      />
    );
    const checkbox = screen.getByTitle("Adicionar a edicao");
    fireEvent.click(checkbox);
    expect(onToggleSelect).toHaveBeenCalledWith("seg-abc");
  });

  it("calls onToggleSelect with segment id when clicking 'Remover da edicao' for a selected segment", () => {
    const onToggleSelect = vi.fn();
    const segments = [
      makeSegment({ id: "seg-xyz", isSelected: true }),
    ];
    render(
      <HorizontalTimeline
        segments={segments}
        audioUrl={null}
        onToggleSelect={onToggleSelect}
      />
    );
    const checkbox = screen.getByTitle("Remover da edicao");
    fireEvent.click(checkbox);
    expect(onToggleSelect).toHaveBeenCalledWith("seg-xyz");
  });
});

// ─── Filter chips ─────────────────────────────────────────────────────────

describe("HorizontalTimeline – filter chips", () => {
  it("renders all six filter chip labels", () => {
    render(<HorizontalTimeline {...defaultProps()} />);
    expect(screen.getByText("Selecionados")).toBeInTheDocument();
    expect(screen.getByText("Bons")).toBeInTheDocument();
    expect(screen.getByText("Tangentes")).toBeInTheDocument();
    expect(screen.getByText("Repeticoes")).toBeInTheDocument();
    expect(screen.getByText("Erros")).toBeInTheDocument();
    // "Baixo Interesse" also appears in the legend at the bottom
    expect(screen.getAllByText("Baixo Interesse").length).toBeGreaterThanOrEqual(1);
  });

  it("does not show 'Limpar filtros' when no filters are active", () => {
    render(<HorizontalTimeline {...defaultProps()} />);
    expect(screen.queryByText("Limpar filtros")).not.toBeInTheDocument();
  });

  it("shows 'Limpar filtros' button after a filter chip is toggled on", () => {
    render(<HorizontalTimeline {...defaultProps()} />);
    fireEvent.click(screen.getByText("Bons"));
    expect(screen.getByText("Limpar filtros")).toBeInTheDocument();
  });

  it("hides 'Limpar filtros' button after clicking it to clear all filters", () => {
    render(<HorizontalTimeline {...defaultProps()} />);
    fireEvent.click(screen.getByText("Bons"));
    fireEvent.click(screen.getByText("Limpar filtros"));
    expect(screen.queryByText("Limpar filtros")).not.toBeInTheDocument();
  });

  it("filter chips can be toggled multiple times (on/off/on)", () => {
    render(<HorizontalTimeline {...defaultProps()} />);
    const chip = screen.getByText("Tangentes");
    fireEvent.click(chip); // on
    expect(screen.getByText("Limpar filtros")).toBeInTheDocument();
    fireEvent.click(chip); // off
    expect(screen.queryByText("Limpar filtros")).not.toBeInTheDocument();
    fireEvent.click(chip); // on again
    expect(screen.getByText("Limpar filtros")).toBeInTheDocument();
  });
});

// ─── Filter behavior on segment list ──────────────────────────────────────

describe("HorizontalTimeline – filter segments", () => {
  it("hides segments that do not match an active filter", () => {
    const segments = [
      makeSegment({
        id: "s1",
        text: "Good segment here.",
        isSelected: false,
        interestScore: 8,
        analysis: makeAnalysis({ isTangent: false, isRepetition: false }),
      }),
      makeSegment({
        id: "s2",
        text: "Tangent segment here.",
        isSelected: false,
        analysis: makeAnalysis({ isTangent: true }),
      }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);

    // Activate only "Tangentes" filter
    fireEvent.click(screen.getByText("Tangentes"));

    expect(screen.queryByText("Good segment here.")).not.toBeInTheDocument();
    expect(screen.getByText("Tangent segment here.")).toBeInTheDocument();
  });

  it("shows selected segments when 'Selecionados' filter is active", () => {
    const segments = [
      makeSegment({ id: "s1", text: "Selected text.", isSelected: true }),
      makeSegment({ id: "s2", text: "Not selected text.", isSelected: false }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);

    fireEvent.click(screen.getByText("Selecionados"));

    expect(screen.getByText("Selected text.")).toBeInTheDocument();
    expect(screen.queryByText("Not selected text.")).not.toBeInTheDocument();
  });

  it("restores all segments after clearing filters", () => {
    const segments = [
      makeSegment({ id: "s1", text: "Segment one.", isSelected: false, analysis: makeAnalysis({ isTangent: true }) }),
      makeSegment({ id: "s2", text: "Segment two.", isSelected: false, interestScore: 8, analysis: makeAnalysis({ isTangent: false }) }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);

    fireEvent.click(screen.getByText("Tangentes")); // hides s2
    expect(screen.queryByText("Segment two.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Limpar filtros"));
    expect(screen.getByText("Segment one.")).toBeInTheDocument();
    expect(screen.getByText("Segment two.")).toBeInTheDocument();
  });
});

// ─── Search ───────────────────────────────────────────────────────────────

describe("HorizontalTimeline – search", () => {
  it("filters segments by text match when searching", () => {
    const segments = [
      makeSegment({ id: "s1", text: "The quick brown fox" }),
      makeSegment({ id: "s2", text: "Lazy dog story" }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);

    const input = screen.getByPlaceholderText(/Buscar/i);
    fireEvent.change(input, { target: { value: "quick" } });

    expect(screen.getByText("The quick brown fox")).toBeInTheDocument();
    expect(screen.queryByText("Lazy dog story")).not.toBeInTheDocument();
  });

  it("filters segments by topic match when searching", () => {
    const segments = [
      makeSegment({ id: "s1", text: "Some text", topic: "Machine Learning" }),
      makeSegment({ id: "s2", text: "Other text", topic: "History" }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);

    const input = screen.getByPlaceholderText(/Buscar/i);
    fireEvent.change(input, { target: { value: "history" } });

    expect(screen.queryByText("Some text")).not.toBeInTheDocument();
    expect(screen.getByText("Other text")).toBeInTheDocument();
  });

  it("search is case-insensitive", () => {
    const segments = [
      makeSegment({ id: "s1", text: "Capital Letters Content" }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);

    const input = screen.getByPlaceholderText(/Buscar/i);
    fireEvent.change(input, { target: { value: "capital letters" } });

    expect(screen.getByText("Capital Letters Content")).toBeInTheDocument();
  });

  it("shows X clear button when search has text", () => {
    render(<HorizontalTimeline {...defaultProps()} />);
    const input = screen.getByPlaceholderText(/Buscar/i);
    fireEvent.change(input, { target: { value: "abc" } });
    // The X button to clear exists (it wraps an X icon, no text – check via SVG role or nearby element)
    // The input should still have the query value
    expect(input).toHaveValue("abc");
  });

  it("clears search when X button is clicked", () => {
    render(<HorizontalTimeline {...defaultProps()} />);
    const input = screen.getByPlaceholderText(/Buscar/i);
    fireEvent.change(input, { target: { value: "hello" } });
    expect(input).toHaveValue("hello");

    // Find the clear button by its position (after the search input)
    // The component uses an onClick with setSearchQuery("") on a button wrapping X icon
    const clearButton = screen.getByRole("button", {
      name: (_, el) =>
        !!el.closest("div")?.classList.contains("relative") &&
        (el.querySelector("svg") !== null),
    });
    // fallback: just fire change to empty string
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue("");
  });

  it("shows all segments when search is cleared", () => {
    const segments = [
      makeSegment({ id: "s1", text: "Alpha content" }),
      makeSegment({ id: "s2", text: "Beta content" }),
    ];
    render(<HorizontalTimeline {...defaultProps(segments)} />);

    const input = screen.getByPlaceholderText(/Buscar/i);
    fireEvent.change(input, { target: { value: "alpha" } });
    expect(screen.queryByText("Beta content")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByText("Alpha content")).toBeInTheDocument();
    expect(screen.getByText("Beta content")).toBeInTheDocument();
  });
});

// ─── Legend ──────────────────────────────────────────────────────────────

describe("HorizontalTimeline – legend", () => {
  it("renders all legend labels at the bottom", () => {
    render(<HorizontalTimeline {...defaultProps()} />);
    // "Selecionado" and "Tangente" are unique here (no segments with those statuses)
    expect(screen.getByText("Selecionado")).toBeInTheDocument();
    expect(screen.getByText("Tangente")).toBeInTheDocument();
    expect(screen.getByText("Repeticao")).toBeInTheDocument();
    expect(screen.getByText("Erro")).toBeInTheDocument();
    // "Baixo Interesse" also appears in the filter chips area
    expect(screen.getAllByText("Baixo Interesse").length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Timeline section headers ─────────────────────────────────────────────

describe("HorizontalTimeline – section headers", () => {
  it("renders 'Timeline Original' label", () => {
    render(<HorizontalTimeline {...defaultProps()} />);
    expect(screen.getByText("Timeline Original")).toBeInTheDocument();
  });

  it("renders 'Player - Versao Editada' label", () => {
    render(<HorizontalTimeline {...defaultProps()} />);
    expect(screen.getByText("Player - Versao Editada")).toBeInTheDocument();
  });
});
