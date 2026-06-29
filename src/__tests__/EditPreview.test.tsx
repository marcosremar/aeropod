import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  EditPreview,
  EditDiff,
  type PreviewSegment,
} from "@/components/editor/EditPreview";

// ─── Fixtures ─────────────────────────────────────────────────────────────

function makeSeg(overrides: Partial<PreviewSegment> = {}): PreviewSegment {
  return {
    id: "seg-1",
    text: "Hello world",
    startTime: 0,
    endTime: 10,
    ...overrides,
  };
}

const BASE_SEGS: PreviewSegment[] = [
  makeSeg({ id: "a", text: "First segment", startTime: 0, endTime: 30 }),
  makeSeg({ id: "b", text: "Second segment", startTime: 30, endTime: 90 }),
];

// ─── EditPreview — basic rendering ────────────────────────────────────────

describe("EditPreview — basic rendering", () => {
  it("renders without crashing with an empty segments array", () => {
    const { container } = render(<EditPreview segments={[]} />);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders the title when provided", () => {
    render(<EditPreview segments={BASE_SEGS} title="My Edit Preview" />);
    expect(screen.getByText("My Edit Preview")).toBeInTheDocument();
  });

  it("renders the description when provided", () => {
    render(
      <EditPreview
        segments={BASE_SEGS}
        description="A helpful description"
      />
    );
    expect(screen.getByText("A helpful description")).toBeInTheDocument();
  });

  it("does not render title area when neither title nor description is given", () => {
    render(<EditPreview segments={BASE_SEGS} />);
    expect(screen.queryByText("My Edit Preview")).not.toBeInTheDocument();
  });

  it("renders all segment texts", () => {
    render(<EditPreview segments={BASE_SEGS} />);
    expect(screen.getByText("First segment")).toBeInTheDocument();
    expect(screen.getByText("Second segment")).toBeInTheDocument();
  });
});

// ─── EditPreview — duration & segment stats ───────────────────────────────

describe("EditPreview — duration and stats", () => {
  it("displays total duration as M:SS", () => {
    const segs: PreviewSegment[] = [
      makeSeg({ id: "a", startTime: 0, endTime: 90 }),
    ];
    render(<EditPreview segments={segs} />);
    expect(screen.getByText("1:30")).toBeInTheDocument();
  });

  it("pads seconds with a leading zero when seconds < 10", () => {
    const segs: PreviewSegment[] = [
      makeSeg({ id: "a", startTime: 0, endTime: 65 }),
    ];
    render(<EditPreview segments={segs} />);
    expect(screen.getByText("1:05")).toBeInTheDocument();
  });

  it("shows 0:00 duration for empty segments", () => {
    render(<EditPreview segments={[]} />);
    expect(screen.getByText("0:00")).toBeInTheDocument();
  });

  it("shows combined current + new segment count", () => {
    const segs: PreviewSegment[] = [
      makeSeg({ id: "a", isNew: false }),
      makeSeg({ id: "b", isNew: true }),
    ];
    render(<EditPreview segments={segs} />);
    // current (1) + new (1) = 2 segmentos
    expect(screen.getByText("2 segmentos")).toBeInTheDocument();
  });

  it("shows '+N novos' when new segments are present", () => {
    const segs: PreviewSegment[] = [
      makeSeg({ id: "a", isNew: true }),
      makeSeg({ id: "b", isNew: true }),
    ];
    render(<EditPreview segments={segs} />);
    expect(screen.getByText("+2 novos")).toBeInTheDocument();
  });

  it("does not show '+N novos' when there are no new segments", () => {
    render(<EditPreview segments={BASE_SEGS} />);
    expect(screen.queryByText(/novos/)).not.toBeInTheDocument();
  });

  it("shows '-N removidos' when removed segments are present", () => {
    const segs: PreviewSegment[] = [
      makeSeg({ id: "a", isRemoved: true }),
    ];
    render(<EditPreview segments={segs} />);
    expect(screen.getByText("-1 removidos")).toBeInTheDocument();
  });

  it("does not show '-N removidos' when no segments are removed", () => {
    render(<EditPreview segments={BASE_SEGS} />);
    expect(screen.queryByText(/removidos/)).not.toBeInTheDocument();
  });
});

