import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Timeline } from "@/components/editor/Timeline";
import type { Segment } from "@/lib/db/schema";
import React from "react";

// ─── Mocks ────────────────────────────────────────────────────────────────

// framer-motion: render children directly, including Reorder support
vi.mock("framer-motion", async () => {
  const R = await import("react");

  const makeEl =
    (tag: string) =>
    ({ children, ...props }: React.HTMLAttributes<HTMLElement> & { [k: string]: unknown }) =>
      R.createElement(tag, props, children);

  const ReorderGroup = ({
    children,
    axis: _a,
    values: _v,
    onReorder: _r,
    ...props
  }: {
    children?: React.ReactNode;
    axis?: string;
    values?: unknown[];
    onReorder?: (v: unknown[]) => void;
    [k: string]: unknown;
  }) => R.createElement("div", props, children);

  const ReorderItem = ({
    children,
    value: _v,
    initial: _i,
    animate: _an,
    exit: _e,
    transition: _t,
    ...props
  }: {
    children?: React.ReactNode;
    value?: unknown;
    initial?: unknown;
    animate?: unknown;
    exit?: unknown;
    transition?: unknown;
    [k: string]: unknown;
  }) => R.createElement("div", props, children);

  return {
    motion: new Proxy(
      {},
      {
        get: (_: unknown, tag: string) => makeEl(tag as string),
      }
    ),
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      R.createElement(R.Fragment, null, children),
    Reorder: {
      Group: ReorderGroup,
      Item: ReorderItem,
    },
  };
});

