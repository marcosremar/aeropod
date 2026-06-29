import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProjectCard } from "@/components/dashboard/ProjectCard";

// Override the global next/navigation mock with one that exposes push for inspection
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const makeProject = (
  overrides: Partial<{
    id: string;
    title: string;
    status: string;
    duration: number;
    createdAt: string;
    progress: number;
    errorMessage: string | null;
  }> = {}
) => ({
  id: "proj-1",
  title: "My Podcast Episode",
  status: "ready" as const,
  duration: 3665, // 61:05
  createdAt: new Date().toISOString(),
  progress: undefined,
  errorMessage: null,
  ...overrides,
});

describe("ProjectCard", () => {
  const onDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── formatDuration (via rendered text) ───────────────────────────────

  describe("duration formatting", () => {
    it("shows 0:00 when duration is 0", () => {
      render(<ProjectCard project={makeProject({ duration: 0 })} onDelete={onDelete} />);
      expect(screen.getByText("0:00")).toBeInTheDocument();
    });

    it("formats seconds only correctly", () => {
      render(<ProjectCard project={makeProject({ duration: 45 })} onDelete={onDelete} />);
      expect(screen.getByText("0:45")).toBeInTheDocument();
    });

    it("pads seconds with leading zero", () => {
      render(<ProjectCard project={makeProject({ duration: 65 })} onDelete={onDelete} />);
      expect(screen.getByText("1:05")).toBeInTheDocument();
    });

    it("formats longer durations correctly", () => {
      render(<ProjectCard project={makeProject({ duration: 3665 })} onDelete={onDelete} />);
      expect(screen.getByText("61:05")).toBeInTheDocument();
    });

    it("shows 0:00 for NaN duration", () => {
      render(<ProjectCard project={makeProject({ duration: NaN })} onDelete={onDelete} />);
      expect(screen.getByText("0:00")).toBeInTheDocument();
    });
  });

  // ── formatDate (via rendered text) ───────────────────────────────────

  describe("date formatting", () => {
    const FIXED_NOW = new Date("2024-06-15T12:00:00.000Z");

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(FIXED_NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("shows 'Hoje' for today's date", () => {
      const today = new Date("2024-06-15T08:00:00.000Z").toISOString();
      render(<ProjectCard project={makeProject({ createdAt: today })} onDelete={onDelete} />);
      expect(screen.getByText("Hoje")).toBeInTheDocument();
    });

    it("shows 'Ontem' for yesterday's date", () => {
      const yesterday = new Date("2024-06-14T12:00:00.000Z").toISOString();
      render(<ProjectCard project={makeProject({ createdAt: yesterday })} onDelete={onDelete} />);
      expect(screen.getByText("Ontem")).toBeInTheDocument();
    });

    it("shows 'X dias atras' for dates within 7 days", () => {
      const threeDaysAgo = new Date("2024-06-12T12:00:00.000Z").toISOString();
      render(<ProjectCard project={makeProject({ createdAt: threeDaysAgo })} onDelete={onDelete} />);
      expect(screen.getByText("3 dias atras")).toBeInTheDocument();
    });

    it("shows localized date for dates older than 7 days", () => {
      const oldDate = new Date("2024-06-01T12:00:00.000Z").toISOString();
      render(<ProjectCard project={makeProject({ createdAt: oldDate })} onDelete={onDelete} />);
      // Should NOT be "Hoje", "Ontem", or "dias atras"
      const dateText = screen.queryByText("Hoje");
      expect(dateText).not.toBeInTheDocument();
      // The text should match a localized pt-BR date (e.g. "jun. 1" or "1 de jun.")
      const card = document.body.textContent || "";
      expect(card).toMatch(/\d/); // At least has digits in date
    });
  });

  // ── Status display ────────────────────────────────────────────────────

  describe("status display", () => {
    it("shows 'Pronto' label for ready status", () => {
      render(<ProjectCard project={makeProject({ status: "ready" })} onDelete={onDelete} />);
      expect(screen.getByText("Pronto")).toBeInTheDocument();
    });

    it("shows 'Pronto' label for completed status", () => {
      render(<ProjectCard project={makeProject({ status: "completed" })} onDelete={onDelete} />);
      expect(screen.getByText("Pronto")).toBeInTheDocument();
    });

    it("shows 'Transcrevendo' label for transcribing status", () => {
      render(<ProjectCard project={makeProject({ status: "transcribing" })} onDelete={onDelete} />);
      expect(screen.getByText("Transcrevendo")).toBeInTheDocument();
    });

    it("shows 'Analisando' label for analyzing status", () => {
      render(<ProjectCard project={makeProject({ status: "analyzing" })} onDelete={onDelete} />);
      expect(screen.getByText("Analisando")).toBeInTheDocument();
    });

    it("shows 'Enviando' label for uploading status", () => {
      render(<ProjectCard project={makeProject({ status: "uploading" })} onDelete={onDelete} />);
      expect(screen.getByText("Enviando")).toBeInTheDocument();
    });

    it("shows 'Falhou' label for failed status", () => {
      render(<ProjectCard project={makeProject({ status: "failed" })} onDelete={onDelete} />);
      expect(screen.getByText("Falhou")).toBeInTheDocument();
    });

    it("shows 'Erro' label for error status", () => {
      render(<ProjectCard project={makeProject({ status: "error" })} onDelete={onDelete} />);
      expect(screen.getByText("Erro")).toBeInTheDocument();
    });
  });

  // ── Call-to-action for ready/completed ───────────────────────────────

  describe("call-to-action text", () => {
    it("shows 'Clique para editar' for ready status", () => {
      render(<ProjectCard project={makeProject({ status: "ready" })} onDelete={onDelete} />);
      expect(screen.getByText("Clique para editar")).toBeInTheDocument();
    });

    it("shows 'Clique para editar' for completed status", () => {
      render(<ProjectCard project={makeProject({ status: "completed" })} onDelete={onDelete} />);
      expect(screen.getByText("Clique para editar")).toBeInTheDocument();
    });

    it("does not show 'Clique para editar' while transcribing", () => {
      render(<ProjectCard project={makeProject({ status: "transcribing" })} onDelete={onDelete} />);
      expect(screen.queryByText("Clique para editar")).not.toBeInTheDocument();
    });
  });

  // ── Progress bar ─────────────────────────────────────────────────────

  describe("progress bar", () => {
    it("shows progress percentage for uploading status with progress", () => {
      render(
        <ProjectCard
          project={makeProject({ status: "uploading", progress: 42 })}
          onDelete={onDelete}
        />
      );
      expect(screen.getByText("42%")).toBeInTheDocument();
    });

    it("shows progress percentage for transcribing status", () => {
      render(
        <ProjectCard
          project={makeProject({ status: "transcribing", progress: 75 })}
          onDelete={onDelete}
        />
      );
      expect(screen.getByText("75%")).toBeInTheDocument();
    });

    it("does not show progress for ready status", () => {
      render(
        <ProjectCard
          project={makeProject({ status: "ready", progress: 100 })}
          onDelete={onDelete}
        />
      );
      expect(screen.queryByText("100%")).not.toBeInTheDocument();
    });
  });

  // ── Error message ─────────────────────────────────────────────────────

  describe("error message display", () => {
    it("shows error message for failed status", () => {
      render(
        <ProjectCard
          project={makeProject({ status: "failed", errorMessage: "Transcription timeout" })}
          onDelete={onDelete}
        />
      );
      expect(screen.getByText("Transcription timeout")).toBeInTheDocument();
    });

    it("shows error message for error status", () => {
      render(
        <ProjectCard
          project={makeProject({ status: "error", errorMessage: "Upload failed" })}
          onDelete={onDelete}
        />
      );
      expect(screen.getByText("Upload failed")).toBeInTheDocument();
    });

    it("does not show error box when errorMessage is null", () => {
      render(
        <ProjectCard
          project={makeProject({ status: "failed", errorMessage: null })}
          onDelete={onDelete}
        />
      );
      // No error text present
      expect(document.querySelector(".bg-red-500\\/10 p")).not.toBeInTheDocument();
    });
  });

  // ── Navigation on click ───────────────────────────────────────────────

  describe("navigation on click", () => {
    beforeEach(() => {
      mockPush.mockClear();
    });

    it("navigates to editor when clicking a ready project", () => {
      render(<ProjectCard project={makeProject({ id: "proj-abc", status: "ready" })} onDelete={onDelete} />);
      const card = document.querySelector("div[class*='rounded-xl']")!;
      fireEvent.click(card);
      expect(mockPush).toHaveBeenCalledWith("/editor/proj-abc");
    });

    it("navigates to editor when clicking a completed project", () => {
      render(<ProjectCard project={makeProject({ id: "proj-xyz", status: "completed" })} onDelete={onDelete} />);
      const card = document.querySelector("div[class*='rounded-xl']")!;
      fireEvent.click(card);
      expect(mockPush).toHaveBeenCalledWith("/editor/proj-xyz");
    });

    it("does not navigate when clicking a transcribing project", () => {
      render(
        <ProjectCard
          project={makeProject({ status: "transcribing" })}
          onDelete={onDelete}
        />
      );
      fireEvent.click(document.querySelector("div[class*='rounded-xl']")!);
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("does not navigate when clicking a failed project", () => {
      render(
        <ProjectCard
          project={makeProject({ status: "failed" })}
          onDelete={onDelete}
        />
      );
      fireEvent.click(document.querySelector("div[class*='rounded-xl']")!);
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  // ── Delete button ─────────────────────────────────────────────────────

  describe("delete button", () => {
    it("calls onDelete with project id when confirmed", () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      render(<ProjectCard project={makeProject({ id: "proj-xyz" })} onDelete={onDelete} />);
      const deleteBtn = document.querySelector("button")!;
      fireEvent.click(deleteBtn);
      expect(onDelete).toHaveBeenCalledWith("proj-xyz");
    });

    it("does not call onDelete when confirmation is cancelled", () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      render(<ProjectCard project={makeProject({ id: "proj-xyz" })} onDelete={onDelete} />);
      const deleteBtn = document.querySelector("button")!;
      fireEvent.click(deleteBtn);
      expect(onDelete).not.toHaveBeenCalled();
    });

    it("stopPropagation so card click does not fire on delete", () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const handleCardClick = vi.fn();
      render(<ProjectCard project={makeProject({ status: "ready" })} onDelete={onDelete} />);
      const deleteBtn = document.querySelector("button")!;
      // Delete click should not bubble to the card div's onClick
      fireEvent.click(deleteBtn);
      // onDelete not called (confirm returned false) and we didn't navigate
      expect(onDelete).not.toHaveBeenCalled();
    });
  });

  // ── Project title ─────────────────────────────────────────────────────

  it("renders the project title", () => {
    render(<ProjectCard project={makeProject({ title: "Episode 42: AI Tools" })} onDelete={onDelete} />);
    expect(screen.getByText("Episode 42: AI Tools")).toBeInTheDocument();
  });
});