// ─── EditPreview — segment badges ─────────────────────────────────────────

describe("EditPreview — segment badges", () => {
  it("renders NOVO badge for new segments", () => {
    const segs: PreviewSegment[] = [makeSeg({ id: "a", isNew: true })];
    render(<EditPreview segments={segs} />);
    expect(screen.getByText("NOVO")).toBeInTheDocument();
  });

  it("renders REMOVER badge for removed segments", () => {
    const segs: PreviewSegment[] = [makeSeg({ id: "a", isRemoved: true })];
    render(<EditPreview segments={segs} />);
    expect(screen.getByText("REMOVER")).toBeInTheDocument();
  });

  it("does not render NOVO badge for regular segments", () => {
    render(<EditPreview segments={BASE_SEGS} />);
    expect(screen.queryByText("NOVO")).not.toBeInTheDocument();
  });

  it("does not render REMOVER badge for regular segments", () => {
    render(<EditPreview segments={BASE_SEGS} />);
    expect(screen.queryByText("REMOVER")).not.toBeInTheDocument();
  });
});

// ─── EditPreview — topics ─────────────────────────────────────────────────

describe("EditPreview — topics", () => {
  it("renders topic label when segment has a topic", () => {
    const segs: PreviewSegment[] = [makeSeg({ id: "a", topic: "Tech Talk" })];
    render(<EditPreview segments={segs} />);
    expect(screen.getByText("Tech Talk")).toBeInTheDocument();
  });

  it("does not render topic when segment topic is absent", () => {
    render(<EditPreview segments={BASE_SEGS} />);
    expect(screen.queryByText("Tech Talk")).not.toBeInTheDocument();
  });
});

// ─── EditPreview — interest scores ────────────────────────────────────────

describe("EditPreview — interest scores", () => {
  it("renders interest score when interestScore is defined", () => {
    const segs: PreviewSegment[] = [makeSeg({ id: "a", interestScore: 8 })];
    render(<EditPreview segments={segs} />);
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("does not render score badge when interestScore is undefined", () => {
    render(<EditPreview segments={BASE_SEGS} />);
    // BASE_SEGS have no interestScore, so no numeric score nodes expected
    // Just ensure no score badge div appears alongside regular content
    const badges = document.querySelectorAll(
      "div.rounded-full"
    );
    expect(badges).toHaveLength(0);
  });
});

// ─── EditPreview — timestamps displayed per segment ───────────────────────

describe("EditPreview — segment start time display", () => {
  it("displays segment start time in M:SS format", () => {
    const segs: PreviewSegment[] = [
      makeSeg({ id: "a", text: "A", startTime: 75, endTime: 90 }),
    ];
    render(<EditPreview segments={segs} />);
    expect(screen.getByText("1:15")).toBeInTheDocument();
  });

  it("displays 0:00 for a segment starting at time zero", () => {
    const segs: PreviewSegment[] = [
      makeSeg({ id: "a", text: "A", startTime: 0, endTime: 10 }),
    ];
    render(<EditPreview segments={segs} />);
    expect(screen.getAllByText("0:00").length).toBeGreaterThanOrEqual(1);
  });
});

// ─── EditPreview — onPlaySegment callback ─────────────────────────────────

describe("EditPreview — onPlaySegment callback", () => {
  it("calls onPlaySegment with the segment when a segment row is clicked", () => {
    const onPlaySegment = vi.fn();
    const seg = makeSeg({ id: "a", text: "Clickable segment" });
    render(<EditPreview segments={[seg]} onPlaySegment={onPlaySegment} />);

    fireEvent.click(screen.getByText("Clickable segment"));
    expect(onPlaySegment).toHaveBeenCalledTimes(1);
    expect(onPlaySegment).toHaveBeenCalledWith(seg);
  });

  it("does not throw when onPlaySegment is not provided", () => {
    const seg = makeSeg({ id: "a", text: "No callback" });
    render(<EditPreview segments={[seg]} />);
    expect(() => fireEvent.click(screen.getByText("No callback"))).not.toThrow();
  });
});

// ─── EditPreview — onApply button ─────────────────────────────────────────

describe("EditPreview — onApply button", () => {
  it("renders the apply button when onApply is provided", () => {
    const onApply = vi.fn();
    render(<EditPreview segments={BASE_SEGS} onApply={onApply} />);
    expect(
      screen.getByRole("button", { name: /Aplicar esta edicao/i })
    ).toBeInTheDocument();
  });

  it("does not render an apply button when onApply is not provided", () => {
    render(<EditPreview segments={BASE_SEGS} />);
    expect(
      screen.queryByRole("button", { name: /Aplicar esta edicao/i })
    ).not.toBeInTheDocument();
  });

  it("calls onApply when the apply button is clicked", () => {
    const onApply = vi.fn();
    render(<EditPreview segments={BASE_SEGS} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar esta edicao/i }));
    expect(onApply).toHaveBeenCalledTimes(1);
  });
});

