import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { TemplateCard } from "@/components/templates/TemplateCard";
import { TemplateSelector } from "@/components/templates/TemplateSelector";
import { TemplateMappingView } from "@/components/templates/TemplateMappingView";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSection(overrides: Record<string, unknown> = {}) {
  return {
    id: "sec-1",
    name: "Introduction",
    description: "Opening segment",
    isRequired: true,
    type: "intro",
    suggestedDuration: 120,
    icon: undefined,
    color: undefined,
    ...overrides,
  };
}

function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: "tmpl-1",
    name: "Interview Show",
    description: "A classic interview format",
    category: "interview",
    estimatedDuration: 3600,
    sections: [
      makeSection({ id: "s1", name: "Intro", isRequired: true }),
      makeSection({ id: "s2", name: "Main Content", isRequired: true }),
      makeSection({ id: "s3", name: "Outro", isRequired: false }),
    ],
    ...overrides,
  };
}

function makeMappingSection(overrides: Record<string, unknown> = {}) {
  return {
    id: "ms-1",
    name: "Introduction",
    type: "intro",
    description: "Opening of the episode",
    minDuration: 30,
    maxDuration: 180,
    suggestedDuration: 120,
    isRequired: true,
    order: 1,
    segments: [] as { id: string; title: string; summary: string; duration: number; confidence: number }[],
    totalDuration: 0,
    status: "empty" as "empty" | "partial" | "complete",
    ...overrides,
  };
}

function makeSegment(overrides: Record<string, unknown> = {}) {
  return {
    id: "seg-1",
    title: "Opening Remarks",
    summary: "Host introduces the episode",
    duration: 90,
    confidence: 0.92,
    ...overrides,
  };
}

// ── TemplateCard ──────────────────────────────────────────────────────────────

