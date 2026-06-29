import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { RerecordModal } from "@/components/editor/RerecordModal";
import type { Segment } from "@/lib/db/schema";

// ─── Stubs for browser media APIs ─────────────────────────────────────────────

// MediaRecorder stub — tracks calls and fires onstop when stop() is called
class MockMediaRecorder {
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  state = "inactive";

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    // Fire ondataavailable then onstop
    this.ondataavailable?.({ data: new Blob(["audio"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

// Minimal AudioContext stub
class MockAudioContext {
  createMediaStreamSource() {
    return { connect: vi.fn() };
  }
  createAnalyser() {
    return {
      fftSize: 0,
      frequencyBinCount: 0,
      getByteTimeDomainData: vi.fn(),
      connect: vi.fn(),
    };
  }
  close() {}
}

// Mock getUserMedia
const mockGetUserMedia = vi.fn();

function buildSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    id: "seg-1",
    projectId: "proj-1",
    startTime: 0,
    endTime: 10,
    text: "This is the original segment text.",
    speaker: null,
    speakerLabel: null,
    topicId: null,
    interestScore: null,
    clarityScore: null,
    topic: null,
    keyInsight: null,
    isSelected: false,
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

beforeEach(() => {
  vi.clearAllMocks();

  // Stub global media APIs
  (global as any).MediaRecorder = MockMediaRecorder;
  (global as any).AudioContext = MockAudioContext;
  (global as any).URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
  (global as any).URL.revokeObjectURL = vi.fn();

  Object.defineProperty(global.navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: mockGetUserMedia },
  });

  // Default: microphone access granted — returns a minimal MediaStream stub
  mockGetUserMedia.mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }],
  });

