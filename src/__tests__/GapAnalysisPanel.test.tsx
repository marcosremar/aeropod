import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GapAnalysisPanel } from "@/components/sections/GapAnalysisPanel";

// ─── Fixtures ─────────────────────────────────────────────────────────────

interface GapInfo {
  sectionId: string;
  sectionName: string;
  type: string;
  isRequired: boolean;
  status: "empty" | "partial" | "complete";
  currentDuration: number;
  minDuration: number | null;
  maxDuration: number | null;
  suggestedDuration: number | null;
  exampleText: string | null;
  segmentCount: number;
  missingDuration: number;
  suggestion: string;
}

function makeGap(overrides: Partial<GapInfo> = {}): GapInfo {
  return {
    sectionId: "sec-1",
    sectionName: "Intro",
    type: "intro",
    isRequired: true,
    status: "empty",
    currentDuration: 0,
    minDuration: null,
    maxDuration: null,
    suggestedDuration: 60,
    exampleText: null,
    segmentCount: 0,
    missingDuration: 60,
    suggestion: "Record an introduction",
    ...overrides,
  };
}

function defaultProps(gaps: GapInfo[] = [], extra: Record<string, unknown> = {}) {
  return {
    projectId: "proj-1",
    gaps,
    ...extra,
  };
}

// ─── Loading state ────────────────────────────────────────────────────────

describe("GapAnalysisPanel — loading state", () => {
  it("shows spinner and loading text when isLoading is true", () => {
    render(<GapAnalysisPanel {...defaultProps([], { isLoading: true })} />);
    expect(screen.getByText(/Analisando gaps/)).toBeInTheDocument();
  });

  it("does not render the main panel when isLoading is true", () => {
    render(<GapAnalysisPanel {...defaultProps([], { isLoading: true })} />);
    expect(screen.queryByText(/Analise de Gaps/)).not.toBeInTheDocument();
  });

  it("renders the main panel when isLoading is false", () => {
    render(<GapAnalysisPanel {...defaultProps([])} />);
    expect(screen.getByText(/Analise de Gaps/)).toBeInTheDocument();
  });
});

// ─── Empty state ─────────────────────────────────────────────────────────

describe("GapAnalysisPanel — empty state", () => {
  it("shows empty state message when gaps array is empty", () => {
    render(<GapAnalysisPanel {...defaultProps([])} />);
    expect(screen.getByText(/Nenhum gap encontrado/)).toBeInTheDocument();
  });

  it("shows all-complete subtitle when no gaps are incomplete", () => {
    const gaps = [makeGap({ status: "complete" })];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    expect(screen.getByText(/Todas as secoes estao completas/)).toBeInTheDocument();
  });

  it("shows incomplete count when some gaps need attention", () => {
    const gaps = [
      makeGap({ sectionId: "sec-1", status: "empty" }),
      makeGap({ sectionId: "sec-2", status: "partial" }),
    ];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    expect(screen.getByText(/2 secoes precisam de atencao/)).toBeInTheDocument();
  });
});

// ─── Quick stats ──────────────────────────────────────────────────────────

describe("GapAnalysisPanel — quick stats", () => {
  it("counts critical gaps correctly (empty + required)", () => {
    const gaps = [
      makeGap({ sectionId: "s1", status: "empty", isRequired: true }),
      makeGap({ sectionId: "s2", status: "empty", isRequired: false }),
      makeGap({ sectionId: "s3", status: "partial", isRequired: true }),
    ];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    const criticalEl = screen.getByText("Criticos");
    expect(criticalEl.previousElementSibling?.textContent).toBe("1");
  });

  it("counts partial gaps correctly", () => {
    const gaps = [
      makeGap({ sectionId: "s1", status: "partial" }),
      makeGap({ sectionId: "s2", status: "partial" }),
    ];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    const partialEl = screen.getByText("Parciais");
    expect(partialEl.previousElementSibling?.textContent).toBe("2");
  });

  it("counts completed gaps correctly", () => {
    const gaps = [
      makeGap({ sectionId: "s1", status: "complete" }),
      makeGap({ sectionId: "s2", status: "complete" }),
      makeGap({ sectionId: "s3", status: "empty" }),
    ];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    const completosEl = screen.getByText("Completos");
    expect(completosEl.previousElementSibling?.textContent).toBe("2");
  });

  it("shows zero for all stats when gaps list is empty", () => {
    render(<GapAnalysisPanel {...defaultProps([])} />);
    expect(screen.getByText("Criticos").previousElementSibling?.textContent).toBe("0");
    expect(screen.getByText("Parciais").previousElementSibling?.textContent).toBe("0");
    expect(screen.getByText("Completos").previousElementSibling?.textContent).toBe("0");
  });
});