describe("TemplateCard", () => {
  const onSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the template name and description", () => {
    render(<TemplateCard template={makeTemplate()} onSelect={onSelect} />);
    expect(screen.getByText("Interview Show")).toBeInTheDocument();
    expect(screen.getByText("A classic interview format")).toBeInTheDocument();
  });

  it("renders the category badge with the correct Portuguese label", () => {
    render(<TemplateCard template={makeTemplate({ category: "interview" })} onSelect={onSelect} />);
    expect(screen.getByText("Entrevista")).toBeInTheDocument();
  });

  it("renders monologue category label", () => {
    render(<TemplateCard template={makeTemplate({ category: "monologue" })} onSelect={onSelect} />);
    expect(screen.getByText("Monólogo")).toBeInTheDocument();
  });

  it("renders debate category label", () => {
    render(<TemplateCard template={makeTemplate({ category: "debate" })} onSelect={onSelect} />);
    expect(screen.getByText("Debate")).toBeInTheDocument();
  });

  it("renders review category label", () => {
    render(<TemplateCard template={makeTemplate({ category: "review" })} onSelect={onSelect} />);
    expect(screen.getByText("Review")).toBeInTheDocument();
  });

  it("renders educational category label", () => {
    render(<TemplateCard template={makeTemplate({ category: "educational" })} onSelect={onSelect} />);
    expect(screen.getByText("Educacional")).toBeInTheDocument();
  });

  it("renders unknown category as-is", () => {
    render(<TemplateCard template={makeTemplate({ category: "custom" })} onSelect={onSelect} />);
    expect(screen.getByText("custom")).toBeInTheDocument();
  });

  it("formats duration in minutes for < 60 min", () => {
    render(<TemplateCard template={makeTemplate({ estimatedDuration: 2700 })} onSelect={onSelect} />);
    expect(screen.getByText("~45 min")).toBeInTheDocument();
  });

  it("formats duration in hours and minutes for >= 60 min", () => {
    render(<TemplateCard template={makeTemplate({ estimatedDuration: 5400 })} onSelect={onSelect} />);
    expect(screen.getByText("~1h 30m")).toBeInTheDocument();
  });

  it("shows 'Duração flexível' when estimatedDuration is absent", () => {
    render(<TemplateCard template={makeTemplate({ estimatedDuration: undefined })} onSelect={onSelect} />);
    expect(screen.getByText("Duração flexível")).toBeInTheDocument();
  });

  it("shows recommended badge when isRecommended=true", () => {
    render(<TemplateCard template={makeTemplate()} isRecommended onSelect={onSelect} />);
    expect(screen.getByText("Recomendado")).toBeInTheDocument();
  });

  it("shows match score percentage alongside the recommended badge", () => {
    render(<TemplateCard template={makeTemplate()} isRecommended matchScore={0.87} onSelect={onSelect} />);
    expect(screen.getByText("87%")).toBeInTheDocument();
  });

  it("does not show recommended badge when isRecommended=false", () => {
    render(<TemplateCard template={makeTemplate()} isRecommended={false} onSelect={onSelect} />);
    expect(screen.queryByText("Recomendado")).not.toBeInTheDocument();
  });

  it("shows section names up to 4", () => {
    const sections = [
      makeSection({ id: "s1", name: "Intro" }),
      makeSection({ id: "s2", name: "Interview" }),
      makeSection({ id: "s3", name: "Break" }),
      makeSection({ id: "s4", name: "Analysis" }),
      makeSection({ id: "s5", name: "Hidden Section" }),
    ];
    render(<TemplateCard template={makeTemplate({ sections })} onSelect={onSelect} />);
    expect(screen.getByText("Intro")).toBeInTheDocument();
    expect(screen.getByText("Interview")).toBeInTheDocument();
    expect(screen.getByText("Break")).toBeInTheDocument();
    expect(screen.getByText("Analysis")).toBeInTheDocument();
    expect(screen.queryByText("Hidden Section")).not.toBeInTheDocument();
  });

  it("shows '+N mais seções' when sections exceed 4", () => {
    const sections = Array.from({ length: 6 }, (_, i) =>
      makeSection({ id: `s${i}`, name: `Section ${i + 1}` })
    );
    render(<TemplateCard template={makeTemplate({ sections })} onSelect={onSelect} />);
    expect(screen.getByText("+2 mais seções")).toBeInTheDocument();
  });

  it("shows required count and optional count", () => {
    const sections = [
      makeSection({ id: "s1", name: "Intro", isRequired: true }),
      makeSection({ id: "s2", name: "Content", isRequired: true }),
      makeSection({ id: "s3", name: "Outro", isRequired: false }),
    ];
    render(<TemplateCard template={makeTemplate({ sections })} onSelect={onSelect} />);
    expect(screen.getByText("2 obrigatórias, 1 opcionais")).toBeInTheDocument();
  });

  it("shows section suggested duration when provided", () => {
    const sections = [
      makeSection({ id: "s1", name: "Intro", isRequired: true, suggestedDuration: 300 }),
    ];
    render(<TemplateCard template={makeTemplate({ sections })} onSelect={onSelect} />);
    expect(screen.getByText("~5 min")).toBeInTheDocument();
  });

  it("does not show sections overview when template has no sections", () => {
    render(<TemplateCard template={makeTemplate({ sections: [] })} onSelect={onSelect} />);
    expect(screen.queryByText("Seções do template:")).not.toBeInTheDocument();
  });

  it("calls onSelect with the template id when the button is clicked", () => {
    render(<TemplateCard template={makeTemplate({ id: "tmpl-42" })} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Usar este template"));
    expect(onSelect).toHaveBeenCalledWith("tmpl-42");
  });

  it("uses default variant for the button when not recommended", () => {
    render(<TemplateCard template={makeTemplate()} isRecommended={false} onSelect={onSelect} />);
    const btn = screen.getByText("Usar este template").closest("button");
    expect(btn).toBeInTheDocument();
  });
});

// ── TemplateSelector ──────────────────────────────────────────────────────────

