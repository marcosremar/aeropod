import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FillerWordPanel } from "@/components/editor/FillerWordPanel";

// ─── Fixtures ─────────────────────────────────────────────────────────────

interface FillerWord {
  id: string;
  word: string;
  startTime: number;
  endTime: number;
  confidence: number;
  isRemoved: boolean;
}

interface FillerStats {
  totalCount: number;
  removedCount: number;
  timeSaved: number;
  byType: Record<string, number>;
}

function makeFiller(overrides: Partial<FillerWord> = {}): FillerWord {
  return {
    id: "f-1",
    word: "uhm",
    startTime: 65,
    endTime: 65.4,
    confidence: 0.9,
    isRemoved: false,
    ...overrides,
  };
}

function makeStats(overrides: Partial<FillerStats> = {}): FillerStats {
  return {
    totalCount: 3,
    removedCount: 0,
    timeSaved: 0.0,
    byType: { uhm: 2, tipo: 1 },
    ...overrides,
  };
}

function mockFetch(responseBody: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: async () => responseBody,
  });
}

// ─── Loading state ─────────────────────────────────────────────────────────

describe("FillerWordPanel — loading state", () => {
  it("shows a spinner while the initial fetch is in-flight", async () => {
    // Never resolves during this test
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<FillerWordPanel projectId="proj-1" />);
    // The spinner is a RefreshCw SVG inside a loading wrapper
    const spinner = document.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
  });

  it("stops showing the spinner after data loads", async () => {
    global.fetch = mockFetch({ success: true, fillers: [], stats: makeStats({ totalCount: 0 }) });
    render(<FillerWordPanel projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.queryByText(/Detectar Filler Words/)).toBeInTheDocument()
    );
  });
});

// ─── Empty state ─────────────────────────────────────────────────────────

describe("FillerWordPanel — empty state", () => {
  beforeEach(() => {
    global.fetch = mockFetch({ success: true, fillers: [], stats: makeStats({ totalCount: 0 }) });
  });

  it("renders the empty-state heading", async () => {
    render(<FillerWordPanel projectId="proj-1" />);
    expect(await screen.findByText(/Detectar Filler Words/)).toBeInTheDocument();
  });

  it("renders the 'Analisar Audio' call-to-action button", async () => {
    render(<FillerWordPanel projectId="proj-1" />);
    expect(await screen.findByRole("button", { name: /Analisar Audio/ })).toBeInTheDocument();
  });

  it("renders the panel header with 'Filler Words' title", async () => {
    render(<FillerWordPanel projectId="proj-1" />);
    expect(await screen.findByText("Filler Words")).toBeInTheDocument();
  });

  it("renders the 'Detectar' refresh button in the header", async () => {
    render(<FillerWordPanel projectId="proj-1" />);
    expect(await screen.findByRole("button", { name: /Detectar/ })).toBeInTheDocument();
  });

  it("shows placeholder stats in empty state preview", async () => {
    render(<FillerWordPanel projectId="proj-1" />);
    // Two placeholder '--' values (detected/removed) and one '--s' (timeSaved)
    const placeholders = await screen.findAllByText("--");
    expect(placeholders.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("--s")).toBeInTheDocument();
  });

  it("does not render 'Remover Todos' when no fillers exist", async () => {
    render(<FillerWordPanel projectId="proj-1" />);
    await screen.findByText(/Detectar Filler Words/);
    expect(screen.queryByText("Remover Todos")).not.toBeInTheDocument();
  });
});

// ─── Stats panel ──────────────────────────────────────────────────────────

