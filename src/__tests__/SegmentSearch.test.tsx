import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { SegmentSearch } from "@/components/editor/SegmentSearch";
import type { Segment } from "@/lib/db/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    id: "seg-1",
    projectId: "proj-1",
    startTime: 0,
    endTime: 60,
    text: "Default segment text",
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

function defaultProps(segmentOverrides: Partial<Segment>[] = []) {
  return {
    segments: segmentOverrides.map((o) => makeSegment(o)),
    projectId: "proj-test",
    onResultClick: vi.fn(),
    onHighlightSegments: vi.fn(),
  };
}

// Matches elements of a specific HTML tag whose normalized textContent equals `text`.
// Tag filter prevents matching parent wrappers that share the same text content.
function byTagText(tag: string, text: string) {
  return (_: string, el: Element | null) => {
    if (!el || el.tagName.toLowerCase() !== tag) return false;
    const normalized = el.textContent?.replace(/\s+/g, " ").trim();
    return normalized === text;
  };
}

// Make fetch a vi.fn() so each test can override the behavior
const fetchMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  global.fetch = fetchMock;
  fetchMock.mockReset();
  // Default: reject so tests that don't specify fall through to local search
  fetchMock.mockRejectedValue(new Error("Network error"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── Rendering ────────────────────────────────────────────────────────────

describe("SegmentSearch rendering", () => {
  it("renders the search input with correct placeholder", () => {
    const props = defaultProps();
    render(<SegmentSearch {...props} />);
    expect(screen.getByPlaceholderText("Buscar nos segmentos...")).toBeInTheDocument();
  });

  it("does not show clear button when query is empty", () => {
    const props = defaultProps();
    render(<SegmentSearch {...props} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not show results dropdown when query is empty", () => {
    const props = defaultProps([{ id: "s1", text: "hello world" }]);
    render(<SegmentSearch {...props} />);
    expect(screen.queryByText("Nenhum resultado encontrado")).not.toBeInTheDocument();
  });

  it("shows clear button when query has text", () => {
    const props = defaultProps();
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");
    fireEvent.change(input, { target: { value: "hello" } });
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("clears query and calls onHighlightSegments([]) when clear button is clicked", () => {
    const props = defaultProps();
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");
    fireEvent.change(input, { target: { value: "hello" } });

    const clearBtn = screen.getByRole("button");
    fireEvent.click(clearBtn);

    expect((input as HTMLInputElement).value).toBe("");
    expect(props.onHighlightSegments).toHaveBeenCalledWith([]);
  });
});

// ─── API-path search ──────────────────────────────────────────────────────

describe("SegmentSearch API search", () => {
  it("calls fetch with the typed query after the 300ms debounce", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });

    const props = defaultProps();
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");
    fireEvent.change(input, { target: { value: "hello" } });

    // Debounce not fired yet
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/proj-test/search",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("displays results returned from the API (shows topic label)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { segmentId: "s1", text: "hello world", startTime: 30, endTime: 60, topic: "Intro", score: 0.9 },
        ],
      }),
    });

    const props = defaultProps();
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");
    fireEvent.change(input, { target: { value: "hello" } });

    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => {});

    // Topic is displayed as plain text (not highlighted) inside a <span>
    expect(screen.getByText("Intro")).toBeInTheDocument();
    // Result text is split by <mark> so check the <p> element's full textContent
    expect(screen.getByText(byTagText("p", "hello world"))).toBeInTheDocument();
  });

  it("calls onHighlightSegments with segment IDs from API results", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { segmentId: "s1", text: "hello", startTime: 0, endTime: 10, topic: null, score: 0.9 },
          { segmentId: "s2", text: "world", startTime: 10, endTime: 20, topic: null, score: 0.8 },
        ],
      }),
    });

    const props = defaultProps();
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");
    fireEvent.change(input, { target: { value: "hello" } });

    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => {});

    expect(props.onHighlightSegments).toHaveBeenCalledWith(["s1", "s2"]);
  });

  it("shows 'no results' message when API returns empty results", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });

    const props = defaultProps();
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");
    fireEvent.change(input, { target: { value: "xyz" } });

    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => {});

    expect(screen.getByText("Nenhum resultado encontrado")).toBeInTheDocument();
  });

  it("shows result count header for multiple results", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { segmentId: "s1", text: "one", startTime: 0, endTime: 10, topic: null, score: 0.9 },
          { segmentId: "s2", text: "two", startTime: 10, endTime: 20, topic: null, score: 0.8 },
        ],
      }),
    });

    const props = defaultProps();
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");
    fireEvent.change(input, { target: { value: "hello" } });

    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => {});

    // Find the count span inside the header bar
    expect(screen.getByText(byTagText("span", "2 resultados"))).toBeInTheDocument();
  });

  it("uses singular 'resultado' for a single API result", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { segmentId: "s1", text: "hello", startTime: 0, endTime: 10, topic: null, score: 0.9 },
        ],
      }),
    });

    const props = defaultProps();
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");
    fireEvent.change(input, { target: { value: "hello" } });

    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => {});

    expect(screen.getByText(byTagText("span", "1 resultado"))).toBeInTheDocument();
  });
});