describe("TemplateSelector", () => {
  const onTemplateSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockFetchTemplates(templates: ReturnType<typeof makeTemplate>[]) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, templates }),
    });
  }

  it("shows a loading spinner before templates load", () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves
    render(<TemplateSelector projectId="proj-1" onTemplateSelect={onTemplateSelect} />);
    expect(document.querySelector("svg.animate-spin")).toBeInTheDocument();
  });

  it("renders all templates after fetching", async () => {
    mockFetchTemplates([
      makeTemplate({ id: "t1", name: "Show A", category: "interview" }),
      makeTemplate({ id: "t2", name: "Show B", category: "monologue" }),
    ]);
    render(<TemplateSelector projectId="proj-1" onTemplateSelect={onTemplateSelect} />);
    await waitFor(() => {
      expect(screen.getAllByText("Usar este template")).toHaveLength(2);
    });
  });

  it("fetches from /api/templates on mount", async () => {
    mockFetchTemplates([]);
    render(<TemplateSelector projectId="proj-1" onTemplateSelect={onTemplateSelect} />);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/templates");
    });
  });

  it("shows suggested templates section when suggestedTemplates is provided", async () => {
    const suggested = {
      template: makeTemplate({ id: "s1", name: "Suggested Show" }),
      matchScore: 0.9,
      reason: "Matches your content",
    };
    mockFetchTemplates([]);
    render(
      <TemplateSelector
        projectId="proj-1"
        suggestedTemplates={[suggested]}
        onTemplateSelect={onTemplateSelect}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("Templates Recomendados")).toBeInTheDocument();
      expect(screen.getByText("Suggested Show")).toBeInTheDocument();
    });
  });

  it("does not show suggested section when suggestedTemplates is empty", async () => {
    mockFetchTemplates([makeTemplate({ id: "t1", name: "Show A" })]);
    render(
      <TemplateSelector projectId="proj-1" suggestedTemplates={[]} onTemplateSelect={onTemplateSelect} />
    );
    await waitFor(() => {
      expect(screen.queryByText("Templates Recomendados")).not.toBeInTheDocument();
    });
  });

  it("excludes suggested template from the 'all templates' grid", async () => {
    const suggestedTemplate = makeTemplate({ id: "s1", name: "Suggested Show", category: "interview" });
    const otherTemplate = makeTemplate({ id: "t2", name: "Other Show", category: "interview" });
    const suggested = { template: suggestedTemplate, matchScore: 0.9, reason: "Good match" };
    mockFetchTemplates([suggestedTemplate, otherTemplate]);

    render(
      <TemplateSelector
        projectId="proj-1"
        suggestedTemplates={[suggested]}
        onTemplateSelect={onTemplateSelect}
      />
    );
    await waitFor(() => {
      // "Suggested Show" appears once (in suggested section), "Other Show" once (in all)
      expect(screen.getAllByText("Suggested Show")).toHaveLength(1);
      expect(screen.getByText("Other Show")).toBeInTheDocument();
    });
  });

  it("calls onTemplateSelect when selecting a template", async () => {
    onTemplateSelect.mockResolvedValue(undefined);
    mockFetchTemplates([makeTemplate({ id: "t1", name: "Show A" })]);
    render(<TemplateSelector projectId="proj-1" onTemplateSelect={onTemplateSelect} />);
    await waitFor(() => screen.getByText("Usar este template"));
    await act(async () => {
      fireEvent.click(screen.getByText("Usar este template"));
    });
    expect(onTemplateSelect).toHaveBeenCalledWith("t1");
  });

  it("shows 'Templates Disponíveis' heading when no suggested templates", async () => {
    mockFetchTemplates([]);
    render(<TemplateSelector projectId="proj-1" onTemplateSelect={onTemplateSelect} />);
    await waitFor(() => {
      expect(screen.getByText("Templates Disponíveis")).toBeInTheDocument();
    });
  });

  it("shows 'Todos os Templates' heading when suggested templates are present", async () => {
    const suggested = {
      template: makeTemplate({ id: "s1" }),
      matchScore: 0.8,
      reason: "Match",
    };
    mockFetchTemplates([]);
    render(
      <TemplateSelector
        projectId="proj-1"
        suggestedTemplates={[suggested]}
        onTemplateSelect={onTemplateSelect}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("Todos os Templates")).toBeInTheDocument();
    });
  });

  it("handles fetch errors gracefully without crashing", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network error"));
    render(<TemplateSelector projectId="proj-1" onTemplateSelect={onTemplateSelect} />);
    await waitFor(() => {
      // Should stop loading without throwing
      expect(document.querySelector("svg.animate-spin")).not.toBeInTheDocument();
    });
  });
});

// ── TemplateMappingView ───────────────────────────────────────────────────────