// ─── EditPreview — showTimeline ───────────────────────────────────────────

describe("EditPreview — showTimeline prop", () => {
  it("renders the timeline bar container when showTimeline is true (default)", () => {
    const { container } = render(<EditPreview segments={BASE_SEGS} showTimeline />);
    const timeline = container.querySelector(".h-8.bg-zinc-900");
    expect(timeline).not.toBeNull();
  });

  it("hides the timeline bar container when showTimeline is false", () => {
    const { container } = render(
      <EditPreview segments={BASE_SEGS} showTimeline={false} />
    );
    const timeline = container.querySelector(".h-8.bg-zinc-900");
    expect(timeline).toBeNull();
  });

  it("does not render timeline when segments array is empty even if showTimeline is true", () => {
    const { container } = render(
      <EditPreview segments={[]} showTimeline />
    );
    const timeline = container.querySelector(".h-8.bg-zinc-900");
    expect(timeline).toBeNull();
  });
});

// ─── EditPreview — compact mode ───────────────────────────────────────────

describe("EditPreview — compact mode", () => {
  it("applies compact padding class when compact is true", () => {
    const { container } = render(
      <EditPreview segments={BASE_SEGS} compact />
    );
    expect(container.firstChild).toHaveClass("p-3");
  });

  it("applies full padding class when compact is false (default)", () => {
    const { container } = render(<EditPreview segments={BASE_SEGS} />);
    expect(container.firstChild).toHaveClass("p-4");
  });

  it("uses shorter max-height in compact mode for segment list", () => {
    const { container } = render(
      <EditPreview segments={BASE_SEGS} compact />
    );
    const list = container.querySelector(".max-h-\\[150px\\]");
    expect(list).not.toBeNull();
  });

  it("uses full max-height in non-compact mode for segment list", () => {
    const { container } = render(<EditPreview segments={BASE_SEGS} />);
    const list = container.querySelector(".max-h-\\[250px\\]");
    expect(list).not.toBeNull();
  });
});

// ─── EditDiff — basic rendering ───────────────────────────────────────────

describe("EditDiff — basic rendering", () => {
  it("renders without crashing", () => {
    const { container } = render(<EditDiff before={[]} after={[]} />);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders 'Antes' and 'Depois' labels", () => {
    render(<EditDiff before={BASE_SEGS} after={BASE_SEGS} />);
    expect(screen.getByText("Antes")).toBeInTheDocument();
    expect(screen.getByText("Depois")).toBeInTheDocument();
  });
});

// ─── EditDiff — added/removed/kept counts ─────────────────────────────────