// ─── Local-search fallback ────────────────────────────────────────────────

describe("SegmentSearch local search fallback", () => {
  it("falls back to local search when API returns a non-ok response", async () => {
    fetchMock.mockResolvedValue({ ok: false });

    const props = defaultProps([
      { id: "s1", text: "hello world podcast", topic: null, keyInsight: null },
      { id: "s2", text: "unrelated content here", topic: null, keyInsight: null },
    ]);
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");
    fireEvent.change(input, { target: { value: "hello" } });

    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => {});

    // Local search hit s1, skipped s2; verify via the highlights callback
    expect(props.onHighlightSegments).toHaveBeenCalledWith(["s1"]);
  });

  it("falls back to local search when fetch throws a network error", async () => {
    fetchMock.mockRejectedValue(new Error("Network error"));

    const props = defaultProps([
      { id: "s1", text: "machine learning basics", topic: null, keyInsight: null },
      { id: "s2", text: "cooking recipes today", topic: null, keyInsight: null },
    ]);
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");
    fireEvent.change(input, { target: { value: "machine" } });

    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => {});

    expect(props.onHighlightSegments).toHaveBeenCalledWith(["s1"]);
  });

  it("gives higher score to exact phrase matches (score += 50)", async () => {
    fetchMock.mockRejectedValue(new Error("fail"));

    // "machine learning" appears as exact phrase in s1 but only word match in s2
    const props = defaultProps([
      { id: "s1", text: "machine learning is great", topic: null, keyInsight: null },
      { id: "s2", text: "I use machine and learning separately here", topic: null, keyInsight: null },
    ]);
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");
    fireEvent.change(input, { target: { value: "machine learning" } });

    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => {});

    // s1: exact phrase (50) + word "machine" (15) + word "learning" (15) = 80
    // s2: word "machine" (15) + word "learning" (15) = 30
    // Both match; s1 must appear first → highlighted IDs have s1 before s2
    const calls = props.onHighlightSegments.mock.calls;
    const lastCall = calls[calls.length - 1][0] as string[];
    expect(lastCall[0]).toBe("s1");
    expect(lastCall).toContain("s2");
  });

  it("boosts segments whose topic matches the query (score += 25)", async () => {
    fetchMock.mockRejectedValue(new Error("fail"));

    const props = defaultProps([
      { id: "s1", text: "some text without keywords", topic: "podcast tips", keyInsight: null },
      { id: "s2", text: "another segment text here", topic: null, keyInsight: null },
    ]);
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");
    fireEvent.change(input, { target: { value: "tips" } });

    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => {});

    // s1 matches via topic; s2 has no match at all
    expect(props.onHighlightSegments).toHaveBeenCalledWith(["s1"]);
  });

  it("boosts segments whose keyInsight matches the query (score += 20)", async () => {
    fetchMock.mockRejectedValue(new Error("fail"));

    const props = defaultProps([
      { id: "s1", text: "regular sentence here for test", topic: null, keyInsight: "important insight about audio" },
      { id: "s2", text: "something else unrelated more", topic: null, keyInsight: null },
    ]);
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");
    fireEvent.change(input, { target: { value: "audio" } });

    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => {});

    expect(props.onHighlightSegments).toHaveBeenCalledWith(["s1"]);
  });

  it("ignores query words shorter than 3 characters", async () => {
    fetchMock.mockRejectedValue(new Error("fail"));

    const props = defaultProps([
      { id: "s1", text: "the cat is here", topic: null, keyInsight: null },
    ]);
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");
    // "in" and "of" are 2-char words → no word-match score, no exact phrase
    fireEvent.change(input, { target: { value: "in of" } });

    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => {});

    expect(screen.getByText("Nenhum resultado encontrado")).toBeInTheDocument();
  });

  it("limits local results to 10 segments", async () => {
    fetchMock.mockRejectedValue(new Error("fail"));

    const manySegments = Array.from({ length: 15 }, (_, i) => ({
      id: `s${i}`,
      text: `hello segment number ${i} right here`,
      topic: null,
      keyInsight: null,
    }));
    const props = defaultProps(manySegments);
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");
    fireEvent.change(input, { target: { value: "hello" } });

    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => {});

    // At most 10 segment IDs highlighted
    const calls = props.onHighlightSegments.mock.calls;
    const lastCall = calls[calls.length - 1][0] as string[];
    expect(lastCall.length).toBe(10);
  });

  it("shows 'no results' when no segments match", async () => {
    fetchMock.mockRejectedValue(new Error("fail"));

    const props = defaultProps([
      { id: "s1", text: "totally irrelevant content", topic: null, keyInsight: null },
    ]);
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");
    fireEvent.change(input, { target: { value: "xyzzy" } });

    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => {});

    expect(screen.getByText("Nenhum resultado encontrado")).toBeInTheDocument();
  });

  it("clears results and highlights when query is cleared", async () => {
    fetchMock.mockRejectedValue(new Error("fail"));

    const props = defaultProps([
      { id: "s1", text: "hello world segment text here", topic: null, keyInsight: null },
    ]);
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");

    fireEvent.change(input, { target: { value: "hello" } });
    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => {});

    // Clear the input
    fireEvent.change(input, { target: { value: "" } });

    // After clearing, highlights are reset
    const calls = props.onHighlightSegments.mock.calls;
    const lastCall = calls[calls.length - 1][0] as string[];
    expect(lastCall).toEqual([]);
  });
});

