import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { AudioRecorder } from "@/components/editor/AudioRecorder";

// ─── Browser API stubs ─────────────────────────────────────────────────────────

// Capture instances of Audio() so tests can fire synthetic events
let lastAudioInstance: any = null;

class MockAudio {
  src: string;
  onended: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onplay: (() => void) | null = null;

  constructor(src: string) {
    this.src = src;
    lastAudioInstance = this;
  }

  play() {
    // Immediately fire onplay to simulate browser behavior
    this.onplay?.();
    return Promise.resolve();
  }

  pause() {
    this.onpause?.();
  }
}

class MockMediaRecorder {
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  state = "inactive";
  static isTypeSupported = vi.fn().mockReturnValue(true);

  start(_timeslice?: number) {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["audio"], { type: "audio/webm;codecs=opus" }) });
    this.onstop?.();
  }
}

const mockGetUserMedia = vi.fn();
const mockCreateObjectURL = vi.fn().mockReturnValue("blob:mock-audio-url");
const mockRevokeObjectURL = vi.fn();

function buildDefaultStream() {
  return {
    getTracks: () => [{ stop: vi.fn() }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  lastAudioInstance = null;

  (global as any).MediaRecorder = MockMediaRecorder;
  (global as any).Audio = MockAudio;
  (global as any).URL.createObjectURL = mockCreateObjectURL;
  (global as any).URL.revokeObjectURL = mockRevokeObjectURL;

  Object.defineProperty(global.navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: mockGetUserMedia },
  });

  mockGetUserMedia.mockResolvedValue(buildDefaultStream());

  // Stub HTMLMediaElement so Audio(url) doesn't throw
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

// ─── Helpers ───────────────────────────────────────────────────────────────────

function defaultProps(overrides = {}) {
  return {
    projectId: "proj-1",
    ...overrides,
  };
}

/** Drive the recorder from idle → recording → recorded */
async function recordAndStop() {
  const micButton = screen.getByTitle("Gravar audio");
  await act(async () => {
    fireEvent.click(micButton);
  });
  await waitFor(() => screen.getByTitle("Parar gravacao"));
  const stopButton = screen.getByTitle("Parar gravacao");
  await act(async () => {
    fireEvent.click(stopButton);
  });
  await waitFor(() => screen.getByTitle("Adicionar ao projeto"));
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("AudioRecorder", () => {
  // ── Idle state ────────────────────────────────────────────────────────────────

  it("renders the mic button in idle state", () => {
    render(<AudioRecorder {...defaultProps()} />);
    expect(screen.getByTitle("Gravar audio")).toBeInTheDocument();
  });

  it("does not show stop/send/discard buttons in idle state", () => {
    render(<AudioRecorder {...defaultProps()} />);
    expect(screen.queryByTitle("Parar gravacao")).toBeNull();
    expect(screen.queryByTitle("Adicionar ao projeto")).toBeNull();
    expect(screen.queryByTitle("Descartar")).toBeNull();
  });

  it("applies custom className to wrapper", () => {
    const { container } = render(
      <AudioRecorder {...defaultProps()} className="my-custom-class" />
    );
    expect(container.firstChild).toHaveClass("my-custom-class");
  });

  // ── Transition to recording ────────────────────────────────────────────────────

  it("requests microphone access when mic button is clicked", async () => {
    render(<AudioRecorder {...defaultProps()} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle("Gravar audio"));
    });
    expect(mockGetUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  });

  it("shows stop button after recording starts", async () => {
    render(<AudioRecorder {...defaultProps()} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle("Gravar audio"));
    });
    await waitFor(() => expect(screen.getByTitle("Parar gravacao")).toBeInTheDocument());
  });

  it("hides the mic button once recording starts", async () => {
    render(<AudioRecorder {...defaultProps()} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle("Gravar audio"));
    });
    await waitFor(() => {
      expect(screen.queryByTitle("Gravar audio")).toBeNull();
    });
  });

  it("shows the recording timer with 0:00 when recording begins", async () => {
    render(<AudioRecorder {...defaultProps()} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle("Gravar audio"));
    });
    await waitFor(() => {
      expect(screen.getByText("0:00")).toBeInTheDocument();
    });
  });

  // ── Transition to recorded ─────────────────────────────────────────────────────

  it("shows send and discard buttons after stopping", async () => {
    render(<AudioRecorder {...defaultProps()} />);
    await recordAndStop();
    expect(screen.getByTitle("Adicionar ao projeto")).toBeInTheDocument();
    expect(screen.getByTitle("Descartar")).toBeInTheDocument();
  });

  it("shows play button after stopping", async () => {
    render(<AudioRecorder {...defaultProps()} />);
    await recordAndStop();
    expect(screen.getByTitle("Ouvir preview")).toBeInTheDocument();
  });

  it("calls URL.createObjectURL after recording stops", async () => {
    render(<AudioRecorder {...defaultProps()} />);
    await recordAndStop();
    expect(mockCreateObjectURL).toHaveBeenCalled();
  });

  // ── Discard ───────────────────────────────────────────────────────────────────

  it("returns to idle state when discard is clicked", async () => {
    render(<AudioRecorder {...defaultProps()} />);
    await recordAndStop();
    await act(async () => {
      fireEvent.click(screen.getByTitle("Descartar"));
    });
    await waitFor(() => expect(screen.getByTitle("Gravar audio")).toBeInTheDocument());
  });

  it("revokes the object URL when discarding", async () => {
    render(<AudioRecorder {...defaultProps()} />);
    await recordAndStop();
    await act(async () => {
      fireEvent.click(screen.getByTitle("Descartar"));
    });
    await waitFor(() => {
      expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-audio-url");
    });
  });

  // ── Play / Pause preview ──────────────────────────────────────────────────────

  it("shows pause button after clicking play", async () => {
    render(<AudioRecorder {...defaultProps()} />);
    await recordAndStop();
    await act(async () => {
      fireEvent.click(screen.getByTitle("Ouvir preview"));
    });
    // MockAudio.play() fires onplay() synchronously, which sets isPlaying=true
    await waitFor(() => expect(screen.getByTitle("Pausar")).toBeInTheDocument());
  });

  // ── Upload / send ─────────────────────────────────────────────────────────────

  it("shows uploading state after clicking send", async () => {
    // Keep the fetch pending so we can observe the uploading state
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})) as any;
    render(<AudioRecorder {...defaultProps()} />);
    await recordAndStop();
    await act(async () => {
      fireEvent.click(screen.getByTitle("Adicionar ao projeto"));
    });
    await waitFor(() =>
      expect(screen.getByText("Processando audio...")).toBeInTheDocument()
    );
  });

  it("calls onRecordingComplete and onSegmentCreated callbacks after successful upload", async () => {
    const onRecordingComplete = vi.fn();
    const onSegmentCreated = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ segmentId: "seg-new", text: "hello", duration: 5 }),
    }) as any;
    render(
      <AudioRecorder
        {...defaultProps()}
        onRecordingComplete={onRecordingComplete}
        onSegmentCreated={onSegmentCreated}
      />
    );
    await recordAndStop();
    await act(async () => {
      fireEvent.click(screen.getByTitle("Adicionar ao projeto"));
    });
    await waitFor(() => expect(onRecordingComplete).toHaveBeenCalled());
    expect(onSegmentCreated).toHaveBeenCalledWith("seg-new");
  });

  it("calls onRecordingProcessed instead of onRecordingComplete when provided", async () => {
    const onRecordingProcessed = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        segmentId: "seg-abc",
        text: "processed text",
        topic: "My Topic",
        duration: 10,
        audioUrl: "https://cdn.example.com/audio.webm",
      }),
    }) as any;
    render(
      <AudioRecorder {...defaultProps()} onRecordingProcessed={onRecordingProcessed} />
    );
    await recordAndStop();
    await act(async () => {
      fireEvent.click(screen.getByTitle("Adicionar ao projeto"));
    });
    await waitFor(() => expect(onRecordingProcessed).toHaveBeenCalled());
    const arg = onRecordingProcessed.mock.calls[0][0];
    expect(arg.segmentId).toBe("seg-abc");
    expect(arg.text).toBe("processed text");
    expect(arg.topic).toBe("My Topic");
  });

  it("passes targetSection as sectionId in the form data", async () => {
    let capturedBody: FormData | undefined;
    global.fetch = vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedBody = opts.body as FormData;
      return Promise.resolve({
        ok: true,
        json: async () => ({ segmentId: "s1", text: "", duration: 3 }),
      });
    }) as any;
    render(
      <AudioRecorder {...defaultProps()} targetSection="section-intro" />
    );
    await recordAndStop();
    await act(async () => {
      fireEvent.click(screen.getByTitle("Adicionar ao projeto"));
    });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect((capturedBody as FormData).get("sectionId")).toBe("section-intro");
  });

  it("shows error and returns to recorded state on upload failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Server error" }),
    }) as any;
    render(<AudioRecorder {...defaultProps()} />);
    await recordAndStop();
    await act(async () => {
      fireEvent.click(screen.getByTitle("Adicionar ao projeto"));
    });
    await waitFor(() => expect(screen.getByText("Server error")).toBeInTheDocument());
    // Should be back in recorded state (send button visible again)
    expect(screen.getByTitle("Adicionar ao projeto")).toBeInTheDocument();
  });

  it("includes projectId in the upload URL", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ segmentId: "s1", text: "", duration: 0 }),
    }) as any;
    render(<AudioRecorder projectId="my-project-id" />);
    await recordAndStop();
    await act(async () => {
      fireEvent.click(screen.getByTitle("Adicionar ao projeto"));
    });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("my-project-id");
    expect(url).toContain("/record");
  });

  // ── Microphone access denied ───────────────────────────────────────────────────

  it("shows permission-denied error when getUserMedia throws NotAllowedError", async () => {
    const err = Object.assign(new Error("Denied"), { name: "NotAllowedError" });
    mockGetUserMedia.mockRejectedValueOnce(err);
    render(<AudioRecorder {...defaultProps()} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle("Gravar audio"));
    });
    await waitFor(() =>
      expect(
        screen.getByText(/Permissao de microfone negada/i)
      ).toBeInTheDocument()
    );
  });

  it("shows generic microphone error for non-permission errors", async () => {
    mockGetUserMedia.mockRejectedValueOnce(new Error("Device not found"));
    render(<AudioRecorder {...defaultProps()} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle("Gravar audio"));
    });
    await waitFor(() =>
      expect(
        screen.getByText(/Erro ao acessar o microfone/i)
      ).toBeInTheDocument()
    );
  });

  it("dismisses the error when the close button is clicked", async () => {
    const err = Object.assign(new Error("Denied"), { name: "NotAllowedError" });
    mockGetUserMedia.mockRejectedValueOnce(err);
    render(<AudioRecorder {...defaultProps()} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle("Gravar audio"));
    });
    await waitFor(() => screen.getByText(/Permissao de microfone negada/i));
    // The error panel has an X close button
    const closeBtn = screen.getAllByRole("button").find(
      (btn) => btn.querySelector("svg") && !btn.title
    );
    if (closeBtn) {
      await act(async () => {
        fireEvent.click(closeBtn);
      });
      await waitFor(() =>
        expect(screen.queryByText(/Permissao de microfone negada/i)).toBeNull()
      );
    }
  });

  // ── formatTime helper (observable via UI) ─────────────────────────────────────

  it("formatTime: shows 0:00 for zero seconds", async () => {
    render(<AudioRecorder {...defaultProps()} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle("Gravar audio"));
    });
    await waitFor(() => expect(screen.getByText("0:00")).toBeInTheDocument());
  });

  it("shows 0:00 timer in recorded state", async () => {
    // duration stays 0 because we stop immediately (no interval fires)
    render(<AudioRecorder {...defaultProps()} />);
    await recordAndStop();
    // The recorded panel also shows the duration
    const timers = screen.getAllByText("0:00");
    expect(timers.length).toBeGreaterThan(0);
  });

  // ── AudioRecorderInline ────────────────────────────────────────────────────────

  it("AudioRecorderInline renders the same mic button", async () => {
    const { AudioRecorderInline } = await import("@/components/editor/AudioRecorder");
    render(<AudioRecorderInline projectId="proj-2" />);
    expect(screen.getByTitle("Gravar audio")).toBeInTheDocument();
  });
});