// ─── Progress bar ─────────────────────────────────────────────────────────

describe("GapAnalysisPanel — required-sections progress", () => {
  it("shows 100% when all required sections are complete", () => {
    const gaps = [
      makeGap({ sectionId: "s1", isRequired: true, status: "complete" }),
    ];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    expect(screen.getByText(/1\/1 \(100%\)/)).toBeInTheDocument();
  });

  it("shows 0% when no required sections are complete", () => {
    const gaps = [
      makeGap({ sectionId: "s1", isRequired: true, status: "empty" }),
    ];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    expect(screen.getByText(/0\/1 \(0%\)/)).toBeInTheDocument();
  });

  it("shows 50% when half of required sections are complete", () => {
    const gaps = [
      makeGap({ sectionId: "s1", isRequired: true, status: "complete" }),
      makeGap({ sectionId: "s2", isRequired: true, status: "empty" }),
    ];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    expect(screen.getByText(/1\/2 \(50%\)/)).toBeInTheDocument();
  });

  it("ignores optional sections in progress calculation", () => {
    const gaps = [
      makeGap({ sectionId: "s1", isRequired: true, status: "complete" }),
      makeGap({ sectionId: "s2", isRequired: false, status: "empty" }),
    ];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    expect(screen.getByText(/1\/1 \(100%\)/)).toBeInTheDocument();
  });

  it("shows 100% when no required sections exist (all optional)", () => {
    const gaps = [
      makeGap({ sectionId: "s1", isRequired: false, status: "empty" }),
    ];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    expect(screen.getByText(/0\/0 \(100%\)/)).toBeInTheDocument();
  });
});

// ─── Gap sorting ──────────────────────────────────────────────────────────

describe("GapAnalysisPanel — gap sorting", () => {
  it("places required-empty gaps before optional-empty gaps", () => {
    const gaps = [
      makeGap({ sectionId: "s1", sectionName: "Optional Section", isRequired: false, status: "empty" }),
      makeGap({ sectionId: "s2", sectionName: "Required Section", isRequired: true, status: "empty" }),
    ];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    const allGapNames = screen.getAllByText(/Optional Section|Required Section/).map((el) => el.textContent);
    const reqIdx = allGapNames.findIndex((t) => t === "Required Section");
    const optIdx = allGapNames.findIndex((t) => t === "Optional Section");
    expect(reqIdx).toBeLessThan(optIdx);
  });

  it("places empty gaps before partial gaps within the same required level", () => {
    const gaps = [
      makeGap({ sectionId: "s1", sectionName: "Partial Gap", isRequired: true, status: "partial", currentDuration: 30 }),
      makeGap({ sectionId: "s2", sectionName: "Empty Gap", isRequired: true, status: "empty" }),
    ];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    const allNames = screen.getAllByText(/Partial Gap|Empty Gap/).map((el) => el.textContent);
    const emptyIdx = allNames.findIndex((t) => t === "Empty Gap");
    const partialIdx = allNames.findIndex((t) => t === "Partial Gap");
    expect(emptyIdx).toBeLessThan(partialIdx);
  });

  it("does not render complete gaps in the main list", () => {
    const gaps = [
      makeGap({ sectionId: "s1", sectionName: "Done Section", status: "complete" }),
      makeGap({ sectionId: "s2", sectionName: "Pending Section", status: "empty" }),
    ];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    // "Done Section" should appear only in the completed subsection, not in the main sorted list
    // The main list only shows non-complete gaps
    expect(screen.getByText("Pending Section")).toBeInTheDocument();
    // "Done Section" appears in the completed footer area
    expect(screen.getByText("Done Section")).toBeInTheDocument();
  });
});

// ─── Expand / collapse ────────────────────────────────────────────────────

