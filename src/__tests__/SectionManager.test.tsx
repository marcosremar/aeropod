import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { SectionManager } from "@/components/sections/SectionManager";

// ─── framer-motion stub ───────────────────────────────────────────────────────
// jsdom doesn't support animations; stub motion.div as a plain div.
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...rest}>{children}</div>
    ),
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSection(overrides: Record<string, unknown> = {}) {
  return {
    id: "sec-1",
    name: "Introduction",
    order: 1,
    status: "pending",
    audioUrl: undefined,
    duration: undefined,
    notes: undefined,
    templateSection: undefined,
    ...overrides,
  };
}

function makeStats(overrides: Record<string, unknown> = {}) {
  return {
    total: 3,
    approved: 1,
    required: 2,
    requiredApproved: 1,
    pending: 1,
    percentComplete: 33,
    isReadyForExport: false,
    ...overrides,
  };
}

function mockFetch(
  sections: ReturnType<typeof makeSection>[],
  stats: ReturnType<typeof makeStats> | null = makeStats(),
  {
    sectionsOk = true,
    statsOk = true,
  }: { sectionsOk?: boolean; statsOk?: boolean } = {}
) {
  return vi.fn().mockImplementation((url: string) => {
    if ((url as string).includes("missing-sections")) {
      return Promise.resolve({
        ok: statsOk,
        json: () =>
          Promise.resolve(
            stats
              ? { success: statsOk, stats }
              : { success: false }
          ),
      });
    }
    return Promise.resolve({
      ok: sectionsOk,
      json: () =>
        Promise.resolve(
          sectionsOk
            ? { success: true, sections }
            : { success: false, sections: [] }
        ),
    });
  });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchSpy = mockFetch([]);
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Loading state ────────────────────────────────────────────────────────────

describe("SectionManager — loading state", () => {
  it("shows loading text while fetch is in flight", async () => {
    // Delay fetch resolution so we can observe the loading state
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise(() => {})) // never resolves
    );
    render(<SectionManager projectId="proj-1" />);
    expect(screen.getByText(/Carregando seções/)).toBeInTheDocument();
  });

  it("removes loading text after data is fetched", async () => {
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.queryByText(/Carregando seções/)).not.toBeInTheDocument()
    );
  });
});

// ─── API calls ────────────────────────────────────────────────────────────────

describe("SectionManager — API calls on mount", () => {
  it("fetches sections and missing-sections for the given projectId", async () => {
    render(<SectionManager projectId="proj-42" />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    const urls = fetchSpy.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(urls).toContain("/api/projects/proj-42/sections");
    expect(urls).toContain("/api/projects/proj-42/missing-sections");
  });

  it("re-fetches when projectId changes", async () => {
    const { rerender } = render(<SectionManager projectId="proj-1" />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    rerender(<SectionManager projectId="proj-2" />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(4));
    const urls = fetchSpy.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(urls).toContain("/api/projects/proj-2/sections");
    expect(urls).toContain("/api/projects/proj-2/missing-sections");
  });
});

// ─── Stats / progress card ────────────────────────────────────────────────────

describe("SectionManager — stats panel", () => {
  it("renders stats panel when stats are returned", async () => {
    vi.stubGlobal("fetch", mockFetch([], makeStats()));
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.getByText("Progresso das Seções")).toBeInTheDocument()
    );
  });

  it("does not render stats panel when stats request returns no data", async () => {
    vi.stubGlobal("fetch", mockFetch([], null));
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.queryByText(/Carregando seções/)).not.toBeInTheDocument()
    );
    expect(screen.queryByText("Progresso das Seções")).not.toBeInTheDocument();
  });

  it("shows approved / total count", async () => {
    vi.stubGlobal("fetch", mockFetch([], makeStats({ approved: 2, total: 5 })));
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.getByText("2 / 5")).toBeInTheDocument()
    );
  });

  it("shows required approved / required count", async () => {
    vi.stubGlobal(
      "fetch",
      // Use values that differ from approved/total (2/5) so "1 / 4" is unique
      mockFetch([], makeStats({ approved: 2, total: 5, requiredApproved: 1, required: 4 }))
    );
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() => expect(screen.getByText("1 / 4")).toBeInTheDocument());
  });

  it("shows pending count", async () => {
    vi.stubGlobal("fetch", mockFetch([], makeStats({ pending: 4 })));
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() => expect(screen.getByText("4")).toBeInTheDocument());
  });

  it("shows 'Pronto para exportar' badge when isReadyForExport is true", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([], makeStats({ isReadyForExport: true }))
    );
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.getByText(/Pronto para exportar/)).toBeInTheDocument()
    );
  });

  it("hides 'Pronto para exportar' badge when isReadyForExport is false", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([], makeStats({ isReadyForExport: false }))
    );
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.queryByText(/Pronto para exportar/)).not.toBeInTheDocument()
    );
  });
});