describe("FillerWordPanel — stats panel", () => {
  it("displays totalCount, removedCount, and timeSaved when fillers are present", async () => {
    const fillers = [
      makeFiller({ id: "f-1", word: "uhm" }),
      makeFiller({ id: "f-2", word: "tipo" }),
    ];
    const stats = makeStats({ totalCount: 2, removedCount: 1, timeSaved: 0.8 });
    global.fetch = mockFetch({ success: true, fillers, stats });

    render(<FillerWordPanel projectId="proj-1" />);

    // totalCount
    expect(await screen.findByText("2")).toBeInTheDocument();
    // removedCount
    expect(await screen.findByText("1")).toBeInTheDocument();
    // timeSaved (formatted to 1 decimal)
    expect(await screen.findByText("0.8s")).toBeInTheDocument();
  });

  it("renders the 'Detectados' label in the stats grid", async () => {
    const fillers = [makeFiller()];
    global.fetch = mockFetch({ success: true, fillers, stats: makeStats() });
    render(<FillerWordPanel projectId="proj-1" />);
    expect(await screen.findByText("Detectados")).toBeInTheDocument();
  });

  it("renders the 'Removidos' label in the stats grid", async () => {
    const fillers = [makeFiller()];
    global.fetch = mockFetch({ success: true, fillers, stats: makeStats() });
    render(<FillerWordPanel projectId="proj-1" />);
    expect(await screen.findByText("Removidos")).toBeInTheDocument();
  });

  it("renders the 'Economizado' label in the stats grid", async () => {
    const fillers = [makeFiller()];
    global.fetch = mockFetch({ success: true, fillers, stats: makeStats() });
    render(<FillerWordPanel projectId="proj-1" />);
    expect(await screen.findByText("Economizado")).toBeInTheDocument();
  });
});

// ─── Grouped filler list ──────────────────────────────────────────────────

describe("FillerWordPanel — grouped filler list", () => {
  it("groups fillers by word and renders the word as a group header", async () => {
    const fillers = [
      makeFiller({ id: "f-1", word: "uhm", startTime: 10, endTime: 10.4 }),
      makeFiller({ id: "f-2", word: "uhm", startTime: 20, endTime: 20.4 }),
      makeFiller({ id: "f-3", word: "tipo", startTime: 30, endTime: 30.5 }),
    ];
    global.fetch = mockFetch({ success: true, fillers, stats: makeStats({ totalCount: 3 }) });

    render(<FillerWordPanel projectId="proj-1" />);

    expect(await screen.findByText(/"uhm"/)).toBeInTheDocument();
    expect(await screen.findByText(/"tipo"/)).toBeInTheDocument();
  });

  it("shows occurrence count badge for each word group", async () => {
    const fillers = [
      makeFiller({ id: "f-1", word: "uhm" }),
      makeFiller({ id: "f-2", word: "uhm" }),
    ];
    global.fetch = mockFetch({ success: true, fillers, stats: makeStats({ totalCount: 2 }) });

    render(<FillerWordPanel projectId="proj-1" />);

    expect(await screen.findByText("2x")).toBeInTheDocument();
  });

  it("renders 'Remover todos' button inside each group header", async () => {
    const fillers = [makeFiller({ id: "f-1", word: "uhm" })];
    global.fetch = mockFetch({ success: true, fillers, stats: makeStats({ totalCount: 1 }) });

    render(<FillerWordPanel projectId="proj-1" />);

    expect(await screen.findByText("Remover todos")).toBeInTheDocument();
  });

  it("renders formatted start time for each filler item", async () => {
    // startTime 65 → 1:05
    const fillers = [makeFiller({ id: "f-1", word: "uhm", startTime: 65, endTime: 65.4 })];
    global.fetch = mockFetch({ success: true, fillers, stats: makeStats({ totalCount: 1 }) });

    render(<FillerWordPanel projectId="proj-1" />);

    expect(await screen.findByText("1:05")).toBeInTheDocument();
  });

  it("renders confidence badge with rounded percentage for each filler", async () => {
    const fillers = [makeFiller({ id: "f-1", word: "uhm", confidence: 0.87 })];
    global.fetch = mockFetch({ success: true, fillers, stats: makeStats({ totalCount: 1 }) });

    render(<FillerWordPanel projectId="proj-1" />);

    expect(await screen.findByText("87%")).toBeInTheDocument();
  });

  it("renders duration in milliseconds for each filler item", async () => {
    // (0.65 - 0.25) * 1000 = 400ms
    const fillers = [makeFiller({ id: "f-1", word: "uhm", startTime: 0.25, endTime: 0.65 })];
    global.fetch = mockFetch({ success: true, fillers, stats: makeStats({ totalCount: 1 }) });

    render(<FillerWordPanel projectId="proj-1" />);

    expect(await screen.findByText("400ms")).toBeInTheDocument();
  });

  it("marks removed fillers with 'Removido' badge", async () => {
    const fillers = [makeFiller({ id: "f-1", word: "uhm", isRemoved: true })];
    global.fetch = mockFetch({ success: true, fillers, stats: makeStats({ totalCount: 1, removedCount: 1 }) });

    render(<FillerWordPanel projectId="proj-1" />);

    expect(await screen.findByText("Removido")).toBeInTheDocument();
  });
});