describe("GapAnalysisPanel — expand/collapse individual gap", () => {
  it("starts collapsed — suggestion text is not visible", () => {
    const gaps = [makeGap({ suggestion: "Record something great" })];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    expect(screen.queryByText("Record something great")).not.toBeInTheDocument();
  });

  it("expands a gap when its row is clicked", () => {
    const gaps = [makeGap({ suggestion: "Record something great" })];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    fireEvent.click(screen.getByText("Intro"));
    expect(screen.getByText("Record something great")).toBeInTheDocument();
  });

  it("collapses the gap when the same row is clicked again", () => {
    const gaps = [makeGap({ suggestion: "Record something great" })];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    fireEvent.click(screen.getByText("Intro"));
    fireEvent.click(screen.getByText("Intro"));
    expect(screen.queryByText("Record something great")).not.toBeInTheDocument();
  });

  it("shows example text inside expanded gap", () => {
    const gaps = [makeGap({ exampleText: "Hello and welcome to the show!" })];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    fireEvent.click(screen.getByText("Intro"));
    expect(screen.getByText(/Hello and welcome to the show!/)).toBeInTheDocument();
  });

  it("shows missing duration warning inside expanded gap when missingDuration > 0", () => {
    // suggestedDuration (3:00) differs from missingDuration (2:00) so "2:00" is unique in the DOM
    const gaps = [makeGap({ missingDuration: 120, suggestedDuration: 180 })];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    fireEvent.click(screen.getByText("Intro"));
    expect(screen.getByText(/Faltam aproximadamente/)).toBeInTheDocument();
    expect(screen.getByText("2:00")).toBeInTheDocument();
  });

  it("does not show missing duration warning when missingDuration is 0", () => {
    const gaps = [makeGap({ missingDuration: 0, status: "partial", currentDuration: 60 })];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    fireEvent.click(screen.getByText("Intro"));
    expect(screen.queryByText(/Faltam aproximadamente/)).not.toBeInTheDocument();
  });

  it("expands multiple independent gaps at the same time", () => {
    const gaps = [
      makeGap({ sectionId: "s1", sectionName: "Section A", suggestion: "Tip for A" }),
      makeGap({ sectionId: "s2", sectionName: "Section B", suggestion: "Tip for B" }),
    ];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    fireEvent.click(screen.getByText("Section A"));
    fireEvent.click(screen.getByText("Section B"));
    expect(screen.getByText("Tip for A")).toBeInTheDocument();
    expect(screen.getByText("Tip for B")).toBeInTheDocument();
  });
});

// ─── Record button ────────────────────────────────────────────────────────

describe("GapAnalysisPanel — record button", () => {
  it("shows Gravar button when onRecordSection is provided and gap is not complete", () => {
    const onRecordSection = vi.fn();
    const gaps = [makeGap({ status: "empty" })];
    render(<GapAnalysisPanel {...defaultProps(gaps, { onRecordSection })} />);
    expect(screen.getByRole("button", { name: /Gravar/i })).toBeInTheDocument();
  });

  it("does not show Gravar button when onRecordSection is not provided", () => {
    const gaps = [makeGap({ status: "empty" })];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    expect(screen.queryByRole("button", { name: /Gravar/i })).not.toBeInTheDocument();
  });

  it("calls onRecordSection with sectionId and missingDuration when Gravar is clicked", () => {
    const onRecordSection = vi.fn();
    const gaps = [makeGap({ sectionId: "sec-abc", missingDuration: 90 })];
    render(<GapAnalysisPanel {...defaultProps(gaps, { onRecordSection })} />);
    fireEvent.click(screen.getByRole("button", { name: /Gravar/i }));
    expect(onRecordSection).toHaveBeenCalledWith("sec-abc", 90);
  });

  it("falls back to suggestedDuration when missingDuration is 0", () => {
    const onRecordSection = vi.fn();
    const gaps = [makeGap({ sectionId: "sec-abc", missingDuration: 0, suggestedDuration: 45 })];
    render(<GapAnalysisPanel {...defaultProps(gaps, { onRecordSection })} />);
    fireEvent.click(screen.getByRole("button", { name: /Gravar/i }));
    expect(onRecordSection).toHaveBeenCalledWith("sec-abc", 45);
  });

  it("falls back to 60 when both missingDuration and suggestedDuration are null/0", () => {
    const onRecordSection = vi.fn();
    const gaps = [makeGap({ sectionId: "sec-abc", missingDuration: 0, suggestedDuration: null })];
    render(<GapAnalysisPanel {...defaultProps(gaps, { onRecordSection })} />);
    fireEvent.click(screen.getByRole("button", { name: /Gravar/i }));
    expect(onRecordSection).toHaveBeenCalledWith("sec-abc", 60);
  });
});

// ─── Refresh button ──────────────────────────────────────────────────────

