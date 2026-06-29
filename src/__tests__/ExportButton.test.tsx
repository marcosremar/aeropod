import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ExportButton } from "@/components/editor/ExportButton";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from "sonner";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockOpen = vi.fn();
Object.defineProperty(window, "open", { value: mockOpen, writable: true });

// ─── setInterval interception ─────────────────────────────────────────────────
// The component uses setInterval to poll for export status. Rather than relying
// on fake timers (which conflict with RTL's waitFor), we intercept setInterval
// so tests can fire the poll callback on demand.

let capturedIntervalFn: (() => void) | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  capturedIntervalFn = null;

  vi.spyOn(global, "setInterval").mockImplementation((fn: TimerHandler) => {
    capturedIntervalFn = fn as () => void;
    return 999 as unknown as ReturnType<typeof setInterval>;
  });
  vi.spyOn(global, "clearInterval").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defaultProps(
  overrides: Partial<React.ComponentProps<typeof ExportButton>> = {}
) {
  return {
    projectId: "proj-1",
    selectedSegmentsCount: 3,
    ...overrides,
  };
}

/** Fire the captured poll callback and flush all pending React state updates. */
async function firePollTick() {
  await act(async () => {
    await capturedIntervalFn!();
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ExportButton", () => {
  // ── Idle state ──────────────────────────────────────────────────────────────

  describe("idle state", () => {
    it("renders Export Podcast button when selectedSegmentsCount > 0", () => {
      render(<ExportButton {...defaultProps()} />);
      expect(
        screen.getByRole("button", { name: /export podcast/i })
      ).toBeInTheDocument();
    });

    it("shows the segment count in the button label", () => {
      render(<ExportButton {...defaultProps({ selectedSegmentsCount: 5 })} />);
      expect(screen.getByText("(5 segments)")).toBeInTheDocument();
    });

    it("shows singular 'segment' when count is 1", () => {
      render(<ExportButton {...defaultProps({ selectedSegmentsCount: 1 })} />);
      expect(screen.getByText("(1 segment)")).toBeInTheDocument();
    });

    it("disables the button when selectedSegmentsCount is 0", () => {
      render(<ExportButton {...defaultProps({ selectedSegmentsCount: 0 })} />);
      expect(
        screen.getByRole("button", { name: /export podcast/i })
      ).toBeDisabled();
    });

    it("shows helper text when disabled due to zero segments", () => {
      render(<ExportButton {...defaultProps({ selectedSegmentsCount: 0 })} />);
      expect(
        screen.getByText(/select at least one segment to export/i)
      ).toBeInTheDocument();
    });

    it("disables the button when the disabled prop is true", () => {
      render(<ExportButton {...defaultProps({ disabled: true })} />);
      expect(
        screen.getByRole("button", { name: /export podcast/i })
      ).toBeDisabled();
    });
  });

  // ── Compact mode (static) ───────────────────────────────────────────────────

  describe("compact mode", () => {
    it("renders a single icon button without 'Export Podcast' text", () => {
      render(<ExportButton {...defaultProps({ compact: true })} />);
      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(1);
      expect(screen.queryByText(/export podcast/i)).toBeNull();
    });

    it("is disabled when selectedSegmentsCount is 0", () => {
      render(
        <ExportButton
          {...defaultProps({ compact: true, selectedSegmentsCount: 0 })}
        />
      );
      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("is enabled when selectedSegmentsCount > 0", () => {
      render(<ExportButton {...defaultProps({ compact: true })} />);
      expect(screen.getByRole("button")).not.toBeDisabled();
    });
  });

  // ── Export flow — success ───────────────────────────────────────────────────

  describe("export flow — success", () => {
    it("calls POST /api/export/[projectId] on button click", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ jobId: "job-1" }),
      } as Response);

      render(<ExportButton {...defaultProps()} />);
      fireEvent.click(screen.getByRole("button", { name: /export podcast/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/export/proj-1", {
          method: "POST",
        });
      });
    });

    it("shows processing state after starting export", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ jobId: "job-1" }),
      } as Response);

      render(<ExportButton {...defaultProps()} />);
      fireEvent.click(screen.getByRole("button", { name: /export podcast/i }));

      await waitFor(() => {
        expect(screen.getByText(/processing/i)).toBeInTheDocument();
      });
    });

    it("transitions to ready state when poll returns 'completed'", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ jobId: "job-1" }),
        } as Response)
        .mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              status: "completed",
              downloadUrl: "https://cdn.example.com/export.mp3",
            }),
        } as Response);

      render(<ExportButton {...defaultProps()} />);
      fireEvent.click(screen.getByRole("button", { name: /export podcast/i }));

      // Wait for the POST to resolve and setInterval to be registered
      await waitFor(() => expect(capturedIntervalFn).not.toBeNull());

      // Simulate one poll tick
      await firePollTick();

      await waitFor(() => {
        expect(screen.getByText(/export complete/i)).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: /download/i })
        ).toBeInTheDocument();
      });
    });

    it("fires a success toast when export completes", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ jobId: "job-1" }),
        } as Response)
        .mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              status: "completed",
              downloadUrl: "https://cdn.example.com/export.mp3",
            }),
        } as Response);

      render(<ExportButton {...defaultProps()} />);
      fireEvent.click(screen.getByRole("button", { name: /export podcast/i }));

      await waitFor(() => expect(capturedIntervalFn).not.toBeNull());
      await firePollTick();

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          "Exportação concluída!",
          expect.objectContaining({ description: expect.any(String) })
        );
      });
    });

    it("opens the download URL in a new tab when Download is clicked", async () => {
      const downloadUrl = "https://cdn.example.com/export.mp3";
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ jobId: "job-1" }),
        } as Response)
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ status: "completed", downloadUrl }),
        } as Response);

      render(<ExportButton {...defaultProps()} />);
      fireEvent.click(screen.getByRole("button", { name: /export podcast/i }));

      await waitFor(() => expect(capturedIntervalFn).not.toBeNull());
      await firePollTick();

      await waitFor(() =>
        screen.getByRole("button", { name: /download/i })
      );
      fireEvent.click(screen.getByRole("button", { name: /download/i }));

      expect(mockOpen).toHaveBeenCalledWith(downloadUrl, "_blank");
    });

    it("resets to idle state when 'Export Again' is clicked", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ jobId: "job-1" }),
        } as Response)
        .mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              status: "completed",
              downloadUrl: "https://cdn.example.com/export.mp3",
            }),
        } as Response);

      render(<ExportButton {...defaultProps()} />);
      fireEvent.click(screen.getByRole("button", { name: /export podcast/i }));

      await waitFor(() => expect(capturedIntervalFn).not.toBeNull());
      await firePollTick();

      await waitFor(() =>
        screen.getByRole("button", { name: /export again/i })
      );
      fireEvent.click(screen.getByRole("button", { name: /export again/i }));

      expect(
        screen.getByRole("button", { name: /export podcast/i })
      ).toBeInTheDocument();
    });
  });

  // ── Export flow — failure ───────────────────────────────────────────────────

  describe("export flow — failure", () => {
    it("shows error state when the initial POST fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "server error" }),
      } as Response);

      render(<ExportButton {...defaultProps()} />);
      fireEvent.click(screen.getByRole("button", { name: /export podcast/i }));

      await waitFor(() => {
        expect(screen.getByText(/export failed/i)).toBeInTheDocument();
      });
    });

    it("shows error state when polling returns 'failed'", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ jobId: "job-1" }),
        } as Response)
        .mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({ status: "failed", error: "disk full" }),
        } as Response);

      render(<ExportButton {...defaultProps()} />);
      fireEvent.click(screen.getByRole("button", { name: /export podcast/i }));

      await waitFor(() => expect(capturedIntervalFn).not.toBeNull());
      await firePollTick();

      await waitFor(() => {
        expect(screen.getByText(/export failed/i)).toBeInTheDocument();
        expect(screen.getByText(/disk full/i)).toBeInTheDocument();
      });
    });

    it("fires an error toast when polling returns 'failed'", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ jobId: "job-1" }),
        } as Response)
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ status: "failed", error: "oops" }),
        } as Response);

      render(<ExportButton {...defaultProps()} />);
      fireEvent.click(screen.getByRole("button", { name: /export podcast/i }));

      await waitFor(() => expect(capturedIntervalFn).not.toBeNull());
      await firePollTick();

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "Erro na exportação",
          expect.any(Object)
        );
      });
    });

    it("resets to idle when 'Try Again' is clicked from the error state", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      } as Response);

      render(<ExportButton {...defaultProps()} />);
      fireEvent.click(screen.getByRole("button", { name: /export podcast/i }));

      await waitFor(() => screen.getByRole("button", { name: /try again/i }));
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));

      expect(
        screen.getByRole("button", { name: /export podcast/i })
      ).toBeInTheDocument();
    });
  });

  // ── Progress updates ─────────────────────────────────────────────────────────

  describe("progress updates during polling", () => {
    it("updates the progress percentage from the poll response", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ jobId: "job-1" }),
        } as Response)
        .mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({ status: "processing", progress: 75 }),
        } as Response);

      render(<ExportButton {...defaultProps()} />);
      fireEvent.click(screen.getByRole("button", { name: /export podcast/i }));

      await waitFor(() => expect(capturedIntervalFn).not.toBeNull());
      await firePollTick();

      await waitFor(() => {
        expect(screen.getByText("75%")).toBeInTheDocument();
      });
    });
  });

  // ── Compact mode — state transitions ─────────────────────────────────────────

  describe("compact mode — state transitions", () => {
    it("starts export on click", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ jobId: "job-1" }),
      } as Response);

      render(<ExportButton {...defaultProps({ compact: true })} />);
      fireEvent.click(screen.getByRole("button"));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/export/proj-1", {
          method: "POST",
        });
      });
    });

    it("opens the download URL on click when status is ready", async () => {
      const downloadUrl = "https://cdn.example.com/export.mp3";
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ jobId: "job-1" }),
        } as Response)
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ status: "completed", downloadUrl }),
        } as Response);

      render(<ExportButton {...defaultProps({ compact: true })} />);
      fireEvent.click(screen.getByRole("button"));

      await waitFor(() => expect(capturedIntervalFn).not.toBeNull());
      await firePollTick();

      await waitFor(() => expect(toast.success).toHaveBeenCalled());

      fireEvent.click(screen.getByRole("button"));
      expect(mockOpen).toHaveBeenCalledWith(downloadUrl, "_blank");
    });
  });
});