// ─── Section list rendering ───────────────────────────────────────────────────

describe("SectionManager — section list", () => {
  it("renders section names returned by the API", async () => {
    const sections = [
      makeSection({ id: "s1", name: "Intro" }),
      makeSection({ id: "s2", name: "Outro" }),
    ];
    vi.stubGlobal("fetch", mockFetch(sections));
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() => expect(screen.getByText("Intro")).toBeInTheDocument());
    expect(screen.getByText("Outro")).toBeInTheDocument();
  });

  it("renders status badge for each section", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([makeSection({ id: "s1", status: "processing" })])
    );
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.getByText("processing")).toBeInTheDocument()
    );
  });

  it("renders 'Obrigatória' badge for required template sections", async () => {
    const sections = [
      makeSection({
        id: "s1",
        templateSection: { isRequired: true },
      }),
    ];
    vi.stubGlobal("fetch", mockFetch(sections));
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.getByText("Obrigatória")).toBeInTheDocument()
    );
  });

  it("does not render 'Obrigatória' badge for optional sections", async () => {
    const sections = [
      makeSection({
        id: "s1",
        templateSection: { isRequired: false },
      }),
    ];
    vi.stubGlobal("fetch", mockFetch(sections));
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.queryByText("Obrigatória")).not.toBeInTheDocument()
    );
  });

  it("renders section description from templateSection", async () => {
    const sections = [
      makeSection({
        id: "s1",
        templateSection: {
          isRequired: false,
          description: "A brief intro to your show",
        },
      }),
    ];
    vi.stubGlobal("fetch", mockFetch(sections));
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(
        screen.getByText("A brief intro to your show")
      ).toBeInTheDocument()
    );
  });

  it("renders formatted duration when audioUrl and duration are present", async () => {
    const sections = [
      makeSection({
        id: "s1",
        audioUrl: "https://example.com/audio.mp3",
        duration: 125,
      }),
    ];
    vi.stubGlobal("fetch", mockFetch(sections));
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.getByText(/2:05/)).toBeInTheDocument()
    );
  });

  it("renders 'N/A' when duration is not provided", async () => {
    const sections = [
      makeSection({
        id: "s1",
        audioUrl: "https://example.com/audio.mp3",
        duration: undefined,
      }),
    ];
    vi.stubGlobal("fetch", mockFetch(sections));
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() => expect(screen.getByText(/N\/A/)).toBeInTheDocument());
  });

  it("does not render duration label when audioUrl is absent", async () => {
    const sections = [makeSection({ id: "s1", audioUrl: undefined })];
    vi.stubGlobal("fetch", mockFetch(sections));
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.queryByText(/Duração/)).not.toBeInTheDocument()
    );
  });

  it("renders notes when present", async () => {
    const sections = [makeSection({ id: "s1", notes: "Remember to keep it short." })];
    vi.stubGlobal("fetch", mockFetch(sections));
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.getByText(/Remember to keep it short\./)).toBeInTheDocument()
    );
  });

  it("does not render notes block when notes is absent", async () => {
    const sections = [makeSection({ id: "s1", notes: undefined })];
    vi.stubGlobal("fetch", mockFetch(sections));
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.queryByText(/Notas/)).not.toBeInTheDocument()
    );
  });
});

// ─── Duration formatting ──────────────────────────────────────────────────────

describe("SectionManager — formatDuration", () => {
  it("formats zero seconds as N/A", async () => {
    const sections = [
      makeSection({
        id: "s1",
        audioUrl: "https://example.com/audio.mp3",
        duration: 0,
      }),
    ];
    vi.stubGlobal("fetch", mockFetch(sections));
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() => expect(screen.getByText(/N\/A/)).toBeInTheDocument());
  });

  it("formats 60 seconds as 1:00", async () => {
    const sections = [
      makeSection({
        id: "s1",
        audioUrl: "https://example.com/audio.mp3",
        duration: 60,
      }),
    ];
    vi.stubGlobal("fetch", mockFetch(sections));
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() => expect(screen.getByText(/1:00/)).toBeInTheDocument());
  });

  it("formats 3661 seconds as 61:01", async () => {
    const sections = [
      makeSection({
        id: "s1",
        audioUrl: "https://example.com/audio.mp3",
        duration: 3661,
      }),
    ];
    vi.stubGlobal("fetch", mockFetch(sections));
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.getByText(/61:01/)).toBeInTheDocument()
    );
  });
});

// ─── Approve action ───────────────────────────────────────────────────────────

