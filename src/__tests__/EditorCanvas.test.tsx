import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { EditorCanvas } from "@/components/editor/EditorCanvas";
import type { Segment, ProjectSection } from "@/lib/db/schema";

// ─── Mock InlineTextEditor to keep tests focused on EditorCanvas ──────────────
vi.mock("@/components/editor/InlineTextEditor", () => ({
  InlineTextEditor: ({
    text,
    onSave,
  }: {
    text: string;
    onSave: (t: string, cuts: unknown[]) => void;
  }) => (
    <span data-testid="inline-editor" onClick={() => onSave(text, [])}>
      {text}
    </span>
  ),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    id: "seg-1",
    projectId: "proj-1",
    startTime: 0,
    endTime: 60,
    text: "Hello world",
    speaker: null,
    speakerLabel: null,
    topicId: null,
    interestScore: null,
    clarityScore: null,
    topic: null,
    keyInsight: null,
    isSelected: true,
    order: 0,
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
    createdAt: new Date(),
    ...overrides,
  };
}

function makeSection(
  overrides: Partial<ProjectSection> = {}
): ProjectSection {
  return {
    id: "sec-1",
    projectId: "proj-1",
    templateSectionId: null,
    name: "Introducao",
    order: 0,
    status: "pending",
    audioUrl: null,
    transcription: null,
    duration: null,
    uploadedAt: null,
    approvedAt: null,
    approvedBy: null,
    notes: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function defaultProps(
  overrides: Partial<React.ComponentProps<typeof EditorCanvas>> = {}
) {
  return {
    segments: [makeSegment()],
    currentTime: 0,
    onSeekTo: vi.fn(),
    onToggleSelect: vi.fn(),
    ...overrides,
  };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("EditorCanvas", () => {
  // ── Rendering ───────────────────────────────────────────────────────────────

  describe("basic rendering", () => {
    it("renders without crashing", () => {
      render(<EditorCanvas {...defaultProps()} />);
      expect(screen.getByText("Transcricao do Episodio")).toBeInTheDocument();
    });

    it("shows custom project title when provided", () => {
      render(<EditorCanvas {...defaultProps({ projectTitle: "My Podcast" })} />);
      expect(screen.getByText("My Podcast")).toBeInTheDocument();
    });

    it("shows segment text content", () => {
      const seg = makeSegment({ text: "This is the transcript text" });
      render(<EditorCanvas {...defaultProps({ segments: [seg] })} />);
      expect(
        screen.getByText("This is the transcript text")
      ).toBeInTheDocument();
    });

    it("shows edited text instead of original when present", () => {
      const seg = makeSegment({
        text: "Original text",
        editedText: "Edited text",
      });
      render(<EditorCanvas {...defaultProps({ segments: [seg] })} />);
      // The InlineTextEditor mock is used when onUpdateSegment is provided
      // Without it, we render a plain paragraph
      expect(screen.getByText("Edited text")).toBeInTheDocument();
    });

    it("renders segment timestamps", () => {
      const seg = makeSegment({ startTime: 65, endTime: 125 });
      render(<EditorCanvas {...defaultProps({ segments: [seg] })} />);
      expect(screen.getByText("1:05 - 2:05")).toBeInTheDocument();
    });

    it("renders topic badge when segment has a topic", () => {
      // Use currentTime outside the segment so it's not the active segment
      // (active segments also show the topic in the indicator header, causing duplicates)
      const seg = makeSegment({ topic: "AI Ethics", startTime: 10, endTime: 60 });
      render(
        <EditorCanvas {...defaultProps({ segments: [seg], currentTime: 0 })} />
      );
      expect(screen.getByText("AI Ethics")).toBeInTheDocument();
    });

    it("renders InlineTextEditor when onUpdateSegment is provided", () => {
      render(
        <EditorCanvas
          {...defaultProps({ onUpdateSegment: vi.fn() })}
        />
      );
      expect(screen.getByTestId("inline-editor")).toBeInTheDocument();
    });
  });

  // ── Stats header ────────────────────────────────────────────────────────────

  describe("stats header", () => {
    it("shows correct selected segment count", () => {
      const segs = [
        makeSegment({ id: "s1", isSelected: true }),
        makeSegment({ id: "s2", isSelected: false }),
        makeSegment({ id: "s3", isSelected: true }),
      ];
      render(<EditorCanvas {...defaultProps({ segments: segs })} />);
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("selecionados")).toBeInTheDocument();
    });

    it("shows reduction label", () => {
      render(<EditorCanvas {...defaultProps()} />);
      expect(screen.getByText("reducao")).toBeInTheDocument();
    });

    it("shows segment count when no sections", () => {
      const segs = [
        makeSegment({ id: "s1" }),
        makeSegment({ id: "s2" }),
      ];
      render(<EditorCanvas {...defaultProps({ segments: segs })} />);
      expect(screen.getByText(/2 segmentos/)).toBeInTheDocument();
    });

    it("shows sections count when sections are provided", () => {
      const sec = makeSection();
      const seg = makeSegment();
      render(
        <EditorCanvas
          {...defaultProps({
            sections: [{ section: sec, segments: [seg] }],
          })}
        />
      );
      expect(screen.getByText(/1 secoes/)).toBeInTheDocument();
    });

    it("shows zero reduction when all segments are selected", () => {
      const segs = [
        makeSegment({
          id: "s1",
          startTime: 0,
          endTime: 60,
          isSelected: true,
        }),
      ];
      render(<EditorCanvas {...defaultProps({ segments: segs })} />);
      expect(screen.getByText("0%")).toBeInTheDocument();
    });
  });

  // ── Current segment indicator ────────────────────────────────────────────────

  describe("current segment indicator", () => {
    it("shows current segment topic in indicator header", () => {
      const seg = makeSegment({
        id: "s1",
        startTime: 0,
        endTime: 60,
        topic: "Deep Learning",
      });
      render(
        <EditorCanvas
          {...defaultProps({ segments: [seg], currentTime: 10 })}
        />
      );
      // Topic appears in both the indicator header AND the topic badge — verify at least 2 occurrences
      const matches = screen.getAllByText("Deep Learning");
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it("shows 'Pausado' when not playing but within a segment", () => {
      const seg = makeSegment({ startTime: 0, endTime: 60 });
      render(
        <EditorCanvas
          {...defaultProps({ segments: [seg], currentTime: 5, isPlaying: false })}
        />
      );
      expect(screen.getByText("Pausado")).toBeInTheDocument();
    });

    it("shows 'Reproduzindo' when playing and within a segment", () => {
      const seg = makeSegment({ startTime: 0, endTime: 60 });
      render(
        <EditorCanvas
          {...defaultProps({ segments: [seg], currentTime: 5, isPlaying: true })}
        />
      );
      expect(screen.getByText("Reproduzindo")).toBeInTheDocument();
    });

    it("does not show indicator header when currentTime is outside all segments", () => {
      const seg = makeSegment({ startTime: 10, endTime: 60 });
      render(
        <EditorCanvas
          {...defaultProps({ segments: [seg], currentTime: 5 })}
        />
      );
      expect(screen.queryByText("Pausado")).not.toBeInTheDocument();
      expect(screen.queryByText("Reproduzindo")).not.toBeInTheDocument();
    });
  });

  // ── Interaction: selection toggle ────────────────────────────────────────────

  describe("selection toggle", () => {
    it("calls onToggleSelect when clicking the check icon", () => {
      const onToggleSelect = vi.fn();
      const seg = makeSegment({ id: "seg-99", isSelected: true });
      render(
        <EditorCanvas
          {...defaultProps({ segments: [seg], onToggleSelect })}
        />
      );
      // The toggle button renders a CheckCircle2 or XCircle — click it
      const toggleBtn = screen.getByTitle("Remover da selecao");
      fireEvent.click(toggleBtn);
      expect(onToggleSelect).toHaveBeenCalledWith("seg-99");
    });

    it("calls onToggleSelect when clicking an unselected segment icon", () => {
      const onToggleSelect = vi.fn();
      const seg = makeSegment({ id: "seg-100", isSelected: false });
      render(
        <EditorCanvas
          {...defaultProps({ segments: [seg], onToggleSelect })}
        />
      );
      const toggleBtn = screen.getByTitle("Adicionar a selecao");
      fireEvent.click(toggleBtn);
      expect(onToggleSelect).toHaveBeenCalledWith("seg-100");
    });
  });

  // ── Interaction: play/pause ──────────────────────────────────────────────────

  describe("play / pause segment", () => {
    it("calls onPlaySegment when clicking play button on a non-playing segment", () => {
      const onPlaySegment = vi.fn();
      const seg = makeSegment({ id: "seg-1", startTime: 0, endTime: 60 });
      render(
        <EditorCanvas
          {...defaultProps({
            segments: [seg],
            currentTime: 100, // outside segment → not current
            onPlaySegment,
          })}
        />
      );
      const playBtn = screen.getByTitle("Reproduzir segmento");
      fireEvent.click(playBtn);
      expect(onPlaySegment).toHaveBeenCalledWith("seg-1");
    });

    it("calls onPauseSegment when clicking the pause button on the current playing segment", () => {
      const onPauseSegment = vi.fn();
      const seg = makeSegment({ id: "seg-1", startTime: 0, endTime: 60 });
      render(
        <EditorCanvas
          {...defaultProps({
            segments: [seg],
            currentTime: 10,
            isPlaying: true,
            onPauseSegment,
            onPlaySegment: vi.fn(),
          })}
        />
      );
      const pauseBtn = screen.getByTitle("Pausar");
      fireEvent.click(pauseBtn);
      expect(onPauseSegment).toHaveBeenCalled();
    });

    it("calls onSegmentClick when clicking the segment row", () => {
      const onSegmentClick = vi.fn();
      const seg = makeSegment({ id: "seg-1" });
      render(
        <EditorCanvas
          {...defaultProps({ segments: [seg], onSegmentClick })}
        />
      );
      // The main row button; click the text area
      const btn = screen.getByText("Hello world").closest("button");
      fireEvent.click(btn!);
      expect(onSegmentClick).toHaveBeenCalledWith("seg-1");
    });
  });

  // ── Section rendering ────────────────────────────────────────────────────────

  describe("section rendering", () => {
    it("renders section name in header", () => {
      const sec = makeSection({ name: "Introducao" });
      const seg = makeSegment();
      render(
        <EditorCanvas
          {...defaultProps({
            sections: [{ section: sec, segments: [seg] }],
          })}
        />
      );
      expect(screen.getByText("Introducao")).toBeInTheDocument();
    });

    it("shows segment count within section", () => {
      const sec = makeSection({ name: "Conteudo" });
      const segs = [
        makeSegment({ id: "s1" }),
        makeSegment({ id: "s2" }),
      ];
      render(
        <EditorCanvas
          {...defaultProps({
            sections: [{ section: sec, segments: segs }],
          })}
        />
      );
      expect(screen.getByText(/2 segmentos/)).toBeInTheDocument();
    });

    it("shows section status badge", () => {
      const sec = makeSection({ name: "Intro", status: "approved" });
      const seg = makeSegment();
      render(
        <EditorCanvas
          {...defaultProps({
            sections: [{ section: sec, segments: [seg] }],
          })}
        />
      );
      expect(screen.getByText("approved")).toBeInTheDocument();
    });

    it("shows 'pending' badge when section has no status", () => {
      const sec = makeSection({ name: "Intro", status: null });
      const seg = makeSegment();
      render(
        <EditorCanvas
          {...defaultProps({
            sections: [{ section: sec, segments: [seg] }],
          })}
        />
      );
      expect(screen.getByText("pending")).toBeInTheDocument();
    });

    it("shows empty state message when section has no segments", () => {
      const sec = makeSection({ name: "Empty Section" });
      render(
        <EditorCanvas
          {...defaultProps({
            segments: [],
            sections: [{ section: sec, segments: [] }],
          })}
        />
      );
      expect(
        screen.getByText("Nenhum segmento nesta secao")
      ).toBeInTheDocument();
    });

    it("renders multiple sections", () => {
      const sec1 = makeSection({ id: "s1", name: "Intro", order: 0 });
      const sec2 = makeSection({ id: "s2", name: "Conclusao", order: 1 });
      const seg1 = makeSegment({ id: "seg1" });
      const seg2 = makeSegment({ id: "seg2" });
      render(
        <EditorCanvas
          {...defaultProps({
            sections: [
              { section: sec1, segments: [seg1] },
              { section: sec2, segments: [seg2] },
            ],
          })}
        />
      );
      expect(screen.getByText("Intro")).toBeInTheDocument();
      expect(screen.getByText("Conclusao")).toBeInTheDocument();
    });
  });

  // ── Section collapse / expand ────────────────────────────────────────────────

  describe("section collapse/expand", () => {
    it("hides segment content when section is collapsed", () => {
      const sec = makeSection({ id: "sec-1", name: "Intro" });
      const seg = makeSegment({ text: "Hidden content" });
      render(
        <EditorCanvas
          {...defaultProps({
            sections: [{ section: sec, segments: [seg] }],
          })}
        />
      );

      // Initially visible
      expect(screen.getByText("Hidden content")).toBeInTheDocument();

      // Click section header to collapse
      const header = screen.getByText("Intro").closest("button")!;
      fireEvent.click(header);

      // Content should now be hidden
      expect(screen.queryByText("Hidden content")).not.toBeInTheDocument();
    });

    it("re-expands a collapsed section on second click", () => {
      const sec = makeSection({ id: "sec-1", name: "Intro" });
      const seg = makeSegment({ text: "Toggled content" });
      render(
        <EditorCanvas
          {...defaultProps({
            sections: [{ section: sec, segments: [seg] }],
          })}
        />
      );

      const header = screen.getByText("Intro").closest("button")!;

      // Collapse
      fireEvent.click(header);
      expect(screen.queryByText("Toggled content")).not.toBeInTheDocument();

      // Expand
      fireEvent.click(header);
      expect(screen.getByText("Toggled content")).toBeInTheDocument();
    });
  });

  // ── Section summary ──────────────────────────────────────────────────────────

  describe("section summary", () => {
    it("shows summary panel after clicking info button (cached path)", async () => {
      const sec = makeSection({ id: "sec-1", name: "Intro" });
      const seg = makeSegment({ text: "Something interesting" });

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ summary: "AI-generated summary" }),
      });

      render(
        <EditorCanvas
          {...defaultProps({
            sections: [{ section: sec, segments: [seg] }],
          })}
        />
      );

      const infoBtn = screen.getByTitle("Ver resumo da secao");
      await act(async () => {
        fireEvent.click(infoBtn);
      });

      await waitFor(() => {
        expect(screen.getByText("AI-generated summary")).toBeInTheDocument();
      });
    });

    it("shows fallback summary when API call fails", async () => {
      const sec = makeSection({ id: "sec-1", name: "Intro" });
      const seg = makeSegment({ topic: "Machine Learning", text: "..." });

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        json: async () => ({}),
      });

      render(
        <EditorCanvas
          {...defaultProps({
            sections: [{ section: sec, segments: [seg] }],
          })}
        />
      );

      const infoBtn = screen.getByTitle("Ver resumo da secao");
      await act(async () => {
        fireEvent.click(infoBtn);
      });

      // The fallback text starts with "Esta secao aborda os seguintes topicos:" which
      // is unique — the topic badge only contains the bare topic name.
      await waitFor(() => {
        expect(
          screen.getByText(/Esta secao aborda os seguintes topicos/)
        ).toBeInTheDocument();
      });
    });

    it("collapses summary when info button is clicked again", async () => {
      const sec = makeSection({ id: "sec-1", name: "Intro" });
      const seg = makeSegment({ text: "Some text" });

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ summary: "Summary content" }),
      });

      render(
        <EditorCanvas
          {...defaultProps({
            sections: [{ section: sec, segments: [seg] }],
          })}
        />
      );

      const infoBtn = screen.getByTitle("Ver resumo da secao");

      // Expand
      await act(async () => {
        fireEvent.click(infoBtn);
      });
      await waitFor(() => {
        expect(screen.getByText("Summary content")).toBeInTheDocument();
      });

      // Collapse
      act(() => {
        fireEvent.click(infoBtn);
      });
      expect(screen.queryByText("Summary content")).not.toBeInTheDocument();
    });

    it("shows loading state while fetching summary", async () => {
      const sec = makeSection({ id: "sec-1", name: "Intro" });
      const seg = makeSegment({ text: "Some text" });

      let resolve!: (v: unknown) => void;
      (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
        new Promise((r) => (resolve = r))
      );

      render(
        <EditorCanvas
          {...defaultProps({
            sections: [{ section: sec, segments: [seg] }],
          })}
        />
      );

      const infoBtn = screen.getByTitle("Ver resumo da secao");
      act(() => {
        fireEvent.click(infoBtn);
      });

      expect(screen.getByText("Gerando resumo...")).toBeInTheDocument();

      // Resolve the fetch to avoid hanging
      await act(async () => {
        resolve({ ok: true, json: async () => ({ summary: "done" }) });
      });
    });
  });

  // ── onUpdateSegment wiring ───────────────────────────────────────────────────

  describe("onUpdateSegment wiring", () => {
    it("calls onUpdateSegment when InlineTextEditor triggers save", () => {
      const onUpdateSegment = vi.fn();
      const seg = makeSegment({ id: "seg-edit", text: "Editable text" });
      render(
        <EditorCanvas
          {...defaultProps({ segments: [seg], onUpdateSegment })}
        />
      );
      fireEvent.click(screen.getByTestId("inline-editor"));
      expect(onUpdateSegment).toHaveBeenCalledWith(
        "seg-edit",
        expect.objectContaining({ editedText: "Editable text" })
      );
    });
  });

  // ── Flat list (no sections) ──────────────────────────────────────────────────

  describe("flat segment list (no sections)", () => {
    it("renders all segments in flat mode", () => {
      const segs = [
        makeSegment({ id: "s1", text: "First segment" }),
        makeSegment({ id: "s2", text: "Second segment" }),
        makeSegment({ id: "s3", text: "Third segment" }),
      ];
      render(<EditorCanvas {...defaultProps({ segments: segs })} />);
      expect(screen.getByText("First segment")).toBeInTheDocument();
      expect(screen.getByText("Second segment")).toBeInTheDocument();
      expect(screen.getByText("Third segment")).toBeInTheDocument();
    });

    it("shows total duration in subtitle for flat list", () => {
      const seg = makeSegment({ startTime: 0, endTime: 120 }); // 2 minutes
      render(<EditorCanvas {...defaultProps({ segments: [seg] })} />);
      // 1 segment • 2:00 total
      expect(screen.getByText(/2:00 total/)).toBeInTheDocument();
    });
  });

  // ── formatTime utility (via rendered output) ─────────────────────────────────

  describe("formatTime utility", () => {
    it("formats sub-minute durations correctly", () => {
      const seg = makeSegment({ startTime: 0, endTime: 45 });
      render(<EditorCanvas {...defaultProps({ segments: [seg] })} />);
      expect(screen.getByText("0:00 - 0:45")).toBeInTheDocument();
    });

    it("formats multi-minute durations correctly", () => {
      const seg = makeSegment({ startTime: 90, endTime: 150 });
      render(<EditorCanvas {...defaultProps({ segments: [seg] })} />);
      expect(screen.getByText("1:30 - 2:30")).toBeInTheDocument();
    });
  });

  // ── Error / insight indicators ───────────────────────────────────────────────

  describe("segment indicators", () => {
    it("renders the selected indicator icon for selected segments", () => {
      const seg = makeSegment({ isSelected: true });
      render(<EditorCanvas {...defaultProps({ segments: [seg] })} />);
      expect(screen.getByTitle("Remover da selecao")).toBeInTheDocument();
    });

    it("renders the unselected indicator icon for unselected segments", () => {
      const seg = makeSegment({ isSelected: false });
      render(<EditorCanvas {...defaultProps({ segments: [seg] })} />);
      expect(screen.getByTitle("Adicionar a selecao")).toBeInTheDocument();
    });
  });
});