// ─── Selection behavior ────────────────────────────────────────────────────

describe("FillerWordPanel — selection behavior", () => {
  it("renders 'Remover Todos' bulk action button when fillers exist", async () => {
    const fillers = [makeFiller()];
    global.fetch = mockFetch({ success: true, fillers, stats: makeStats({ totalCount: 1 }) });

    render(<FillerWordPanel projectId="proj-1" />);

    // The actions bar renders a button with "Remover Todos" text
    const buttons = await screen.findAllByText(/Remover Todos/i);
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("selecting a filler shows action buttons with its count", async () => {
    const fillers = [makeFiller({ id: "f-1", word: "uhm" })];
    global.fetch = mockFetch({ success: true, fillers, stats: makeStats({ totalCount: 1 }) });

    render(<FillerWordPanel projectId="proj-1" />);

    // Click on the filler row to select it
    const fillerRow = await screen.findByText("1:05");
    // The parent motion.div is the clickable row
    const row = fillerRow.closest("[class]");
    // Walk up to the motion div that has the onClick handler
    let clickTarget: Element | null = row;
    while (clickTarget && !clickTarget.getAttribute("class")?.includes("cursor-pointer")) {
      clickTarget = clickTarget.parentElement;
    }
    if (clickTarget) fireEvent.click(clickTarget);

    // After selection, the bulk mark buttons should appear
    await waitFor(() => {
      expect(screen.queryByText("Manter")).toBeInTheDocument();
    });
  });

  it("deselecting a filler hides the selection action buttons", async () => {
    const fillers = [makeFiller({ id: "f-1", word: "uhm" })];
    global.fetch = mockFetch({ success: true, fillers, stats: makeStats({ totalCount: 1 }) });

    render(<FillerWordPanel projectId="proj-1" />);

    const fillerRow = await screen.findByText("1:05");
    let clickTarget: Element | null = fillerRow.closest("[class]");
    while (clickTarget && !clickTarget.getAttribute("class")?.includes("cursor-pointer")) {
      clickTarget = clickTarget.parentElement;
    }
    if (clickTarget) {
      fireEvent.click(clickTarget); // select
      fireEvent.click(clickTarget); // deselect
    }

    await waitFor(() => {
      expect(screen.queryByText("Manter")).not.toBeInTheDocument();
    });
  });
});

// ─── API interactions ─────────────────────────────────────────────────────

describe("FillerWordPanel — API interactions", () => {
  it("calls GET /api/projects/{id}/fillers on mount", async () => {
    const fetchMock = mockFetch({ success: true, fillers: [], stats: makeStats({ totalCount: 0 }) });
    global.fetch = fetchMock;

    render(<FillerWordPanel projectId="proj-42" />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/projects/proj-42/fillers");
    });
  });

  it("calls POST to detect fillers when 'Analisar Audio' is clicked", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, fillers: [], stats: makeStats({ totalCount: 0 }) }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, fillers: [], stats: makeStats({ totalCount: 0 }) }) });
    global.fetch = fetchMock;

    render(<FillerWordPanel projectId="proj-1" />);

    const analyzeBtn = await screen.findByRole("button", { name: /Analisar Audio/ });
    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-1/fillers",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("calls POST to detect when 'Detectar' header button is clicked", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, fillers: [], stats: makeStats({ totalCount: 0 }) }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, fillers: [], stats: makeStats({ totalCount: 0 }) }) });
    global.fetch = fetchMock;

    render(<FillerWordPanel projectId="proj-1" />);

    await screen.findByText("Filler Words"); // header rendered
    const detectBtn = screen.getByRole("button", { name: /Detectar/ });
    fireEvent.click(detectBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-1/fillers",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("calls PATCH with remove_all when the destructive 'Remover Todos' button is clicked", async () => {
    const fillers = [makeFiller()];
    const patchResponse = { success: true, removedCount: 1 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, fillers, stats: makeStats({ totalCount: 1 }) }) })
      .mockResolvedValueOnce({ ok: true, json: async () => patchResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, fillers, stats: makeStats({ totalCount: 1 }) }) });
    global.fetch = fetchMock;

    render(<FillerWordPanel projectId="proj-1" />);

    // There are two buttons with this text: the destructive "Remover Todos" (actions bar)
    // and the per-group "Remover todos". Use getAllByRole and pick the destructive one.
    await screen.findByText(/"uhm"/);
    const removeAllBtns = screen.getAllByRole("button", { name: /Remover Todos/i });
    // The destructive variant is the first one (actions bar), has data-variant="destructive"
    const destructiveBtn = removeAllBtns.find(
      (btn) => btn.getAttribute("data-variant") === "destructive"
    );
    fireEvent.click(destructiveBtn!);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-1/fillers",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining("remove_all"),
        })
      );
    });
  });

  it("calls PATCH with 'remove' action when group 'Remover todos' is clicked", async () => {
    const fillers = [makeFiller({ id: "f-1", word: "uhm" })];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, fillers, stats: makeStats({ totalCount: 1 }) }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, stats: makeStats({ totalCount: 1, removedCount: 1 }) }) });
    global.fetch = fetchMock;

    render(<FillerWordPanel projectId="proj-1" />);

    const removeGroupBtn = await screen.findByText("Remover todos");
    fireEvent.click(removeGroupBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-1/fillers",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"action":"remove"'),
        })
      );
    });
  });
});

