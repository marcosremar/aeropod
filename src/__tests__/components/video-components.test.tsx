import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { AspectRatioToggle } from "@/components/video/AspectRatioToggle";
import { VideoEntryButtons } from "@/components/video/VideoEntryButtons";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AspectRatioToggle", () => {
  it("renders the three output formats", () => {
    render(<AspectRatioToggle value="16:9" onChange={() => {}} />);
    expect(screen.getByText("Horizontal")).toBeInTheDocument();
    expect(screen.getByText("Vertical")).toBeInTheDocument();
    expect(screen.getByText("Quadrado")).toBeInTheDocument();
  });

  it("marks the active ratio as pressed", () => {
    render(<AspectRatioToggle value="9:16" onChange={() => {}} />);
    const vertical = screen.getByText("Vertical").closest("button")!;
    expect(vertical).toHaveAttribute("aria-pressed", "true");
  });

  it("calls onChange with the selected ratio", () => {
    const onChange = vi.fn();
    render(<AspectRatioToggle value="16:9" onChange={onChange} />);
    fireEvent.click(screen.getByText("Quadrado").closest("button")!);
    expect(onChange).toHaveBeenCalledWith("1:1");
  });
});

describe("VideoEntryButtons", () => {
  it("renders YouTube import and phone upload entry points", () => {
    render(<VideoEntryButtons />);
    expect(
      screen.getByRole("button", { name: /Importar do YouTube/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Enviar vídeo do celular/i })
    ).toBeInTheDocument();
  });

  it("opens the YouTube import modal with a URL field", async () => {
    render(<VideoEntryButtons />);
    fireEvent.click(
      screen.getByRole("button", { name: /Importar do YouTube/i })
    );
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/youtube\.com\/watch/i)
      ).toBeInTheDocument();
    });
  });
});