// ─── Time formatting ──────────────────────────────────────────────────────

describe("SegmentSearch time formatting", () => {
  async function renderWithTime(startTime: number) {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { segmentId: "s1", text: "content here", startTime, endTime: startTime + 10, topic: null, score: 0.9 },
        ],
      }),
    });

    const props = defaultProps();
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");
    fireEvent.change(input, { target: { value: "content" } });

    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => {});
  }

  // The time badge <span> also contains an SVG icon; textContent is "icon text + time string".
  // Using toContain on body text is more robust here.
  it("formats 30 seconds as '0:30'", async () => {
    await renderWithTime(30);
    expect(document.body.textContent?.replace(/\s+/g, " ")).toContain("0:30");
  });

  it("formats 90 seconds as '1:30'", async () => {
    await renderWithTime(90);
    expect(document.body.textContent?.replace(/\s+/g, " ")).toContain("1:30");
  });

  it("formats 605 seconds as '10:05'", async () => {
    await renderWithTime(605);
    expect(document.body.textContent?.replace(/\s+/g, " ")).toContain("10:05");
  });

  it("pads single-digit seconds with a leading zero", async () => {
    await renderWithTime(61);
    expect(document.body.textContent?.replace(/\s+/g, " ")).toContain("1:01");
  });
});

// ─── Keyboard navigation ──────────────────────────────────────────────────

describe("SegmentSearch keyboard navigation", () => {
  async function setupWithResults() {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { segmentId: "s1", text: "first xuniq result", startTime: 0, endTime: 10, topic: null, score: 0.9 },
          { segmentId: "s2", text: "second xuniq result", startTime: 10, endTime: 20, topic: null, score: 0.8 },
          { segmentId: "s3", text: "third xuniq result", startTime: 20, endTime: 30, topic: null, score: 0.7 },
        ],
      }),
    });

    const props = defaultProps();
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");
    fireEvent.change(input, { target: { value: "xuniq" } });

    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => {});

    return { input, props };
  }

  // Get result buttons by matching the <p> text via byTagText
  function getResultButtons() {
    return [
      screen.getByText(byTagText("p", "first xuniq result")).closest("button")!,
      screen.getByText(byTagText("p", "second xuniq result")).closest("button")!,
      screen.getByText(byTagText("p", "third xuniq result")).closest("button")!,
    ];
  }

  it("ArrowDown moves selection to next result", async () => {
    const { input } = await setupWithResults();
    const [btn1] = getResultButtons();
    expect(btn1).toHaveClass("bg-zinc-700/50");

    fireEvent.keyDown(input, { key: "ArrowDown" });

    const [btn1After, btn2After] = getResultButtons();
    expect(btn2After).toHaveClass("bg-zinc-700/50");
    expect(btn1After).not.toHaveClass("bg-zinc-700/50");
  });

  it("ArrowDown does not go past the last result", async () => {
    const { input } = await setupWithResults();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    // Try to go past the last
    fireEvent.keyDown(input, { key: "ArrowDown" });

    const [btn1, btn2, btn3] = getResultButtons();
    expect(btn3).toHaveClass("bg-zinc-700/50");
    expect(btn1).not.toHaveClass("bg-zinc-700/50");
    expect(btn2).not.toHaveClass("bg-zinc-700/50");
  });

  it("ArrowUp moves selection to previous result", async () => {
    const { input } = await setupWithResults();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    const [, btn2] = getResultButtons();
    expect(btn2).toHaveClass("bg-zinc-700/50");

    fireEvent.keyDown(input, { key: "ArrowUp" });
    const [btn1After] = getResultButtons();
    expect(btn1After).toHaveClass("bg-zinc-700/50");
  });

  it("ArrowUp does not go below index 0", async () => {
    const { input } = await setupWithResults();

    fireEvent.keyDown(input, { key: "ArrowUp" });
    const [btn1] = getResultButtons();
    expect(btn1).toHaveClass("bg-zinc-700/50");
  });

  it("Enter fires onResultClick with the selected segment ID", async () => {
    const { input, props } = await setupWithResults();

    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onResultClick).toHaveBeenCalledWith("s1");
  });

  it("Enter after ArrowDown fires onResultClick with the new selection", async () => {
    const { input, props } = await setupWithResults();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onResultClick).toHaveBeenCalledWith("s2");
  });

  it("Escape closes dropdown and clears query", async () => {
    const { input, props } = await setupWithResults();

    expect(screen.getByText(byTagText("p", "first xuniq result"))).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByText(byTagText("p", "first xuniq result"))).not.toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe("");
    expect(props.onHighlightSegments).toHaveBeenCalledWith([]);
  });
});