// ─── onPlayTime callback ───────────────────────────────────────────────────

describe("FillerWordPanel — onPlayTime callback", () => {
  it("calls onPlayTime with the filler startTime when the time button is clicked", async () => {
    const fillers = [makeFiller({ id: "f-1", word: "uhm", startTime: 65, endTime: 65.4 })];
    global.fetch = mockFetch({ success: true, fillers, stats: makeStats({ totalCount: 1 }) });

    const onPlayTime = vi.fn();
    render(<FillerWordPanel projectId="proj-1" onPlayTime={onPlayTime} />);

    const timeButton = await screen.findByText("1:05");
    fireEvent.click(timeButton.closest("button")!);

    expect(onPlayTime).toHaveBeenCalledWith(65);
  });

  it("does not propagate to row selection when time button is clicked", async () => {
    const fillers = [makeFiller({ id: "f-1", word: "uhm", startTime: 65, endTime: 65.4 })];
    global.fetch = mockFetch({ success: true, fillers, stats: makeStats({ totalCount: 1 }) });

    const onPlayTime = vi.fn();
    render(<FillerWordPanel projectId="proj-1" onPlayTime={onPlayTime} />);

    const timeButton = await screen.findByText("1:05");
    fireEvent.click(timeButton.closest("button")!);

    // Selection buttons ("Manter") should NOT appear — stopPropagation prevents selection
    expect(screen.queryByText("Manter")).not.toBeInTheDocument();
  });
});

// ─── Removed footer ────────────────────────────────────────────────────────

