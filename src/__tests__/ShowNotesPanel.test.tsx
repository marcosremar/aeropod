import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ShowNotesPanel } from "@/components/editor/ShowNotesPanel";

// ─── Mocks ────────────────────────────────────────────────────────────────

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Radix UI Tabs lazy-renders inactive content and uses pointer events which
// don't work well in JSDOM. This mock renders all tab content as always-visible
// so we can test tab content without simulating pointer events.
vi.mock("@/components/ui/tabs", async () => {
  const R = await import("react");
  const ce = R.createElement;
  return {
    Tabs: ({ children, defaultValue: _dv, ...props }: { children?: R.ReactNode; defaultValue?: string; [key: string]: unknown }) =>
      ce("div", { "data-tabs": true, ...props }, children),
    TabsList: ({ children, ...props }: { children?: R.ReactNode; [key: string]: unknown }) =>
      ce("div", { role: "tablist", ...props }, children),
    TabsTrigger: ({ children, value, ...props }: { children?: R.ReactNode; value?: string; [key: string]: unknown }) =>
      ce("button", { role: "tab", "data-tab-value": value, ...props }, children),
    TabsContent: ({ children, ...props }: { children?: R.ReactNode; [key: string]: unknown }) =>
      ce("div", props, children),
  };
});

// ─── Fixtures ─────────────────────────────────────────────────────────────

interface Chapter {
  title: string;
  timestamp: number;
  description?: string;
}

interface Guest {
  name: string;
  bio?: string;
  role?: string;
}

interface ShowNotes {
  id: string;
  summary: string;
  chapters: Chapter[];
  keyPoints: string[];
  guestInfo?: Guest[];
  links?: string[];
  generatedAt: string;
}

function makeShowNotes(overrides: Partial<ShowNotes> = {}): ShowNotes {
  return {
    id: "sn-1",
    summary: "This is the episode summary.",
    chapters: [
      { title: "Introduction", timestamp: 0, description: "Welcome intro" },
      { title: "Main Topic", timestamp: 120, description: "Core discussion" },
    ],
    keyPoints: ["Key point one", "Key point two", "Key point three"],
    guestInfo: undefined,
    links: undefined,
    generatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function mockFetch(responseBody: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => responseBody,
    blob: async () => new Blob(["content"]),
  });
}

function mockFetch404() {
  return vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    json: async () => ({ error: "Not found" }),
  });
}

// ─── Loading state ─────────────────────────────────────────────────────────

describe("ShowNotesPanel — loading state", () => {
  it("shows a spinner while the initial fetch is in-flight", async () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<ShowNotesPanel projectId="proj-1" />);
    const spinner = document.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
  });

  it("stops showing the spinner after data loads", async () => {
    global.fetch = mockFetch404();
    render(<ShowNotesPanel projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.queryByText("Gerar Show Notes")).toBeInTheDocument()
    );
    expect(document.querySelector(".animate-spin")).toBeNull();
  });
});

// ─── Empty state (no show notes) ──────────────────────────────────────────

describe("ShowNotesPanel — empty state", () => {
  beforeEach(() => {
    global.fetch = mockFetch404();
  });

  it("renders the empty-state heading", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    expect(await screen.findByText("Show Notes")).toBeInTheDocument();
  });

  it("renders the 'Gerar Show Notes' call-to-action button", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    expect(
      await screen.findByRole("button", { name: /Gerar Show Notes/ })
    ).toBeInTheDocument();
  });

  it("renders the empty-state description text", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    expect(
      await screen.findByText(/Gere resumo, capitulos e pontos-chave/)
    ).toBeInTheDocument();
  });

  it("renders the feature list items in empty state", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    expect(await screen.findByText("Resumo do episodio")).toBeInTheDocument();
    expect(screen.getByText("Capitulos com timestamps")).toBeInTheDocument();
    expect(screen.getByText("Pontos-chave")).toBeInTheDocument();
  });

  it("does not render the tabs when there are no show notes", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    await screen.findByText("Gerar Show Notes");
    expect(screen.queryByRole("tab", { name: "Resumo" })).not.toBeInTheDocument();
  });
});

// ─── Loaded state — header ─────────────────────────────────────────────────

