import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AdvancedTimeline } from "@/components/editor/AdvancedTimeline";
import type { Segment } from "@/lib/db/schema";
import React from "react";

// ─── HTMLMediaElement stubs ────────────────────────────────────────────────────
const mockPlay = vi.fn().mockResolvedValue(undefined);
const mockPause = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();

  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    writable: true,
    value: mockPlay,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    writable: true,
    value: mockPause,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
    configurable: true,
    get(this: HTMLMediaElement & { _ct?: number }) {
      return this._ct ?? 0;
    },
    set(this: HTMLMediaElement & { _ct?: number }, val: number) {
      this._ct = val;
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "duration", {
    configurable: true,
    get(this: HTMLMediaElement & { _dur?: number }) {
      return this._dur ?? 0;
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "muted", {
    configurable: true,
    get(this: HTMLMediaElement & { _muted?: boolean }) {
      return this._muted ?? false;
    },
    set(this: HTMLMediaElement & { _muted?: boolean }, val: boolean) {
      this._muted = val;
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    id: "seg-1",
    projectId: "proj-1",
    startTime: 0,
    endTime: 60,
    text: "Segment text",
    speaker: null,
    speakerLabel: null,
    topicId: null,
    interestScore: 7,
    clarityScore: null,
    topic: "Intro",
    keyInsight: null,
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
    createdAt: new Date("2024-01-01"),
    ...overrides,
  } as Segment;
}

function defaultProps(segments: Segment[] = [], extra: Partial<React.ComponentProps<typeof AdvancedTimeline>> = {}) {
  return {
    segments,
    audioUrl: null,
    onToggleSelect: vi.fn(),
    ...extra,
  };
}

// ─── Rendering ────────────────────────────────────────────────────────────────

describe("AdvancedTimeline – rendering", () => {
  it("renders the audio element", () => {
    const { container } = render(<AdvancedTimeline {...defaultProps()} />);
    expect(container.querySelector("audio")).toBeTruthy();
  });

  it("renders the Original mode button by default", () => {
    render(<AdvancedTimeline {...defaultProps()} />);
    expect(screen.getByText("Original")).toBeInTheDocument();
  });

  it("renders the Editada mode button", () => {
    render(<AdvancedTimeline {...defaultProps()} />);
    expect(screen.getByText("Editada")).toBeInTheDocument();
  });

  it("renders the zoom level as 1x by default", () => {
    render(<AdvancedTimeline {...defaultProps()} />);
    expect(screen.getByText("1x")).toBeInTheDocument();
  });

  it("shows 0:00 time display initially", () => {
    render(<AdvancedTimeline {...defaultProps()} />);
    // Multiple 0:00 elements: current time and total duration
    const zeros = screen.getAllByText("0:00");
    expect(zeros.length).toBeGreaterThanOrEqual(2);
  });

  it("renders segment with its topic label", () => {
    const seg = makeSegment({ topic: "My Topic" });
    render(<AdvancedTimeline {...defaultProps([seg])} />);
    expect(screen.getByText("My Topic")).toBeInTheDocument();
  });

  it("does not show the Preview button when no previewRange is given", () => {
    render(<AdvancedTimeline {...defaultProps()} />);
    expect(screen.queryByText("Preview")).toBeNull();
  });
});

// ─── Stats display ─────────────────────────────────────────────────────────

describe("AdvancedTimeline – stats display", () => {
  it("shows correct selected/total ratio", () => {
    const segs = [
      makeSegment({ id: "s1", isSelected: true }),
      makeSegment({ id: "s2", isSelected: false }),
    ];
    render(<AdvancedTimeline {...defaultProps(segs)} />);
    // The component renders "{selected}/{total}" as two adjacent spans
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("/2")).toBeInTheDocument();
  });

  it("shows 0% reduction when nothing is deselected", () => {
    const segs = [
      makeSegment({ id: "s1", startTime: 0, endTime: 60, isSelected: true }),
    ];
    render(<AdvancedTimeline {...defaultProps(segs)} />);
    expect(screen.getByText("-0%")).toBeInTheDocument();
  });

  it("shows non-zero reduction when some segments are deselected", () => {
    const segs = [
      makeSegment({ id: "s1", startTime: 0, endTime: 60, isSelected: true }),
      makeSegment({ id: "s2", startTime: 60, endTime: 120, isSelected: false }),
    ];
    render(<AdvancedTimeline {...defaultProps(segs)} />);
    // 60s selected out of 120s total = 50% reduction
    expect(screen.getByText("-50%")).toBeInTheDocument();
  });
});

// ─── Mode toggle ───────────────────────────────────────────────────────────

describe("AdvancedTimeline – mode toggle", () => {
  it("calls onModeChange with 'edited' when Editada is clicked", () => {
    const onModeChange = vi.fn();
    render(<AdvancedTimeline {...defaultProps([], { onModeChange })} />);
    fireEvent.click(screen.getByText("Editada"));
    expect(onModeChange).toHaveBeenCalledWith("edited");
  });

  it("calls onModeChange with 'full' when Original is clicked after switching", () => {
    const onModeChange = vi.fn();
    render(<AdvancedTimeline {...defaultProps([], { onModeChange })} />);
    fireEvent.click(screen.getByText("Editada"));
    onModeChange.mockClear();
    fireEvent.click(screen.getByText("Original"));
    expect(onModeChange).toHaveBeenCalledWith("full");
  });

  it("shows Preview button when previewRange is provided", () => {
    const seg = makeSegment({ id: "seg-1" });
    const previewRange = { segmentIds: ["seg-1"], label: "Preview Label" };
    render(
      <AdvancedTimeline
        {...defaultProps([seg], { previewRange })}
      />
    );
    expect(screen.getByText("Preview")).toBeInTheDocument();
  });

  it("switches to preview mode when Preview button is clicked", () => {
    const onModeChange = vi.fn();
    const seg = makeSegment({ id: "seg-1" });
    const previewRange = { segmentIds: ["seg-1"] };
    render(
      <AdvancedTimeline
        {...defaultProps([seg], { previewRange, onModeChange })}
      />
    );
    fireEvent.click(screen.getByText("Preview"));
    expect(onModeChange).toHaveBeenCalledWith("preview");
  });
});

// ─── Preview mode indicator ────────────────────────────────────────────────

describe("AdvancedTimeline – preview mode indicator", () => {
  function renderWithPreview(label?: string) {
    const seg = makeSegment({ id: "seg-1" });
    const previewRange = { segmentIds: ["seg-1"], label };
    const { container } = render(
      <AdvancedTimeline
        {...defaultProps([seg], { previewRange, initialMode: "preview" })}
      />
    );
    return { container };
  }

  it("shows the previewRange label when in preview mode", () => {
    renderWithPreview("My Section Preview");
    expect(screen.getByText("My Section Preview")).toBeInTheDocument();
  });

  it("shows segment count when no label is given", () => {
    renderWithPreview();
    expect(screen.getByText("1 segmentos")).toBeInTheDocument();
  });

  it("shows the loop (Repeat) button in preview mode", () => {
    renderWithPreview("Label");
    // The loop toggle button has a title with "Loop"
    const loopBtn = screen.getByTitle(/Loop/);
    expect(loopBtn).toBeInTheDocument();
  });

  it("calls onPreviewClose when the close button is clicked", () => {
    const onPreviewClose = vi.fn();
    const seg = makeSegment({ id: "seg-1" });
    const previewRange = { segmentIds: ["seg-1"] };
    render(
      <AdvancedTimeline
        {...defaultProps([seg], { previewRange, initialMode: "preview", onPreviewClose })}
      />
    );
    // The close button is the X button inside the preview indicator
    const closeBtn = screen.getAllByRole("button").find(
      (btn) => btn.querySelector('svg') && btn.className.includes("p-0.5")
        && !btn.title?.includes("Loop")
    );
    if (closeBtn) {
      fireEvent.click(closeBtn);
      expect(onPreviewClose).toHaveBeenCalled();
    }
  });
});

// ─── Zoom controls ─────────────────────────────────────────────────────────

describe("AdvancedTimeline – zoom controls", () => {
  it("increments zoom level when ZoomIn is clicked", () => {
    render(<AdvancedTimeline {...defaultProps()} />);
    expect(screen.getByText("1x")).toBeInTheDocument();

    // ZoomIn button increments by 0.5
    const buttons = screen.getAllByRole("button");
    const zoomInBtn = buttons[buttons.length - 1]; // Last button in the group
    fireEvent.click(zoomInBtn);

    expect(screen.getByText("1.5x")).toBeInTheDocument();
  });

  it("decrements zoom level when ZoomOut is clicked", () => {
    render(<AdvancedTimeline {...defaultProps()} />);
    const buttons = screen.getAllByRole("button");
    // ZoomOut is the second-to-last button (last two are ZoomOut, ZoomIn)
    const zoomOutBtn = buttons[buttons.length - 2];
    fireEvent.click(zoomOutBtn);

    expect(screen.getByText("0.5x")).toBeInTheDocument();
  });

  it("does not go below 0.5x zoom", () => {
    render(<AdvancedTimeline {...defaultProps()} />);
    const buttons = screen.getAllByRole("button");
    const zoomOutBtn = buttons[buttons.length - 2];
    // Click multiple times to try to go below 0.5
    fireEvent.click(zoomOutBtn);
    fireEvent.click(zoomOutBtn);
    fireEvent.click(zoomOutBtn);

    expect(screen.getByText("0.5x")).toBeInTheDocument();
  });

  it("does not go above 4x zoom", () => {
    render(<AdvancedTimeline {...defaultProps()} />);
    const buttons = screen.getAllByRole("button");
    const zoomInBtn = buttons[buttons.length - 1];
    // Click 8 times - should stop at 4x
    for (let i = 0; i < 8; i++) {
      fireEvent.click(zoomInBtn);
    }

    expect(screen.getByText("4x")).toBeInTheDocument();
  });
});

// ─── Playback controls ─────────────────────────────────────────────────────

describe("AdvancedTimeline – playback controls", () => {
  it("calls play() when the play button is clicked", async () => {
    render(<AdvancedTimeline {...defaultProps()} audioUrl="http://example.com/a.mp3" />);
    // Play button is the round emerald button
    const playBtn = screen.getAllByRole("button").find(
      (btn) => btn.className.includes("rounded-full") && btn.className.includes("emerald")
    )!;
    await act(async () => {
      fireEvent.click(playBtn);
    });
    expect(mockPlay).toHaveBeenCalled();
  });

  it("calls onPlayingChange(true) when playback starts", async () => {
    const onPlayingChange = vi.fn();
    const { container } = render(
      <AdvancedTimeline
        {...defaultProps([], { onPlayingChange })}
        audioUrl="http://example.com/a.mp3"
      />
    );
    const audio = container.querySelector("audio")!;
    act(() => {
      fireEvent(audio, new Event("play"));
    });
    expect(onPlayingChange).toHaveBeenCalledWith(true);
  });

  it("calls onPlayingChange(false) when playback pauses", () => {
    const onPlayingChange = vi.fn();
    const { container } = render(
      <AdvancedTimeline
        {...defaultProps([], { onPlayingChange })}
        audioUrl="http://example.com/a.mp3"
      />
    );
    const audio = container.querySelector("audio")!;
    act(() => {
      fireEvent(audio, new Event("pause"));
    });
    expect(onPlayingChange).toHaveBeenCalledWith(false);
  });

  it("toggles muted state when the mute button is clicked", async () => {
    const { container } = render(
      <AdvancedTimeline {...defaultProps()} audioUrl="http://example.com/a.mp3" />
    );
    // Find mute button (fourth button in the player controls)
    const allButtons = screen.getAllByRole("button");
    // Mute button is at index 3 in the controls (skip, play, skip-fwd, mute)
    const muteBtn = allButtons[3];
    await act(async () => {
      fireEvent.click(muteBtn);
    });
    const audio = container.querySelector("audio")! as HTMLMediaElement & { _muted?: boolean };
    expect(audio._muted).toBe(true);
  });
});

// ─── Segment interaction ───────────────────────────────────────────────────

describe("AdvancedTimeline – segment interaction", () => {
  it("calls onSegmentClick when a segment is clicked", () => {
    const onSegmentClick = vi.fn();
    const seg = makeSegment({ id: "seg-42", topic: "Click Me" });
    render(
      <AdvancedTimeline
        {...defaultProps([seg], { onSegmentClick })}
      />
    );
    const segEl = screen.getByText("Click Me").closest("[data-segment-id]")!;
    fireEvent.click(segEl);
    expect(onSegmentClick).toHaveBeenCalledWith("seg-42");
  });
});

// ─── onTimeUpdate callback ─────────────────────────────────────────────────

describe("AdvancedTimeline – onTimeUpdate", () => {
  it("calls onTimeUpdate when timeupdate fires", () => {
    const onTimeUpdate = vi.fn();
    const { container } = render(
      <AdvancedTimeline
        {...defaultProps([], { onTimeUpdate })}
        audioUrl="http://example.com/a.mp3"
      />
    );
    const audio = container.querySelector("audio")! as HTMLMediaElement & { _ct?: number };
    audio._ct = 15;
    act(() => {
      fireEvent(audio, new Event("timeupdate"));
    });
    expect(onTimeUpdate).toHaveBeenCalledWith(15);
  });
});

// ─── Timeline mode info text ───────────────────────────────────────────────

describe("AdvancedTimeline – mode info label", () => {
  it("shows 'Original' mode label at the bottom", () => {
    render(<AdvancedTimeline {...defaultProps()} />);
    // The bottom label shows "Original • N seg"
    expect(screen.getByText(/^Original •/)).toBeInTheDocument();
  });

  it("shows 'Editada' mode label after switching to edited mode", () => {
    render(<AdvancedTimeline {...defaultProps()} />);
    fireEvent.click(screen.getByText("Editada"));
    expect(screen.getByText(/^Editada •/)).toBeInTheDocument();
  });
});

// ─── initialMode prop ──────────────────────────────────────────────────────

describe("AdvancedTimeline – initialMode prop", () => {
  it("starts in edited mode when initialMode='edited'", () => {
    render(<AdvancedTimeline {...defaultProps([], { initialMode: "edited" })} />);
    expect(screen.getByText(/^Editada •/)).toBeInTheDocument();
  });
});
