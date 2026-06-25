import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ExportButton } from "@/components/editor/ExportButton";
import { mockFetchRoutes } from "../helpers/mock-fetch";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ExportButton", () => {
  beforeEach(() => {
    mockFetchRoutes({
      "/api/export/": { json: { status: "processing", downloadUrl: null } },
    });
  });

  it("renders the idle export button", () => {
    render(<ExportButton projectId="p1" selectedSegmentsCount={3} />);
    expect(screen.getByText(/Export Podcast/i)).toBeInTheDocument();
    expect(screen.getByText(/3 segments/i)).toBeInTheDocument();
  });

  it("is disabled and shows a hint when no segments are selected", () => {
    render(<ExportButton projectId="p1" selectedSegmentsCount={0} />);
    expect(
      screen.getByText(/Select at least one segment/i)
    ).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /Export Podcast/i });
    expect(btn).toBeDisabled();
  });

  it("starts the export (POST) and shows processing state on click", async () => {
    const fetchMock = mockFetchRoutes({
      "/api/export/": { json: { status: "processing" } },
    });
    render(<ExportButton projectId="p1" selectedSegmentsCount={2} />);

    fireEvent.click(screen.getByRole("button", { name: /Export Podcast/i }));

    await waitFor(() => {
      expect(screen.getByText(/Processing/i)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/export/p1",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("renders a compact icon button when compact", () => {
    render(
      <ExportButton projectId="p1" selectedSegmentsCount={1} compact />
    );
    // compact mode renders a single icon button (no "Export Podcast" label)
    expect(screen.queryByText(/Export Podcast/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