describe("FillerWordPanel — removed fillers footer", () => {
  it("shows the removed-count footer when removedCount > 0", async () => {
    const fillers = [makeFiller({ id: "f-1", word: "uhm", isRemoved: true })];
    const stats = makeStats({ totalCount: 1, removedCount: 1, timeSaved: 0.4 });
    global.fetch = mockFetch({ success: true, fillers, stats });

    render(<FillerWordPanel projectId="proj-1" />);

    expect(
      await screen.findByText(/1 fillers serao removidos no export/)
    ).toBeInTheDocument();
  });

  it("includes the timeSaved in the footer message", async () => {
    const fillers = [makeFiller({ id: "f-1", word: "uhm", isRemoved: true })];
    const stats = makeStats({ totalCount: 1, removedCount: 1, timeSaved: 1.23 });
    global.fetch = mockFetch({ success: true, fillers, stats });

    render(<FillerWordPanel projectId="proj-1" />);

    expect(await screen.findByText(/1.2s economizados/)).toBeInTheDocument();
  });

  it("hides the removed footer when removedCount is 0", async () => {
    const fillers = [makeFiller({ id: "f-1", word: "uhm", isRemoved: false })];
    const stats = makeStats({ totalCount: 1, removedCount: 0, timeSaved: 0 });
    global.fetch = mockFetch({ success: true, fillers, stats });

    render(<FillerWordPanel projectId="proj-1" />);

    await screen.findByText(/"uhm"/);
    expect(screen.queryByText(/serao removidos no export/)).not.toBeInTheDocument();
  });
});

// ─── Overflow (> 5 per group) ──────────────────────────────────────────────

describe("FillerWordPanel — filler group overflow", () => {
  it("shows overflow indicator when a group has more than 5 fillers", async () => {
    const fillers = Array.from({ length: 7 }, (_, i) =>
      makeFiller({ id: `f-${i}`, word: "uhm", startTime: i * 10, endTime: i * 10 + 0.4 })
    );
    global.fetch = mockFetch({ success: true, fillers, stats: makeStats({ totalCount: 7 }) });

    render(<FillerWordPanel projectId="proj-1" />);

    // Shows "+2 mais" for the 2 hidden items
    expect(await screen.findByText(/\+2 mais/)).toBeInTheDocument();
  });

  it("does not show overflow indicator when group has exactly 5 fillers", async () => {
    const fillers = Array.from({ length: 5 }, (_, i) =>
      makeFiller({ id: `f-${i}`, word: "uhm", startTime: i * 10, endTime: i * 10 + 0.4 })
    );
    global.fetch = mockFetch({ success: true, fillers, stats: makeStats({ totalCount: 5 }) });

    render(<FillerWordPanel projectId="proj-1" />);

    await screen.findByText(/"uhm"/);
    expect(screen.queryByText(/mais/)).not.toBeInTheDocument();
  });
});

// ─── Confidence color coding ───────────────────────────────────────────────

describe("FillerWordPanel — confidence color coding", () => {
  it("applies emerald color for confidence >= 0.8", async () => {
    const fillers = [makeFiller({ id: "f-1", word: "uhm", confidence: 0.9 })];
    global.fetch = mockFetch({ success: true, fillers, stats: makeStats({ totalCount: 1 }) });

    render(<FillerWordPanel projectId="proj-1" />);

    const badge = await screen.findByText("90%");
    expect(badge.className).toContain("emerald");
  });

  it("applies amber color for confidence between 0.6 and 0.8", async () => {
    const fillers = [makeFiller({ id: "f-1", word: "uhm", confidence: 0.7 })];
    global.fetch = mockFetch({ success: true, fillers, stats: makeStats({ totalCount: 1 }) });

    render(<FillerWordPanel projectId="proj-1" />);

    const badge = await screen.findByText("70%");
    expect(badge.className).toContain("amber");
  });

  it("applies zinc/low color for confidence < 0.6", async () => {
    const fillers = [makeFiller({ id: "f-1", word: "uhm", confidence: 0.5 })];
    global.fetch = mockFetch({ success: true, fillers, stats: makeStats({ totalCount: 1 }) });

    render(<FillerWordPanel projectId="proj-1" />);

    const badge = await screen.findByText("50%");
    expect(badge.className).toContain("zinc");
  });
});

// ─── className prop ────────────────────────────────────────────────────────

describe("FillerWordPanel — className prop", () => {
  it("applies additional className to the root element", async () => {
    global.fetch = mockFetch({ success: true, fillers: [], stats: makeStats({ totalCount: 0 }) });

    const { container } = render(
      <FillerWordPanel projectId="proj-1" className="test-custom-class" />
    );

    expect(container.firstChild).toHaveClass("test-custom-class");
  });
});