// SegmentCard: render a minimal stub so we can check calls without full setup
vi.mock("@/components/editor/SegmentCard", () => ({
  SegmentCard: ({
    segment,
    onToggleSelect,
    onPlay,
  }: {
    segment: Segment;
    isSelected: boolean;
    onToggleSelect: (id: string) => void;
    onPlay: (seg: Segment) => void;
    showDragHandle?: boolean;
  }) =>
    React.createElement("div", { "data-testid": `segment-card-${segment.id}` },
      React.createElement(
        "button",
        { onClick: () => onToggleSelect(segment.id), "data-testid": `toggle-${segment.id}` },
        "Toggle"
      ),
      React.createElement(
        "button",
        { onClick: () => onPlay(segment), "data-testid": `play-${segment.id}` },
        "Play"
      )
    ),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeSeg(overrides: Partial<Segment> = {}): Segment {
  return {
    id: "seg-1",
    projectId: "proj-1",
    startTime: 0,
    endTime: 60,
    text: "Test segment",
    speaker: null,
    speakerLabel: null,
    topicId: null,
    interestScore: null,
    clarityScore: null,
    topic: null,
    keyInsight: null,
    isSelected: false,
    order: 0,
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

function defaultProps(segments: Segment[] = []) {
  return {
    segments,
    onReorder: vi.fn(),
    onToggleSelect: vi.fn(),
    onPlaySegment: vi.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("Timeline", () => {
  describe("empty state", () => {
    it("renders empty state when no segments exist", () => {
      render(<Timeline {...defaultProps([])} />);
      expect(screen.getByText("No segments selected")).toBeInTheDocument();
    });

    it("renders empty state when segments exist but none are selected", () => {
      const segs = [makeSeg({ id: "a", isSelected: false })];
      render(<Timeline {...defaultProps(segs)} />);
      expect(screen.getByText("No segments selected")).toBeInTheDocument();
    });

    it("shows prompt to select segments in empty state", () => {
      render(<Timeline {...defaultProps([])} />);
      expect(
        screen.getByText(/Select segments from the removed segments section/i)
      ).toBeInTheDocument();
    });

    it("does not show duration info in empty state", () => {
      render(<Timeline {...defaultProps([])} />);
      expect(screen.queryByText("Total Duration:")).not.toBeInTheDocument();
    });
  });

  describe("with selected segments", () => {
    it("renders selected segments only", () => {
      const segs = [
        makeSeg({ id: "sel-1", isSelected: true, order: 1 }),
        makeSeg({ id: "not-sel", isSelected: false, order: 2 }),
      ];
      render(<Timeline {...defaultProps(segs)} />);
      expect(screen.getByTestId("segment-card-sel-1")).toBeInTheDocument();
      expect(screen.queryByTestId("segment-card-not-sel")).not.toBeInTheDocument();
    });

    it("shows total duration header", () => {
      const segs = [makeSeg({ id: "s1", isSelected: true, startTime: 0, endTime: 90, order: 1 })];
      render(<Timeline {...defaultProps(segs)} />);
      expect(screen.getByText("Total Duration:")).toBeInTheDocument();
    });

    it("formats duration as M:SS", () => {
      // 90 seconds = 1:30
      const segs = [makeSeg({ id: "s1", isSelected: true, startTime: 0, endTime: 90, order: 1 })];
      render(<Timeline {...defaultProps(segs)} />);
      expect(screen.getByText("1:30")).toBeInTheDocument();
    });

    it("formats sub-minute duration correctly", () => {
      // 45 seconds = 0:45
      const segs = [makeSeg({ id: "s1", isSelected: true, startTime: 0, endTime: 45, order: 1 })];
      render(<Timeline {...defaultProps(segs)} />);
      expect(screen.getByText("0:45")).toBeInTheDocument();
    });

    it("pads seconds with leading zero", () => {
      // 65 seconds = 1:05
      const segs = [makeSeg({ id: "s1", isSelected: true, startTime: 0, endTime: 65, order: 1 })];
      render(<Timeline {...defaultProps(segs)} />);
      expect(screen.getByText("1:05")).toBeInTheDocument();
    });

    it("sums duration across multiple segments", () => {
      // 60 + 90 = 150 seconds = 2:30
      const segs = [
        makeSeg({ id: "s1", isSelected: true, startTime: 0, endTime: 60, order: 1 }),
        makeSeg({ id: "s2", isSelected: true, startTime: 100, endTime: 190, order: 2 }),
      ];
      render(<Timeline {...defaultProps(segs)} />);
      expect(screen.getByText("2:30")).toBeInTheDocument();
    });

    it("displays singular 'segment' count when one segment", () => {
      const segs = [makeSeg({ id: "s1", isSelected: true, order: 1 })];
      render(<Timeline {...defaultProps(segs)} />);
      expect(screen.getByText("1 segment")).toBeInTheDocument();
    });

    it("displays plural 'segments' count when multiple segments", () => {
      const segs = [
        makeSeg({ id: "s1", isSelected: true, order: 1 }),
        makeSeg({ id: "s2", isSelected: true, order: 2 }),
      ];
      render(<Timeline {...defaultProps(segs)} />);
      expect(screen.getByText("2 segments")).toBeInTheDocument();
    });

    it("renders score legend", () => {
      const segs = [makeSeg({ id: "s1", isSelected: true, order: 1 })];
      render(<Timeline {...defaultProps(segs)} />);
      expect(screen.getByText("Score Legend:")).toBeInTheDocument();
      expect(screen.getByText("High (8-10)")).toBeInTheDocument();
      expect(screen.getByText("Medium (5-7)")).toBeInTheDocument();
      expect(screen.getByText("Low (0-4)")).toBeInTheDocument();
    });

    it("shows order numbers for each segment", () => {
      const segs = [
        makeSeg({ id: "s1", isSelected: true, order: 1 }),
        makeSeg({ id: "s2", isSelected: true, order: 2 }),
        makeSeg({ id: "s3", isSelected: true, order: 3 }),
      ];
      render(<Timeline {...defaultProps(segs)} />);
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("sorts segments by order field", () => {
      const segs = [
        makeSeg({ id: "s3", isSelected: true, order: 3 }),
        makeSeg({ id: "s1", isSelected: true, order: 1 }),
        makeSeg({ id: "s2", isSelected: true, order: 2 }),
      ];
      render(<Timeline {...defaultProps(segs)} />);
      const cards = screen.getAllByTestId(/segment-card-/);
      expect(cards[0].getAttribute("data-testid")).toBe("segment-card-s1");
      expect(cards[1].getAttribute("data-testid")).toBe("segment-card-s2");
      expect(cards[2].getAttribute("data-testid")).toBe("segment-card-s3");
    });
  });

  describe("score color logic", () => {
    it("applies green score bar for high interest (≥8)", () => {
      const segs = [makeSeg({ id: "s1", isSelected: true, order: 1, interestScore: 9 })];
      const { container } = render(<Timeline {...defaultProps(segs)} />);
      const scoreBar = container.querySelector(".bg-green-500");
      expect(scoreBar).toBeInTheDocument();
    });

    it("applies yellow score bar for medium interest (5-7)", () => {
      const segs = [makeSeg({ id: "s1", isSelected: true, order: 1, interestScore: 6 })];
      const { container } = render(<Timeline {...defaultProps(segs)} />);
      const scoreBar = container.querySelector(".bg-yellow-500");
      expect(scoreBar).toBeInTheDocument();
    });

    it("applies red score bar for low interest (<5)", () => {
      const segs = [makeSeg({ id: "s1", isSelected: true, order: 1, interestScore: 3 })];
      const { container } = render(<Timeline {...defaultProps(segs)} />);
      const scoreBar = container.querySelector(".bg-red-500");
      expect(scoreBar).toBeInTheDocument();
    });

    it("applies gray score bar when interestScore is null", () => {
      const segs = [makeSeg({ id: "s1", isSelected: true, order: 1, interestScore: null })];
      const { container } = render(<Timeline {...defaultProps(segs)} />);
      const scoreBar = container.querySelector(".bg-gray-500");
      expect(scoreBar).toBeInTheDocument();
    });

    it("boundary: score exactly 8 is green", () => {
      const segs = [makeSeg({ id: "s1", isSelected: true, order: 1, interestScore: 8 })];
      const { container } = render(<Timeline {...defaultProps(segs)} />);
      expect(container.querySelector(".bg-green-500")).toBeInTheDocument();
    });

    it("boundary: score exactly 5 is yellow", () => {
      const segs = [makeSeg({ id: "s1", isSelected: true, order: 1, interestScore: 5 })];
      const { container } = render(<Timeline {...defaultProps(segs)} />);
      expect(container.querySelector(".bg-yellow-500")).toBeInTheDocument();
    });
  });

  describe("callbacks", () => {
    it("calls onToggleSelect with segment id when toggle clicked", () => {
      const onToggleSelect = vi.fn();
      const segs = [makeSeg({ id: "seg-abc", isSelected: true, order: 1 })];
      render(<Timeline {...defaultProps(segs)} onToggleSelect={onToggleSelect} />);
      fireEvent.click(screen.getByTestId("toggle-seg-abc"));
      expect(onToggleSelect).toHaveBeenCalledWith("seg-abc");
    });

    it("calls onPlaySegment with segment when play clicked", () => {
      const onPlaySegment = vi.fn();
      const seg = makeSeg({ id: "seg-xyz", isSelected: true, order: 1 });
      render(<Timeline {...defaultProps([seg])} onPlaySegment={onPlaySegment} />);
      fireEvent.click(screen.getByTestId("play-seg-xyz"));
      expect(onPlaySegment).toHaveBeenCalledWith(seg);
    });

    it("calls onToggleSelect for the correct segment in a multi-segment list", () => {
      const onToggleSelect = vi.fn();
      const segs = [
        makeSeg({ id: "seg-1", isSelected: true, order: 1 }),
        makeSeg({ id: "seg-2", isSelected: true, order: 2 }),
      ];
      render(<Timeline {...defaultProps(segs)} onToggleSelect={onToggleSelect} />);
      fireEvent.click(screen.getByTestId("toggle-seg-2"));
      expect(onToggleSelect).toHaveBeenCalledWith("seg-2");
      expect(onToggleSelect).not.toHaveBeenCalledWith("seg-1");
    });
  });

  describe("className prop", () => {
    it("applies custom className in empty state", () => {
      const { container } = render(
        <Timeline {...defaultProps([])} className="custom-class" />
      );
      expect(container.firstChild).toHaveClass("custom-class");
    });

    it("applies custom className when segments are present", () => {
      const segs = [makeSeg({ id: "s1", isSelected: true, order: 1 })];
      const { container } = render(
        <Timeline {...defaultProps(segs)} className="my-custom" />
      );
      expect(container.firstChild).toHaveClass("my-custom");
    });
  });
});