// ─── Result click handler ─────────────────────────────────────────────────

describe("SegmentSearch result click", () => {
  it("calls onResultClick with the segment ID when a result button is clicked", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { segmentId: "s42", text: "zclick result xtest", startTime: 5, endTime: 15, topic: null, score: 0.9 },
        ],
      }),
    });

    const props = defaultProps();
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");
    fireEvent.change(input, { target: { value: "zclick" } });

    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => {});

    const resultButton = screen.getByText(byTagText("p", "zclick result xtest")).closest("button")!;
    fireEvent.click(resultButton);

    expect(props.onResultClick).toHaveBeenCalledWith("s42");
  });

  it("closes the dropdown after clicking a result", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { segmentId: "s1", text: "zdistinct label xresult", startTime: 5, endTime: 15, topic: null, score: 0.9 },
        ],
      }),
    });

    const props = defaultProps();
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");
    fireEvent.change(input, { target: { value: "zdistinct" } });

    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => {});

    const resultButton = screen.getByText(byTagText("p", "zdistinct label xresult")).closest("button")!;
    fireEvent.click(resultButton);

    expect(screen.queryByText(byTagText("p", "zdistinct label xresult"))).not.toBeInTheDocument();
  });
});

// ─── Text highlighting ─────────────────────────────────────────────────────

describe("SegmentSearch text highlighting", () => {
  it("wraps the matching text in a <mark> element", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { segmentId: "s1", text: "find the zneedle here", startTime: 0, endTime: 10, topic: null, score: 0.9 },
        ],
      }),
    });

    const props = defaultProps();
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");
    fireEvent.change(input, { target: { value: "zneedle" } });

    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => {});

    const mark = document.querySelector("mark");
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe("zneedle");
  });

  it("renders full result text content across the mark boundary", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { segmentId: "s1", text: "find the zneedle here", startTime: 0, endTime: 10, topic: null, score: 0.9 },
        ],
      }),
    });

    const props = defaultProps();
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");
    fireEvent.change(input, { target: { value: "zneedle" } });

    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => {});

    // The full text is split: "find the " + <mark>zneedle</mark> + " here"
    // Check the <p> element whose textContent combines all parts
    expect(screen.getByText(byTagText("p", "find the zneedle here"))).toBeInTheDocument();
  });

  it("truncates text longer than 150 characters", async () => {
    const longText = "a".repeat(200);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { segmentId: "s1", text: longText, startTime: 0, endTime: 10, topic: null, score: 0.9 },
        ],
      }),
    });

    const props = defaultProps();
    render(<SegmentSearch {...props} />);
    const input = screen.getByPlaceholderText("Buscar nos segmentos...");
    fireEvent.change(input, { target: { value: "aaa" } });

    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => {});

    // The rendered text should end with "..."
    const paragraph = document.querySelector("p.text-sm");
    expect(paragraph?.textContent).toMatch(/\.\.\.$/);
    // 150 chars + "..." = 153 chars max
    expect(paragraph?.textContent?.length).toBeLessThanOrEqual(153);
  });
});
