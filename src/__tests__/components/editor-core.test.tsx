import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import type { Segment } from "@/lib/db/schema";
import { mockFetch, jsonResponse, restoreFetch } from "../helpers/mock-fetch";

// ---------------------------------------------------------------------------
// framer-motion: the global setup mock does NOT export `Reorder` (used by
// Timeline). Re-mock here, adding Reorder.Group / Reorder.Item passthroughs so
// the Timeline component can render. We strip framer-only props to avoid React
// unknown-prop warnings.
// ---------------------------------------------------------------------------
vi.mock("framer-motion", () => {
  const strip = (props: Record<string, unknown>) => {
    const {
      initial,
      animate,
      transition,
      whileInView,
      viewport,
      whileHover,
      whileTap,
      exit,
      variants,
      layout,
      drag,
      dragListener,
      dragControls,
      onReorder,
      values,
      axis,
      ...rest
    } = props;
    return rest;
  };
  const make = (tag: string) =>
    function Mock({
      children,
      ...props
    }: { children?: React.ReactNode; [key: string]: unknown }) {
      return React.createElement(tag, strip(props), children);
    };
  const motion = new Proxy(
    {},
    {
      get: (_t, key: string) => make(key),
    }
  ) as Record<string, ReturnType<typeof make>>;

  const ReorderGroup = function ReorderGroup({
    children,
    ...props
  }: { children?: React.ReactNode; [key: string]: unknown }) {
    return React.createElement("ul", strip(props), children);
  };
  const ReorderItem = function ReorderItem({
    children,
    ...props
  }: { children?: React.ReactNode; [key: string]: unknown }) {
    return React.createElement("li", strip(props), children);
  };

  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Reorder: { Group: ReorderGroup, Item: ReorderItem },
  };
});

// sonner toast
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  }),
}));

import { ExportButton } from "@/components/editor/ExportButton";
import { AudioPlayer } from "@/components/editor/AudioPlayer";
import { CompactPlayer } from "@/components/editor/CompactPlayer";
import { AudioEnhancementPanel } from "@/components/editor/AudioEnhancementPanel";
import { FillerWordPanel } from "@/components/editor/FillerWordPanel";
import { RemovedSegments } from "@/components/editor/RemovedSegments";
import { SegmentCard } from "@/components/editor/SegmentCard";
import { SegmentSearch } from "@/components/editor/SegmentSearch";
import { ShowNotesPanel } from "@/components/editor/ShowNotesPanel";
import { Timeline } from "@/components/editor/Timeline";
import { HorizontalTimeline } from "@/components/editor/HorizontalTimeline";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    id: "seg-1",
    projectId: "proj-1",
    startTime: 0,
    endTime: 30,
    text: "This is a sample segment about machine learning and AI topics.",
    speaker: null,
    speakerLabel: null,
    topicId: null,
    interestScore: 9,
    clarityScore: 8,
    topic: "AI",
    keyInsight: "AI is transforming podcasts",
    isSelected: true,
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
    createdAt: new Date(),
    ...overrides,
  } as Segment;
}

afterEach(() => {
  vi.clearAllMocks();
  restoreFetch();
});

// ---------------------------------------------------------------------------
// ExportButton
// ---------------------------------------------------------------------------
describe("ExportButton", () => {
  it("renders the export label with segment count", () => {
    render(<ExportButton projectId="p1" selectedSegmentsCount={3} />);
    expect(screen.getByText(/Export Podcast/i)).toBeInTheDocument();
    expect(screen.getByText(/\(3 segments\)/)).toBeInTheDocument();
  });

  it("disables and shows hint when no segments selected", () => {
    render(<ExportButton projectId="p1" selectedSegmentsCount={0} />);
    expect(
      screen.getByText(/Select at least one segment to export/i)
    ).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /Export Podcast/i });
    expect(btn).toBeDisabled();
  });

  it("starts export and transitions to processing on click", async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse({ status: "processing" })
    );
    render(<ExportButton projectId="p1" selectedSegmentsCount={2} />);
    fireEvent.click(screen.getByRole("button", { name: /Export Podcast/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/export/p1",
        expect.objectContaining({ method: "POST" })
      );
    });
    await waitFor(() => {
      expect(screen.getByText(/Processing/i)).toBeInTheDocument();
    });
  });

  it("shows error state when start export fails", async () => {
    mockFetch(() => jsonResponse({}, { status: 500, ok: false }));
    render(<ExportButton projectId="p1" selectedSegmentsCount={2} />);
    fireEvent.click(screen.getByRole("button", { name: /Export Podcast/i }));

    await waitFor(() => {
      expect(screen.getByText(/Export Failed/i)).toBeInTheDocument();
    });
  });

  it("renders compact mode as an icon button", () => {
    render(
      <ExportButton projectId="p1" selectedSegmentsCount={4} compact />
    );
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("title", expect.stringContaining("4 segmentos"));
  });
});