describe("SectionManager — approve button", () => {
  it("shows Aprovar button when section has audioUrl and is not approved", async () => {
    const sections = [
      makeSection({
        id: "s1",
        audioUrl: "https://example.com/audio.mp3",
        status: "review",
      }),
    ];
    vi.stubGlobal("fetch", mockFetch(sections));
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Aprovar/ })).toBeInTheDocument()
    );
  });

  it("does not show Aprovar button when section has no audioUrl", async () => {
    const sections = [makeSection({ id: "s1", audioUrl: undefined, status: "review" })];
    vi.stubGlobal("fetch", mockFetch(sections));
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Aprovar/ })).not.toBeInTheDocument()
    );
  });

  it("does not show Aprovar button when section is already approved", async () => {
    const sections = [
      makeSection({
        id: "s1",
        audioUrl: "https://example.com/audio.mp3",
        status: "approved",
      }),
    ];
    vi.stubGlobal("fetch", mockFetch(sections));
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Aprovar/ })).not.toBeInTheDocument()
    );
  });

  it("calls PATCH endpoint with status approved when Aprovar is clicked", async () => {
    const sections = [
      makeSection({
        id: "s1",
        audioUrl: "https://example.com/audio.mp3",
        status: "review",
      }),
    ];
    const patchFetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "PATCH") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      // On reload after patch, return empty sections
      if ((url as string).includes("missing-sections")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, stats: makeStats() }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, sections }),
      });
    });
    vi.stubGlobal("fetch", patchFetch);

    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Aprovar/ })).toBeInTheDocument()
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Aprovar/ }));
    });

    await waitFor(() => {
      const patchCall = patchFetch.mock.calls.find(
        (c: unknown[]) => (c[1] as RequestInit)?.method === "PATCH"
      );
      expect(patchCall).toBeTruthy();
      expect(patchCall![0]).toContain("/api/projects/proj-1/sections/s1");
      expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
        status: "approved",
      });
    });
  });

  it("disables Aprovar button while updating", async () => {
    let resolvePatch!: () => void;
    const patchFetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          resolvePatch = () =>
            resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
        });
      }
      if ((url as string).includes("missing-sections")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, stats: makeStats() }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            sections: [
              makeSection({
                id: "s1",
                audioUrl: "https://example.com/audio.mp3",
                status: "review",
              }),
            ],
          }),
      });
    });
    vi.stubGlobal("fetch", patchFetch);

    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Aprovar/ })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: /Aprovar/ }));

    // While the PATCH is pending the button shows "..." and is disabled
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /\.\.\./ })).toBeDisabled()
    );

    // Let the PATCH resolve to clean up
    act(() => resolvePatch());
  });
});

// ─── Reopen (Review) action ───────────────────────────────────────────────────

describe("SectionManager — Reabrir (review) button", () => {
  it("shows Reabrir button when section is approved", async () => {
    const sections = [
      makeSection({
        id: "s1",
        audioUrl: "https://example.com/audio.mp3",
        status: "approved",
      }),
    ];
    vi.stubGlobal("fetch", mockFetch(sections));
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Reabrir/ })).toBeInTheDocument()
    );
  });

  it("does not show Reabrir button when section is pending", async () => {
    const sections = [
      makeSection({ id: "s1", status: "pending" }),
    ];
    vi.stubGlobal("fetch", mockFetch(sections));
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Reabrir/ })).not.toBeInTheDocument()
    );
  });

  it("calls PATCH endpoint with status review when Reabrir is clicked", async () => {
    const sections = [
      makeSection({
        id: "s1",
        audioUrl: "https://example.com/audio.mp3",
        status: "approved",
      }),
    ];
    const patchFetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "PATCH") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      if ((url as string).includes("missing-sections")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, stats: makeStats() }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, sections }),
      });
    });
    vi.stubGlobal("fetch", patchFetch);

    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Reabrir/ })).toBeInTheDocument()
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Reabrir/ }));
    });

    await waitFor(() => {
      const patchCall = patchFetch.mock.calls.find(
        (c: unknown[]) => (c[1] as RequestInit)?.method === "PATCH"
      );
      expect(patchCall).toBeTruthy();
      expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
        status: "review",
      });
    });
  });
});

// ─── Error resilience ─────────────────────────────────────────────────────────

describe("SectionManager — error resilience", () => {
  it("does not crash when sections fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error"))
    );
    // suppress console.error for this test
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.queryByText(/Carregando seções/)).not.toBeInTheDocument()
    );
  });

  it("does not render sections when success is false", async () => {
    vi.stubGlobal("fetch", mockFetch([], makeStats(), { sectionsOk: false }));
    render(<SectionManager projectId="proj-1" />);
    await waitFor(() =>
      expect(screen.queryByText(/Carregando seções/)).not.toBeInTheDocument()
    );
    // No section cards should appear
    expect(screen.queryByText("Introduction")).not.toBeInTheDocument();
  });
});
