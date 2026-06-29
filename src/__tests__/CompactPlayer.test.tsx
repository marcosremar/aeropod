import React, { createRef } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CompactPlayer, CompactPlayerRef } from "@/components/editor/CompactPlayer";
import type { Segment } from "@/lib/db/schema";

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

// ─── Test fixtures ─────────────────────────────────────────────────────────────

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

const AUDIO_URL = "https://example.com/audio.mp3";

// Button layout rendered by CompactPlayer:
//   [0] expand/collapse (ChevronDown/Up, in the stats row)
//   [1] skip-back  (SkipBack, in controls row)
//   [2] play/pause (Play/Pause)
//   [3] skip-next  (SkipForward)
//   [4] mute       (Volume2/VolumeX)
const BTN = { expand: 0, skipBack: 1, play: 2, skipNext: 3, mute: 4 };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CompactPlayer", () => {
  // ── Empty / no-segments state ─────────────────────────────────────────────

  describe("with no segments", () => {
    it("renders the <audio> element even with no segments", () => {
      const { container } = render(
        <CompactPlayer
          segments={[]}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      expect(container.querySelector("audio")).not.toBeNull();
    });

    it("shows 0/0 segment count when no segments", () => {
      render(
        <CompactPlayer
          segments={[]}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      expect(screen.getByText("0/0 seg")).toBeInTheDocument();
    });

    it("disables the play button when no segments are selected", () => {
      const seg = makeSegment({ isSelected: false });
      render(
        <CompactPlayer
          segments={[seg]}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      const buttons = screen.getAllByRole("button");
      expect(buttons[BTN.play]).toBeDisabled();
    });

    it("disables skip-prev when there is only one selected segment", () => {
      const seg = makeSegment();
      render(
        <CompactPlayer
          segments={[seg]}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      const buttons = screen.getAllByRole("button");
      expect(buttons[BTN.skipBack]).toBeDisabled();
    });

    it("disables skip-next when there is only one selected segment", () => {
      const seg = makeSegment();
      render(
        <CompactPlayer
          segments={[seg]}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      const buttons = screen.getAllByRole("button");
      expect(buttons[BTN.skipNext]).toBeDisabled();
    });
  });

  // ── Stats row ──────────────────────────────────────────────────────────────

  describe("stats row", () => {
    it("shows 1/1 seg when one selected segment", () => {
      const seg = makeSegment({ isSelected: true });
      render(
        <CompactPlayer
          segments={[seg]}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      expect(screen.getByText("1/1 seg")).toBeInTheDocument();
    });

    it("shows correct segment count with mixed selection", () => {
      const segs = [
        makeSegment({ id: "a", isSelected: true }),
        makeSegment({ id: "b", isSelected: false }),
      ];
      render(
        <CompactPlayer
          segments={segs}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      expect(screen.getByText("1/2 seg")).toBeInTheDocument();
    });

    it("shows -0% reduction when all segments are selected and no cuts", () => {
      const seg = makeSegment({ startTime: 0, endTime: 60, isSelected: true });
      render(
        <CompactPlayer
          segments={[seg]}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      expect(screen.getByText("-0%")).toBeInTheDocument();
    });

    it("shows reduction percentage when some segments are deselected", () => {
      const segs = [
        makeSegment({ id: "a", startTime: 0, endTime: 60, isSelected: true }),
        makeSegment({ id: "b", startTime: 60, endTime: 120, isSelected: false }),
      ];
      render(
        <CompactPlayer
          segments={segs}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      // Original = 120s, selected = 60s, reduction = 50%
      expect(screen.getByText("-50%")).toBeInTheDocument();
    });

    it("renders the audio element with the provided src", () => {
      const { container } = render(
        <CompactPlayer
          segments={[makeSegment()]}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      const audio = container.querySelector("audio")!;
      expect(audio.src).toBe(AUDIO_URL);
    });

    it("renders no src attribute when audioUrl is null", () => {
      const { container } = render(
        <CompactPlayer
          segments={[makeSegment()]}
          audioUrl={null}
          onToggleSelect={vi.fn()}
        />
      );
      const audio = container.querySelector("audio")!;
      // jsdom normalises missing src to "" or the page URL — just confirm it is not the real URL
      expect(audio.src).not.toBe(AUDIO_URL);
    });
  });

  // ── Playback controls ──────────────────────────────────────────────────────

  describe("play / pause", () => {
    it("calls play() on the audio element when play button is clicked", async () => {
      const seg = makeSegment();
      render(
        <CompactPlayer
          segments={[seg]}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      const buttons = screen.getAllByRole("button");
      await act(async () => {
        fireEvent.click(buttons[BTN.play]);
      });
      expect(mockPlay).toHaveBeenCalledTimes(1);
    });

    it("calls pause() when the play button is clicked while playing", async () => {
      const seg = makeSegment();
      const { container } = render(
        <CompactPlayer
          segments={[seg]}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      const buttons = screen.getAllByRole("button");

      // Start playing
      await act(async () => {
        fireEvent.click(buttons[BTN.play]);
      });

      // Simulate the audio element emitting its 'play' event so React state updates
      const audio = container.querySelector("audio")!;
      await act(async () => {
        fireEvent(audio, new Event("play"));
      });

      // Click again to pause
      await act(async () => {
        fireEvent.click(buttons[BTN.play]);
      });
      expect(mockPause).toHaveBeenCalledTimes(1);
    });
  });

  // ── Skip prev / next ────────────────────────────────────────────────────────

  describe("skip prev / next", () => {
    it("enables skip-next when multiple selected segments exist", () => {
      const segs = [
        makeSegment({ id: "a", startTime: 0, endTime: 30, isSelected: true }),
        makeSegment({ id: "b", startTime: 30, endTime: 60, isSelected: true }),
      ];
      render(
        <CompactPlayer
          segments={segs}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      const buttons = screen.getAllByRole("button");
      expect(buttons[BTN.skipNext]).not.toBeDisabled();
    });

    it("enables skip-prev after advancing to the next segment", async () => {
      const segs = [
        makeSegment({ id: "a", startTime: 0, endTime: 30, isSelected: true }),
        makeSegment({ id: "b", startTime: 30, endTime: 60, isSelected: true }),
      ];
      render(
        <CompactPlayer
          segments={segs}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      const buttons = screen.getAllByRole("button");
      // Initially skip-prev is disabled
      expect(buttons[BTN.skipBack]).toBeDisabled();
      // Click skip-next to move to segment 2
      await act(async () => {
        fireEvent.click(buttons[BTN.skipNext]);
      });
      // Now skip-prev should be enabled
      expect(buttons[BTN.skipBack]).not.toBeDisabled();
    });
  });

  // ── Mute toggle ────────────────────────────────────────────────────────────

  describe("mute toggle", () => {
    it("mutes the audio element when mute button is clicked", () => {
      const seg = makeSegment();
      const { container } = render(
        <CompactPlayer
          segments={[seg]}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      const audio = container.querySelector("audio")!;
      expect(audio.muted).toBe(false);

      const buttons = screen.getAllByRole("button");
      fireEvent.click(buttons[BTN.mute]);
      expect(audio.muted).toBe(true);
    });

    it("un-mutes when mute button is clicked a second time", () => {
      const seg = makeSegment();
      const { container } = render(
        <CompactPlayer
          segments={[seg]}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      const audio = container.querySelector("audio")!;
      const buttons = screen.getAllByRole("button");

      fireEvent.click(buttons[BTN.mute]); // mute
      fireEvent.click(buttons[BTN.mute]); // unmute
      expect(audio.muted).toBe(false);
    });
  });

  // ── Expand / collapse original timeline ───────────────────────────────────

  describe("expand / collapse", () => {
    it("does not show the original timeline label by default", () => {
      render(
        <CompactPlayer
          segments={[makeSegment()]}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      expect(
        screen.queryByText("Timeline Original - clique para selecionar")
      ).toBeNull();
    });

    it("shows the original timeline after clicking the expand button", () => {
      render(
        <CompactPlayer
          segments={[makeSegment()]}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      const buttons = screen.getAllByRole("button");
      fireEvent.click(buttons[BTN.expand]);
      expect(
        screen.getByText("Timeline Original - clique para selecionar")
      ).toBeInTheDocument();
    });

    it("hides the original timeline after collapsing again", () => {
      render(
        <CompactPlayer
          segments={[makeSegment()]}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      const buttons = screen.getAllByRole("button");
      fireEvent.click(buttons[BTN.expand]); // expand
      fireEvent.click(buttons[BTN.expand]); // collapse
      expect(
        screen.queryByText("Timeline Original - clique para selecionar")
      ).toBeNull();
    });
  });

  // ── onToggleSelect callback ────────────────────────────────────────────────

  describe("onToggleSelect in expanded timeline", () => {
    it("calls onToggleSelect with segment id when a segment block is clicked", () => {
      const onToggleSelect = vi.fn();
      const seg = makeSegment({ id: "seg-abc", startTime: 0, endTime: 60, isSelected: true });
      render(
        <CompactPlayer
          segments={[seg]}
          audioUrl={AUDIO_URL}
          onToggleSelect={onToggleSelect}
        />
      );
      // Expand original timeline
      const buttons = screen.getAllByRole("button");
      fireEvent.click(buttons[BTN.expand]);

      // Each segment in the expanded timeline is a clickable div with a title
      const segBlock = document.querySelector(`[title="0:00 - Segmento"]`);
      expect(segBlock).not.toBeNull();
      fireEvent.click(segBlock!);
      expect(onToggleSelect).toHaveBeenCalledWith("seg-abc");
    });

    it("calls onToggleSelect with the correct id when topic is set", () => {
      const onToggleSelect = vi.fn();
      const seg = makeSegment({ id: "seg-xyz", startTime: 0, endTime: 60, isSelected: true, topic: "Intro" });
      render(
        <CompactPlayer
          segments={[seg]}
          audioUrl={AUDIO_URL}
          onToggleSelect={onToggleSelect}
        />
      );
      const buttons = screen.getAllByRole("button");
      fireEvent.click(buttons[BTN.expand]);

      const segBlock = document.querySelector(`[title="0:00 - Intro"]`);
      expect(segBlock).not.toBeNull();
      fireEvent.click(segBlock!);
      expect(onToggleSelect).toHaveBeenCalledWith("seg-xyz");
    });
  });

  // ── Ref methods ────────────────────────────────────────────────────────────

  describe("imperative handle (ref)", () => {
    it("seekToTime sets audio currentTime", () => {
      const ref = createRef<CompactPlayerRef>();
      const seg = makeSegment();
      const { container } = render(
        <CompactPlayer
          ref={ref}
          segments={[seg]}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      const audio = container.querySelector("audio")!;
      act(() => {
        ref.current!.seekToTime(42);
      });
      expect(audio.currentTime).toBe(42);
    });

    it("playFromStart seeks to first selected segment start and calls play()", async () => {
      const ref = createRef<CompactPlayerRef>();
      const seg = makeSegment({ startTime: 10, endTime: 70 });
      const { container } = render(
        <CompactPlayer
          ref={ref}
          segments={[seg]}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      const audio = container.querySelector("audio")!;
      await act(async () => {
        ref.current!.playFromStart();
      });
      expect(audio.currentTime).toBe(10);
      expect(mockPlay).toHaveBeenCalledTimes(1);
    });

    it("playSegment seeks to segment startTime and calls play()", async () => {
      const ref = createRef<CompactPlayerRef>();
      const seg = makeSegment({ startTime: 20, endTime: 50 });
      const { container } = render(
        <CompactPlayer
          ref={ref}
          segments={[seg]}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      const audio = container.querySelector("audio")!;
      await act(async () => {
        ref.current!.playSegment(seg);
      });
      expect(audio.currentTime).toBe(20);
      expect(mockPlay).toHaveBeenCalledTimes(1);
    });

    it("playFromStart does nothing when no segments are selected", async () => {
      const ref = createRef<CompactPlayerRef>();
      const seg = makeSegment({ isSelected: false });
      render(
        <CompactPlayer
          ref={ref}
          segments={[seg]}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      await act(async () => {
        ref.current!.playFromStart();
      });
      expect(mockPlay).not.toHaveBeenCalled();
    });
  });

  // ── className prop ─────────────────────────────────────────────────────────

  describe("className prop", () => {
    it("applies additional className to the root element", () => {
      const { container } = render(
        <CompactPlayer
          segments={[makeSegment()]}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
          className="my-custom-class"
        />
      );
      const root = container.firstChild as HTMLElement;
      expect(root.classList.contains("my-custom-class")).toBe(true);
    });
  });

  // ── Time formatting helper ─────────────────────────────────────────────────

  describe("time display formatting", () => {
    it("formats durations as m:ss with zero-padded seconds", () => {
      // 90s → 1:30 should appear (original duration)
      const seg = makeSegment({ startTime: 0, endTime: 90, isSelected: true });
      render(
        <CompactPlayer
          segments={[seg]}
          audioUrl={AUDIO_URL}
          onToggleSelect={vi.fn()}
        />
      );
      // Both original and edited span show "1:30" — use getAllByText
      const times = screen.getAllByText("1:30");
      expect(times.length).toBeGreaterThanOrEqual(1);
    });
  });
});