// ---------------------------------------------------------------------------
// AudioPlayer
// ---------------------------------------------------------------------------
describe("AudioPlayer", () => {
  it("renders empty state when no audioUrl", () => {
    render(<AudioPlayer audioUrl={null} />);
    expect(screen.getByText(/No audio available/i)).toBeInTheDocument();
  });

  it("renders title and controls when audioUrl provided", () => {
    render(<AudioPlayer audioUrl="https://example.com/a.mp3" title="My Clip" />);
    expect(screen.getByText("My Clip")).toBeInTheDocument();
    // default speed control
    expect(screen.getByText("1x")).toBeInTheDocument();
  });

  it("cycles playback speed when speed button clicked", () => {
    render(<AudioPlayer audioUrl="https://example.com/a.mp3" />);
    const speedBtn = screen.getByText("1x");
    fireEvent.click(speedBtn);
    expect(screen.getByText("1.25x")).toBeInTheDocument();
  });

  it("toggles play state when play button clicked", () => {
    render(<AudioPlayer audioUrl="https://example.com/a.mp3" />);
    const playMock = window.HTMLMediaElement.prototype.play as ReturnType<
      typeof vi.fn
    >;
    const buttons = screen.getAllByRole("button");
    // the main play button has h-10 w-10 class; click each safely - find by no title
    const playBtn = buttons.find((b) => !b.getAttribute("title"));
    fireEvent.click(playBtn!);
    expect(playMock).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// CompactPlayer
// ---------------------------------------------------------------------------
describe("CompactPlayer", () => {
  const segments = [
    makeSegment({ id: "s1", startTime: 0, endTime: 10, isSelected: true }),
    makeSegment({ id: "s2", startTime: 10, endTime: 30, isSelected: true }),
    makeSegment({ id: "s3", startTime: 30, endTime: 60, isSelected: false }),
  ];

  it("renders stats with selected/total counts", () => {
    render(
      <CompactPlayer
        segments={segments}
        audioUrl="https://example.com/a.mp3"
        onToggleSelect={vi.fn()}
      />
    );
    expect(screen.getByText("2/3 seg")).toBeInTheDocument();
  });

  it("expands original timeline and toggles a segment", () => {
    const onToggle = vi.fn();
    const { container } = render(
      <CompactPlayer
        segments={segments}
        audioUrl="https://example.com/a.mp3"
        onToggleSelect={onToggle}
      />
    );
    // Expand toggle is the first button (in the stats row).
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    // After expand, original timeline label appears
    expect(
      screen.getByText(/Timeline Original/i)
    ).toBeInTheDocument();

    // Click on an original-timeline segment block to toggle selection
    const segmentBlocks = container.querySelectorAll("[title]");
    const block = Array.from(segmentBlocks).find((el) =>
      el.getAttribute("title")?.includes("Segmento") ||
      el.getAttribute("title")?.includes("AI")
    );
    if (block) {
      fireEvent.click(block);
      expect(onToggle).toHaveBeenCalled();
    }
  });
});

// ---------------------------------------------------------------------------
// AudioEnhancementPanel
// ---------------------------------------------------------------------------
describe("AudioEnhancementPanel", () => {
  it("renders header and default presets after load", async () => {
    mockFetch(() =>
      jsonResponse({ success: true, isEnhanced: false, presets: [] })
    );
    render(<AudioEnhancementPanel projectId="p1" />);
    expect(screen.getByText(/Melhoria de Audio/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Podcast Padrao")).toBeInTheDocument();
    });
    expect(screen.getByText("Voz Clara")).toBeInTheDocument();
  });

  it("generates preview and shows success toast", async () => {
    const fetchMock = mockFetch((_url, init) => {
      if (init?.method === "POST") {
        return jsonResponse({ success: true, previewUrl: "u" });
      }
      return jsonResponse({ success: true, isEnhanced: false, presets: [] });
    });
    render(<AudioEnhancementPanel projectId="p1" />);
    await waitFor(() =>
      expect(screen.getByText("Podcast Padrao")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /Preview/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/p1/enhance",
        expect.objectContaining({ method: "POST" })
      );
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Preview gerado!");
    });
  });

  it("selects a different preset on click", async () => {
    mockFetch(() =>
      jsonResponse({ success: true, isEnhanced: false, presets: [] })
    );
    render(<AudioEnhancementPanel projectId="p1" />);
    await waitFor(() =>
      expect(screen.getByText("Voz Clara")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByText("Voz Clara"));
    // still rendered (no throw) - selecting applies settings
    expect(screen.getByText("Voz Clara")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// FillerWordPanel
// ---------------------------------------------------------------------------
describe("FillerWordPanel", () => {
  it("renders empty state CTA when no fillers", async () => {
    mockFetch(() => jsonResponse({ success: true, fillers: [], stats: null }));
    render(<FillerWordPanel projectId="p1" />);
    expect(screen.getByText("Filler Words")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Detectar Filler Words/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Analisar Audio/i })).toBeInTheDocument();
  });

  it("renders fillers grouped with stats when present", async () => {
    mockFetch(() =>
      jsonResponse({
        success: true,
        fillers: [
          {
            id: "f1",
            word: "uhm",
            startTime: 5,
            endTime: 5.3,
            confidence: 0.9,
            isRemoved: false,
          },
          {
            id: "f2",
            word: "uhm",
            startTime: 12,
            endTime: 12.2,
            confidence: 0.7,
            isRemoved: false,
          },
        ],
        stats: { totalCount: 2, removedCount: 0, timeSaved: 0.5, byType: {} },
      })
    );
    render(<FillerWordPanel projectId="p1" />);
    await waitFor(() => {
      expect(screen.getByText('"uhm"')).toBeInTheDocument();
    });
    expect(screen.getByText("2x")).toBeInTheDocument();
    expect(screen.getByText("Remover Todos")).toBeInTheDocument();
  });

  it("calls detect endpoint when Detectar clicked", async () => {
    const fetchMock = mockFetch((_url, init) => {
      if (init?.method === "POST") {
        return jsonResponse({
          success: true,
          fillers: [],
          stats: { totalCount: 0, removedCount: 0, timeSaved: 0, byType: {} },
        });
      }
      return jsonResponse({ success: true, fillers: [], stats: null });
    });
    render(<FillerWordPanel projectId="p1" />);
    await waitFor(() =>
      expect(screen.getByText(/Detectar Filler Words/i)).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /^Detectar$/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/p1/fillers",
        expect.objectContaining({ method: "POST" })
      );
    });
  });
});

// ---------------------------------------------------------------------------
// RemovedSegments
// ---------------------------------------------------------------------------
describe("RemovedSegments", () => {
  it("returns null when no removed segments", () => {
    const { container } = render(
      <RemovedSegments
        segments={[makeSegment({ isSelected: true })]}
        onToggleSelect={vi.fn()}
        onPlaySegment={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders removed segments header and expands to show cards", () => {
    const removed = makeSegment({
      id: "r1",
      isSelected: false,
      startTime: 0,
      endTime: 60,
      text: "Removed segment text content here.",
    });
    render(
      <RemovedSegments
        segments={[removed, makeSegment({ id: "k1", isSelected: true })]}
        onToggleSelect={vi.fn()}
        onPlaySegment={vi.fn()}
      />
    );
    expect(screen.getByText(/Removed Segments/i)).toBeInTheDocument();
    expect(screen.getByText(/1 segment removed/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Removed Segments/i }));
    expect(
      screen.getByText(/add it back to the timeline/i)
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SegmentCard
// ---------------------------------------------------------------------------
describe("SegmentCard", () => {
  it("renders text and metadata badges", () => {
    render(
      <SegmentCard
        segment={makeSegment()}
        isSelected={true}
        onToggleSelect={vi.fn()}
        onPlay={vi.fn()}
      />
    );
    expect(screen.getByText(/sample segment about machine learning/i)).toBeInTheDocument();
    expect(screen.getByText(/Interest: 9\/10/)).toBeInTheDocument();
    expect(screen.getByText(/Clarity: 8\/10/)).toBeInTheDocument();
    expect(screen.getByText("AI")).toBeInTheDocument();
  });

  it("calls onToggleSelect when checkbox clicked", () => {
    const onToggle = vi.fn();
    render(
      <SegmentCard
        segment={makeSegment({ id: "x9" })}
        isSelected={false}
        onToggleSelect={onToggle}
        onPlay={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Select segment/i }));
    expect(onToggle).toHaveBeenCalledWith("x9");
  });

  it("calls onPlay when play button clicked", () => {
    const onPlay = vi.fn();
    const seg = makeSegment({ id: "play1" });
    render(
      <SegmentCard
        segment={seg}
        isSelected={true}
        onToggleSelect={vi.fn()}
        onPlay={onPlay}
      />
    );
    fireEvent.click(screen.getByTitle("Play segment"));
    expect(onPlay).toHaveBeenCalledWith(seg);
  });

  it("expands to reveal key insight", () => {
    render(
      <SegmentCard
        segment={makeSegment({ keyInsight: "Important takeaway" })}
        isSelected={true}
        onToggleSelect={vi.fn()}
        onPlay={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTitle("Show more"));
    expect(screen.getByText("Important takeaway")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SegmentSearch
// ---------------------------------------------------------------------------
describe("SegmentSearch", () => {
  it("renders the search input", () => {
    render(
      <SegmentSearch
        segments={[makeSegment()]}
        projectId="p1"
        onResultClick={vi.fn()}
        onHighlightSegments={vi.fn()}
      />
    );
    expect(
      screen.getByPlaceholderText(/Buscar nos segmentos/i)
    ).toBeInTheDocument();
  });

  it("debounced typing triggers search API and shows results", async () => {
    const onHighlight = vi.fn();
    const fetchMock = mockFetch(() =>
      jsonResponse({
        results: [
          {
            segmentId: "seg-1",
            text: "machine learning content",
            startTime: 0,
            endTime: 30,
            topic: "AI",
            score: 50,
          },
        ],
      })
    );
    render(
      <SegmentSearch
        segments={[makeSegment()]}
        projectId="p1"
        onResultClick={vi.fn()}
        onHighlightSegments={onHighlight}
      />
    );
    fireEvent.change(screen.getByPlaceholderText(/Buscar nos segmentos/i), {
      target: { value: "machine" },
    });
    await waitFor(
      () => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/projects/p1/search",
          expect.objectContaining({ method: "POST" })
        );
      },
      { timeout: 2000 }
    );
    await waitFor(() => {
      expect(screen.getByText(/1 resultado/i)).toBeInTheDocument();
    });
    // query "machine" is wrapped in a <mark>, so assert on the remaining text node
    expect(screen.getByText(/learning content/i)).toBeInTheDocument();
    expect(onHighlight).toHaveBeenCalledWith(["seg-1"]);
  });
});

// ---------------------------------------------------------------------------
// ShowNotesPanel
// ---------------------------------------------------------------------------
describe("ShowNotesPanel", () => {
  it("renders empty state with generate CTA when 404", async () => {
    mockFetch(() => jsonResponse({}, { status: 404, ok: false }));
    render(<ShowNotesPanel projectId="p1" />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Gerar Show Notes/i })
      ).toBeInTheDocument();
    });
  });

  it("renders existing show notes with summary", async () => {
    mockFetch(() =>
      jsonResponse({
        showNotes: {
          id: "sn1",
          summary: "Episode summary about AI editing.",
          chapters: [{ title: "Intro", timestamp: 0 }],
          keyPoints: ["Point one"],
          generatedAt: new Date().toISOString(),
        },
      })
    );
    render(<ShowNotesPanel projectId="p1" />);
    await waitFor(() => {
      expect(screen.getByText("Show Notes")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Episode summary about AI editing/i)
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------
describe("Timeline", () => {
  it("renders empty state when no selected segments", () => {
    render(
      <Timeline
        segments={[makeSegment({ isSelected: false })]}
        onReorder={vi.fn()}
        onToggleSelect={vi.fn()}
        onPlaySegment={vi.fn()}
      />
    );
    expect(screen.getByText(/No segments selected/i)).toBeInTheDocument();
  });

  it("renders selected segments with total duration and legend", () => {
    render(
      <Timeline
        segments={[
          makeSegment({ id: "a", isSelected: true, startTime: 0, endTime: 60, order: 1 }),
          makeSegment({ id: "b", isSelected: true, startTime: 60, endTime: 120, order: 2 }),
        ]}
        onReorder={vi.fn()}
        onToggleSelect={vi.fn()}
        onPlaySegment={vi.fn()}
      />
    );
    expect(screen.getByText(/Total Duration/i)).toBeInTheDocument();
    expect(screen.getByText("2:00")).toBeInTheDocument();
    expect(screen.getByText(/Score Legend/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// HorizontalTimeline
// ---------------------------------------------------------------------------
describe("HorizontalTimeline", () => {
  const segments = [
    makeSegment({ id: "h1", startTime: 0, endTime: 30, isSelected: true }),
    makeSegment({ id: "h2", startTime: 30, endTime: 90, isSelected: false }),
  ];

  it("mounts and renders reduction stats without throwing", () => {
    const { container } = render(
      <HorizontalTimeline
        segments={segments}
        audioUrl="https://example.com/a.mp3"
        onToggleSelect={vi.fn()}
      />
    );
    expect(container.querySelector("audio")).toBeInTheDocument();
    // reduction percentage shown somewhere
    expect(screen.getByText(/%/)).toBeInTheDocument();
  });
});
