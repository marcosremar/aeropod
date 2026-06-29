import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RemovedSegments } from "@/components/editor/RemovedSegments";
import type { Segment } from "@/lib/db/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    id: "seg-1",
    projectId: "proj-1",
    startTime: 0,
    endTime: 30,
    text: "Test segment text.",
    speaker: null,
    speakerLabel: null,
    topicId: null,
    interestScore: null,
    clarityScore: null,
    topic: null,
    keyInsight: null,
    isSelected: false,
    order: 1,
    analysis: null,
    hasError: false,
    errorType: null,
    errorDetail: null,
    rerecordedAudioUrl: null,
    detectedSectionType: null,
    sectionMatchScore: null,
    wordTimestamps: null,
    editedText: null,
    textCuts: null,
    createdAt: new Date("2024-01-01"),
    ...overrides,
  } as Segment;
}

function defaultProps(segmentsOverrides: Partial<Segment>[] = []) {
  return {
    segments: segmentsOverrides.map((o, i) =>
      makeSegment({ id: `seg-${i + 1}`, ...o })
    ),
    onToggleSelect: vi.fn(),
    onPlaySegment: vi.fn(),
  };
}

// ─── Null / empty render ───────────────────────────────────────────────────

describe("RemovedSegments — null render", () => {
  it("returns null when there are no segments at all", () => {
    const { container } = render(<RemovedSegments {...defaultProps([])} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when all segments are selected", () => {
    const { container } = render(
      <RemovedSegments
        {...defaultProps([{ isSelected: true }, { isSelected: true }])}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders when at least one segment is not selected", () => {
    render(
      <RemovedSegments
        {...defaultProps([{ isSelected: true }, { isSelected: false }])}
      />
    );
    expect(screen.getByText("Removed Segments")).toBeInTheDocument();
  });
});

// ─── Count display ────────────────────────────────────────────────────────

describe("RemovedSegments — count display", () => {
  it("shows singular label for one removed segment", () => {
    render(<RemovedSegments {...defaultProps([{ isSelected: false }])} />);
    expect(screen.getByText(/1 segment removed/)).toBeInTheDocument();
  });

  it("shows plural label for multiple removed segments", () => {
    render(
      <RemovedSegments
        {...defaultProps([{ isSelected: false }, { isSelected: false }])}
      />
    );
    expect(screen.getByText(/2 segments removed/)).toBeInTheDocument();
  });

  it("only counts non-selected segments", () => {
    render(
      <RemovedSegments
        {...defaultProps([
          { isSelected: true },
          { isSelected: false },
          { isSelected: false },
        ])}
      />
    );
    expect(screen.getByText(/2 segments removed/)).toBeInTheDocument();
  });
});

// ─── Duration display ─────────────────────────────────────────────────────

describe("RemovedSegments — duration display", () => {
  it("shows the total removed duration as MM:SS", () => {
    // Two segments of 30s each → 1:00 removed
    render(
      <RemovedSegments
        {...defaultProps([
          { isSelected: false, startTime: 0, endTime: 30 },
          { isSelected: false, startTime: 30, endTime: 60 },
        ])}
      />
    );
    expect(screen.getByText(/1:00 removed/)).toBeInTheDocument();
  });

  it("pads seconds with leading zero for durations under 10s", () => {
    // 5 seconds removed → 0:05
    render(
      <RemovedSegments
        {...defaultProps([{ isSelected: false, startTime: 0, endTime: 5 }])}
      />
    );
    expect(screen.getByText(/0:05 removed/)).toBeInTheDocument();
  });

  it("ignores duration of selected segments when computing total", () => {
    // Selected segment is 100s — should not count
    // Removed segment is 10s → 0:10
    render(
      <RemovedSegments
        {...defaultProps([
          { isSelected: true, startTime: 0, endTime: 100 },
          { isSelected: false, startTime: 100, endTime: 110 },
        ])}
      />
    );
    expect(screen.getByText(/0:10 removed/)).toBeInTheDocument();
  });
});

// ─── Expand / collapse ────────────────────────────────────────────────────

describe("RemovedSegments — expand/collapse", () => {
  it("starts collapsed — add-back tip is not visible", () => {
    render(<RemovedSegments {...defaultProps([{ isSelected: false }])} />);
    expect(
      screen.queryByText(/Click on any segment to add it back/)
    ).not.toBeInTheDocument();
  });

  it("expands when the header button is clicked", () => {
    render(<RemovedSegments {...defaultProps([{ isSelected: false }])} />);
    fireEvent.click(screen.getByRole("button", { name: /Removed Segments/i }));
    expect(
      screen.getByText(/Click on any segment to add it back/)
    ).toBeInTheDocument();
  });

  it("collapses again when the header button is clicked a second time", () => {
    render(<RemovedSegments {...defaultProps([{ isSelected: false }])} />);
    const toggle = screen.getByRole("button", { name: /Removed Segments/i });
    fireEvent.click(toggle); // expand
    fireEvent.click(toggle); // collapse
    expect(
      screen.queryByText(/Click on any segment to add it back/)
    ).not.toBeInTheDocument();
  });

  it("shows tip text and info message when expanded", () => {
    render(<RemovedSegments {...defaultProps([{ isSelected: false }])} />);
    fireEvent.click(screen.getByRole("button", { name: /Removed Segments/i }));
    expect(
      screen.getByText(/These segments were removed during the AI analysis/)
    ).toBeInTheDocument();
  });
});

// ─── Segment ordering ─────────────────────────────────────────────────────

describe("RemovedSegments — segment ordering", () => {
  it("displays removed segments sorted by startTime ascending", () => {
    render(
      <RemovedSegments
        {...defaultProps([
          { isSelected: false, startTime: 90, endTime: 120, text: "Third" },
          { isSelected: false, startTime: 0, endTime: 30, text: "First" },
          { isSelected: false, startTime: 45, endTime: 75, text: "Second" },
        ])}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Removed Segments/i }));

    const texts = screen
      .getAllByText(/First|Second|Third/)
      .map((el) => el.textContent);
    const firstIdx = texts.indexOf("First");
    const secondIdx = texts.indexOf("Second");
    const thirdIdx = texts.indexOf("Third");

    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });

  it("shows segment text for each removed segment when expanded", () => {
    render(
      <RemovedSegments
        {...defaultProps([
          { isSelected: false, text: "Alpha segment" },
          { isSelected: false, text: "Beta segment" },
        ])}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Removed Segments/i }));
    expect(screen.getByText("Alpha segment")).toBeInTheDocument();
    expect(screen.getByText("Beta segment")).toBeInTheDocument();
  });
});

// ─── Callbacks ────────────────────────────────────────────────────────────

describe("RemovedSegments — callbacks", () => {
  it("calls onToggleSelect with the segment id when a SegmentCard checkbox is clicked", () => {
    const onToggleSelect = vi.fn();
    render(
      <RemovedSegments
        segments={[makeSegment({ id: "seg-1", isSelected: false })]}
        onToggleSelect={onToggleSelect}
        onPlaySegment={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Removed Segments/i }));
    // Click the select button rendered by SegmentCard
    fireEvent.click(screen.getByRole("button", { name: /Select segment/i }));
    expect(onToggleSelect).toHaveBeenCalledWith("seg-1");
  });
});
