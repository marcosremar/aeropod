import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { RecordingStudio } from "@/components/recording/RecordingStudio";

// ─── Browser API stubs ────────────────────────────────────────────────────────

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

class MockAnalyserNode {
  fftSize = 2048;
  get frequencyBinCount() {
    return this.fftSize / 2;
  }
  getByteTimeDomainData(_arr: Uint8Array) {}
}

class MockAudioContextInstance {
  state = "running";
  createMediaStreamSource() {
    return { connect: vi.fn() };
  }
  createAnalyser() {
    return new MockAnalyserNode();
  }
  close() {
    return Promise.resolve();
  }
}

let lastMediaRecorderInstance: MockMediaRecorder | null = null;

class MockMediaRecorder {
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onresume: (() => void) | null = null;
  state = "inactive";
  mimeType = "audio/webm";
  static isTypeSupported = vi.fn().mockReturnValue(true);

  constructor(_stream: MediaStream, _opts?: MediaRecorderOptions) {
    lastMediaRecorderInstance = this;
  }

  start(_timeslice?: number) {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["audio"], { type: "audio/webm" }) });
    this.onstop?.();
  }

  pause() {
    this.state = "paused";
  }

  resume() {
    this.state = "recording";
  }
}

const mockGetUserMedia = vi.fn();
const mockEnumerateDevices = vi.fn();
const mockCreateObjectURL = vi.fn().mockReturnValue("blob:mock-recording-url");

function makeMockStream() {
  return {
    getTracks: () => [{ stop: vi.fn() }],
  } as unknown as MediaStream;
}

function makeDevice(overrides: Partial<MediaDeviceInfo> = {}): MediaDeviceInfo {
  return {
    deviceId: "device-1",
    groupId: "group-1",
    kind: "audioinput",
    label: "Built-in Microphone",
    toJSON: () => ({}),
    ...overrides,
  } as MediaDeviceInfo;
}

beforeEach(() => {
  vi.clearAllMocks();
  lastMediaRecorderInstance = null;

  (global as any).MediaRecorder = MockMediaRecorder;
  (global as any).AudioContext = MockAudioContextInstance;
  (global as any).URL.createObjectURL = mockCreateObjectURL;
  (global as any).URL.revokeObjectURL = vi.fn();

  Object.defineProperty(global.navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: mockGetUserMedia,
      enumerateDevices: mockEnumerateDevices,
    },
  });

  mockGetUserMedia.mockResolvedValue(makeMockStream());
  mockEnumerateDevices.mockResolvedValue([makeDevice()]);

  // Stub canvas getContext so drawWaveform doesn't throw
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  }) as any;

  // Stub requestAnimationFrame / cancelAnimationFrame
  (global as any).requestAnimationFrame = vi.fn().mockReturnValue(1);
  (global as any).cancelAnimationFrame = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defaultProps(overrides = {}) {
  return {
    onRecordingComplete: vi.fn(),
    ...overrides,
  };
}