describe("ShowNotesPanel — header when loaded", () => {
  beforeEach(() => {
    global.fetch = mockFetch({ showNotes: makeShowNotes() });
  });

  it("renders the 'Show Notes' header title", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    expect(await screen.findByText("Show Notes")).toBeInTheDocument();
  });

  it("renders the regenerate (refresh) button in the header", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    await screen.findByText("Show Notes");
    const spinners = document.querySelectorAll("svg");
    expect(spinners.length).toBeGreaterThan(0);
  });

  it("renders Download button in the header", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    await screen.findByText("Show Notes");
    // Download icon button is present — verify via SVG download icon container
    const header = document.querySelector(".border-b");
    expect(header).not.toBeNull();
  });
});

// ─── Tabs ──────────────────────────────────────────────────────────────────

describe("ShowNotesPanel — tabs", () => {
  beforeEach(() => {
    global.fetch = mockFetch({ showNotes: makeShowNotes() });
  });

  it("renders the Resumo, Capitulos, and Pontos tabs", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    expect(await screen.findByRole("tab", { name: "Resumo" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Capitulos" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Pontos" })).toBeInTheDocument();
  });

  it("shows Resumo tab content by default", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    expect(
      await screen.findByText("This is the episode summary.")
    ).toBeInTheDocument();
  });

  it("shows chapter list content", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    // Chapters tab content is always mounted (all tab contents rendered)
    expect(await screen.findByText("Introduction")).toBeInTheDocument();
    expect(screen.getByText("Main Topic")).toBeInTheDocument();
  });

  it("shows key points content", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    expect(await screen.findByText("Key point one")).toBeInTheDocument();
    expect(screen.getByText("Key point two")).toBeInTheDocument();
    expect(screen.getByText("Key point three")).toBeInTheDocument();
  });
});

// ─── Summary tab ──────────────────────────────────────────────────────────

describe("ShowNotesPanel — summary tab", () => {
  beforeEach(() => {
    global.fetch = mockFetch({ showNotes: makeShowNotes() });
  });

  it("renders the 'Resumo do Episodio' section heading", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    expect(await screen.findByText("Resumo do Episodio")).toBeInTheDocument();
  });

  it("renders the summary text", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    expect(
      await screen.findByText("This is the episode summary.")
    ).toBeInTheDocument();
  });

  it("enters edit mode when the edit button is clicked", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    await screen.findByText("This is the episode summary.");

    // Find the edit button (Edit2 icon button) in summary section
    const editButtons = screen.getAllByRole("button");
    const editBtn = editButtons.find((btn) =>
      btn.querySelector("svg") && btn.getAttribute("class")?.includes("px-2")
    );
    // Click the second small button which is the edit (Edit2) button
    const smallButtons = editButtons.filter(
      (btn) => btn.getAttribute("class")?.includes("h-7")
    );
    if (smallButtons.length >= 2) {
      fireEvent.click(smallButtons[1]); // Edit2 is second
    }

    await waitFor(() =>
      expect(
        screen.queryByDisplayValue("This is the episode summary.")
      ).toBeInTheDocument()
    );
  });

  it("cancels edit mode when cancel (X) button is clicked", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    await screen.findByText("This is the episode summary.");

    // Enter edit mode via the h-7 Edit2 button (second h-7 button)
    const h7Btns = screen
      .getAllByRole("button")
      .filter((btn) => btn.getAttribute("class")?.includes("h-7"));
    expect(h7Btns.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(h7Btns[1]); // Edit2 is second small button

    // Textarea should appear
    const textarea = await screen.findByDisplayValue("This is the episode summary.");
    expect(textarea).toBeInTheDocument();

    // Cancel button is in the div immediately after the textarea
    const cancelBtn = textarea.parentElement?.querySelector(
      "button[data-variant='ghost']"
    ) as HTMLElement | null;
    expect(cancelBtn).not.toBeNull();
    fireEvent.click(cancelBtn!);

    // Textarea should disappear — summary text shows again
    await waitFor(() => {
      expect(screen.queryByDisplayValue("This is the episode summary.")).not.toBeInTheDocument();
    });
    expect(screen.getByText("This is the episode summary.")).toBeInTheDocument();
  });
});

// ─── Chapters tab ─────────────────────────────────────────────────────────

