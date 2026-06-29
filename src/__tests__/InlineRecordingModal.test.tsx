import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { InlineRecordingModal } from "@/components/recording/InlineRecordingModal";

// ─── Browser API stubs ─────────────────────────────────────────────────────────

let lastMediaRecorderInstance: MockMediaRecorder | null = null;

class MockMediaRecorder {
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  state = "inactive";
  mimeType = "audio/webm";
  static isTypeSupported = vi.fn().mockReturnValue(true);

  constructor() {
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
}

const mockGetUserMedia = vi.fn();
const mockCreateObjectURL = vi.fn().mockReturnValue("blob:mock-recording-url");
const mockRevokeObjectURL = vi.fn();

function buildDefaultStream() {
  return { getTracks: () => [{ stop: vi.fn() }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  lastMediaRecorderInstance = null;

  (global as any).MediaRecorder = MockMediaRecorder;
  (global as any).URL.createObjectURL = mockCreateObjectURL;
  (global as any).URL.revokeObjectURL = mockRevokeObjectURL;

  Object.defineProperty(global.navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: mockGetUserMedia },
  });

  mockGetUserMedia.mockResolvedValue(buildDefaultStream());

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defaultProps(overrides: Record<string, unknown> = {}) {
  return {
    isOpen: true,
    onClose: vi.fn(),
    sectionId: "section-abc",
    sectionName: "Introducao",
    targetDuration: 120,
    onRecordingComplete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function clickStartRecording() {
  const btn = screen.getByText("Iniciar Gravacao");
  await act(async () => { fireEvent.click(btn); });
}

async function clickStopRecording() {
  const btn = screen.getByText("Parar Gravacao");
  await act(async () => { fireEvent.click(btn); });
}

/** idle → recording → recorded */
async function recordAndStop() {
  await clickStartRecording();
  await waitFor(() => screen.getByText("Parar Gravacao"));
  await clickStopRecording();
  await waitFor(() => screen.getByText("Usar Gravacao"));
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("InlineRecordingModal", () => {
  // ── Rendering / idle state ────────────────────────────────────────────────────

  it("renders the dialog when isOpen is true", () => {
    render(<InlineRecordingModal {...defaultProps()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not render the dialog when isOpen is false", () => {
    render(<InlineRecordingModal {...defaultProps({ isOpen: false })} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the section name in the title", () => {
    render(<InlineRecordingModal {...defaultProps({ sectionName: "Encerramento" })} />);
    expect(screen.getByText(/Encerramento/)).toBeInTheDocument();
  });

  it("shows the target duration in M:SS format in the description", () => {
    render(<InlineRecordingModal {...defaultProps({ targetDuration: 90 })} />);
    const matches = screen.getAllByText(/1:30/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("shows the target label with the formatted time", () => {
    render(<InlineRecordingModal {...defaultProps({ targetDuration: 60 })} />);
    expect(screen.getByText(/Alvo:/)).toBeInTheDocument();
    expect(screen.getByText("1:00")).toBeInTheDocument();
  });

  it("shows Iniciar Gravacao button in idle state", () => {
    render(<InlineRecordingModal {...defaultProps()} />);
    expect(screen.getByText("Iniciar Gravacao")).toBeInTheDocument();
  });

  it("shows Cancelar button in idle state", () => {
    render(<InlineRecordingModal {...defaultProps()} />);
    expect(screen.getByText("Cancelar")).toBeInTheDocument();
  });

  it("does not show recording controls in idle state", () => {
    render(<InlineRecordingModal {...defaultProps()} />);
    expect(screen.queryByText("Parar Gravacao")).toBeNull();
    expect(screen.queryByText("Usar Gravacao")).toBeNull();
  });

  // ── Example text ──────────────────────────────────────────────────────────────

  it("renders exampleText when provided", () => {
    render(
      <InlineRecordingModal
        {...defaultProps({ exampleText: "Ola e bem-vindos ao podcast!" })}
      />
    );
    expect(screen.getByText(/Ola e bem-vindos ao podcast!/)).toBeInTheDocument();
  });

  it("does not render example text block when exampleText is omitted", () => {
    render(<InlineRecordingModal {...defaultProps()} />);
    expect(screen.queryByText("Exemplo do que dizer:")).toBeNull();
  });

  // ── Transition: idle → recording ──────────────────────────────────────────────

  it("requests microphone access when start button is clicked", async () => {
    render(<InlineRecordingModal {...defaultProps()} />);
    await clickStartRecording();
    expect(mockGetUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  });

  it("shows Parar Gravacao button after recording starts", async () => {
    render(<InlineRecordingModal {...defaultProps()} />);
    await clickStartRecording();
    await waitFor(() => expect(screen.getByText("Parar Gravacao")).toBeInTheDocument());
  });

  it("hides the Iniciar Gravacao button while recording", async () => {
    render(<InlineRecordingModal {...defaultProps()} />);
    await clickStartRecording();
    await waitFor(() => expect(screen.queryByText("Iniciar Gravacao")).toBeNull());
  });

  it("shows 0:00 timer when recording starts", async () => {
    render(<InlineRecordingModal {...defaultProps()} />);
    await clickStartRecording();
    await waitFor(() => expect(screen.getByText("0:00")).toBeInTheDocument());
  });

  // ── Transition: recording → recorded ─────────────────────────────────────────

  it("shows Usar Gravacao button after stopping", async () => {
    render(<InlineRecordingModal {...defaultProps()} />);
    await recordAndStop();
    expect(screen.getByText("Usar Gravacao")).toBeInTheDocument();
  });

  it("shows Regravar button after stopping", async () => {
    render(<InlineRecordingModal {...defaultProps()} />);
    await recordAndStop();
    expect(screen.getByText("Regravar")).toBeInTheDocument();
  });

  it("shows Ouvir button after stopping", async () => {
    render(<InlineRecordingModal {...defaultProps()} />);
    await recordAndStop();
    expect(screen.getByText("Ouvir")).toBeInTheDocument();
  });

  it("calls URL.createObjectURL after stopping", async () => {
    render(<InlineRecordingModal {...defaultProps()} />);
    await recordAndStop();
    expect(mockCreateObjectURL).toHaveBeenCalled();
  });

  // ── Regravar (reset) ──────────────────────────────────────────────────────────

  it("returns to idle state when Regravar is clicked", async () => {
    render(<InlineRecordingModal {...defaultProps()} />);
    await recordAndStop();
    await act(async () => { fireEvent.click(screen.getByText("Regravar")); });
    await waitFor(() => expect(screen.getByText("Iniciar Gravacao")).toBeInTheDocument());
  });

  it("resets the timer to 0:00 after Regravar", async () => {
    render(<InlineRecordingModal {...defaultProps()} />);
    await recordAndStop();
    await act(async () => { fireEvent.click(screen.getByText("Regravar")); });
    await waitFor(() => expect(screen.getByText("0:00")).toBeInTheDocument());
  });

  // ── Upload (Usar Gravacao) ─────────────────────────────────────────────────────

  it("calls onRecordingComplete with the blob and duration on upload", async () => {
    const onRecordingComplete = vi.fn().mockResolvedValue(undefined);
    render(<InlineRecordingModal {...defaultProps({ onRecordingComplete })} />);
    await recordAndStop();
    await act(async () => { fireEvent.click(screen.getByText("Usar Gravacao")); });
    await waitFor(() => expect(onRecordingComplete).toHaveBeenCalledOnce());
    const [blob, duration] = onRecordingComplete.mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(typeof duration).toBe("number");
  });

  it("shows uploading state while the upload is pending", async () => {
    const onRecordingComplete = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<InlineRecordingModal {...defaultProps({ onRecordingComplete })} />);
    await recordAndStop();
    await act(async () => { fireEvent.click(screen.getByText("Usar Gravacao")); });
    await waitFor(() => expect(screen.getByText("Enviando...")).toBeInTheDocument());
  });

  it("calls onClose after a successful upload", async () => {
    const onClose = vi.fn();
    render(<InlineRecordingModal {...defaultProps({ onClose })} />);
    await recordAndStop();
    await act(async () => { fireEvent.click(screen.getByText("Usar Gravacao")); });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("shows an error and returns to recorded state on upload failure", async () => {
    const onRecordingComplete = vi
      .fn()
      .mockRejectedValue(new Error("Upload falhou"));
    render(<InlineRecordingModal {...defaultProps({ onRecordingComplete })} />);
    await recordAndStop();
    await act(async () => { fireEvent.click(screen.getByText("Usar Gravacao")); });
    await waitFor(() =>
      expect(screen.getByText(/Erro ao enviar gravacao/)).toBeInTheDocument()
    );
    // Button should be available again
    expect(screen.getByText("Usar Gravacao")).toBeInTheDocument();
  });

  // ── Error handling: microphone permission ─────────────────────────────────────

  it("shows permission-denied error for NotAllowedError", async () => {
    const err = Object.assign(new Error("Denied"), { name: "NotAllowedError" });
    mockGetUserMedia.mockRejectedValueOnce(err);
    render(<InlineRecordingModal {...defaultProps()} />);
    await clickStartRecording();
    await waitFor(() =>
      expect(
        screen.getByText(/Permissao do microfone negada/i)
      ).toBeInTheDocument()
    );
  });

  it("shows permission-denied error for PermissionDeniedError", async () => {
    const err = Object.assign(new Error("Denied"), { name: "PermissionDeniedError" });
    mockGetUserMedia.mockRejectedValueOnce(err);
    render(<InlineRecordingModal {...defaultProps()} />);
    await clickStartRecording();
    await waitFor(() =>
      expect(
        screen.getByText(/Permissao do microfone negada/i)
      ).toBeInTheDocument()
    );
  });

  it("shows no-microphone error for NotFoundError", async () => {
    const err = Object.assign(new Error("No device"), { name: "NotFoundError" });
    mockGetUserMedia.mockRejectedValueOnce(err);
    render(<InlineRecordingModal {...defaultProps()} />);
    await clickStartRecording();
    await waitFor(() =>
      expect(
        screen.getByText(/Nenhum microfone encontrado/i)
      ).toBeInTheDocument()
    );
  });

  it("shows no-microphone error for DevicesNotFoundError", async () => {
    const err = Object.assign(new Error("No device"), { name: "DevicesNotFoundError" });
    mockGetUserMedia.mockRejectedValueOnce(err);
    render(<InlineRecordingModal {...defaultProps()} />);
    await clickStartRecording();
    await waitFor(() =>
      expect(
        screen.getByText(/Nenhum microfone encontrado/i)
      ).toBeInTheDocument()
    );
  });

  it("shows a generic error message for unknown errors", async () => {
    const err = Object.assign(new Error("Something broke"), { name: "UnknownError" });
    mockGetUserMedia.mockRejectedValueOnce(err);
    render(<InlineRecordingModal {...defaultProps()} />);
    await clickStartRecording();
    await waitFor(() =>
      expect(screen.getByText(/Erro ao iniciar gravacao/i)).toBeInTheDocument()
    );
  });

  it("returns to idle state after a permission error", async () => {
    const err = Object.assign(new Error("Denied"), { name: "NotAllowedError" });
    mockGetUserMedia.mockRejectedValueOnce(err);
    render(<InlineRecordingModal {...defaultProps()} />);
    await clickStartRecording();
    await waitFor(() =>
      expect(screen.getByText("Iniciar Gravacao")).toBeInTheDocument()
    );
  });

  // ── Duration progress UI ──────────────────────────────────────────────────────

  it("shows the progress bar while recording", async () => {
    render(<InlineRecordingModal {...defaultProps()} />);
    await clickStartRecording();
    await waitFor(() =>
      expect(screen.getByText("Progresso para duracao alvo")).toBeInTheDocument()
    );
  });

  it("shows the progress bar in the recorded state", async () => {
    render(<InlineRecordingModal {...defaultProps()} />);
    await recordAndStop();
    expect(screen.getByText("Progresso para duracao alvo")).toBeInTheDocument();
  });

  it("shows 0% progress initially", async () => {
    render(<InlineRecordingModal {...defaultProps({ targetDuration: 120 })} />);
    await clickStartRecording();
    await waitFor(() => expect(screen.getByText("0%")).toBeInTheDocument());
  });

  // ── Cancelar button ───────────────────────────────────────────────────────────

  it("calls onClose when Cancelar is clicked in idle state", () => {
    const onClose = vi.fn();
    render(<InlineRecordingModal {...defaultProps({ onClose })} />);
    fireEvent.click(screen.getByText("Cancelar"));
    expect(onClose).toHaveBeenCalled();
  });

  // ── formatTime (via UI) ───────────────────────────────────────────────────────

  it("formats target duration of 0 seconds as 0:00", () => {
    render(<InlineRecordingModal {...defaultProps({ targetDuration: 0 })} />);
    const zeros = screen.getAllByText("0:00");
    expect(zeros.length).toBeGreaterThanOrEqual(1);
  });

  it("formats target duration of 3661 seconds as 61:01", () => {
    render(<InlineRecordingModal {...defaultProps({ targetDuration: 3661 })} />);
    expect(screen.getByText("61:01")).toBeInTheDocument();
  });

  // ── Playback ──────────────────────────────────────────────────────────────────

  it("shows Pausar button after clicking Ouvir", async () => {
    render(<InlineRecordingModal {...defaultProps()} />);
    await recordAndStop();
    await act(async () => { fireEvent.click(screen.getByText("Ouvir")); });
    await waitFor(() => expect(screen.getByText("Pausar")).toBeInTheDocument());
  });

  it("returns to recorded state (Ouvir visible) after clicking Pausar", async () => {
    render(<InlineRecordingModal {...defaultProps()} />);
    await recordAndStop();
    await act(async () => { fireEvent.click(screen.getByText("Ouvir")); });
    await waitFor(() => screen.getByText("Pausar"));
    await act(async () => { fireEvent.click(screen.getByText("Pausar")); });
    await waitFor(() => expect(screen.getByText("Ouvir")).toBeInTheDocument());
  });

  it("shows Usar Gravacao in playing state", async () => {
    render(<InlineRecordingModal {...defaultProps()} />);
    await recordAndStop();
    await act(async () => { fireEvent.click(screen.getByText("Ouvir")); });
    await waitFor(() => expect(screen.getByText("Usar Gravacao")).toBeInTheDocument());
  });

  // ── Open/close lifecycle ──────────────────────────────────────────────────────

  it("resets to idle when isOpen transitions from false to true", async () => {
    const { rerender } = render(
      <InlineRecordingModal {...defaultProps({ isOpen: false })} />
    );
    rerender(<InlineRecordingModal {...defaultProps({ isOpen: true })} />);
    await waitFor(() =>
      expect(screen.getByText("Iniciar Gravacao")).toBeInTheDocument()
    );
  });
});