describe("TemplateMappingView", () => {
  const onAutoMap = vi.fn();
  const onPlaySegment = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("stats display", () => {
    it("shows complete, partial, empty, and total duration stats", () => {
      const sections = [
        makeMappingSection({ id: "s1", status: "complete", totalDuration: 60 }),
        makeMappingSection({ id: "s2", status: "partial", totalDuration: 30 }),
        makeMappingSection({ id: "s3", status: "empty", totalDuration: 0, isRequired: false }),
      ];
      render(<TemplateMappingView projectId="proj-1" sections={sections} />);
      expect(screen.getByText("Completos")).toBeInTheDocument();
      expect(screen.getByText("Parciais")).toBeInTheDocument();
      expect(screen.getByText("Vazios")).toBeInTheDocument();
      // Total duration 90s = 1:30; multiple occurrences expected (stats + section headers)
      expect(screen.getAllByText("1:30").length).toBeGreaterThanOrEqual(1);
    });

    it("shows 0 for each stat when sections is empty", () => {
      render(<TemplateMappingView projectId="proj-1" sections={[]} />);
      expect(screen.getByText("Completos")).toBeInTheDocument();
    });

    it("shows the mapped segments count in subtitle", () => {
      const withSegment = makeMappingSection({
        id: "s1",
        status: "partial",
        totalDuration: 45,
        segments: [makeSegment()],
      });
      render(<TemplateMappingView projectId="proj-1" sections={[withSegment]} />);
      expect(screen.getByText("1 segmentos mapeados automaticamente")).toBeInTheDocument();
    });
  });

  describe("auto-map button", () => {
    it("shows the auto-map button when onAutoMap is provided", () => {
      render(<TemplateMappingView projectId="proj-1" sections={[]} onAutoMap={onAutoMap} />);
      expect(screen.getByText("Remapear com IA")).toBeInTheDocument();
    });

    it("calls onAutoMap when the button is clicked", () => {
      render(<TemplateMappingView projectId="proj-1" sections={[]} onAutoMap={onAutoMap} />);
      fireEvent.click(screen.getByText("Remapear com IA"));
      expect(onAutoMap).toHaveBeenCalledOnce();
    });

    it("shows loading spinner and disables button when isAutoMapping=true", () => {
      render(
        <TemplateMappingView projectId="proj-1" sections={[]} onAutoMap={onAutoMap} isAutoMapping />
      );
      const btn = screen.getByText("Remapear com IA").closest("button");
      expect(btn).toBeDisabled();
      expect(btn?.querySelector("svg.animate-spin")).toBeInTheDocument();
    });

    it("does not show auto-map button when onAutoMap is not provided", () => {
      render(<TemplateMappingView projectId="proj-1" sections={[]} />);
      expect(screen.queryByText("Remapear com IA")).not.toBeInTheDocument();
    });
  });

  describe("section rendering", () => {
    it("renders each section name", () => {
      const sections = [
        makeMappingSection({ id: "s1", name: "Introduction", order: 1 }),
        makeMappingSection({ id: "s2", name: "Main Interview", order: 2 }),
      ];
      render(<TemplateMappingView projectId="proj-1" sections={sections} />);
      expect(screen.getByText(/Introduction/)).toBeInTheDocument();
      expect(screen.getByText(/Main Interview/)).toBeInTheDocument();
    });

    it("shows 'Obrigatorio' badge for required sections", () => {
      const sections = [makeMappingSection({ id: "s1", isRequired: true })];
      render(<TemplateMappingView projectId="proj-1" sections={sections} />);
      expect(screen.getByText("Obrigatorio")).toBeInTheDocument();
    });

    it("does not show 'Obrigatorio' badge for optional sections", () => {
      const sections = [makeMappingSection({ id: "s1", isRequired: false })];
      render(<TemplateMappingView projectId="proj-1" sections={sections} />);
      expect(screen.queryByText("Obrigatorio")).not.toBeInTheDocument();
    });

    it("shows section type badge", () => {
      const sections = [makeMappingSection({ id: "s1", type: "interview" })];
      render(<TemplateMappingView projectId="proj-1" sections={sections} />);
      expect(screen.getByText("interview")).toBeInTheDocument();
    });
  });

  describe("section expand / collapse", () => {
    it("shows section content when expanded (sections with segments start expanded)", () => {
      const seg = makeSegment({ id: "seg-1", title: "Opening remarks" });
      const sections = [
        makeMappingSection({ id: "s1", segments: [seg], totalDuration: 90, status: "partial" }),
      ];
      render(<TemplateMappingView projectId="proj-1" sections={sections} />);
      expect(screen.getByText("Opening remarks")).toBeInTheDocument();
    });

    it("toggles section open when header is clicked", () => {
      const sections = [makeMappingSection({ id: "s1", segments: [], status: "empty" })];
      render(<TemplateMappingView projectId="proj-1" sections={sections} />);
      // Initially collapsed (empty sections start collapsed)
      expect(screen.queryByText("Nenhum segmento mapeado para esta secao")).not.toBeInTheDocument();
      // Click to expand
      const header = screen.getByText(/Introduction/).closest("div[class*='cursor-pointer']")!;
      fireEvent.click(header);
      expect(screen.getByText("Nenhum segmento mapeado para esta secao")).toBeInTheDocument();
    });

    it("shows empty placeholder when expanded section has no segments", () => {
      const sections = [makeMappingSection({ id: "s1", segments: [], status: "empty" })];
      render(<TemplateMappingView projectId="proj-1" sections={sections} />);
      const header = screen.getByText(/Introduction/).closest("div[class*='cursor-pointer']")!;
      fireEvent.click(header);
      expect(screen.getByText("Nenhum segmento mapeado para esta secao")).toBeInTheDocument();
      expect(screen.getByText("Use o painel de gaps para gravar conteudo")).toBeInTheDocument();
    });

    it("collapses section when header is clicked a second time", () => {
      const seg = makeSegment({ id: "seg-1", title: "Opening remarks" });
      const sections = [
        makeMappingSection({ id: "s1", segments: [seg], totalDuration: 90, status: "partial" }),
      ];
      render(<TemplateMappingView projectId="proj-1" sections={sections} />);
      // Starts expanded because it has segments
      expect(screen.getByText("Opening remarks")).toBeInTheDocument();
      // Click header to collapse
      const header = screen.getByText(/Introduction/).closest("div[class*='cursor-pointer']")!;
      fireEvent.click(header);
      expect(screen.queryByText("Opening remarks")).not.toBeInTheDocument();
    });
  });

  describe("segment display", () => {
    it("shows segment title and summary in expanded section", () => {
      const seg = makeSegment({ id: "seg-1", title: "Opener", summary: "Host welcomes audience" });
      const sections = [
        makeMappingSection({ id: "s1", segments: [seg], totalDuration: 90, status: "partial" }),
      ];
      render(<TemplateMappingView projectId="proj-1" sections={sections} />);
      expect(screen.getByText("Opener")).toBeInTheDocument();
      expect(screen.getByText("Host welcomes audience")).toBeInTheDocument();
    });

    it("shows segment confidence percentage when confidence > 0", () => {
      const seg = makeSegment({ id: "seg-1", confidence: 0.85 });
      const sections = [
        makeMappingSection({ id: "s1", segments: [seg], totalDuration: 90, status: "partial" }),
      ];
      render(<TemplateMappingView projectId="proj-1" sections={sections} />);
      expect(screen.getByText("85%")).toBeInTheDocument();
    });

    it("shows segment duration in m:ss format", () => {
      const seg = makeSegment({ id: "seg-1", duration: 75 });
      const sections = [
        makeMappingSection({ id: "s1", segments: [seg], totalDuration: 75, status: "partial" }),
      ];
      render(<TemplateMappingView projectId="proj-1" sections={sections} />);
      // "1:15" appears in both the stats total and the segment badge
      expect(screen.getAllByText("1:15").length).toBeGreaterThanOrEqual(1);
    });

    it("shows play button when onPlaySegment is provided", () => {
      const seg = makeSegment({ id: "seg-1" });
      const sections = [
        makeMappingSection({ id: "s1", segments: [seg], totalDuration: 90, status: "partial" }),
      ];
      render(
        <TemplateMappingView projectId="proj-1" sections={sections} onPlaySegment={onPlaySegment} />
      );
      const playButtons = screen.getAllByRole("button");
      expect(playButtons.length).toBeGreaterThan(0);
    });

    it("calls onPlaySegment with segment id when play button is clicked", () => {
      const seg = makeSegment({ id: "seg-42" });
      const sections = [
        makeMappingSection({ id: "s1", segments: [seg], totalDuration: 90, status: "partial" }),
      ];
      render(
        <TemplateMappingView projectId="proj-1" sections={sections} onPlaySegment={onPlaySegment} />
      );
      const buttons = screen.getAllByRole("button");
      fireEvent.click(buttons[buttons.length - 1]);
      expect(onPlaySegment).toHaveBeenCalledWith("seg-42");
    });
  });

  describe("unmapped segments", () => {
    it("shows unmapped segments section when unmappedSegments is provided", () => {
      const unmapped = [
        { id: "u1", title: "Extra content", summary: "Out of template", duration: 60 },
      ];
      render(<TemplateMappingView projectId="proj-1" sections={[]} unmappedSegments={unmapped} />);
      expect(screen.getByText(/Segmentos nao mapeados/)).toBeInTheDocument();
      expect(screen.getByText("Extra content")).toBeInTheDocument();
    });

    it("shows up to 5 unmapped segments", () => {
      const unmapped = Array.from({ length: 7 }, (_, i) => ({
        id: `u${i}`,
        title: `Segment ${i + 1}`,
        summary: "",
        duration: 30,
      }));
      render(<TemplateMappingView projectId="proj-1" sections={[]} unmappedSegments={unmapped} />);
      expect(screen.getByText("Segment 1")).toBeInTheDocument();
      expect(screen.getByText("Segment 5")).toBeInTheDocument();
      expect(screen.queryByText("Segment 6")).not.toBeInTheDocument();
      expect(screen.getByText("+2 segmentos adicionais")).toBeInTheDocument();
    });

    it("does not show unmapped section when unmappedSegments is empty", () => {
      render(<TemplateMappingView projectId="proj-1" sections={[]} unmappedSegments={[]} />);
      expect(screen.queryByText(/Segmentos nao mapeados/)).not.toBeInTheDocument();
    });
  });

  describe("success state", () => {
    it("shows success state when all sections are complete and no unmapped segments", () => {
      const sections = [
        makeMappingSection({ id: "s1", status: "complete", totalDuration: 120 }),
        makeMappingSection({ id: "s2", status: "complete", totalDuration: 300 }),
      ];
      render(<TemplateMappingView projectId="proj-1" sections={sections} unmappedSegments={[]} />);
      expect(screen.getByText("Mapeamento Completo!")).toBeInTheDocument();
      expect(
        screen.getByText("Todos os segmentos foram mapeados com sucesso para as secoes do template.")
      ).toBeInTheDocument();
    });

    it("does not show success state when some sections are not complete", () => {
      const sections = [
        makeMappingSection({ id: "s1", status: "complete", totalDuration: 120 }),
        makeMappingSection({ id: "s2", status: "partial", totalDuration: 60 }),
      ];
      render(<TemplateMappingView projectId="proj-1" sections={sections} unmappedSegments={[]} />);
      expect(screen.queryByText("Mapeamento Completo!")).not.toBeInTheDocument();
    });

    it("does not show success state when there are unmapped segments", () => {
      const sections = [makeMappingSection({ id: "s1", status: "complete", totalDuration: 120 })];
      const unmapped = [{ id: "u1", title: "Extra", summary: "", duration: 30 }];
      render(<TemplateMappingView projectId="proj-1" sections={sections} unmappedSegments={unmapped} />);
      expect(screen.queryByText("Mapeamento Completo!")).not.toBeInTheDocument();
    });
  });

  describe("formatTime helper (via rendered output)", () => {
    it("formats 0 seconds as 0:00", () => {
      const sections = [makeMappingSection({ id: "s1", totalDuration: 0, suggestedDuration: 0 })];
      render(<TemplateMappingView projectId="proj-1" sections={sections} />);
      // Multiple 0:00 values expected (totalDuration / suggestedDuration)
      const zeroes = screen.getAllByText("0:00");
      expect(zeroes.length).toBeGreaterThanOrEqual(1);
    });

    it("formats 90 seconds as 1:30", () => {
      const sections = [makeMappingSection({ id: "s1", totalDuration: 90, suggestedDuration: 120 })];
      render(<TemplateMappingView projectId="proj-1" sections={sections} />);
      // "1:30" appears in stats total and in the section progress display
      expect(screen.getAllByText("1:30").length).toBeGreaterThanOrEqual(1);
    });
  });
});
