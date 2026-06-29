import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SegmentCard } from "@/components/editor/SegmentCard";
import type { Segment, SegmentAnalysis } from "@/lib/db/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    id: "seg-1",
    projectId: "proj-1",
    startTime: 65,   // 1:05
    endTime: 95,     // 1:35
    text: "This is the segment text for testing purposes.",
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

function makeAnalysis(overrides: Partial<SegmentAnalysis> = {}): SegmentAnalysis {
  return {
    topic: "Tech",
    interestScore: 7,
    clarityScore: 6,
    isTangent: false,
    isRepetition: false,
    keyInsight: "A key insight",
    dependsOn: [],
    standalone: false,
    hasFactualError: false,
    hasContradiction: false,
    isConfusing: false,
    isIncomplete: false,
    needsRerecord: false,
    rerecordSuggestion: null,
    ...overrides,
  } as SegmentAnalysis;
}

function defaultProps(segmentOverrides: Partial<Segment> = {}) {
  return {
    segment: makeSegment(segmentOverrides),
    isSelected: false,
    onToggleSelect: vi.fn(),
    onPlay: vi.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("SegmentCard", () => {
  describe("basic rendering", () => {
    it("renders the segment text", () => {
      render(<SegmentCard {...defaultProps()} />);
      expect(screen.getByText("This is the segment text for testing purposes.")).toBeInTheDocument();
    });

    it("renders a select/deselect button with correct aria-label when not selected", () => {
      render(<SegmentCard {...defaultProps()} />);
      expect(screen.getByRole("button", { name: "Select segment" })).toBeInTheDocument();
    });

    it("renders aria-label 'Deselect segment' when isSelected is true", () => {
      render(<SegmentCard {...defaultProps()} isSelected />);
      expect(screen.getByRole("button", { name: "Deselect segment" })).toBeInTheDocument();
    });

    it("renders the play button", () => {
      render(<SegmentCard {...defaultProps()} />);
      expect(screen.getByTitle("Play segment")).toBeInTheDocument();
    });

    it("renders the expand button", () => {
      render(<SegmentCard {...defaultProps()} />);
      expect(screen.getByTitle("Show more")).toBeInTheDocument();
    });
  });

  describe("time formatting", () => {
    it("formats start and end times as M:SS badges", () => {
      render(<SegmentCard {...defaultProps()} />);
      // 65s = 1:05, 95s = 1:35
      expect(screen.getByText("1:05 - 1:35")).toBeInTheDocument();
    });

    it("formats duration as M:SS badge", () => {
      render(<SegmentCard {...defaultProps()} />);
      // duration = 95 - 65 = 30s = 0:30
      expect(screen.getByText("0:30")).toBeInTheDocument();
    });

    it("pads single-digit seconds with leading zero", () => {
      render(<SegmentCard {...defaultProps({ startTime: 0, endTime: 9 })} />);
      expect(screen.getByText("0:00 - 0:09")).toBeInTheDocument();
    });

    it("handles times spanning multiple minutes", () => {
      render(<SegmentCard {...defaultProps({ startTime: 0, endTime: 3661 })} />);
      // 3661s = 61:01
      expect(screen.getByText("0:00 - 61:01")).toBeInTheDocument();
    });
  });

  describe("text truncation", () => {
    it("shows full text when it is 120 characters or fewer", () => {
      const text = "a".repeat(120);
      render(<SegmentCard {...defaultProps({ text })} />);
      expect(screen.getByText(text)).toBeInTheDocument();
    });

    it("truncates text longer than 120 characters and appends ellipsis", () => {
      const text = "a".repeat(130);
      render(<SegmentCard {...defaultProps({ text })} />);
      expect(screen.getByText("a".repeat(120) + "...")).toBeInTheDocument();
    });

    it("shows full text when expanded", () => {
      const text = "b".repeat(200);
      render(<SegmentCard {...defaultProps({ text })} />);
      // Click expand
      fireEvent.click(screen.getByTitle("Show more"));
      expect(screen.getByText(text)).toBeInTheDocument();
    });
  });

  describe("selection toggle", () => {
    it("calls onToggleSelect with the segment id when checkbox is clicked", () => {
      const onToggleSelect = vi.fn();
      render(<SegmentCard {...defaultProps()} onToggleSelect={onToggleSelect} />);
      fireEvent.click(screen.getByRole("button", { name: "Select segment" }));
      expect(onToggleSelect).toHaveBeenCalledTimes(1);
      expect(onToggleSelect).toHaveBeenCalledWith("seg-1");
    });

    it("does not call onPlay when the checkbox is clicked", () => {
      const onPlay = vi.fn();
      const onToggleSelect = vi.fn();
      render(<SegmentCard {...defaultProps()} onPlay={onPlay} onToggleSelect={onToggleSelect} />);
      fireEvent.click(screen.getByRole("button", { name: "Select segment" }));
      expect(onPlay).not.toHaveBeenCalled();
    });
  });

  describe("play button", () => {
    it("calls onPlay with the full segment when the play button is clicked", () => {
      const onPlay = vi.fn();
      const segment = makeSegment();
      render(<SegmentCard segment={segment} isSelected={false} onToggleSelect={vi.fn()} onPlay={onPlay} />);
      fireEvent.click(screen.getByTitle("Play segment"));
      expect(onPlay).toHaveBeenCalledTimes(1);
      expect(onPlay).toHaveBeenCalledWith(segment);
    });
  });

  describe("expand / collapse", () => {
    it("shows 'Show more' title before expansion", () => {
      render(<SegmentCard {...defaultProps()} />);
      expect(screen.getByTitle("Show more")).toBeInTheDocument();
    });

    it("shows 'Show less' title after clicking expand", () => {
      render(<SegmentCard {...defaultProps()} />);
      fireEvent.click(screen.getByTitle("Show more"));
      expect(screen.getByTitle("Show less")).toBeInTheDocument();
    });

    it("collapses again when 'Show less' is clicked", () => {
      render(<SegmentCard {...defaultProps()} />);
      fireEvent.click(screen.getByTitle("Show more"));
      fireEvent.click(screen.getByTitle("Show less"));
      expect(screen.getByTitle("Show more")).toBeInTheDocument();
    });

    it("shows key insight in expanded view", () => {
      render(<SegmentCard {...defaultProps({ keyInsight: "The crucial insight" })} />);
      fireEvent.click(screen.getByTitle("Show more"));
      expect(screen.getByText("The crucial insight")).toBeInTheDocument();
    });

    it("does not show key insight before expanding", () => {
      render(<SegmentCard {...defaultProps({ keyInsight: "The crucial insight" })} />);
      expect(screen.queryByText("The crucial insight")).not.toBeInTheDocument();
    });
  });

  describe("score badges", () => {
    it("shows interest score badge when interestScore is set", () => {
      render(<SegmentCard {...defaultProps({ interestScore: 8 })} />);
      expect(screen.getByText("Interest: 8/10")).toBeInTheDocument();
    });

    it("shows clarity score badge when clarityScore is set", () => {
      render(<SegmentCard {...defaultProps({ clarityScore: 5 })} />);
      expect(screen.getByText("Clarity: 5/10")).toBeInTheDocument();
    });

    it("omits interest score badge when interestScore is null", () => {
      render(<SegmentCard {...defaultProps({ interestScore: null })} />);
      expect(screen.queryByText(/Interest:/)).not.toBeInTheDocument();
    });

    it("omits clarity score badge when clarityScore is null", () => {
      render(<SegmentCard {...defaultProps({ clarityScore: null })} />);
      expect(screen.queryByText(/Clarity:/)).not.toBeInTheDocument();
    });
  });

  describe("topic badge", () => {
    it("shows the topic badge when topic is set", () => {
      render(<SegmentCard {...defaultProps({ topic: "AI & Machine Learning" })} />);
      expect(screen.getByText("AI & Machine Learning")).toBeInTheDocument();
    });

    it("does not show a topic badge when topic is null", () => {
      render(<SegmentCard {...defaultProps({ topic: null })} />);
      // There should be no badge whose text could be a topic label
      expect(screen.queryByText("AI & Machine Learning")).not.toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("shows error badge with errorType when hasError is true", () => {
      render(<SegmentCard {...defaultProps({ hasError: true, errorType: "audio_glitch" })} />);
      expect(screen.getByText("audio_glitch")).toBeInTheDocument();
    });

    it("shows fallback 'Error' text when errorType is null but hasError is true", () => {
      render(<SegmentCard {...defaultProps({ hasError: true, errorType: null })} />);
      expect(screen.getByText("Error")).toBeInTheDocument();
    });

    it("shows error detail in expanded view when hasError is true", () => {
      render(
        <SegmentCard
          {...defaultProps({ hasError: true, errorDetail: "Corrupted audio frame at 00:01:05" })}
        />
      );
      fireEvent.click(screen.getByTitle("Show more"));
      expect(screen.getByText("Corrupted audio frame at 00:01:05")).toBeInTheDocument();
    });

    it("does not show error badge when hasError is false", () => {
      render(<SegmentCard {...defaultProps({ hasError: false })} />);
      expect(screen.queryByText("Error")).not.toBeInTheDocument();
    });
  });

  describe("drag handle", () => {
    it("does not render a drag handle by default", () => {
      const { container } = render(<SegmentCard {...defaultProps()} />);
      // The drag handle div has cursor-grab class
      expect(container.querySelector(".cursor-grab")).not.toBeInTheDocument();
    });

    it("renders a drag handle when showDragHandle is true", () => {
      const { container } = render(<SegmentCard {...defaultProps()} showDragHandle />);
      expect(container.querySelector(".cursor-grab")).toBeInTheDocument();
    });
  });

  describe("rerecord badge", () => {
    it("shows 'Rerecord Suggested' badge when analysis.needsRerecord is true", () => {
      const analysis = makeAnalysis({ needsRerecord: true });
      render(<SegmentCard {...defaultProps({ analysis })} />);
      expect(screen.getByText("Rerecord Suggested")).toBeInTheDocument();
    });

    it("does not show 'Rerecord Suggested' badge when analysis.needsRerecord is false", () => {
      const analysis = makeAnalysis({ needsRerecord: false });
      render(<SegmentCard {...defaultProps({ analysis })} />);
      expect(screen.queryByText("Rerecord Suggested")).not.toBeInTheDocument();
    });

    it("does not show 'Rerecord Suggested' badge when analysis is null", () => {
      render(<SegmentCard {...defaultProps({ analysis: null })} />);
      expect(screen.queryByText("Rerecord Suggested")).not.toBeInTheDocument();
    });
  });

  describe("analysis details (expanded)", () => {
    it("shows 'Tangent detected' when analysis.isTangent is true", () => {
      const analysis = makeAnalysis({ isTangent: true });
      render(<SegmentCard {...defaultProps({ analysis })} />);
      fireEvent.click(screen.getByTitle("Show more"));
      expect(screen.getByText("Tangent detected")).toBeInTheDocument();
    });

    it("shows 'Contains repetition' when analysis.isRepetition is true", () => {
      const analysis = makeAnalysis({ isRepetition: true });
      render(<SegmentCard {...defaultProps({ analysis })} />);
      fireEvent.click(screen.getByTitle("Show more"));
      expect(screen.getByText("Contains repetition")).toBeInTheDocument();
    });

    it("shows 'Standalone' when analysis.standalone is true", () => {
      const analysis = makeAnalysis({ standalone: true });
      render(<SegmentCard {...defaultProps({ analysis })} />);
      fireEvent.click(screen.getByTitle("Show more"));
      expect(screen.getByText("Standalone")).toBeInTheDocument();
    });

    it("shows 'Factual error' when analysis.hasFactualError is true", () => {
      const analysis = makeAnalysis({ hasFactualError: true });
      render(<SegmentCard {...defaultProps({ analysis })} />);
      fireEvent.click(screen.getByTitle("Show more"));
      expect(screen.getByText("Factual error")).toBeInTheDocument();
    });

    it("shows factualErrorDetail in expanded view", () => {
      const analysis = makeAnalysis({ hasFactualError: true, factualErrorDetail: "Wrong date cited" });
      render(<SegmentCard {...defaultProps({ analysis })} />);
      fireEvent.click(screen.getByTitle("Show more"));
      expect(screen.getByText(/Wrong date cited/)).toBeInTheDocument();
    });

    it("shows 'Contradiction' when analysis.hasContradiction is true", () => {
      const analysis = makeAnalysis({ hasContradiction: true });
      render(<SegmentCard {...defaultProps({ analysis })} />);
      fireEvent.click(screen.getByTitle("Show more"));
      expect(screen.getByText("Contradiction")).toBeInTheDocument();
    });

    it("shows 'Confusing' when analysis.isConfusing is true", () => {
      const analysis = makeAnalysis({ isConfusing: true });
      render(<SegmentCard {...defaultProps({ analysis })} />);
      fireEvent.click(screen.getByTitle("Show more"));
      expect(screen.getByText("Confusing")).toBeInTheDocument();
    });

    it("shows 'Incomplete' when analysis.isIncomplete is true", () => {
      const analysis = makeAnalysis({ isIncomplete: true });
      render(<SegmentCard {...defaultProps({ analysis })} />);
      fireEvent.click(screen.getByTitle("Show more"));
      expect(screen.getByText("Incomplete")).toBeInTheDocument();
    });

    it("shows rerecord suggestion text in expanded view", () => {
      const analysis = makeAnalysis({ needsRerecord: true, rerecordSuggestion: "Re-record with more energy" });
      render(<SegmentCard {...defaultProps({ analysis })} />);
      fireEvent.click(screen.getByTitle("Show more"));
      expect(screen.getByText("Re-record with more energy")).toBeInTheDocument();
    });

    it("does not show analysis section when analysis is null", () => {
      render(<SegmentCard {...defaultProps({ analysis: null })} />);
      fireEvent.click(screen.getByTitle("Show more"));
      expect(screen.queryByText("Tangent detected")).not.toBeInTheDocument();
      expect(screen.queryByText("Analysis:")).not.toBeInTheDocument();
    });
  });
});
