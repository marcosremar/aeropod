import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { TranscriptEditor } from "@/components/editor/TranscriptEditor";
import { Segment, WordTimestamp, TextCut } from "@/lib/db/schema";

// ─── Suppress noisy logs + mock missing JSDOM APIs ───────────────────────────
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  // JSDOM does not implement scrollIntoView
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    id: "seg-1",
    projectId: "proj-1",
    startTime: 0,
    endTime: 10,
    text: "Hello world foo bar",
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
    createdAt: new Date(),
    ...overrides,
  };
}

function defaultProps(
  overrides: Partial<React.ComponentProps<typeof TranscriptEditor>> = {}
) {
  return {
    segments: [makeSegment()],
    currentTime: 0,
    onSeekTo: vi.fn(),
    onSelectSegment: vi.fn(),
    onUpdateSegment: vi.fn(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("TranscriptEditor", () => {
  // ── Empty state ─────────────────────────────────────────────────────────────

  describe("empty state", () => {
    it("shows empty state message when no segments", () => {
      render(<TranscriptEditor {...defaultProps({ segments: [] })} />);
      expect(screen.getByText("Nenhuma transcricao disponivel")).toBeInTheDocument();
    });

    it("shows segment count in footer", () => {
      render(<TranscriptEditor {...defaultProps()} />);
      expect(screen.getByText("1 segmentos")).toBeInTheDocument();
    });

    it("shows correct footer when multiple segments", () => {
      const segs = [
        makeSegment({ id: "seg-1", startTime: 0, endTime: 5 }),
        makeSegment({ id: "seg-2", startTime: 5, endTime: 10 }),
      ];
      render(<TranscriptEditor {...defaultProps({ segments: segs })} />);
      expect(screen.getByText("2 segmentos")).toBeInTheDocument();
    });
  });

  // ── Segment rendering ───────────────────────────────────────────────────────

  describe("segment rendering", () => {
    it("renders segment text", () => {
      render(<TranscriptEditor {...defaultProps()} />);
      expect(screen.getByText("Hello world foo bar")).toBeInTheDocument();
    });

    it("renders multiple segments sorted by startTime", () => {
      const segs = [
        makeSegment({ id: "seg-b", startTime: 10, endTime: 20, text: "Second segment" }),
        makeSegment({ id: "seg-a", startTime: 0, endTime: 10, text: "First segment" }),
      ];
      render(<TranscriptEditor {...defaultProps({ segments: segs })} />);
      const items = screen.getAllByText(/segment/);
      expect(items[0].textContent).toBe("First segment");
      expect(items[1].textContent).toBe("Second segment");
    });

    it("renders topic label when present", () => {
      const seg = makeSegment({ topic: "Introduction" });
      render(<TranscriptEditor {...defaultProps({ segments: [seg] })} />);
      expect(screen.getByText("Introduction")).toBeInTheDocument();
    });

    it("shows selected badge when segment is selected", () => {
      const seg = makeSegment({ isSelected: true });
      render(<TranscriptEditor {...defaultProps({ segments: [seg] })} />);
      expect(screen.getByText("Selecionado")).toBeInTheDocument();
    });

    it("renders formatted start time as a play button", () => {
      const seg = makeSegment({ startTime: 65 });
      render(<TranscriptEditor {...defaultProps({ segments: [seg] })} />);
      expect(screen.getByText("1:05")).toBeInTheDocument();
    });

    it("calls onSeekTo when time button clicked", () => {
      const onSeekTo = vi.fn();
      const seg = makeSegment({ startTime: 30 });
      render(<TranscriptEditor {...defaultProps({ segments: [seg], onSeekTo })} />);
      fireEvent.click(screen.getByText("0:30"));
      expect(onSeekTo).toHaveBeenCalledWith(30);
    });

    it("shows interest score on hover area", () => {
      const seg = makeSegment({ interestScore: 8 });
      render(<TranscriptEditor {...defaultProps({ segments: [seg] })} />);
      expect(screen.getByText("Interesse: 8/10")).toBeInTheDocument();
    });

    it("shows clarity score on hover area", () => {
      const seg = makeSegment({ clarityScore: 6 });
      render(<TranscriptEditor {...defaultProps({ segments: [seg] })} />);
      expect(screen.getByText("Clareza: 6/10")).toBeInTheDocument();
    });
  });

  // ── Search ───────────────────────────────────────────────────────────────────

  describe("search functionality", () => {
    it("renders search input", () => {
      render(<TranscriptEditor {...defaultProps()} />);
      expect(screen.getByPlaceholderText("Buscar na transcricao...")).toBeInTheDocument();
    });

    it("shows match count when search finds results", () => {
      const segs = [
        makeSegment({ id: "1", text: "Hello world" }),
        makeSegment({ id: "2", startTime: 5, text: "world of code" }),
      ];
      render(<TranscriptEditor {...defaultProps({ segments: segs })} />);
      fireEvent.change(screen.getByPlaceholderText("Buscar na transcricao..."), {
        target: { value: "world" },
      });
      expect(screen.getByText("1/2")).toBeInTheDocument();
    });

    it("shows no count when search has no results", () => {
      render(<TranscriptEditor {...defaultProps()} />);
      fireEvent.change(screen.getByPlaceholderText("Buscar na transcricao..."), {
        target: { value: "xyznotfound" },
      });
      expect(screen.queryByText(/\d+\/\d+/)).not.toBeInTheDocument();
    });

    it("clear button removes search query", () => {
      render(<TranscriptEditor {...defaultProps()} />);
      const input = screen.getByPlaceholderText("Buscar na transcricao...");
      fireEvent.change(input, { target: { value: "hello" } });
      expect(input).toHaveValue("hello");
      // The clear button is the sibling button after the nav buttons (last in search bar)
      // It's inside the div that only appears when searchQuery is set
      const allButtons = screen.getAllByRole("button");
      // Find the button whose click clears the input by clicking them until it's cleared
      const clearBtn = allButtons.find((b) => {
        // The clear button has a class containing "text-zinc-400" and is the last nav button
        return b.className.includes("text-zinc-400") && !b.hasAttribute("disabled");
      });
      // Last "text-zinc-400" button in the search area is the clear X
      const searchAreaButtons = allButtons.filter((b) =>
        b.className.includes("text-zinc-400") && b.className.includes("hover:text-white")
      );
      fireEvent.click(searchAreaButtons[searchAreaButtons.length - 1]);
      expect(input).toHaveValue("");
    });

    it("search is case-insensitive", () => {
      const seg = makeSegment({ text: "Hello World" });
      render(<TranscriptEditor {...defaultProps({ segments: [seg] })} />);
      fireEvent.change(screen.getByPlaceholderText("Buscar na transcricao..."), {
        target: { value: "HELLO" },
      });
      expect(screen.getByText("1/1")).toBeInTheDocument();
    });

    it("navigation buttons are disabled when no search results", () => {
      render(<TranscriptEditor {...defaultProps()} />);
      const input = screen.getByPlaceholderText("Buscar na transcricao...");
      fireEvent.change(input, { target: { value: "zzznomatch" } });
      const navBtns = screen.getAllByRole("button").filter((b) =>
        b.getAttribute("disabled") !== null
      );
      expect(navBtns.length).toBeGreaterThan(0);
    });
  });

  // ── Edit mode ───────────────────────────────────────────────────────────────

  describe("edit mode", () => {
    it("double-clicking segment enters edit mode", () => {
      render(<TranscriptEditor {...defaultProps()} />);
      const segText = screen.getByText("Hello world foo bar");
      fireEvent.doubleClick(segText);
      // getByRole("textbox") matches both the search input and the edit textarea
      const textboxes = screen.getAllByRole("textbox");
      expect(textboxes.length).toBeGreaterThanOrEqual(2);
      expect(textboxes.some((el) => el.tagName === "TEXTAREA")).toBe(true);
    });

    it("textarea contains segment text when edit starts", () => {
      render(<TranscriptEditor {...defaultProps()} />);
      const segText = screen.getByText("Hello world foo bar");
      fireEvent.doubleClick(segText);
      const textarea = screen
        .getAllByRole("textbox")
        .find((el) => el.tagName === "TEXTAREA") as HTMLTextAreaElement;
      expect(textarea.value).toBe("Hello world foo bar");
    });

    it("shows original text label when editing", () => {
      render(<TranscriptEditor {...defaultProps()} />);
      fireEvent.doubleClick(screen.getByText("Hello world foo bar"));
      expect(screen.getByText("Texto original")).toBeInTheDocument();
    });

    it("cancel button exits edit mode", () => {
      render(<TranscriptEditor {...defaultProps()} />);
      fireEvent.doubleClick(screen.getByText("Hello world foo bar"));
      expect(
        screen.getAllByRole("textbox").some((el) => el.tagName === "TEXTAREA")
      ).toBe(true);
      fireEvent.click(screen.getByText("Cancelar"));
      expect(
        screen.getAllByRole("textbox").every((el) => el.tagName !== "TEXTAREA")
      ).toBe(true);
    });

    it("save button is disabled when text unchanged", () => {
      render(<TranscriptEditor {...defaultProps()} />);
      fireEvent.doubleClick(screen.getByText("Hello world foo bar"));
      const saveBtn = screen.getByText("Salvar Alteracoes").closest("button");
      expect(saveBtn).toBeDisabled();
    });

    it("save button enables when text is changed", () => {
      render(<TranscriptEditor {...defaultProps()} />);
      fireEvent.doubleClick(screen.getByText("Hello world foo bar"));
      const textarea = screen
        .getAllByRole("textbox")
        .find((el) => el.tagName === "TEXTAREA") as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "Hello world" } });
      const saveBtn = screen.getByText("Salvar Alteracoes").closest("button");
      expect(saveBtn).not.toBeDisabled();
    });

    it("saving calls onUpdateSegment with editedText", async () => {
      const onUpdateSegment = vi.fn();
      render(<TranscriptEditor {...defaultProps({ onUpdateSegment })} />);
      fireEvent.doubleClick(screen.getByText("Hello world foo bar"));
      const textarea = screen
        .getAllByRole("textbox")
        .find((el) => el.tagName === "TEXTAREA") as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "Hello world" } });
      fireEvent.click(screen.getByText("Salvar Alteracoes"));
      await waitFor(() => {
        expect(onUpdateSegment).toHaveBeenCalledWith(
          "seg-1",
          expect.objectContaining({ editedText: "Hello world" })
        );
      });
    });

    it("saving exits edit mode", async () => {
      render(<TranscriptEditor {...defaultProps()} />);
      fireEvent.doubleClick(screen.getByText("Hello world foo bar"));
      const textarea = screen
        .getAllByRole("textbox")
        .find((el) => el.tagName === "TEXTAREA") as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "Hello world" } });
      fireEvent.click(screen.getByText("Salvar Alteracoes"));
      await waitFor(() => {
        expect(
          screen.getAllByRole("textbox").every((el) => el.tagName !== "TEXTAREA")
        ).toBe(true);
      });
    });

    it("shows correct label without word timestamps", () => {
      const seg = makeSegment({ wordTimestamps: null });
      render(<TranscriptEditor {...defaultProps({ segments: [seg] })} />);
      fireEvent.doubleClick(screen.getByText("Hello world foo bar"));
      expect(
        screen.getByText("Texto editado (salve para manter suas alteracoes)")
      ).toBeInTheDocument();
    });

    it("shows correct label with word timestamps", () => {
      const words: WordTimestamp[] = [
        { word: "Hello", start: 0, end: 1 },
        { word: "world", start: 1, end: 2 },
      ];
      const seg = makeSegment({ wordTimestamps: words });
      render(<TranscriptEditor {...defaultProps({ segments: [seg] })} />);
      fireEvent.doubleClick(screen.getByText("Hello world foo bar"));
      expect(
        screen.getByText("Texto editado (remova palavras para cortar o audio)")
      ).toBeInTheDocument();
    });

    it("save does nothing (stays in edit mode) when onUpdateSegment is not provided", () => {
      render(
        <TranscriptEditor
          segments={[makeSegment()]}
          currentTime={0}
          onSeekTo={vi.fn()}
          onSelectSegment={vi.fn()}
        />
      );
      fireEvent.doubleClick(screen.getByText("Hello world foo bar"));
      const textarea = screen
        .getAllByRole("textbox")
        .find((el) => el.tagName === "TEXTAREA") as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "Hello world" } });
      // Should not throw — but the save is a no-op without onUpdateSegment
      expect(() => fireEvent.click(screen.getByText("Salvar Alteracoes"))).not.toThrow();
      // Edit mode stays active (early return in saveSegmentEdits)
      expect(
        screen.getAllByRole("textbox").some((el) => el.tagName === "TEXTAREA")
      ).toBe(true);
    });
  });

  // ── Word-level cuts ─────────────────────────────────────────────────────────

  describe("word-level editing", () => {
    it("passes word timestamps to onUpdateSegment on save", async () => {
      const onUpdateSegment = vi.fn();
      const words: WordTimestamp[] = [
        { word: "Hello", start: 0, end: 1 },
        { word: "world", start: 1, end: 2 },
        { word: "foo", start: 2, end: 3 },
      ];
      const seg = makeSegment({ text: "Hello world foo", wordTimestamps: words });
      render(
        <TranscriptEditor
          {...defaultProps({ segments: [seg], onUpdateSegment })}
        />
      );
      fireEvent.doubleClick(screen.getByText("Hello world foo"));
      const textarea = screen
        .getAllByRole("textbox")
        .find((el) => el.tagName === "TEXTAREA") as HTMLTextAreaElement;
      // Remove "foo" from the text
      fireEvent.change(textarea, { target: { value: "Hello world" } });
      fireEvent.click(screen.getByText("Salvar Alteracoes"));
      await waitFor(() => {
        expect(onUpdateSegment).toHaveBeenCalledWith(
          "seg-1",
          expect.objectContaining({
            editedText: "Hello world",
            wordTimestamps: expect.arrayContaining([
              expect.objectContaining({ word: "foo", isDeleted: true }),
            ]),
          })
        );
      });
    });
  });

  // ── Saved edits / revert ────────────────────────────────────────────────────

  describe("saved edits display", () => {
    it("shows editedText when segment has saved edits", () => {
      const words: WordTimestamp[] = [
        { word: "Hello", start: 0, end: 1, isDeleted: false },
        { word: "foo", start: 1, end: 2, isDeleted: true },
      ];
      const cuts: TextCut[] = [
        { startTime: 1, endTime: 2, deletedText: "foo", wordIndices: [1] },
      ];
      const seg = makeSegment({
        editedText: "Hello",
        wordTimestamps: words,
        textCuts: cuts,
      });
      render(<TranscriptEditor {...defaultProps({ segments: [seg] })} />);
      // Should show the edited text
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    it("shows cut count badge when segment has cuts", () => {
      const words: WordTimestamp[] = [
        { word: "Hello", start: 0, end: 1, isDeleted: false },
        { word: "foo", start: 1, end: 2, isDeleted: true },
      ];
      const cuts: TextCut[] = [
        { startTime: 1, endTime: 2, deletedText: "foo", wordIndices: [1] },
      ];
      const seg = makeSegment({
        editedText: "Hello",
        wordTimestamps: words,
        textCuts: cuts,
      });
      render(<TranscriptEditor {...defaultProps({ segments: [seg] })} />);
      expect(screen.getByText(/1 corte/)).toBeInTheDocument();
    });

    it("shows deleted words with strikethrough badge", () => {
      const words: WordTimestamp[] = [
        { word: "Hello", start: 0, end: 1, isDeleted: false },
        { word: "foo", start: 1, end: 2, isDeleted: true },
      ];
      const cuts: TextCut[] = [
        { startTime: 1, endTime: 2, deletedText: "foo", wordIndices: [1] },
      ];
      const seg = makeSegment({
        editedText: "Hello",
        wordTimestamps: words,
        textCuts: cuts,
      });
      render(<TranscriptEditor {...defaultProps({ segments: [seg] })} />);
      expect(screen.getByText("foo")).toBeInTheDocument();
    });

    it("revert button calls onUpdateSegment to clear edits", () => {
      const onUpdateSegment = vi.fn();
      const words: WordTimestamp[] = [
        { word: "Hello", start: 0, end: 1, isDeleted: false },
        { word: "foo", start: 1, end: 2, isDeleted: true },
      ];
      const cuts: TextCut[] = [
        { startTime: 1, endTime: 2, deletedText: "foo", wordIndices: [1] },
      ];
      const seg = makeSegment({
        editedText: "Hello",
        wordTimestamps: words,
        textCuts: cuts,
      });
      render(
        <TranscriptEditor {...defaultProps({ segments: [seg], onUpdateSegment })} />
      );
      fireEvent.click(screen.getByText("Reverter para original"));
      expect(onUpdateSegment).toHaveBeenCalledWith(
        "seg-1",
        expect.objectContaining({ textCuts: [], editedText: null })
      );
    });
  });

  // ── Footer stats ─────────────────────────────────────────────────────────────

  describe("footer stats", () => {
    it("shows 0 selected when none are selected", () => {
      render(<TranscriptEditor {...defaultProps()} />);
      expect(screen.getByText("0 selecionados")).toBeInTheDocument();
    });

    it("shows correct selected count", () => {
      const segs = [
        makeSegment({ id: "1", isSelected: true }),
        makeSegment({ id: "2", startTime: 5, isSelected: false }),
      ];
      render(<TranscriptEditor {...defaultProps({ segments: segs })} />);
      expect(screen.getByText("1 selecionados")).toBeInTheDocument();
    });

    it("shows edited count when segments have saved edits", () => {
      const words: WordTimestamp[] = [
        { word: "Hello", start: 0, end: 1, isDeleted: true },
      ];
      const cuts: TextCut[] = [
        { startTime: 0, endTime: 1, deletedText: "Hello", wordIndices: [0] },
      ];
      const seg = makeSegment({
        editedText: "world",
        wordTimestamps: words,
        textCuts: cuts,
      });
      render(<TranscriptEditor {...defaultProps({ segments: [seg] })} />);
      expect(screen.getByText("1 editado")).toBeInTheDocument();
    });
  });

  // ── Current time highlight ───────────────────────────────────────────────────

  describe("currentTime highlighting", () => {
    it("does not throw when currentTime matches a segment", () => {
      const seg = makeSegment({ startTime: 0, endTime: 10 });
      expect(() =>
        render(<TranscriptEditor {...defaultProps({ segments: [seg], currentTime: 5 })} />)
      ).not.toThrow();
    });

    it("does not throw when currentTime is between segments (gap)", () => {
      const segs = [
        makeSegment({ id: "1", startTime: 0, endTime: 5 }),
        makeSegment({ id: "2", startTime: 10, endTime: 15 }),
      ];
      expect(() =>
        render(
          <TranscriptEditor {...defaultProps({ segments: segs, currentTime: 7 })} />
        )
      ).not.toThrow();
    });
  });
});