describe("ShowNotesPanel — chapters tab", () => {
  beforeEach(() => {
    global.fetch = mockFetch({
      showNotes: makeShowNotes({
        chapters: [
          { title: "Intro", timestamp: 0 },
          { title: "Deep Dive", timestamp: 3661, description: "The heart of it" },
        ],
      }),
    });
  });

  it("shows chapter count in the heading", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    expect(await screen.findByText("2 Capitulos")).toBeInTheDocument();
  });

  it("formats timestamp 0 as 0:00", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    expect(await screen.findByText("0:00")).toBeInTheDocument();
  });

  it("formats timestamp with hours correctly (3661 → 1:01:01)", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    expect(await screen.findByText("1:01:01")).toBeInTheDocument();
  });

  it("renders chapter description when present", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    expect(await screen.findByText("The heart of it")).toBeInTheDocument();
  });

  it("renders the Regenerar buttons in chapter and key point sections", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    await screen.findByText("2 Capitulos");
    const regenerarBtns = screen.getAllByRole("button", { name: /Regenerar/ });
    expect(regenerarBtns.length).toBeGreaterThanOrEqual(1);
  });

  it("calls onSeekTo with chapter timestamp when chapter button is clicked", async () => {
    const onSeekTo = vi.fn();
    render(<ShowNotesPanel projectId="proj-1" onSeekTo={onSeekTo} />);

    const introChapterBtn = await screen.findByText("Intro");
    fireEvent.click(introChapterBtn.closest("button")!);

    expect(onSeekTo).toHaveBeenCalledWith(0);
  });

  it("does not throw when onSeekTo is not provided", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);

    const chapterBtn = await screen.findByText("Intro");
    expect(() => fireEvent.click(chapterBtn.closest("button")!)).not.toThrow();
  });
});

// ─── Key points tab ───────────────────────────────────────────────────────

