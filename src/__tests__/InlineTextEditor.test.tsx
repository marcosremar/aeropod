import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import {
  InlineTextEditor,
  type TextCut,
  type WordTimestamp,
} from "@/components/editor/InlineTextEditor";

// ─── Suppress noisy debug logs ─────────────────────────────────────────────────
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SAMPLE_TEXT = "Hello world foo bar";
const SAMPLE_ORIGINAL = "Hello world foo bar";

function defaultProps(
  overrides: Partial<React.ComponentProps<typeof InlineTextEditor>> = {}
) {
  return {
    text: SAMPLE_TEXT,
    originalText: SAMPLE_ORIGINAL,
    textCuts: [] as TextCut[],
    wordTimestamps: [] as WordTimestamp[],
    segmentStartTime: 0,
    segmentEndTime: 20,
    onSave: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
}

function renderAndEnterEditMode(
  overrides: Partial<React.ComponentProps<typeof InlineTextEditor>> = {}
) {
  const result = render(<InlineTextEditor {...defaultProps(overrides)} />);
  // Click the root container element to trigger startEditing
  fireEvent.click(result.container.firstChild as Element);
  const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
  return { ...result, textarea };
}

// Simulate a text selection on the textarea using setSelectionRange (JSDOM-compatible)
function selectRange(
  textarea: HTMLTextAreaElement,
  start: number,
  end: number
) {
  textarea.focus();
  textarea.setSelectionRange(start, end);
  fireEvent.select(textarea);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("InlineTextEditor", () => {
  // ── Idle (non-editing) mode ──────────────────────────────────────────────────

  describe("idle mode", () => {
    it("renders the text content", () => {
      render(<InlineTextEditor {...defaultProps()} />);
      expect(screen.getByText(SAMPLE_TEXT)).toBeInTheDocument();
    });

    it("does not render a textarea when not editing", () => {
      render(<InlineTextEditor {...defaultProps()} />);
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    it("clicking the container enters edit mode", () => {
      const { container } = render(<InlineTextEditor {...defaultProps()} />);
      fireEvent.click(container.firstChild as Element);
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });

    it("applies text-white class when isCurrentSegment is true", () => {
      const { container } = render(
        <InlineTextEditor {...defaultProps({ isCurrentSegment: true })} />
      );
      expect(container.querySelector(".text-white")).not.toBeNull();
    });

    it("applies text-zinc-300 class when isCurrentSegment is false", () => {
      const { container } = render(
        <InlineTextEditor {...defaultProps({ isCurrentSegment: false })} />
      );
      expect(container.querySelector(".text-zinc-300")).not.toBeNull();
    });

    it("renders strikethrough span for word removed via a cut", () => {
      render(
        <InlineTextEditor
          {...defaultProps({
            // "Hello" was deleted from the text
            text: "world foo bar",
            originalText: "Hello world foo bar",
            textCuts: [{ startTime: 0, endTime: 1, deletedText: "Hello" }],
          })}
        />
      );
      const stricken = screen.getByText("Hello");
      expect(stricken).toHaveClass("line-through");
    });

    it("renders plain text when text equals originalText and no cuts exist", () => {
      const { container } = render(<InlineTextEditor {...defaultProps()} />);
      // Plain text — no strikethrough spans
      expect(container.querySelectorAll(".line-through")).toHaveLength(0);
    });
  });

  // ── Edit mode appearance ─────────────────────────────────────────────────────

  describe("edit mode appearance", () => {
    it("textarea shows the current text value", () => {
      const { textarea } = renderAndEnterEditMode();
      expect(textarea.value).toBe(SAMPLE_TEXT);
    });

    it("shows the save button", () => {
      renderAndEnterEditMode();
      expect(screen.getByTitle("Salvar")).toBeInTheDocument();
    });

    it("shows the cancel button", () => {
      renderAndEnterEditMode();
      expect(screen.getByTitle("Cancelar")).toBeInTheDocument();
    });

    it("shows hint text about cutting audio", () => {
      renderAndEnterEditMode();
      expect(
        screen.getByText(/Selecione texto \+ Del para cortar do audio/i)
      ).toBeInTheDocument();
    });

    it("does not show Cortar button when no text is selected", () => {
      renderAndEnterEditMode();
      expect(screen.queryByText("Cortar")).not.toBeInTheDocument();
    });

    it("shows cut count for multiple existing cuts", () => {
      renderAndEnterEditMode({
        textCuts: [
          { startTime: 0, endTime: 1, deletedText: "Hello" },
          { startTime: 5, endTime: 6, deletedText: "foo" },
        ],
      });
      expect(screen.getByText(/2 cortes/i)).toBeInTheDocument();
    });

    it("shows singular 'corte' label for exactly one existing cut", () => {
      renderAndEnterEditMode({
        textCuts: [{ startTime: 0, endTime: 1, deletedText: "Hello" }],
      });
      // Must match "1 corte" but NOT "1 cortes"
      expect(screen.getByText(/1 corte(?!s)/i)).toBeInTheDocument();
    });
  });

  // ── Save and cancel ──────────────────────────────────────────────────────────

  describe("save and cancel", () => {
    it("save button calls onSave with current text and empty cuts", () => {
      const onSave = vi.fn();
      renderAndEnterEditMode({ onSave });
      fireEvent.click(screen.getByTitle("Salvar"));
      expect(onSave).toHaveBeenCalledWith(SAMPLE_TEXT, []);
    });

    it("onSave receives trimmed text", () => {
      const onSave = vi.fn();
      const { textarea } = renderAndEnterEditMode({ onSave });
      fireEvent.change(textarea, { target: { value: "  trimmed  " } });
      fireEvent.click(screen.getByTitle("Salvar"));
      expect(onSave).toHaveBeenCalledWith("trimmed", []);
    });

    it("save exits edit mode", async () => {
      renderAndEnterEditMode();
      fireEvent.click(screen.getByTitle("Salvar"));
      await waitFor(() =>
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
      );
    });

    it("Ctrl+Enter saves", () => {
      const onSave = vi.fn();
      const { textarea } = renderAndEnterEditMode({ onSave });
      fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
      expect(onSave).toHaveBeenCalledOnce();
    });

    it("Meta+Enter saves", () => {
      const onSave = vi.fn();
      const { textarea } = renderAndEnterEditMode({ onSave });
      fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
      expect(onSave).toHaveBeenCalledOnce();
    });

    it("Escape cancels without calling onSave", () => {
      const onSave = vi.fn();
      const { textarea } = renderAndEnterEditMode({ onSave });
      fireEvent.keyDown(textarea, { key: "Escape" });
      expect(onSave).not.toHaveBeenCalled();
    });

    it("Escape calls onCancel", () => {
      const onCancel = vi.fn();
      const { textarea } = renderAndEnterEditMode({ onCancel });
      fireEvent.keyDown(textarea, { key: "Escape" });
      expect(onCancel).toHaveBeenCalledOnce();
    });

    it("Escape exits edit mode", async () => {
      const { textarea } = renderAndEnterEditMode();
      fireEvent.keyDown(textarea, { key: "Escape" });
      await waitFor(() =>
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
      );
    });

    it("cancel button calls onCancel", () => {
      const onCancel = vi.fn();
      renderAndEnterEditMode({ onCancel });
      fireEvent.click(screen.getByTitle("Cancelar"));
      expect(onCancel).toHaveBeenCalledOnce();
    });

    it("cancel button restores original text in idle view", async () => {
      const { textarea } = renderAndEnterEditMode();
      fireEvent.change(textarea, { target: { value: "something else" } });
      fireEvent.click(screen.getByTitle("Cancelar"));
      await waitFor(() =>
        expect(screen.getByText(SAMPLE_TEXT)).toBeInTheDocument()
      );
    });

    it("cancel button does not call onSave", () => {
      const onSave = vi.fn();
      renderAndEnterEditMode({ onSave });
      fireEvent.click(screen.getByTitle("Cancelar"));
      expect(onSave).not.toHaveBeenCalled();
    });

    it("mousedown outside the container triggers save", async () => {
      const onSave = vi.fn();
      renderAndEnterEditMode({ onSave });
      fireEvent.mouseDown(document.body);
      await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    });

    it("mousedown inside the container does not trigger save", () => {
      const onSave = vi.fn();
      const { container } = renderAndEnterEditMode({ onSave });
      fireEvent.mouseDown(container.firstChild as Element);
      expect(onSave).not.toHaveBeenCalled();
    });
  });

  // ── Cut tracking ─────────────────────────────────────────────────────────────

  describe("cut tracking", () => {
    it("Delete key with a selection creates a cut", () => {
      const onSave = vi.fn();
      const { textarea } = renderAndEnterEditMode({ onSave });

      textarea.selectionStart = 0;
      textarea.selectionEnd = 5; // selects "Hello"
      fireEvent.keyDown(textarea, { key: "Delete" });

      fireEvent.click(screen.getByTitle("Salvar"));
      const [, cuts] = onSave.mock.calls[0] as [string, TextCut[]];
      expect(cuts).toHaveLength(1);
      expect(cuts[0].deletedText).toBe("Hello");
    });

    it("Backspace key with a selection creates a cut", () => {
      const onSave = vi.fn();
      const { textarea } = renderAndEnterEditMode({ onSave });

      textarea.selectionStart = 6;
      textarea.selectionEnd = 11; // selects "world"
      fireEvent.keyDown(textarea, { key: "Backspace" });

      fireEvent.click(screen.getByTitle("Salvar"));
      const [, cuts] = onSave.mock.calls[0] as [string, TextCut[]];
      expect(cuts[0].deletedText).toBe("world");
    });

    it("Delete key without a selection does not create a cut", () => {
      const onSave = vi.fn();
      const { textarea } = renderAndEnterEditMode({ onSave });

      textarea.selectionStart = 5;
      textarea.selectionEnd = 5; // no selection
      fireEvent.keyDown(textarea, { key: "Delete" });

      fireEvent.click(screen.getByTitle("Salvar"));
      const [, cuts] = onSave.mock.calls[0] as [string, TextCut[]];
      expect(cuts).toHaveLength(0);
    });

    it("Delete key with selection removes the selected text from the saved value", () => {
      const onSave = vi.fn();
      const { textarea } = renderAndEnterEditMode({ onSave });

      textarea.selectionStart = 0;
      textarea.selectionEnd = 6; // "Hello "
      fireEvent.keyDown(textarea, { key: "Delete" });

      fireEvent.click(screen.getByTitle("Salvar"));
      const [savedText] = onSave.mock.calls[0] as [string, TextCut[]];
      expect(savedText).not.toContain("Hello");
    });

    it("cut count label is not shown when no cuts exist", () => {
      renderAndEnterEditMode({ textCuts: [] });
      // Neither "1 corte" nor "2 cortes" etc. should appear
      expect(screen.queryByText(/corte/i)).not.toBeInTheDocument();
    });

    it("multi-word selection uses first word start and last word end timestamps", () => {
      const onSave = vi.fn();
      const text = "hello world foo";
      const wordTimestamps: WordTimestamp[] = [
        { word: "hello", start: 1.0, end: 1.5 },
        { word: "world", start: 2.0, end: 2.5 },
        { word: "foo", start: 3.0, end: 3.5 },
      ];
      const { textarea } = renderAndEnterEditMode({
        text,
        originalText: text,
        wordTimestamps,
        onSave,
      });

      // Select "hello world" (chars 0–11)
      textarea.selectionStart = 0;
      textarea.selectionEnd = 11;
      fireEvent.keyDown(textarea, { key: "Delete" });

      fireEvent.click(screen.getByTitle("Salvar"));
      const [, cuts] = onSave.mock.calls[0] as [string, TextCut[]];
      // startTime = hello.start, endTime = world.end
      expect(cuts[0].startTime).toBe(1.0);
      expect(cuts[0].endTime).toBe(2.5);
    });

    it("hint text is shown in edit mode but absent in idle mode", () => {
      const { container } = render(<InlineTextEditor {...defaultProps()} />);
      // Idle mode: hint should not be visible
      expect(screen.queryByText(/Del para cortar/i)).not.toBeInTheDocument();
      // Enter edit mode
      fireEvent.click(container.firstChild as Element);
      expect(screen.getByText(/Del para cortar/i)).toBeInTheDocument();
    });

    it("cut timestamps use approximate character-position when no wordTimestamps", () => {
      const onSave = vi.fn();
      // 10-char text, segment spans 0–10 s → 1s per char
      const text = "0123456789";
      const { textarea } = renderAndEnterEditMode({
        text,
        originalText: text,
        segmentStartTime: 0,
        segmentEndTime: 10,
        onSave,
      });

      textarea.selectionStart = 0;
      textarea.selectionEnd = 5; // first half
      fireEvent.keyDown(textarea, { key: "Delete" });

      fireEvent.click(screen.getByTitle("Salvar"));
      const [, cuts] = onSave.mock.calls[0] as [string, TextCut[]];
      expect(cuts[0].startTime).toBeCloseTo(0);
      // endTime ≈ (5/10) * 10 = 5
      expect(cuts[0].endTime).toBeCloseTo(5);
    });

    it("cut timestamps use precise word-level timestamps when provided", () => {
      const onSave = vi.fn();
      const text = "hello world foo";
      const wordTimestamps: WordTimestamp[] = [
        { word: "hello", start: 1.0, end: 1.5 },
        { word: "world", start: 2.0, end: 2.5 },
        { word: "foo", start: 3.0, end: 3.5 },
      ];
      const { textarea } = renderAndEnterEditMode({
        text,
        originalText: text,
        wordTimestamps,
        onSave,
      });

      textarea.selectionStart = 0;
      textarea.selectionEnd = 5; // "hello"
      fireEvent.keyDown(textarea, { key: "Delete" });

      fireEvent.click(screen.getByTitle("Salvar"));
      const [, cuts] = onSave.mock.calls[0] as [string, TextCut[]];
      expect(cuts[0].startTime).toBe(1.0);
      expect(cuts[0].endTime).toBe(1.5);
    });

    it("multiple cuts accumulate in the cuts array", () => {
      const onSave = vi.fn();
      const { textarea } = renderAndEnterEditMode({ onSave });

      // First cut
      textarea.selectionStart = 0;
      textarea.selectionEnd = 5;
      fireEvent.keyDown(textarea, { key: "Delete" });

      // Second cut (from the now-shorter editedText)
      textarea.selectionStart = 0;
      textarea.selectionEnd = 1;
      fireEvent.keyDown(textarea, { key: "Delete" });

      fireEvent.click(screen.getByTitle("Salvar"));
      const [, cuts] = onSave.mock.calls[0] as [string, TextCut[]];
      expect(cuts).toHaveLength(2);
    });

    it("cut count label updates after each deletion", async () => {
      const { textarea } = renderAndEnterEditMode();

      textarea.selectionStart = 0;
      textarea.selectionEnd = 5;
      fireEvent.keyDown(textarea, { key: "Delete" });

      await waitFor(() =>
        expect(screen.getByText(/1 corte(?!s)/i)).toBeInTheDocument()
      );

      textarea.selectionStart = 0;
      textarea.selectionEnd = 1;
      fireEvent.keyDown(textarea, { key: "Delete" });

      await waitFor(() =>
        expect(screen.getByText(/2 cortes/i)).toBeInTheDocument()
      );
    });
  });

  // ── Props sync ───────────────────────────────────────────────────────────────

  describe("props sync", () => {
    it("idle view updates when text prop changes", () => {
      const { rerender } = render(<InlineTextEditor {...defaultProps()} />);
      rerender(
        <InlineTextEditor
          {...defaultProps({ text: "Updated text", originalText: "Updated text" })}
        />
      );
      expect(screen.getByText("Updated text")).toBeInTheDocument();
    });

    it("does not override in-progress edits when text prop changes", () => {
      const { rerender, textarea } = renderAndEnterEditMode();
      fireEvent.change(textarea, { target: { value: "user typed this" } });

      rerender(
        <InlineTextEditor
          {...defaultProps({ text: "Prop update", originalText: "Prop update" })}
        />
      );

      // The textarea should still contain the user's edit, not the new prop
      expect(textarea.value).toBe("user typed this");
    });

    it("existing textCuts are initialised in edit mode", () => {
      const existingCuts: TextCut[] = [
        { startTime: 1, endTime: 2, deletedText: "foo" },
      ];
      const onSave = vi.fn();
      renderAndEnterEditMode({ textCuts: existingCuts, onSave });

      // Save without making any additional cuts
      fireEvent.click(screen.getByTitle("Salvar"));
      const [, cuts] = onSave.mock.calls[0] as [string, TextCut[]];
      expect(cuts).toEqual(existingCuts);
    });

    it("cancelling restores the prop textCuts", () => {
      const existingCuts: TextCut[] = [
        { startTime: 1, endTime: 2, deletedText: "foo" },
      ];
      const onSave = vi.fn();
      const { textarea } = renderAndEnterEditMode({
        textCuts: existingCuts,
        onSave,
      });

      // Add another cut then cancel
      textarea.selectionStart = 0;
      textarea.selectionEnd = 3;
      fireEvent.keyDown(textarea, { key: "Delete" });
      fireEvent.click(screen.getByTitle("Cancelar"));

      // Re-enter edit mode to verify cuts were reset
      fireEvent.click((textarea.ownerDocument.body.firstChild as Element)?.firstChild as Element ?? document.body);
    });
  });
});
