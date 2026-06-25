import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { VideoEditor } from "@/components/video/VideoEditor";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => cleanup());

const project = {
  id: "p1",
  title: "Meu corte",
  videoUrl: "/uploads/x.mp4",
  thumbnailUrl: "/uploads/x.jpg",
  videoDuration: 120,
  aspectRatio: "16:9" as const,
  cutRanges: [],
};

describe("VideoEditor", () => {
  it("renders the project title and output format controls", () => {
    render(
      <VideoEditor
        project={project}
        thumbnails={[]}
        onSaveCuts={vi.fn()}
        onExport={vi.fn()}
        isExporting={false}
      />
    );
    expect(screen.getByText("Meu corte")).toBeInTheDocument();
    expect(screen.getByText(/Proporção de saída/i)).toBeInTheDocument();
    // aspect toggle options
    expect(screen.getByText("Horizontal")).toBeInTheDocument();
    expect(screen.getByText("Vertical")).toBeInTheDocument();
  });

  it("renders a video element for the source", () => {
    const { container } = render(
      <VideoEditor
        project={project}
        thumbnails={[]}
        onSaveCuts={vi.fn()}
        onExport={vi.fn()}
        isExporting={false}
      />
    );
    expect(container.querySelector("video")).toBeTruthy();
  });

  it("shows an unavailable message when there is no video", () => {
    render(
      <VideoEditor
        project={{ ...project, videoUrl: null }}
        thumbnails={[]}
        onSaveCuts={vi.fn()}
        onExport={vi.fn()}
        isExporting={false}
      />
    );
    expect(screen.getByText(/Vídeo indisponível/i)).toBeInTheDocument();
  });
});