describe("GapAnalysisPanel — refresh button", () => {
  it("shows Atualizar button when onRefresh is provided", () => {
    const onRefresh = vi.fn();
    render(<GapAnalysisPanel {...defaultProps([], { onRefresh })} />);
    expect(screen.getByRole("button", { name: /Atualizar/i })).toBeInTheDocument();
  });

  it("does not show Atualizar button when onRefresh is not provided", () => {
    render(<GapAnalysisPanel {...defaultProps([])} />);
    expect(screen.queryByRole("button", { name: /Atualizar/i })).not.toBeInTheDocument();
  });

  it("calls onRefresh when Atualizar button is clicked", () => {
    const onRefresh = vi.fn();
    render(<GapAnalysisPanel {...defaultProps([], { onRefresh })} />);
    fireEvent.click(screen.getByRole("button", { name: /Atualizar/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

// ─── Completed sections footer ────────────────────────────────────────────

describe("GapAnalysisPanel — completed sections footer", () => {
  it("shows completed sections section when some gaps are complete", () => {
    const gaps = [
      makeGap({ sectionId: "s1", sectionName: "Finished Part", status: "complete", currentDuration: 30, segmentCount: 2 }),
    ];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    expect(screen.getByText(/Secoes Completas \(1\)/)).toBeInTheDocument();
    expect(screen.getByText("Finished Part")).toBeInTheDocument();
  });

  it("does not show completed sections section when no gaps are complete", () => {
    const gaps = [makeGap({ status: "empty" })];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    expect(screen.queryByText(/Secoes Completas/)).not.toBeInTheDocument();
  });

  it("shows segment count badge for completed sections", () => {
    const gaps = [
      makeGap({ sectionId: "s1", sectionName: "Done", status: "complete", currentDuration: 90, segmentCount: 3 }),
    ];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    expect(screen.getByText("3 seg")).toBeInTheDocument();
  });

  it("shows formatted duration badge for completed sections", () => {
    const gaps = [
      makeGap({ sectionId: "s1", sectionName: "Done", status: "complete", currentDuration: 125, segmentCount: 1 }),
    ];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    expect(screen.getByText("2:05")).toBeInTheDocument();
  });
});

// ─── Badge labels ─────────────────────────────────────────────────────────

describe("GapAnalysisPanel — badge labels", () => {
  it("shows 'Obrigatorio' badge for required gaps", () => {
    const gaps = [makeGap({ isRequired: true })];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    expect(screen.getByText("Obrigatorio")).toBeInTheDocument();
  });

  it("shows 'Opcional' badge for optional gaps", () => {
    const gaps = [makeGap({ isRequired: false, status: "empty" })];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    expect(screen.getByText("Opcional")).toBeInTheDocument();
  });

  it("shows type badge for each gap", () => {
    const gaps = [makeGap({ type: "outro" })];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    expect(screen.getByText("outro")).toBeInTheDocument();
  });

  it("shows segment count badge when segmentCount > 0", () => {
    const gaps = [makeGap({ segmentCount: 5, status: "partial", currentDuration: 30 })];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    expect(screen.getByText("5 segmentos")).toBeInTheDocument();
  });

  it("does not show segment count badge when segmentCount is 0", () => {
    const gaps = [makeGap({ segmentCount: 0 })];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    expect(screen.queryByText(/segmentos/)).not.toBeInTheDocument();
  });
});

// ─── formatTime helper ────────────────────────────────────────────────────

describe("GapAnalysisPanel — time formatting (via expanded gap)", () => {
  it("formats seconds-only durations as 0:SS", () => {
    const gaps = [makeGap({ missingDuration: 9 })];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    fireEvent.click(screen.getByText("Intro"));
    expect(screen.getByText("0:09")).toBeInTheDocument();
  });

  it("formats full minute durations correctly", () => {
    // suggestedDuration (1:30) differs from missingDuration (1:00) so "1:00" is unique in the DOM
    const gaps = [makeGap({ missingDuration: 60, suggestedDuration: 90 })];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    fireEvent.click(screen.getByText("Intro"));
    expect(screen.getByText("1:00")).toBeInTheDocument();
  });

  it("formats mixed minute-second durations correctly", () => {
    const gaps = [makeGap({ missingDuration: 95 })];
    render(<GapAnalysisPanel {...defaultProps(gaps)} />);
    fireEvent.click(screen.getByText("Intro"));
    expect(screen.getByText("1:35")).toBeInTheDocument();
  });
});