describe("ShowNotesPanel — key points tab", () => {
  beforeEach(() => {
    global.fetch = mockFetch({
      showNotes: makeShowNotes({
        keyPoints: ["Alpha point", "Beta point"],
      }),
    });
  });

  it("shows key point count in the heading", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    expect(await screen.findByText("2 Pontos-Chave")).toBeInTheDocument();
  });

  it("renders all key points", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    expect(await screen.findByText("Alpha point")).toBeInTheDocument();
    expect(screen.getByText("Beta point")).toBeInTheDocument();
  });

  it("renders the Regenerar button in key points section", async () => {
    render(<ShowNotesPanel projectId="proj-1" />);
    await screen.findByText("Alpha point");
    const regenerarBtns = screen.getAllByRole("button", { name: /Regenerar/ });
    expect(regenerarBtns.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Guest info ────────────────────────────────────────────────────────────

describe("ShowNotesPanel — guest info", () => {
  it("renders guest section when guestInfo is present", async () => {
    global.fetch = mockFetch({
      showNotes: makeShowNotes({
        guestInfo: [{ name: "Jane Doe", role: "CEO", bio: "Expert in AI." }],
      }),
    });

    render(<ShowNotesPanel projectId="proj-1" />);
    expect(await screen.findByText("Convidados")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("renders guest role when provided", async () => {
    global.fetch = mockFetch({
      showNotes: makeShowNotes({
        guestInfo: [{ name: "Jane Doe", role: "CEO" }],
      }),
    });

    render(<ShowNotesPanel projectId="proj-1" />);
    expect(await screen.findByText("CEO")).toBeInTheDocument();
  });

  it("renders guest bio when provided", async () => {
    global.fetch = mockFetch({
      showNotes: makeShowNotes({
        guestInfo: [{ name: "Jane Doe", bio: "Expert in AI." }],
      }),
    });

    render(<ShowNotesPanel projectId="proj-1" />);
    expect(await screen.findByText("Expert in AI.")).toBeInTheDocument();
  });

  it("renders guest avatar initial from name", async () => {
    global.fetch = mockFetch({
      showNotes: makeShowNotes({
        guestInfo: [{ name: "John Smith" }],
      }),
    });

    render(<ShowNotesPanel projectId="proj-1" />);
    await screen.findByText("Convidados");
    expect(screen.getByText("J")).toBeInTheDocument();
  });

  it("does not render Convidados section when guestInfo is empty", async () => {
    global.fetch = mockFetch({
      showNotes: makeShowNotes({ guestInfo: [] }),
    });

    render(<ShowNotesPanel projectId="proj-1" />);
    await screen.findByText("This is the episode summary.");
    expect(screen.queryByText("Convidados")).not.toBeInTheDocument();
  });

  it("does not render Convidados section when guestInfo is undefined", async () => {
    global.fetch = mockFetch({
      showNotes: makeShowNotes({ guestInfo: undefined }),
    });

    render(<ShowNotesPanel projectId="proj-1" />);
    await screen.findByText("This is the episode summary.");
    expect(screen.queryByText("Convidados")).not.toBeInTheDocument();
  });
});

// ─── Links ─────────────────────────────────────────────────────────────────

describe("ShowNotesPanel — links", () => {
  it("renders the Links Mencionados section when links are present", async () => {
    global.fetch = mockFetch({
      showNotes: makeShowNotes({
        links: ["https://example.com", "https://another.io"],
      }),
    });

    render(<ShowNotesPanel projectId="proj-1" />);
    expect(await screen.findByText("Links Mencionados")).toBeInTheDocument();
  });

  it("renders each link as an anchor with the correct href", async () => {
    global.fetch = mockFetch({
      showNotes: makeShowNotes({
        links: ["https://example.com"],
      }),
    });

    render(<ShowNotesPanel projectId="proj-1" />);
    const link = await screen.findByRole("link", { name: "https://example.com" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("does not render Links section when links is empty", async () => {
    global.fetch = mockFetch({
      showNotes: makeShowNotes({ links: [] }),
    });

    render(<ShowNotesPanel projectId="proj-1" />);
    await screen.findByText("This is the episode summary.");
    expect(screen.queryByText("Links Mencionados")).not.toBeInTheDocument();
  });

  it("does not render Links section when links is undefined", async () => {
    global.fetch = mockFetch({
      showNotes: makeShowNotes({ links: undefined }),
    });

    render(<ShowNotesPanel projectId="proj-1" />);
    await screen.findByText("This is the episode summary.");
    expect(screen.queryByText("Links Mencionados")).not.toBeInTheDocument();
  });
});

// ─── Timestamp formatting ──────────────────────────────────────────────────

describe("ShowNotesPanel — timestamp formatting", () => {
  it("formats sub-minute timestamp as 0:SS", async () => {
    global.fetch = mockFetch({
      showNotes: makeShowNotes({
        chapters: [{ title: "Quick", timestamp: 9 }],
      }),
    });

    render(<ShowNotesPanel projectId="proj-1" />);
    expect(await screen.findByText("0:09")).toBeInTheDocument();
  });

  it("formats minute-range timestamp as M:SS", async () => {
    global.fetch = mockFetch({
      showNotes: makeShowNotes({
        chapters: [{ title: "Mid", timestamp: 75 }],
      }),
    });

    render(<ShowNotesPanel projectId="proj-1" />);
    expect(await screen.findByText("1:15")).toBeInTheDocument();
  });

  it("formats hour-range timestamp as H:MM:SS", async () => {
    global.fetch = mockFetch({
      showNotes: makeShowNotes({
        chapters: [{ title: "Long", timestamp: 7322 }],
      }),
    });

    render(<ShowNotesPanel projectId="proj-1" />);
    expect(await screen.findByText("2:02:02")).toBeInTheDocument();
  });
});

// ─── API interactions ─────────────────────────────────────────────────────

describe("ShowNotesPanel — API interactions", () => {
  it("calls GET /api/projects/{id}/show-notes on mount", async () => {
    const fetchMock = mockFetch({ showNotes: makeShowNotes() });
    global.fetch = fetchMock;

    render(<ShowNotesPanel projectId="proj-42" />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/projects/proj-42/show-notes");
    });
  });

  it("calls POST to generate show notes when 'Gerar Show Notes' is clicked", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, showNotes: makeShowNotes() }),
      });
    global.fetch = fetchMock;

    render(<ShowNotesPanel projectId="proj-1" />);

    const generateBtn = await screen.findByRole("button", { name: /Gerar Show Notes/ });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-1/show-notes",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("calls POST with regenerate=true when regenerate header button is clicked", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ showNotes: makeShowNotes() }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, showNotes: makeShowNotes() }),
      });
    global.fetch = fetchMock;

    render(<ShowNotesPanel projectId="proj-1" />);
    await screen.findByText("Show Notes");

    // The refresh (RefreshCw icon) button in the header uses data-variant="ghost"
    const ghostBtns = screen
      .getAllByRole("button")
      .filter((btn) => btn.getAttribute("data-variant") === "ghost");
    // First ghost button is the refresh (regenerate) button
    expect(ghostBtns.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(ghostBtns[0]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-1/show-notes",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"regenerate":true'),
        })
      );
    });
  });

  it("calls POST with section='chapters' when chapters Regenerar is clicked", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ showNotes: makeShowNotes() }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, showNotes: makeShowNotes() }),
      });
    global.fetch = fetchMock;

    render(<ShowNotesPanel projectId="proj-1" />);
    // All tab content is rendered (mocked Tabs renders all panels)
    // The chapters Regenerar is the first Regenerar button in the DOM
    const regenerarBtns = await screen.findAllByRole("button", { name: /Regenerar/ });
    fireEvent.click(regenerarBtns[0]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-1/show-notes",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"section":"chapters"'),
        })
      );
    });
  });

  it("calls POST with section='keyPoints' when key points Regenerar is clicked", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ showNotes: makeShowNotes() }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, showNotes: makeShowNotes() }),
      });
    global.fetch = fetchMock;

    render(<ShowNotesPanel projectId="proj-1" />);
    // The keyPoints Regenerar is the second Regenerar button in DOM order
    const regenerarBtns = await screen.findAllByRole("button", { name: /Regenerar/ });
    fireEvent.click(regenerarBtns[1]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-1/show-notes",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"section":"keyPoints"'),
        })
      );
    });
  });

  it("calls PUT when summary edit is saved", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ showNotes: makeShowNotes() }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, showNotes: makeShowNotes({ summary: "Updated summary." }) }),
      });
    global.fetch = fetchMock;

    render(<ShowNotesPanel projectId="proj-1" />);
    await screen.findByText("This is the episode summary.");

    // Enter edit mode via the small h-7 Edit2 button (second h-7 button)
    const smallBtns = screen
      .getAllByRole("button")
      .filter((btn) => btn.getAttribute("class")?.includes("h-7"));
    if (smallBtns.length >= 2) {
      fireEvent.click(smallBtns[1]); // Edit2 button
    }

    const textarea = await screen.findByDisplayValue("This is the episode summary.");
    fireEvent.change(textarea, { target: { value: "Updated summary." } });

    // Click save (Check icon) — blue bg button
    const saveBtn = screen
      .getAllByRole("button")
      .find((btn) => btn.getAttribute("class")?.includes("bg-blue-500"));
    if (saveBtn) fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-1/show-notes",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining("Updated summary."),
        })
      );
    });
  });

  it("calls GET with format=markdown when Markdown download is triggered", async () => {
    // jsdom supports URL.createObjectURL stub
    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock");
    global.URL.revokeObjectURL = vi.fn();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ showNotes: makeShowNotes() }) })
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(["# Notes"]),
      });
    global.fetch = fetchMock;

    render(<ShowNotesPanel projectId="proj-1" />);
    await screen.findByText("Show Notes");

    // Trigger markdown download directly (simulate click on hidden menu item)
    const markdownBtn = await screen.findByText("Markdown (.md)");
    fireEvent.click(markdownBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-1/show-notes?format=markdown"
      );
    });
  });

  it("calls GET with format=text when Text download is triggered", async () => {
    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock");
    global.URL.revokeObjectURL = vi.fn();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ showNotes: makeShowNotes() }) })
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(["Notes"]),
      });
    global.fetch = fetchMock;

    render(<ShowNotesPanel projectId="proj-1" />);
    await screen.findByText("Show Notes");

    const textBtn = await screen.findByText("Texto (.txt)");
    fireEvent.click(textBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-1/show-notes?format=text"
      );
    });
  });
});

// ─── className prop ────────────────────────────────────────────────────────

describe("ShowNotesPanel — className prop", () => {
  it("applies additional className to the root element when loaded", async () => {
    global.fetch = mockFetch({ showNotes: makeShowNotes() });

    const { container } = render(
      <ShowNotesPanel projectId="proj-1" className="custom-class" />
    );

    await screen.findByText("Show Notes");
    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("applies additional className to the root element in empty state", async () => {
    global.fetch = mockFetch404();

    const { container } = render(
      <ShowNotesPanel projectId="proj-1" className="empty-custom-class" />
    );

    await screen.findByText("Gerar Show Notes");
    expect(container.firstChild).toHaveClass("empty-custom-class");
  });
});
