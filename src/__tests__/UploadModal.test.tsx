import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";
import { UploadModal } from "@/components/dashboard/UploadModal";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from "sonner";

// Bypass Radix UI portal/focus-management in jsdom
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
  }) =>
    open
      ? React.createElement("div", { "data-testid": "dialog" }, children)
      : null,
  DialogContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogHeader: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) =>
    React.createElement("h2", null, children),
  DialogDescription: ({ children }: { children: React.ReactNode }) =>
    React.createElement("p", null, children),
  DialogFooter: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function defaultProps(
  overrides: Partial<{
    isOpen: boolean;
    onClose: () => void;
    onUploadSuccess: () => void;
  }> = {}
) {
  return {
    isOpen: true,
    onClose: vi.fn(),
    onUploadSuccess: vi.fn(),
    ...overrides,
  };
}

/** Creates a plain File-like object whose `size` can be freely set. */
function makeFile(
  name = "episode.mp3",
  type = "audio/mpeg",
  size = 10 * 1024 * 1024
): { name: string; type: string; size: number } {
  return { name, type, size };
}

function getFileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]')!;
}

function selectFile(file: { name: string; type: string; size: number }) {
  fireEvent.change(getFileInput(), { target: { files: [file] } });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("UploadModal", () => {
  // ── Rendering ───────────────────────────────────────────────────────────────

  describe("rendering", () => {
    it("renders the dialog when isOpen is true", () => {
      render(<UploadModal {...defaultProps()} />);
      expect(screen.getByTestId("dialog")).toBeInTheDocument();
    });

    it("does not render the dialog when isOpen is false", () => {
      render(<UploadModal {...defaultProps({ isOpen: false })} />);
      expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
    });

    it("shows the dialog title 'Novo Projeto'", () => {
      render(<UploadModal {...defaultProps()} />);
      expect(screen.getByText("Novo Projeto")).toBeInTheDocument();
    });

    it("shows the dialog description", () => {
      render(<UploadModal {...defaultProps()} />);
      expect(
        screen.getByText(/Envie seu arquivo de audio/i)
      ).toBeInTheDocument();
    });

    it("shows the drag-and-drop area with instructions", () => {
      render(<UploadModal {...defaultProps()} />);
      expect(
        screen.getByText(/Arraste e solte seu arquivo aqui/i)
      ).toBeInTheDocument();
    });

    it("shows the 'Procurar Arquivos' browse button", () => {
      render(<UploadModal {...defaultProps()} />);
      expect(
        screen.getByRole("button", { name: /Procurar Arquivos/i })
      ).toBeInTheDocument();
    });

    it("shows the title input field with placeholder", () => {
      render(<UploadModal {...defaultProps()} />);
      expect(screen.getByPlaceholderText(/Digite o titulo/i)).toBeInTheDocument();
    });

    it("shows all three language buttons", () => {
      render(<UploadModal {...defaultProps()} />);
      expect(screen.getByText("Portugues")).toBeInTheDocument();
      expect(screen.getByText("English")).toBeInTheDocument();
      expect(screen.getByText("Espanol")).toBeInTheDocument();
    });

    it("shows the 'Cancelar' and 'Criar Projeto' footer buttons", () => {
      render(<UploadModal {...defaultProps()} />);
      expect(
        screen.getByRole("button", { name: /Cancelar/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Criar Projeto/i })
      ).toBeInTheDocument();
    });

    it("shows the accepted file types hint", () => {
      render(<UploadModal {...defaultProps()} />);
      expect(screen.getByText(/MP3, WAV ou M4A/i)).toBeInTheDocument();
    });
  });

  // ── Initial state ────────────────────────────────────────────────────────────

  describe("initial state", () => {
    it("disables 'Criar Projeto' when no file is selected", () => {
      render(<UploadModal {...defaultProps()} />);
      expect(
        screen.getByRole("button", { name: /Criar Projeto/i })
      ).toBeDisabled();
    });

    it("'Cancelar' button is enabled when not uploading", () => {
      render(<UploadModal {...defaultProps()} />);
      expect(
        screen.getByRole("button", { name: /Cancelar/i })
      ).not.toBeDisabled();
    });

    it("Portuguese is selected by default", () => {
      render(<UploadModal {...defaultProps()} />);
      const ptButton = screen.getByText("Portugues").closest("button")!;
      expect(ptButton.className).toContain("emerald");
    });

    it("English and Espanol are not selected by default", () => {
      render(<UploadModal {...defaultProps()} />);
      const enButton = screen.getByText("English").closest("button")!;
      const esButton = screen.getByText("Espanol").closest("button")!;
      expect(enButton.className).not.toContain("emerald");
      expect(esButton.className).not.toContain("emerald");
    });
  });

  // ── Language selection ────────────────────────────────────────────────────────

  describe("language selection", () => {
    it("clicking 'English' selects it and deselects 'Portugues'", () => {
      render(<UploadModal {...defaultProps()} />);
      const enButton = screen.getByText("English").closest("button")!;
      const ptButton = screen.getByText("Portugues").closest("button")!;

      fireEvent.click(enButton);

      expect(enButton.className).toContain("emerald");
      expect(ptButton.className).not.toContain("emerald");
    });

    it("clicking 'Espanol' selects it", () => {
      render(<UploadModal {...defaultProps()} />);
      const esButton = screen.getByText("Espanol").closest("button")!;

      fireEvent.click(esButton);

      expect(esButton.className).toContain("emerald");
    });

    it("can switch back to Portugues after selecting another language", () => {
      render(<UploadModal {...defaultProps()} />);
      const ptButton = screen.getByText("Portugues").closest("button")!;
      const enButton = screen.getByText("English").closest("button")!;

      fireEvent.click(enButton);
      fireEvent.click(ptButton);

      expect(ptButton.className).toContain("emerald");
      expect(enButton.className).not.toContain("emerald");
    });
  });

  // ── File validation ──────────────────────────────────────────────────────────

  describe("file validation", () => {
    it("shows an error for an invalid file type (video/mp4)", () => {
      render(<UploadModal {...defaultProps()} />);
      selectFile(makeFile("clip.mp4", "video/mp4"));
      expect(
        screen.getByText(/Tipo de arquivo invalido/i)
      ).toBeInTheDocument();
    });

    it("shows an error when the file exceeds 500 MB", () => {
      render(<UploadModal {...defaultProps()} />);
      selectFile(makeFile("huge.mp3", "audio/mpeg", 501 * 1024 * 1024));
      expect(
        screen.getByText(/Arquivo muito grande/i)
      ).toBeInTheDocument();
    });

    it("accepts audio/mpeg (MP3) without showing an error", () => {
      render(<UploadModal {...defaultProps()} />);
      selectFile(makeFile("ep.mp3", "audio/mpeg"));
      expect(screen.queryByText(/Tipo de arquivo invalido/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Arquivo muito grande/i)).not.toBeInTheDocument();
    });

    it("accepts audio/wav (WAV) without showing an error", () => {
      render(<UploadModal {...defaultProps()} />);
      selectFile(makeFile("ep.wav", "audio/wav"));
      expect(screen.queryByText(/Tipo de arquivo invalido/i)).not.toBeInTheDocument();
    });

    it("accepts audio/x-wav (WAV alternative MIME) without showing an error", () => {
      render(<UploadModal {...defaultProps()} />);
      selectFile(makeFile("ep.wav", "audio/x-wav"));
      expect(screen.queryByText(/Tipo de arquivo invalido/i)).not.toBeInTheDocument();
    });

    it("accepts audio/x-m4a (M4A) without showing an error", () => {
      render(<UploadModal {...defaultProps()} />);
      selectFile(makeFile("ep.m4a", "audio/x-m4a"));
      expect(screen.queryByText(/Tipo de arquivo invalido/i)).not.toBeInTheDocument();
    });
  });

  // ── File selection behaviour ─────────────────────────────────────────────────

  describe("file selection", () => {
    it("shows the file name after a valid file is selected", () => {
      render(<UploadModal {...defaultProps()} />);
      selectFile(makeFile("my-episode.mp3"));
      expect(screen.getByText("my-episode.mp3")).toBeInTheDocument();
    });

    it("auto-fills the title with the file name (without extension)", () => {
      render(<UploadModal {...defaultProps()} />);
      selectFile(makeFile("best-podcast-ever.mp3"));
      expect(
        (screen.getByPlaceholderText(/Digite o titulo/i) as HTMLInputElement).value
      ).toBe("best-podcast-ever");
    });

    it("does not overwrite a title the user already typed", () => {
      render(<UploadModal {...defaultProps()} />);
      fireEvent.change(screen.getByPlaceholderText(/Digite o titulo/i), {
        target: { value: "Custom Title" },
      });
      selectFile(makeFile("episode.mp3"));
      expect(
        (screen.getByPlaceholderText(/Digite o titulo/i) as HTMLInputElement).value
      ).toBe("Custom Title");
    });

    it("enables 'Criar Projeto' once a file and title are present", () => {
      render(<UploadModal {...defaultProps()} />);
      selectFile(makeFile("ep.mp3"));
      // title is auto-filled from filename
      expect(
        screen.getByRole("button", { name: /Criar Projeto/i })
      ).not.toBeDisabled();
    });

    it("keeps 'Criar Projeto' disabled when file is invalid type", () => {
      render(<UploadModal {...defaultProps()} />);
      selectFile(makeFile("clip.mp4", "video/mp4"));
      expect(
        screen.getByRole("button", { name: /Criar Projeto/i })
      ).toBeDisabled();
    });
  });

  // ── Form submission — validation ─────────────────────────────────────────────

  describe("form submission — validation", () => {
    it("submit button is disabled with no file", () => {
      render(<UploadModal {...defaultProps()} />);
      expect(
        screen.getByRole("button", { name: /Criar Projeto/i })
      ).toBeDisabled();
    });

    it("disables submit when file is selected but title is cleared", () => {
      render(<UploadModal {...defaultProps()} />);
      selectFile(makeFile("ep.mp3"));
      fireEvent.change(screen.getByPlaceholderText(/Digite o titulo/i), {
        target: { value: "" },
      });
      expect(
        screen.getByRole("button", { name: /Criar Projeto/i })
      ).toBeDisabled();
    });
  });

  // ── Upload flow — success ────────────────────────────────────────────────────

  describe("upload flow — success", () => {
    function setupSuccessfulFetch(projectId = "proj-42") {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ projectId }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        } as Response);
    }

    async function fillAndSubmit() {
      selectFile(makeFile());
      fireEvent.change(screen.getByPlaceholderText(/Digite o titulo/i), {
        target: { value: "My Episode" },
      });
      await act(async () => {
        fireEvent.submit(document.querySelector("form")!);
      });
    }

    it("calls POST /api/upload with a FormData body on submit", async () => {
      setupSuccessfulFetch();
      render(<UploadModal {...defaultProps()} />);
      await fillAndSubmit();

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/upload",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("also calls POST /api/process/:id after a successful upload", async () => {
      setupSuccessfulFetch("proj-42");
      render(<UploadModal {...defaultProps()} />);
      await fillAndSubmit();

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/process/proj-42",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("shows a success toast on successful upload", async () => {
      setupSuccessfulFetch();
      render(<UploadModal {...defaultProps()} />);
      await fillAndSubmit();

      expect(toast.success).toHaveBeenCalledWith(
        "Upload concluido!",
        expect.any(Object)
      );
    });

    it("calls onUploadSuccess and onClose when the 1-second success timeout fires", async () => {
      setupSuccessfulFetch("p99");
      const props = defaultProps();
      render(<UploadModal {...props} />);

      selectFile(makeFile());
      fireEvent.change(screen.getByPlaceholderText(/Digite o titulo/i), {
        target: { value: "Ep" },
      });

      // Capture only the component's setTimeout so RTL's own timers are unaffected.
      let capturedFn: (() => void) | null = null;
      vi.spyOn(global, "setTimeout").mockImplementationOnce(
        (fn: TimerHandler) => {
          capturedFn = fn as () => void;
          return 1 as unknown as ReturnType<typeof setTimeout>;
        }
      );

      // act drains all microtasks, so both fetch calls complete and
      // the component's setTimeout is captured before act returns.
      await act(async () => {
        fireEvent.submit(document.querySelector("form")!);
      });

      expect(capturedFn).not.toBeNull();

      await act(async () => {
        capturedFn!();
      });

      expect(props.onUploadSuccess).toHaveBeenCalledTimes(1);
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it("disables the Cancel button while the upload fetch is in-flight", async () => {
      // Keep the fetch pending indefinitely so isUploading stays true.
      mockFetch.mockReturnValueOnce(new Promise(() => {}));

      render(<UploadModal {...defaultProps()} />);
      selectFile(makeFile());
      fireEvent.change(screen.getByPlaceholderText(/Digite o titulo/i), {
        target: { value: "Ep" },
      });

      // await act flushes the synchronous part of handleSubmit (setIsUploading=true)
      // before the component suspends on the pending fetch Promise.
      await act(async () => {
        fireEvent.submit(document.querySelector("form")!);
      });

      expect(
        screen.getByRole("button", { name: /Cancelar/i })
      ).toBeDisabled();
    });

    it("shows 'Enviando...' text on the submit button while in-flight", async () => {
      // Keep the fetch pending indefinitely so isUploading stays true.
      mockFetch.mockReturnValueOnce(new Promise(() => {}));

      render(<UploadModal {...defaultProps()} />);
      selectFile(makeFile());
      fireEvent.change(screen.getByPlaceholderText(/Digite o titulo/i), {
        target: { value: "Ep" },
      });

      await act(async () => {
        fireEvent.submit(document.querySelector("form")!);
      });

      expect(screen.getByText("Enviando...")).toBeInTheDocument();
    });
  });

  // ── Upload flow — failure ────────────────────────────────────────────────────

  describe("upload flow — failure", () => {
    async function fillAndSubmitWithFailure() {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "server error" }),
      } as Response);

      selectFile(makeFile());
      fireEvent.change(screen.getByPlaceholderText(/Digite o titulo/i), {
        target: { value: "Ep" },
      });

      await act(async () => {
        fireEvent.submit(document.querySelector("form")!);
      });
    }

    it("shows an error message when the upload fetch fails", async () => {
      render(<UploadModal {...defaultProps()} />);
      await fillAndSubmitWithFailure();

      expect(screen.getByText(/Falha ao fazer upload/i)).toBeInTheDocument();
    });

    it("fires an error toast when the upload fails", async () => {
      render(<UploadModal {...defaultProps()} />);
      await fillAndSubmitWithFailure();

      expect(toast.error).toHaveBeenCalledWith(
        "Erro no upload",
        expect.any(Object)
      );
    });

    it("re-enables the submit button after an upload failure", async () => {
      render(<UploadModal {...defaultProps()} />);
      await fillAndSubmitWithFailure();

      expect(
        screen.getByRole("button", { name: /Criar Projeto/i })
      ).not.toBeDisabled();
    });

    it("re-enables the Cancel button after an upload failure", async () => {
      render(<UploadModal {...defaultProps()} />);
      await fillAndSubmitWithFailure();

      expect(
        screen.getByRole("button", { name: /Cancelar/i })
      ).not.toBeDisabled();
    });
  });

  // ── Close behaviour ──────────────────────────────────────────────────────────

  describe("close behaviour", () => {
    it("calls onClose when Cancel is clicked while not uploading", () => {
      const props = defaultProps();
      render(<UploadModal {...props} />);
      fireEvent.click(screen.getByRole("button", { name: /Cancelar/i }));
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });
  });
});