describe("EditDiff — segment counts", () => {
  it("shows '+N adicionados' when segments are added", () => {
    const before: PreviewSegment[] = [makeSeg({ id: "a" })];
    const after: PreviewSegment[] = [
      makeSeg({ id: "a" }),
      makeSeg({ id: "b" }),
    ];
    render(<EditDiff before={before} after={after} />);
    expect(screen.getByText("+1 adicionados")).toBeInTheDocument();
  });

  it("shows '-N removidos' when segments are removed", () => {
    const before: PreviewSegment[] = [
      makeSeg({ id: "a" }),
      makeSeg({ id: "b" }),
    ];
    const after: PreviewSegment[] = [makeSeg({ id: "a" })];
    render(<EditDiff before={before} after={after} />);
    expect(screen.getByText("-1 removidos")).toBeInTheDocument();
  });

  it("shows kept count for segments in both before and after", () => {
    const before: PreviewSegment[] = [
      makeSeg({ id: "a" }),
      makeSeg({ id: "b" }),
    ];
    const after: PreviewSegment[] = [
      makeSeg({ id: "a" }),
      makeSeg({ id: "c" }),
    ];
    render(<EditDiff before={before} after={after} />);
    expect(screen.getByText("1 mantidos")).toBeInTheDocument();
  });

  it("does not show '+N adicionados' when nothing is added", () => {
    render(<EditDiff before={BASE_SEGS} after={BASE_SEGS} />);
    expect(screen.queryByText(/adicionados/)).not.toBeInTheDocument();
  });

  it("does not show '-N removidos' when nothing is removed", () => {
    render(<EditDiff before={BASE_SEGS} after={BASE_SEGS} />);
    expect(screen.queryByText(/removidos/)).not.toBeInTheDocument();
  });
});

// ─── EditDiff — duration diff display ────────────────────────────────────

describe("EditDiff — duration diff", () => {
  it("shows positive diff when after is longer", () => {
    const before: PreviewSegment[] = [makeSeg({ id: "a", startTime: 0, endTime: 60 })];
    const after: PreviewSegment[] = [makeSeg({ id: "a", startTime: 0, endTime: 90 })];
    render(<EditDiff before={before} after={after} />);
    expect(screen.getByText("+0:30")).toBeInTheDocument();
  });

  it("shows negative diff when after is shorter", () => {
    const before: PreviewSegment[] = [makeSeg({ id: "a", startTime: 0, endTime: 90 })];
    const after: PreviewSegment[] = [makeSeg({ id: "a", startTime: 0, endTime: 60 })];
    render(<EditDiff before={before} after={after} />);
    expect(screen.getByText("-0:30")).toBeInTheDocument();
  });

  it("shows +0:00 when durations are equal", () => {
    render(<EditDiff before={BASE_SEGS} after={BASE_SEGS} />);
    expect(screen.getByText("+0:00")).toBeInTheDocument();
  });
});

// ─── EditDiff — onApply button ────────────────────────────────────────────

describe("EditDiff — onApply button", () => {
  it("renders the apply button when onApply is provided", () => {
    const onApply = vi.fn();
    render(<EditDiff before={BASE_SEGS} after={BASE_SEGS} onApply={onApply} />);
    expect(
      screen.getByRole("button", { name: /Aplicar mudancas/i })
    ).toBeInTheDocument();
  });

  it("does not render apply button when onApply is not provided", () => {
    render(<EditDiff before={BASE_SEGS} after={BASE_SEGS} />);
    expect(
      screen.queryByRole("button", { name: /Aplicar mudancas/i })
    ).not.toBeInTheDocument();
  });

  it("calls onApply when the apply button is clicked", () => {
    const onApply = vi.fn();
    render(<EditDiff before={BASE_SEGS} after={BASE_SEGS} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar mudancas/i }));
    expect(onApply).toHaveBeenCalledTimes(1);
  });
});