  // Stub HTMLMediaElement play/pause so the hidden <audio> doesn't throw
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    writable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("RerecordModal", () => {
  // ── Visibility ──────────────────────────────────────────────────────────────

  it("renders nothing when isOpen=false", () => {
    const { container } = render(
      <RerecordModal
        isOpen={false}
        segment={buildSegment()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when segment=null", () => {
    const { container } = render(
      <RerecordModal
        isOpen={true}
        segment={null}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the modal when isOpen=true and segment is provided", () => {
    render(
      <RerecordModal
        isOpen={true}
        segment={buildSegment()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText("Re-record Segment")).toBeInTheDocument();
  });

  // ── Content rendering ────────────────────────────────────────────────────────

  it("displays the segment's original text", () => {
    const segment = buildSegment({ text: "Hello world, this is a test." });
    render(
      <RerecordModal
        isOpen={true}
        segment={segment}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText("Hello world, this is a test.")).toBeInTheDocument();
  });

  it("shows the 'Original Text' label", () => {
    render(
      <RerecordModal
        isOpen={true}
        segment={buildSegment()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText("Original Text")).toBeInTheDocument();
  });

  it("shows Start Recording button in idle state", () => {
    render(
      <RerecordModal
        isOpen={true}
        segment={buildSegment()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /start recording/i })).toBeInTheDocument();
  });

  it("shows 00:00 timer initially", () => {
    render(
      <RerecordModal
        isOpen={true}
        segment={buildSegment()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText("00:00")).toBeInTheDocument();
  });

  // ── Error information rendering ──────────────────────────────────────────────

  it("shows 'Needs Re-record' fallback when segment has no specific errorType", () => {
    const segment = buildSegment({ errorType: null, errorDetail: null, analysis: null });
    render(
      <RerecordModal
        isOpen={true}
        segment={segment}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText("Needs Re-record")).toBeInTheDocument();
    expect(screen.getByText(/This segment needs to be re-recorded/i)).toBeInTheDocument();
  });

  it("shows factual error information when errorType=factual_error", () => {
    const segment = buildSegment({
      errorType: "factual_error",
      analysis: {
        factualErrorDetail: "Incorrect year mentioned.",
        rerecordSuggestion: "Correct the year and re-record.",
      },
    });
    render(
      <RerecordModal
        isOpen={true}
        segment={segment}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText("Factual Error")).toBeInTheDocument();
    expect(screen.getByText(/Incorrect year mentioned/i)).toBeInTheDocument();
    expect(screen.getByText(/Correct the year and re-record/i)).toBeInTheDocument();
  });

  it("shows contradiction error information when errorType=contradiction", () => {
    const segment = buildSegment({
      errorType: "contradiction",
      analysis: {
        contradictionDetail: "You said X then Y.",
        rerecordSuggestion: "Pick one and re-record.",
      },
    });
    render(
      <RerecordModal
        isOpen={true}
        segment={segment}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText("Contradiction")).toBeInTheDocument();
    expect(screen.getByText(/You said X then Y/i)).toBeInTheDocument();
  });

  it("shows confusing error information when errorType=confusing", () => {
    const segment = buildSegment({
      errorType: "confusing",
      analysis: {
        confusingDetail: "Hard to follow.",
        rerecordSuggestion: "Clarify the explanation.",
      },
    });
    render(
      <RerecordModal
        isOpen={true}
        segment={segment}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText("Confusing")).toBeInTheDocument();
    expect(screen.getByText(/Hard to follow/i)).toBeInTheDocument();
  });

  it("shows incomplete error information when errorType=incomplete", () => {
    const segment = buildSegment({
      errorType: "incomplete",
      analysis: {
        incompleteDetail: "Thought was cut off.",
        rerecordSuggestion: "Finish the thought.",
      },
    });
    render(
      <RerecordModal
        isOpen={true}
        segment={segment}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText("Incomplete")).toBeInTheDocument();
    expect(screen.getByText(/Thought was cut off/i)).toBeInTheDocument();
  });

  it("uses fallback error info for unknown errorType", () => {
    const segment = buildSegment({
      errorType: "unknown_type",
      errorDetail: "Something is wrong here.",
      analysis: { rerecordSuggestion: "Fix it and re-record." },
    });
    render(
      <RerecordModal
        isOpen={true}
        segment={segment}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    // Falls into default branch: shows errorDetail as issue
    expect(screen.getByText(/Something is wrong here/i)).toBeInTheDocument();
  });

  // ── Close / Cancel buttons ───────────────────────────────────────────────────

  it("calls onClose when X button is clicked", () => {
    const onClose = vi.fn();
    render(
      <RerecordModal
        isOpen={true}
        segment={buildSegment()}
        onClose={onClose}
        onConfirm={vi.fn()}
      />
    );
    // The X button is next to the title; it has an SVG but no text
    const buttons = screen.getAllByRole("button");
    // First button in the modal is the close (X) button
    const closeBtn = buttons.find((b) => b.className.includes("absolute"));
    closeBtn?.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Cancel button is clicked", () => {
    const onClose = vi.fn();
    render(
      <RerecordModal
        isOpen={true}
        segment={buildSegment()}
        onClose={onClose}
        onConfirm={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(
      <RerecordModal
        isOpen={true}
        segment={buildSegment()}
        onClose={onClose}
        onConfirm={vi.fn()}
      />
    );
    // Backdrop is the absolute-positioned div
    const backdrop = container.querySelector(".absolute.inset-0");
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── Confirm button state ─────────────────────────────────────────────────────

  it("Confirm button is disabled in idle state (no recording yet)", () => {
    render(
      <RerecordModal
        isOpen={true}
        segment={buildSegment()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    const confirmBtn = screen.getByRole("button", { name: /confirm & replace/i });
    expect(confirmBtn).toBeDisabled();
  });

  // ── Recording flow ───────────────────────────────────────────────────────────

  it("switches to recording state after Start Recording is clicked and microphone is granted", async () => {
    render(
      <RerecordModal
        isOpen={true}
        segment={buildSegment()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
      // Flush the getUserMedia promise
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: /stop recording/i })).toBeInTheDocument();
    expect(screen.getByText(/recording.../i)).toBeInTheDocument();
  });

  it("shows Stop Recording button while recording", async () => {
    render(
      <RerecordModal
        isOpen={true}
        segment={buildSegment()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: /stop recording/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start recording/i })).not.toBeInTheDocument();
  });

  it("shows Play and Record Again buttons after stopping recording", async () => {
    render(
      <RerecordModal
        isOpen={true}
        segment={buildSegment()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /record again/i })).toBeInTheDocument();
  });

  it("enables Confirm & Replace button after recording is stopped", async () => {
    render(
      <RerecordModal
        isOpen={true}
        segment={buildSegment()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));
      await Promise.resolve();
    });

    const confirmBtn = screen.getByRole("button", { name: /confirm & replace/i });
    expect(confirmBtn).not.toBeDisabled();
  });

  it("resets to idle state when Record Again is clicked", async () => {
    render(
      <RerecordModal
        isOpen={true}
        segment={buildSegment()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: /record again/i }));

    expect(screen.getByRole("button", { name: /start recording/i })).toBeInTheDocument();
    expect(screen.getByText("00:00")).toBeInTheDocument();
  });

  // ── Confirm submission ───────────────────────────────────────────────────────

  it("calls onConfirm with segmentId and blob when Confirm is clicked", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const segment = buildSegment({ id: "seg-abc" });

    render(
      <RerecordModal
        isOpen={true}
        segment={segment}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /confirm & replace/i }));
      await Promise.resolve();
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith("seg-abc", expect.any(Blob));
  });

  it("calls onClose after successful confirm", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <RerecordModal
        isOpen={true}
        segment={buildSegment()}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /confirm & replace/i }));
      await Promise.resolve();
    });

    expect(onClose).toHaveBeenCalled();
  });

  it("shows Saving... text while onConfirm is in progress", async () => {
    let resolveConfirm!: () => void;
    const onConfirm = vi.fn(
      () => new Promise<void>((resolve) => { resolveConfirm = resolve; })
    );

    render(
      <RerecordModal
        isOpen={true}
        segment={buildSegment()}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));
      await Promise.resolve();
    });

    // Start confirm — don't resolve yet
    fireEvent.click(screen.getByRole("button", { name: /confirm & replace/i }));

    await waitFor(() => {
      expect(screen.getByText("Saving...")).toBeInTheDocument();
    });

    // Resolve and clean up
    await act(async () => { resolveConfirm(); });
  });

  // ── getUserMedia denied ──────────────────────────────────────────────────────

  it("shows alert when getUserMedia is denied", async () => {
    mockGetUserMedia.mockRejectedValue(new Error("Permission denied"));
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    render(
      <RerecordModal
        isOpen={true}
        segment={buildSegment()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        expect.stringContaining("microphone")
      );
    });
  });
});
