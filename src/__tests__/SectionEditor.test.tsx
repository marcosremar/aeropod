import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { SectionEditor } from "@/components/sections/SectionEditor";

// ─── jsdom stubs ──────────────────────────────────────────────────────────────
// Radix UI's Slider uses ResizeObserver internally; jsdom doesn't provide it.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// ─── Audio mock ───────────────────────────────────────────────────────────────
// SectionEditor creates its own Audio instance via `new Audio(url)` rather than
// rendering an <audio> element, so we replace the global Audio class with a
// plain ES class whose instances are fully observable.

interface MockAudioInstance {
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  currentTime: number;
  volume: number;
  onended: (() => void) | null;
  ontimeupdate: (() => void) | null;
  src: string;
}

let mockAudioInstance: MockAudioInstance;
let AudioCtorSpy: ReturnType<typeof vi.fn>;

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Capture each `new Audio(url)` call, track the instance, and record the url.
  AudioCtorSpy = vi.fn();
  class FakeAudio {
    play = vi.fn().mockResolvedValue(undefined);
    pause = vi.fn();
    currentTime = 0;
    volume = 1;
    onended: (() => void) | null = null;
    ontimeupdate: (() => void) | null = null;
    src: string;
    constructor(src: string) {
      this.src = src;
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      mockAudioInstance = this as unknown as MockAudioInstance;
      AudioCtorSpy(src);
    }
  }

  vi.stubGlobal("Audio", FakeAudio);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defaultProps(
  overrides: Partial<React.ComponentProps<typeof SectionEditor>> = {}
) {
  return {
    sectionId: "sec-1",
    sectionName: "Introduction",
    audioUrl: "https://example.com/audio.mp3",
    duration: 120,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SectionEditor", () => {
  // ── Rendering ──────────────────────────────────────────────────────────────

  describe("initial rendering", () => {
    it("renders the section name", () => {
      render(<SectionEditor {...defaultProps()} />);
      expect(screen.getByText("Introduction")).toBeInTheDocument();
    });

    it("renders formatted duration badge for 120s", () => {
      render(<SectionEditor {...defaultProps({ duration: 120 })} />);
      // Multiple elements may show "2:00" (badge + time display); check at least one exists
      expect(screen.getAllByText("2:00").length).toBeGreaterThanOrEqual(1);
    });

    it("formats duration with zero-padded seconds", () => {
      render(<SectionEditor {...defaultProps({ duration: 65 })} />);
      expect(screen.getAllByText("1:05").length).toBeGreaterThanOrEqual(1);
    });

    it("does not show the unsaved-changes badge initially", () => {
      render(<SectionEditor {...defaultProps()} />);
      expect(screen.queryByText(/alteracoes/i)).not.toBeInTheDocument();
    });

    it("renders expanded content by default", () => {
      render(<SectionEditor {...defaultProps()} />);
      expect(screen.getByText("Volume")).toBeInTheDocument();
    });

    it("shows default volume value of 100%", () => {
      render(<SectionEditor {...defaultProps()} />);
      expect(screen.getByText("100%")).toBeInTheDocument();
    });

    it("shows default fade-in value of 0.0s", () => {
      render(<SectionEditor {...defaultProps()} />);
      expect(screen.getByText("Fade In")).toBeInTheDocument();
      expect(screen.getAllByText("0.0s").length).toBeGreaterThanOrEqual(1);
    });

    it("applies the provided className to the root element", () => {
      const { container } = render(
        <SectionEditor {...defaultProps({ className: "custom-class" })} />
      );
      expect(container.firstChild).toHaveClass("custom-class");
    });
  });

  // ── initialSettings ─────────────────────────────────────────────────────────

  describe("initialSettings", () => {
    it("merges initialSettings into the default settings", () => {
      render(
        <SectionEditor {...defaultProps({ initialSettings: { volume: 80 } })} />
      );
      expect(screen.getByText("80%")).toBeInTheDocument();
    });

    it("preserves default values for unspecified initialSettings keys", () => {
      render(
        <SectionEditor {...defaultProps({ initialSettings: { volume: 50 } })} />
      );
      // fade values should still be at default 0
      expect(screen.getAllByText("0.0s").length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Expand / collapse ──────────────────────────────────────────────────────

  describe("expand / collapse", () => {
    it("collapses the editor body when the toggle button is clicked", () => {
      render(<SectionEditor {...defaultProps()} />);
      // Panel starts expanded — Volume label should be visible
      expect(screen.getByText("Volume")).toBeInTheDocument();

      // The toggle button is the only button with the custom className "hover:text-white"
      const allButtons = screen.getAllByRole("button");
      const toggleButton = allButtons.find((btn) =>
        btn.getAttribute("class")?.includes("hover:text-white")
      )!;
      expect(toggleButton).toBeDefined();
      fireEvent.click(toggleButton);

      expect(screen.queryByText("Volume")).not.toBeInTheDocument();
    });

    it("re-expands when the toggle button is clicked again", () => {
      render(<SectionEditor {...defaultProps()} />);
      const allButtons = screen.getAllByRole("button");
      const toggleButton = allButtons.find((btn) =>
        btn.getAttribute("class")?.includes("hover:text-white")
      )!;
      expect(toggleButton).toBeDefined();
      fireEvent.click(toggleButton);
      fireEvent.click(toggleButton);
      expect(screen.getByText("Volume")).toBeInTheDocument();
    });
  });

  // ── hasChanges badge ───────────────────────────────────────────────────────

  describe("hasChanges badge", () => {
    it("shows the unsaved-changes badge after a switch is toggled", () => {
      render(<SectionEditor {...defaultProps()} />);
      const normalizeSwitch = screen.getByRole("switch", {
        name: /normalizar/i,
      });
      fireEvent.click(normalizeSwitch);
      expect(screen.getByText(/alteracoes nao salvas/i)).toBeInTheDocument();
    });

    it("shows the unsaved-changes badge after hesitations switch is toggled", () => {
      render(<SectionEditor {...defaultProps()} />);
      const hesitationsSwitch = screen.getByRole("switch", {
        name: /hesita/i,
      });
      fireEvent.click(hesitationsSwitch);
      expect(screen.getByText(/alteracoes nao salvas/i)).toBeInTheDocument();
    });
  });

  // ── Reset button ───────────────────────────────────────────────────────────

  describe("Reset button", () => {
    it("is disabled when there are no unsaved changes", () => {
      render(<SectionEditor {...defaultProps()} />);
      const resetBtn = screen.getByRole("button", { name: /resetar/i });
      expect(resetBtn).toBeDisabled();
    });

    it("becomes enabled once a change is made", () => {
      render(<SectionEditor {...defaultProps()} />);
      fireEvent.click(
        screen.getByRole("switch", { name: /normalizar/i })
      );
      const resetBtn = screen.getByRole("button", { name: /resetar/i });
      expect(resetBtn).not.toBeDisabled();
    });

    it("clears the unsaved-changes badge after reset", () => {
      render(<SectionEditor {...defaultProps()} />);
      fireEvent.click(
        screen.getByRole("switch", { name: /normalizar/i })
      );
      expect(screen.getByText(/alteracoes nao salvas/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /resetar/i }));
      expect(
        screen.queryByText(/alteracoes nao salvas/i)
      ).not.toBeInTheDocument();
    });

    it("disables reset again after resetting", () => {
      render(<SectionEditor {...defaultProps()} />);
      fireEvent.click(
        screen.getByRole("switch", { name: /normalizar/i })
      );
      fireEvent.click(screen.getByRole("button", { name: /resetar/i }));
      expect(
        screen.getByRole("button", { name: /resetar/i })
      ).toBeDisabled();
    });
  });

  // ── Save button ────────────────────────────────────────────────────────────

  describe("Save button", () => {
    it("is not rendered when onSave prop is not provided", () => {
      render(<SectionEditor {...defaultProps()} />);
      expect(
        screen.queryByRole("button", { name: /salvar/i })
      ).not.toBeInTheDocument();
    });

    it("is rendered when onSave is provided", () => {
      render(
        <SectionEditor {...defaultProps({ onSave: vi.fn() })} />
      );
      expect(
        screen.getByRole("button", { name: /salvar/i })
      ).toBeInTheDocument();
    });

    it("is disabled when there are no unsaved changes", () => {
      render(
        <SectionEditor {...defaultProps({ onSave: vi.fn() })} />
      );
      expect(
        screen.getByRole("button", { name: /salvar/i })
      ).toBeDisabled();
    });

    it("becomes enabled after a change", () => {
      render(
        <SectionEditor {...defaultProps({ onSave: vi.fn() })} />
      );
      fireEvent.click(
        screen.getByRole("switch", { name: /normalizar/i })
      );
      expect(
        screen.getByRole("button", { name: /salvar/i })
      ).not.toBeDisabled();
    });

    it("calls onSave with the current settings", async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      render(<SectionEditor {...defaultProps({ onSave })} />);

      fireEvent.click(
        screen.getByRole("switch", { name: /normalizar/i })
      );
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
      });

      expect(onSave).toHaveBeenCalledOnce();
      const calledWith = onSave.mock.calls[0][0];
      expect(calledWith.normalizeVolume).toBe(true);
    });

    it("clears hasChanges after a successful save", async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      render(<SectionEditor {...defaultProps({ onSave })} />);

      fireEvent.click(
        screen.getByRole("switch", { name: /normalizar/i })
      );
      expect(screen.getByText(/alteracoes nao salvas/i)).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
      });

      await waitFor(() =>
        expect(
          screen.queryByText(/alteracoes nao salvas/i)
        ).not.toBeInTheDocument()
      );
    });

    it("re-disables the save button after a successful save", async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      render(<SectionEditor {...defaultProps({ onSave })} />);

      fireEvent.click(
        screen.getByRole("switch", { name: /normalizar/i })
      );
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
      });

      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: /salvar/i })
        ).toBeDisabled()
      );
    });
  });

  // ── Preview button ─────────────────────────────────────────────────────────

  describe("Preview button", () => {
    it("is not rendered when onPreview prop is not provided", () => {
      render(<SectionEditor {...defaultProps()} />);
      expect(
        screen.queryByRole("button", { name: /preview/i })
      ).not.toBeInTheDocument();
    });

    it("is rendered when onPreview is provided", () => {
      render(
        <SectionEditor {...defaultProps({ onPreview: vi.fn() })} />
      );
      expect(
        screen.getByRole("button", { name: /preview/i })
      ).toBeInTheDocument();
    });

    it("calls onPreview with the current settings when clicked", () => {
      const onPreview = vi.fn();
      render(<SectionEditor {...defaultProps({ onPreview })} />);

      fireEvent.click(
        screen.getByRole("switch", { name: /normalizar/i })
      );
      fireEvent.click(screen.getByRole("button", { name: /preview/i }));

      expect(onPreview).toHaveBeenCalledOnce();
      expect(onPreview.mock.calls[0][0].normalizeVolume).toBe(true);
    });

    it("is always enabled regardless of hasChanges", () => {
      const onPreview = vi.fn();
      render(<SectionEditor {...defaultProps({ onPreview })} />);
      // No changes made — preview button should still be enabled
      expect(
        screen.getByRole("button", { name: /preview/i })
      ).not.toBeDisabled();
    });
  });

  // ── Toggle switches ────────────────────────────────────────────────────────

  describe("toggle switches", () => {
    it("normalizeVolume switch starts unchecked", () => {
      render(<SectionEditor {...defaultProps()} />);
      const normalizeSwitch = screen.getByRole("switch", {
        name: /normalizar/i,
      });
      expect(normalizeSwitch).not.toBeChecked();
    });

    it("hesitations switch starts unchecked", () => {
      render(<SectionEditor {...defaultProps()} />);
      const hesitationsSwitch = screen.getByRole("switch", {
        name: /hesita/i,
      });
      expect(hesitationsSwitch).not.toBeChecked();
    });

    it("normalizeVolume switch becomes checked after click", () => {
      render(<SectionEditor {...defaultProps()} />);
      const normalizeSwitch = screen.getByRole("switch", {
        name: /normalizar/i,
      });
      fireEvent.click(normalizeSwitch);
      expect(normalizeSwitch).toBeChecked();
    });

    it("hesitations switch becomes checked after click", () => {
      render(<SectionEditor {...defaultProps()} />);
      const hesitationsSwitch = screen.getByRole("switch", {
        name: /hesita/i,
      });
      fireEvent.click(hesitationsSwitch);
      expect(hesitationsSwitch).toBeChecked();
    });
  });

  // ── Audio playback ─────────────────────────────────────────────────────────

  describe("audio playback", () => {
    it("constructs an Audio element with the given audioUrl", () => {
      render(
        <SectionEditor {...defaultProps({ audioUrl: "https://cdn.example.com/seg.mp3" })} />
      );
      expect(AudioCtorSpy).toHaveBeenCalledWith(
        "https://cdn.example.com/seg.mp3"
      );
    });

    it("calls audio.play() when the play button is clicked", async () => {
      render(<SectionEditor {...defaultProps()} />);
      // The play/pause button is the only non-ghost, non-outline button in the controls row;
      // it uses the default (solid) variant and has px-6 in its className.
      const allButtons = screen.getAllByRole("button");
      const playButton = allButtons.find(
        (btn) => btn.className.includes("px-6")
      )!;
      await act(async () => {
        fireEvent.click(playButton);
      });
      expect(mockAudioInstance.play).toHaveBeenCalledOnce();
    });

    it("calls audio.pause() when play is toggled off", async () => {
      render(<SectionEditor {...defaultProps()} />);
      const allButtons = screen.getAllByRole("button");
      const playButton = allButtons.find(
        (btn) => btn.className.includes("px-6")
      )!;
      // Start playing
      await act(async () => {
        fireEvent.click(playButton);
      });
      // Stop playing
      await act(async () => {
        fireEvent.click(playButton);
      });
      expect(mockAudioInstance.pause).toHaveBeenCalledOnce();
    });

    it("updates volume on the audio instance when settings change via initialSettings", () => {
      render(
        <SectionEditor
          {...defaultProps({ initialSettings: { volume: 50 } })}
        />
      );
      expect(mockAudioInstance.volume).toBe(0.5);
    });
  });

  // ── Effective duration ─────────────────────────────────────────────────────

  describe("effectiveDuration badge", () => {
    it("reflects trim settings in the effective duration shown", () => {
      // With trimStart=10 and trimEnd=10 from a 120s audio the effective is 100s = 1:40
      render(
        <SectionEditor
          {...defaultProps({
            duration: 120,
            initialSettings: { trimStart: 10, trimEnd: 10 },
          })}
        />
      );
      expect(screen.getByText("1:40")).toBeInTheDocument();
    });

    it("shows full duration when no trim is applied", () => {
      render(<SectionEditor {...defaultProps({ duration: 90 })} />);
      expect(screen.getAllByText("1:30").length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── IDs for label association ──────────────────────────────────────────────

  describe("switch id uniqueness via sectionId", () => {
    it("uses sectionId to build unique switch ids", () => {
      render(<SectionEditor {...defaultProps({ sectionId: "sec-42" })} />);
      // The normalize switch should have id="normalize-sec-42"
      const normalizeSwitch = document.getElementById("normalize-sec-42");
      expect(normalizeSwitch).not.toBeNull();
    });

    it("uses sectionId for the hesitations switch id", () => {
      render(<SectionEditor {...defaultProps({ sectionId: "sec-42" })} />);
      const hesitationsSwitch = document.getElementById("hesitations-sec-42");
      expect(hesitationsSwitch).not.toBeNull();
    });
  });
});
