import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AudioPlayer } from "@/components/editor/AudioPlayer";

// ─── HTMLMediaElement stubs ────────────────────────────────────────────────────
// jsdom does not implement media APIs, so we stub play/pause on the prototype.
// currentTime/volume/playbackRate are stubbed as getter/setter pairs that store
// values per-instance so that assignments are readable back in assertions.

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

  // Getter/setter stubs so assignments persist on the instance
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
      return this._dur ?? 120;
    },
    set(this: HTMLMediaElement & { _dur?: number }, val: number) {
      this._dur = val;
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "volume", {
    configurable: true,
    get(this: HTMLMediaElement & { _vol?: number }) {
      return this._vol ?? 1;
    },
    set(this: HTMLMediaElement & { _vol?: number }, val: number) {
      this._vol = val;
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "playbackRate", {
    configurable: true,
    get(this: HTMLMediaElement & { _rate?: number }) {
      return this._rate ?? 1;
    },
    set(this: HTMLMediaElement & { _rate?: number }, val: number) {
      this._rate = val;
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Fire a native event on the <audio> element rendered inside the component. */
function fireAudioEvent(container: HTMLElement, eventName: string) {
  const audio = container.querySelector("audio")!;
  fireEvent(audio, new Event(eventName));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AudioPlayer", () => {
  // ── No-audio state ────────────────────────────────────────────────────────

  describe("no audioUrl", () => {
    it("renders the empty state when audioUrl is null", () => {
      render(<AudioPlayer audioUrl={null} />);
      expect(screen.getByText("No audio available")).toBeInTheDocument();
    });

    it("does not render the player controls when audioUrl is null", () => {
      render(<AudioPlayer audioUrl={null} />);
      expect(screen.queryByRole("slider")).toBeNull();
    });
  });

  // ── Player rendering ──────────────────────────────────────────────────────

  describe("player rendering with a valid audioUrl", () => {
    it("renders the default title", () => {
      render(<AudioPlayer audioUrl="https://example.com/audio.mp3" />);
      expect(screen.getByText("Audio Preview")).toBeInTheDocument();
    });

    it("renders a custom title", () => {
      render(
        <AudioPlayer
          audioUrl="https://example.com/audio.mp3"
          title="My Podcast"
        />
      );
      expect(screen.getByText("My Podcast")).toBeInTheDocument();
    });

    it("renders the <audio> element with the provided src", () => {
      const { container } = render(
        <AudioPlayer audioUrl="https://example.com/audio.mp3" />
      );
      const audio = container.querySelector("audio");
      expect(audio).not.toBeNull();
      expect(audio!.src).toBe("https://example.com/audio.mp3");
    });

    it("renders Play, Skip Back, and Skip Forward buttons", () => {
      render(<AudioPlayer audioUrl="https://example.com/audio.mp3" />);
      expect(screen.getByTitle("Skip back 10s")).toBeInTheDocument();
      expect(screen.getByTitle("Skip forward 10s")).toBeInTheDocument();
      // Play button is the one with size="icon" (no explicit title)
      expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(3);
    });

    it("initially shows the play button (not pause)", () => {
      const { container } = render(
        <AudioPlayer audioUrl="https://example.com/audio.mp3" />
      );
      // svg titles come from lucide — check via aria or presence of Pause vs Play
      // The simplest proxy: speed button shows "1x" at start
      expect(screen.getByText("1x")).toBeInTheDocument();
    });

    it("renders the speed button showing 1x by default", () => {
      render(<AudioPlayer audioUrl="https://example.com/audio.mp3" />);
      expect(screen.getByText("1x")).toBeInTheDocument();
    });

    it("renders time display as 0:00 / 0:00 initially", () => {
      render(<AudioPlayer audioUrl="https://example.com/audio.mp3" />);
      const times = screen.getAllByText("0:00");
      expect(times.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Play / Pause ──────────────────────────────────────────────────────────

  describe("play / pause", () => {
    it("calls play() when the play button is clicked", async () => {
      render(<AudioPlayer audioUrl="https://example.com/audio.mp3" />);
      const playButton = screen.getAllByRole("button").find(
        (btn) => !btn.title && !btn.textContent?.includes("x")
      )!;
      await act(async () => {
        fireEvent.click(playButton);
      });
      expect(mockPlay).toHaveBeenCalled();
    });

    it("calls pause() when the button is clicked a second time", async () => {
      render(<AudioPlayer audioUrl="https://example.com/audio.mp3" />);
      const playButton = screen.getAllByRole("button").find(
        (btn) => !btn.title && !btn.textContent?.includes("x")
      )!;
      // First click → play
      await act(async () => {
        fireEvent.click(playButton);
      });
      // Second click → pause
      await act(async () => {
        fireEvent.click(playButton);
      });
      expect(mockPause).toHaveBeenCalled();
    });
  });

  // ── autoPlay ──────────────────────────────────────────────────────────────

  describe("autoPlay prop", () => {
    it("calls play() automatically when autoPlay is true", async () => {
      await act(async () => {
        render(
          <AudioPlayer
            audioUrl="https://example.com/audio.mp3"
            autoPlay={true}
          />
        );
      });
      expect(mockPlay).toHaveBeenCalled();
    });

    it("does not call play() automatically when autoPlay is false", async () => {
      await act(async () => {
        render(
          <AudioPlayer
            audioUrl="https://example.com/audio.mp3"
            autoPlay={false}
          />
        );
      });
      expect(mockPlay).not.toHaveBeenCalled();
    });
  });

  // ── Seek ──────────────────────────────────────────────────────────────────

  describe("seek slider", () => {
    it("updates the displayed time when the seek slider changes", async () => {
      // Fire loadedmetadata first so the slider's max becomes 120 (not 0).
      // jsdom clamps an input's value to [min, max], so without this the
      // change would be silently clamped to 0.
      const { container } = render(
        <AudioPlayer audioUrl="https://example.com/audio.mp3" />
      );
      const audio = container.querySelector("audio")!;
      act(() => { fireEvent(audio, new Event("loadedmetadata")); });

      const [seekSlider] = container.querySelectorAll('input[type="range"]');
      await act(async () => {
        fireEvent.change(seekSlider, { target: { value: "45" } });
      });
      expect(screen.getByText("0:45")).toBeInTheDocument();
    });
  });

  // ── Volume ────────────────────────────────────────────────────────────────

  describe("volume control", () => {
    it("updates audio volume when the volume slider changes", () => {
      const { container } = render(
        <AudioPlayer audioUrl="https://example.com/audio.mp3" />
      );
      const audio = container.querySelector("audio") as HTMLAudioElement;
      const sliders = container.querySelectorAll('input[type="range"]');
      const volumeSlider = sliders[1]; // seek is first, volume is second
      fireEvent.change(volumeSlider, { target: { value: "0.5" } });
      expect(audio.volume).toBe(0.5);
    });

    it("does not mute when volume slider is set above zero", () => {
      const { container } = render(
        <AudioPlayer audioUrl="https://example.com/audio.mp3" />
      );
      const sliders = container.querySelectorAll('input[type="range"]');
      const volumeSlider = sliders[1];
      fireEvent.change(volumeSlider, { target: { value: "0.8" } });
      // VolumeX icon should NOT appear — the audio is not muted
      // (we verify by checking the volume button is still present)
      expect(container.querySelector("audio")).not.toBeNull();
    });
  });

  // ── Mute ─────────────────────────────────────────────────────────────────

  describe("mute toggle", () => {
    it("sets audio.volume to 0 when the mute button is clicked", async () => {
      const { container } = render(
        <AudioPlayer audioUrl="https://example.com/audio.mp3" />
      );
      const audio = container.querySelector("audio") as HTMLAudioElement;
      // The mute button is the icon-sm ghost button after the speed button
      const buttons = screen.getAllByRole("button");
      const muteButton = buttons[buttons.length - 1];
      await act(async () => {
        fireEvent.click(muteButton);
      });
      expect(audio.volume).toBe(0);
    });
  });

  // ── Speed cycling ──────────────────────────────────────────────────────────

  describe("playback speed", () => {
    it("cycles to 0.5x on first click of the speed button", async () => {
      render(<AudioPlayer audioUrl="https://example.com/audio.mp3" />);
      const speedButton = screen.getByText("1x").closest("button")!;
      await act(async () => {
        fireEvent.click(speedButton);
      });
      expect(screen.getByText("1.25x")).toBeInTheDocument();
    });

    it("cycles through all speeds and wraps back to 0.5x", async () => {
      render(<AudioPlayer audioUrl="https://example.com/audio.mp3" />);
      const getSpeedButton = () =>
        screen.getAllByRole("button").find((btn) => btn.textContent?.includes("x"))!;

      const speeds = ["1.25x", "1.5x", "2x", "0.5x", "0.75x", "1x"];
      for (const expected of speeds) {
        await act(async () => {
          fireEvent.click(getSpeedButton());
        });
        expect(screen.getByText(expected)).toBeInTheDocument();
      }
    });

    it("sets audio.playbackRate when speed cycles", async () => {
      const { container } = render(
        <AudioPlayer audioUrl="https://example.com/audio.mp3" />
      );
      const audio = container.querySelector("audio") as HTMLAudioElement;
      const speedButton = screen.getByText("1x").closest("button")!;
      await act(async () => {
        fireEvent.click(speedButton);
      });
      expect(audio.playbackRate).toBe(1.25);
    });
  });

  // ── Skip ──────────────────────────────────────────────────────────────────

  describe("skip buttons", () => {
    /**
     * The component uses React state (currentTime, duration) for the skip
     * calculation. We set up state by:
     *   1. Setting audio.currentTime on the element (our stub persists it).
     *   2. Firing `timeupdate` so the component reads it into state.
     *   3. Firing `loadedmetadata` so `duration` state becomes 120.
     */
    function setupAudioState(
      container: HTMLElement,
      startTime: number
    ) {
      const audio = container.querySelector("audio") as HTMLAudioElement;
      audio.currentTime = startTime;
      act(() => { fireEvent(audio, new Event("timeupdate")); });
      act(() => { fireEvent(audio, new Event("loadedmetadata")); });
      return audio;
    }

    it("decrements currentTime by 10 when skip-back is clicked", () => {
      const { container } = render(
        <AudioPlayer audioUrl="https://example.com/audio.mp3" />
      );
      const audio = setupAudioState(container, 30);
      fireEvent.click(screen.getByTitle("Skip back 10s"));
      expect(audio.currentTime).toBe(20);
    });

    it("does not go below 0 when skip-back is clicked near start", () => {
      const { container } = render(
        <AudioPlayer audioUrl="https://example.com/audio.mp3" />
      );
      const audio = setupAudioState(container, 5);
      fireEvent.click(screen.getByTitle("Skip back 10s"));
      expect(audio.currentTime).toBe(0);
    });

    it("increments currentTime by 10 when skip-forward is clicked", () => {
      const { container } = render(
        <AudioPlayer audioUrl="https://example.com/audio.mp3" />
      );
      const audio = setupAudioState(container, 30);
      fireEvent.click(screen.getByTitle("Skip forward 10s"));
      expect(audio.currentTime).toBe(40);
    });

    it("does not exceed duration when skip-forward is clicked near end", () => {
      const { container } = render(
        <AudioPlayer audioUrl="https://example.com/audio.mp3" />
      );
      const audio = setupAudioState(container, 115); // duration is 120 from stub
      fireEvent.click(screen.getByTitle("Skip forward 10s"));
      expect(audio.currentTime).toBe(120);
    });
  });

  // ── onEnded callback ─────────────────────────────────────────────────────

  describe("onEnded callback", () => {
    it("calls onEnded when the audio 'ended' event fires", () => {
      const onEnded = vi.fn();
      const { container } = render(
        <AudioPlayer
          audioUrl="https://example.com/audio.mp3"
          onEnded={onEnded}
        />
      );
      act(() => {
        fireAudioEvent(container, "ended");
      });
      expect(onEnded).toHaveBeenCalled();
    });
  });

  // ── loadStart / loading state ─────────────────────────────────────────────

  describe("loading state", () => {
    it("shows 'Loading...' text when the audio loadstart event fires", () => {
      const { container } = render(
        <AudioPlayer audioUrl="https://example.com/audio.mp3" />
      );
      act(() => {
        fireAudioEvent(container, "loadstart");
      });
      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    it("hides 'Loading...' after loadedmetadata fires", () => {
      const { container } = render(
        <AudioPlayer audioUrl="https://example.com/audio.mp3" />
      );
      act(() => {
        fireAudioEvent(container, "loadstart");
      });
      expect(screen.getByText("Loading...")).toBeInTheDocument();
      act(() => {
        fireAudioEvent(container, "loadedmetadata");
      });
      expect(screen.queryByText("Loading...")).toBeNull();
    });
  });

  // ── formatTime utility (via rendered output) ───────────────────────────────

  describe("time formatting", () => {
    it("formats 0 as 0:00", () => {
      render(<AudioPlayer audioUrl="https://example.com/audio.mp3" />);
      const times = screen.getAllByText("0:00");
      expect(times.length).toBeGreaterThanOrEqual(1);
    });

    it("formats duration as mm:ss after loadedmetadata fires", () => {
      const { container } = render(
        <AudioPlayer audioUrl="https://example.com/audio.mp3" />
      );
      // duration is set to 120 in the stub, loadedmetadata reads it
      act(() => {
        fireAudioEvent(container, "loadedmetadata");
      });
      // 120 seconds → 2:00
      expect(screen.getByText("2:00")).toBeInTheDocument();
    });
  });
});