/** Drive from idle → recording → stopped */
async function startAndStop() {
  // Find start button (red mic button in idle state)
  const startBtn = screen.getByRole("button", { name: /mic/i });
  await act(async () => {
    fireEvent.click(startBtn);
  });
  await waitFor(() => expect(lastMediaRecorderInstance).not.toBeNull());

  // Click the Square/stop button
  const stopBtn = screen.getAllByRole("button").find(
    (b) => b.innerHTML.includes("square") || b.querySelector("svg[data-icon]") || b.className.includes("red")
  );
  const buttons = screen.getAllByRole("button");
  // After recording starts there are 2 controls: pause and stop
  await waitFor(() => expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(2));
  // Stop is the second button in recording state
  const allBtns = screen.getAllByRole("button");
  const stopButton = allBtns[allBtns.length - 1];
  await act(async () => {
    fireEvent.click(stopButton);
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("RecordingStudio", () => {
  // ── Idle state ───────────────────────────────────────────────────────────────

  it("renders the Gravacao header", () => {
    render(<RecordingStudio {...defaultProps()} />);
    expect(screen.getByText("Gravacao")).toBeInTheDocument();
  });

  it("shows the start recording mic button in idle state", () => {
    render(<RecordingStudio {...defaultProps()} />);
    // The idle start button uses role=button
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("shows the idle tip text in idle state", () => {
    render(<RecordingStudio {...defaultProps()} />);
    expect(
      screen.getByText(/Clique no botao para comecar a gravar/i)
    ).toBeInTheDocument();
  });

  it("shows 00:00 timer in idle state", () => {
    render(<RecordingStudio {...defaultProps()} />);
    expect(screen.getByText("00:00")).toBeInTheDocument();
  });

  it("renders a close button when onClose is provided", async () => {
    const onClose = vi.fn();
    render(<RecordingStudio {...defaultProps()} onClose={onClose} />);
    // The header has a ghost button with X icon; it's the first button
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn();
    render(<RecordingStudio {...defaultProps()} onClose={onClose} />);
    // The X close button is the first button in the header
    const buttons = screen.getAllByRole("button");
    // Last button is the start button; first button is close
    const closeBtn = buttons[0];
    await act(async () => {
      fireEvent.click(closeBtn);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render a close button when onClose is not provided", () => {
    render(<RecordingStudio {...defaultProps()} />);
    // Without onClose only the start button exists
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
  });

  it("applies custom className to the container", () => {
    const { container } = render(
      <RecordingStudio {...defaultProps()} className="my-custom-studio" />
    );
    expect(container.firstChild).toHaveClass("my-custom-studio");
  });

  // ── Device selector ──────────────────────────────────────────────────────────

  it("hides device selector when only one device is available", async () => {
    mockEnumerateDevices.mockResolvedValue([makeDevice()]);
    render(<RecordingStudio {...defaultProps()} />);
    await waitFor(() => expect(mockEnumerateDevices).toHaveBeenCalled());
    expect(screen.queryByLabelText("Microfone")).toBeNull();
  });

  it("shows device selector when multiple audio devices are available", async () => {
    mockEnumerateDevices.mockResolvedValue([
      makeDevice({ deviceId: "d1", label: "Mic 1" }),
      makeDevice({ deviceId: "d2", label: "Mic 2", kind: "audioinput" }),
    ]);
    render(<RecordingStudio {...defaultProps()} />);
    await waitFor(() =>
      expect(screen.getByText("Microfone")).toBeInTheDocument()
    );
  });

  it("requests microphone permission during device enumeration", async () => {
    render(<RecordingStudio {...defaultProps()} />);
    await waitFor(() => expect(mockGetUserMedia).toHaveBeenCalled());
    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
  });

  // ── Transition to recording ──────────────────────────────────────────────────

  it("calls getUserMedia with correct constraints when start is clicked", async () => {
    render(<RecordingStudio {...defaultProps()} />);
    await waitFor(() => expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true }));

    const buttons = screen.getAllByRole("button");
    const startBtn = buttons[buttons.length - 1];
    await act(async () => {
      fireEvent.click(startBtn);
    });

    await waitFor(() => expect(mockGetUserMedia).toHaveBeenCalledTimes(2));
    const [, secondCall] = (mockGetUserMedia as ReturnType<typeof vi.fn>).mock.calls;
    expect(secondCall[0].audio).toMatchObject({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  });

  it("transitions to recording state and shows pause/stop buttons", async () => {
    render(<RecordingStudio {...defaultProps()} />);
    await waitFor(() => expect(mockGetUserMedia).toHaveBeenCalled());

    const buttons = screen.getAllByRole("button");
    const startBtn = buttons[buttons.length - 1];
    await act(async () => {
      fireEvent.click(startBtn);
    });

    await waitFor(() => expect(lastMediaRecorderInstance).not.toBeNull());
    // In recording state there should be 2 control buttons (pause + stop)
    const recordingButtons = screen.getAllByRole("button");
    expect(recordingButtons.length).toBeGreaterThanOrEqual(2);
  });

  it("hides the idle tip text after recording starts", async () => {
    render(<RecordingStudio {...defaultProps()} />);
    await waitFor(() => expect(mockGetUserMedia).toHaveBeenCalled());

    const buttons = screen.getAllByRole("button");
    const startBtn = buttons[buttons.length - 1];
    await act(async () => {
      fireEvent.click(startBtn);
    });

    await waitFor(() => {
      expect(
        screen.queryByText(/Clique no botao para comecar a gravar/i)
      ).toBeNull();
    });
  });

  // ── Pause / resume ───────────────────────────────────────────────────────────

  it("transitions to paused state when pause is clicked", async () => {
    render(<RecordingStudio {...defaultProps()} />);
    await waitFor(() => expect(mockGetUserMedia).toHaveBeenCalled());

    // Start recording
    const buttons = screen.getAllByRole("button");
    const startBtn = buttons[buttons.length - 1];
    await act(async () => {
      fireEvent.click(startBtn);
    });
    await waitFor(() => expect(lastMediaRecorderInstance).not.toBeNull());

    // Click the first control button (pause)
    const recordingBtns = screen.getAllByRole("button");
    const pauseBtn = recordingBtns[recordingBtns.length - 2];
    await act(async () => {
      fireEvent.click(pauseBtn);
    });

    // In paused state, mediaRecorder.pause() should have been called
    expect(lastMediaRecorderInstance!.state).toBe("paused");
  });

  it("transitions back to recording when resume is clicked from paused", async () => {
    render(<RecordingStudio {...defaultProps()} />);
    await waitFor(() => expect(mockGetUserMedia).toHaveBeenCalled());

    // Start
    const buttons = screen.getAllByRole("button");
    await act(async () => {
      fireEvent.click(buttons[buttons.length - 1]);
    });
    await waitFor(() => expect(lastMediaRecorderInstance).not.toBeNull());

    // Pause
    const btnsAfterRecord = screen.getAllByRole("button");
    await act(async () => {
      fireEvent.click(btnsAfterRecord[btnsAfterRecord.length - 2]);
    });
    expect(lastMediaRecorderInstance!.state).toBe("paused");

    // Resume (first control button in paused state)
    const btnsAfterPause = screen.getAllByRole("button");
    await act(async () => {
      fireEvent.click(btnsAfterPause[btnsAfterPause.length - 2]);
    });
    expect(lastMediaRecorderInstance!.state).toBe("recording");
  });

  // ── Stop recording ───────────────────────────────────────────────────────────

  it("transitions to stopped state when stop is clicked", async () => {
    render(<RecordingStudio {...defaultProps()} />);
    await waitFor(() => expect(mockGetUserMedia).toHaveBeenCalled());

    // Start
    const buttons = screen.getAllByRole("button");
    await act(async () => {
      fireEvent.click(buttons[buttons.length - 1]);
    });
    await waitFor(() => expect(lastMediaRecorderInstance).not.toBeNull());

    // Stop (last control button)
    const btnsAfterRecord = screen.getAllByRole("button");
    await act(async () => {
      fireEvent.click(btnsAfterRecord[btnsAfterRecord.length - 1]);
    });

    // In stopped state with recordedBlob, should show confirm/reset and "pronta!" message
    await waitFor(() =>
      expect(screen.getByText(/Gravacao de/i)).toBeInTheDocument()
    );
  });

  it("shows 'pronta' message in stopped state", async () => {
    render(<RecordingStudio {...defaultProps()} />);
    await waitFor(() => expect(mockGetUserMedia).toHaveBeenCalled());

    const buttons = screen.getAllByRole("button");
    await act(async () => {
      fireEvent.click(buttons[buttons.length - 1]);
    });
    await waitFor(() => expect(lastMediaRecorderInstance).not.toBeNull());

    const btnsAfterRecord = screen.getAllByRole("button");
    await act(async () => {
      fireEvent.click(btnsAfterRecord[btnsAfterRecord.length - 1]);
    });

    await waitFor(() =>
      expect(screen.getByText(/pronta/i)).toBeInTheDocument()
    );
  });

  // ── Confirm recording ─────────────────────────────────────────────────────────

  it("calls onRecordingComplete with blob and duration when confirm is clicked", async () => {
    const onRecordingComplete = vi.fn();
    render(
      <RecordingStudio
        {...defaultProps({ onRecordingComplete })}
      />
    );
    await waitFor(() => expect(mockGetUserMedia).toHaveBeenCalled());

    // Start
    const buttons = screen.getAllByRole("button");
    await act(async () => {
      fireEvent.click(buttons[buttons.length - 1]);
    });
    await waitFor(() => expect(lastMediaRecorderInstance).not.toBeNull());

    // Stop
    const btnsAfterRecord = screen.getAllByRole("button");
    await act(async () => {
      fireEvent.click(btnsAfterRecord[btnsAfterRecord.length - 1]);
    });

    await waitFor(() => expect(screen.getByText(/pronta/i)).toBeInTheDocument());

    // Confirm (last button in stopped state = green check)
    const stoppedBtns = screen.getAllByRole("button");
    const confirmBtn = stoppedBtns[stoppedBtns.length - 1];
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(onRecordingComplete).toHaveBeenCalledTimes(1);
    const [blob, duration] = onRecordingComplete.mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(typeof duration).toBe("number");
  });

  // ── Reset recording ───────────────────────────────────────────────────────────

  it("returns to idle state when reset is clicked from stopped state", async () => {
    render(<RecordingStudio {...defaultProps()} />);
    await waitFor(() => expect(mockGetUserMedia).toHaveBeenCalled());

    // Start
    const buttons = screen.getAllByRole("button");
    await act(async () => {
      fireEvent.click(buttons[buttons.length - 1]);
    });
    await waitFor(() => expect(lastMediaRecorderInstance).not.toBeNull());

    // Stop
    const btnsAfterRecord = screen.getAllByRole("button");
    await act(async () => {
      fireEvent.click(btnsAfterRecord[btnsAfterRecord.length - 1]);
    });

    await waitFor(() => expect(screen.getByText(/pronta/i)).toBeInTheDocument());

    // Reset (first control button in stopped state = RefreshCw)
    const stoppedBtns = screen.getAllByRole("button");
    const resetBtn = stoppedBtns[stoppedBtns.length - 2];
    await act(async () => {
      fireEvent.click(resetBtn);
    });

    await waitFor(() =>
      expect(
        screen.getByText(/Clique no botao para comecar a gravar/i)
      ).toBeInTheDocument()
    );
  });

  it("resets timer to 00:00 after reset", async () => {
    render(<RecordingStudio {...defaultProps()} />);
    await waitFor(() => expect(mockGetUserMedia).toHaveBeenCalled());

    const buttons = screen.getAllByRole("button");
    await act(async () => {
      fireEvent.click(buttons[buttons.length - 1]);
    });
    await waitFor(() => expect(lastMediaRecorderInstance).not.toBeNull());

    const btnsAfterRecord = screen.getAllByRole("button");
    await act(async () => {
      fireEvent.click(btnsAfterRecord[btnsAfterRecord.length - 1]);
    });
    await waitFor(() => expect(screen.getByText(/pronta/i)).toBeInTheDocument());

    const stoppedBtns = screen.getAllByRole("button");
    await act(async () => {
      fireEvent.click(stoppedBtns[stoppedBtns.length - 2]);
    });

    await waitFor(() => expect(screen.getByText("00:00")).toBeInTheDocument());
  });

  // ── Error handling ────────────────────────────────────────────────────────────

  it("shows toast error when getUserMedia fails during device load", async () => {
    const { toast } = await import("sonner");
    mockGetUserMedia.mockRejectedValueOnce(new Error("Access denied"));
    render(<RecordingStudio {...defaultProps()} />);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Erro ao acessar microfone"));
  });

  it("shows toast error when getUserMedia fails during recording start", async () => {
    const { toast } = await import("sonner");
    // First call succeeds (device enumeration), second fails (start recording)
    mockGetUserMedia
      .mockResolvedValueOnce(makeMockStream())
      .mockRejectedValueOnce(new Error("Recording denied"));

    render(<RecordingStudio {...defaultProps()} />);
    await waitFor(() => expect(mockEnumerateDevices).toHaveBeenCalled());

    const buttons = screen.getAllByRole("button");
    const startBtn = buttons[buttons.length - 1];
    await act(async () => {
      fireEvent.click(startBtn);
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Erro ao iniciar gravacao")
    );
  });

  // ── formatDuration ────────────────────────────────────────────────────────────

  it("displays 00:00 for zero duration", () => {
    render(<RecordingStudio {...defaultProps()} />);
    expect(screen.getByText("00:00")).toBeInTheDocument();
  });
});
