import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { AudioEnhancementPanel } from "@/components/editor/AudioEnhancementPanel";
import { mockFetchRoutes } from "../helpers/mock-fetch";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AudioEnhancementPanel", () => {
  it("renders preview and apply actions", async () => {
    mockFetchRoutes({
      "/enhance": { json: { success: true, presets: [] } },
    });
    render(<AudioEnhancementPanel projectId="p1" />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Preview/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Aplicar/i })).toBeInTheDocument();
  });

  it("shows a preview audio player after generating a preview", async () => {
    mockFetchRoutes({
      "/enhance": (url, init) => {
        if (init?.method === "POST") {
          return { json: { success: true, previewUrl: "/exports/preview.mp3" } };
        }
        return { json: { success: true, presets: [] } };
      },
    });

    render(<AudioEnhancementPanel projectId="p1" />);

    const previewBtn = await screen.findByRole("button", { name: /^Preview$/i });
    fireEvent.click(previewBtn);

    // The preview player (with play/pause control) should appear.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Tocar preview|Pausar preview/i })
      ).toBeInTheDocument();
    });
  });
});
