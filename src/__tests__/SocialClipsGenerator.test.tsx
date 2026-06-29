import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SocialClipsGenerator } from "@/components/editor/SocialClipsGenerator";

// ─── Mocks ────────────────────────────────────────────────────────────────

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// framer-motion: render children directly without animation overhead
vi.mock("framer-motion", async () => {
  const R = await import("react");
  return {
    motion: new Proxy(
      {},
      {
        get: (_: unknown, tag: string) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ({ children, ...props }: any) =>
            R.createElement(tag, props, children),
      }
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      R.createElement(R.Fragment, null, children),
  };
});

// Radix Switch
vi.mock("@/components/ui/switch", async () => {
  const R = await import("react");
  return {
    Switch: ({
      checked,
      onCheckedChange,
      ...props
    }: {
      checked?: boolean;
      onCheckedChange?: (v: boolean) => void;
      [key: string]: unknown;
    }) =>
      R.createElement("button", {
        role: "switch",
        "aria-checked": checked,
        onClick: () => onCheckedChange?.(!checked),
        ...props,
      }),
  };
});

// ─── Fixtures ────────────────────────────────────────────────────────────

function makeSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    segmentIds: ["seg-1"],
    startTime: 60,
    endTime: 90,
    duration: 30,
    title: "Viral Moment",
    description: "A great viral moment",
    hookScore: 8,
    viralPotential: 9,
    hookText: "This is the hook",
    reason: "High engagement potential",
    ...overrides,
  };
}

function makeSavedClip(overrides: Record<string, unknown> = {}) {
  return {
    id: "clip-1",
    title: "Saved Clip",
    duration: 30,
    status: "pending",
    hookScore: 7,
    viralPotential: 8,
    clipUrl: undefined,
    format: "9:16",
    ...overrides,
  };
}

function mockFetch(responseBody: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: async () => responseBody,
  });
}

function defaultProps(extra: Record<string, unknown> = {}) {
  return {
    projectId: "proj-1",
    onPlaySegment: vi.fn(),
    ...extra,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ─── Initial render & clip loading ────────────────────────────────────────

describe("SocialClipsGenerator — initial render", () => {
  it("renders the panel header with Clips Sociais title", () => {
    global.fetch = mockFetch({ success: true, clips: [] });
    render(<SocialClipsGenerator {...defaultProps()} />);
    expect(screen.getByText("Clips Sociais")).toBeInTheDocument();
  });

  it("renders the Gerar button in the header", () => {
    global.fetch = mockFetch({ success: true, clips: [] });
    render(<SocialClipsGenerator {...defaultProps()} />);
    expect(screen.getByRole("button", { name: /Gerar/i })).toBeInTheDocument();
  });

  it("fetches clips on mount", async () => {
    const fetchMock = mockFetch({ success: true, clips: [] });
    global.fetch = fetchMock;
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/projects/proj-1/clips");
    });
  });

  it("renders saved clips returned from the API on mount", async () => {
    const clip = makeSavedClip({ title: "Loaded Clip" });
    global.fetch = mockFetch({ success: true, clips: [clip] });
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => {
      expect(screen.getByText("Loaded Clip")).toBeInTheDocument();
    });
  });

  it("does not crash when fetch returns success:false", async () => {
    global.fetch = mockFetch({ success: false });
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => {
      expect(screen.getByText("Clips Sociais")).toBeInTheDocument();
    });
  });

  it("does not crash when fetch rejects", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => {
      expect(screen.getByText("Clips Sociais")).toBeInTheDocument();
    });
  });
});

// ─── Empty state ─────────────────────────────────────────────────────────

describe("SocialClipsGenerator — empty state", () => {
  it("shows empty state when no clips or suggestions exist", async () => {
    global.fetch = mockFetch({ success: true, clips: [] });
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => {
      expect(screen.getByText("Gerar Clips Virais")).toBeInTheDocument();
    });
  });

  it("shows descriptive text in empty state", async () => {
    global.fetch = mockFetch({ success: true, clips: [] });
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => {
      expect(
        screen.getByText(/IA identifica os melhores momentos/i)
      ).toBeInTheDocument();
    });
  });

  it("shows Encontrar Momentos button in empty state", async () => {
    global.fetch = mockFetch({ success: true, clips: [] });
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Encontrar Momentos/i })
      ).toBeInTheDocument();
    });
  });

  it("shows feature preview icons in empty state", async () => {
    global.fetch = mockFetch({ success: true, clips: [] });
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => {
      expect(screen.getByText("9:16 Vertical")).toBeInTheDocument();
      expect(screen.getByText("Legendas Auto")).toBeInTheDocument();
      expect(screen.getByText("Score Viral")).toBeInTheDocument();
    });
  });
});

// ─── Format selection ─────────────────────────────────────────────────────

describe("SocialClipsGenerator — format selection", () => {
  it("renders all three format buttons", async () => {
    global.fetch = mockFetch({ success: true, clips: [] });
    render(<SocialClipsGenerator {...defaultProps()} />);
    expect(screen.getByRole("button", { name: /9:16/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1:1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /16:9/i })).toBeInTheDocument();
  });

  it("defaults to 9:16 format (highlighted)", () => {
    global.fetch = mockFetch({ success: true, clips: [] });
    render(<SocialClipsGenerator {...defaultProps()} />);
    const btn = screen.getByRole("button", { name: /9:16/i });
    expect(btn.className).toContain("bg-pink-500");
  });

  it("highlights selected format when 1:1 is clicked", async () => {
    global.fetch = mockFetch({ success: true, clips: [] });
    render(<SocialClipsGenerator {...defaultProps()} />);
    fireEvent.click(screen.getByRole("button", { name: /1:1/i }));
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /1:1/i });
      expect(btn.className).toContain("bg-pink-500");
    });
  });

  it("deselects previous format when a new one is clicked", async () => {
    global.fetch = mockFetch({ success: true, clips: [] });
    render(<SocialClipsGenerator {...defaultProps()} />);
    fireEvent.click(screen.getByRole("button", { name: /16:9/i }));
    await waitFor(() => {
      const originalBtn = screen.getByRole("button", { name: /9:16/i });
      expect(originalBtn.className).not.toContain("bg-pink-500");
    });
  });
});

// ─── Captions toggle ─────────────────────────────────────────────────────

describe("SocialClipsGenerator — captions toggle", () => {
  it("renders the Legendas switch", () => {
    global.fetch = mockFetch({ success: true, clips: [] });
    render(<SocialClipsGenerator {...defaultProps()} />);
    expect(screen.getByRole("switch")).toBeInTheDocument();
  });

  it("captions switch is on by default", () => {
    global.fetch = mockFetch({ success: true, clips: [] });
    render(<SocialClipsGenerator {...defaultProps()} />);
    const sw = screen.getByRole("switch");
    expect(sw).toHaveAttribute("aria-checked", "true");
  });

  it("shows caption style buttons when captions are on", () => {
    global.fetch = mockFetch({ success: true, clips: [] });
    render(<SocialClipsGenerator {...defaultProps()} />);
    expect(screen.getByRole("button", { name: /Animadas/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Estaticas/i })).toBeInTheDocument();
  });

  it("hides caption style buttons when captions are toggled off", async () => {
    global.fetch = mockFetch({ success: true, clips: [] });
    render(<SocialClipsGenerator {...defaultProps()} />);
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /Animadas/i })
      ).not.toBeInTheDocument();
    });
  });

  it("shows caption style buttons again when captions are toggled back on", async () => {
    global.fetch = mockFetch({ success: true, clips: [] });
    render(<SocialClipsGenerator {...defaultProps()} />);
    fireEvent.click(screen.getByRole("switch")); // off
    fireEvent.click(screen.getByRole("switch")); // on
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Animadas/i })
      ).toBeInTheDocument();
    });
  });
});

// ─── Caption style selection ──────────────────────────────────────────────

describe("SocialClipsGenerator — caption style", () => {
  it("defaults to animated captions (highlighted)", () => {
    global.fetch = mockFetch({ success: true, clips: [] });
    render(<SocialClipsGenerator {...defaultProps()} />);
    const btn = screen.getByRole("button", { name: /Animadas/i });
    expect(btn.className).toContain("bg-pink-500");
  });

  it("highlights Estaticas when clicked", async () => {
    global.fetch = mockFetch({ success: true, clips: [] });
    render(<SocialClipsGenerator {...defaultProps()} />);
    fireEvent.click(screen.getByRole("button", { name: /Estaticas/i }));
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /Estaticas/i });
      expect(btn.className).toContain("bg-pink-500");
    });
  });
});

// ─── Generate suggestions ─────────────────────────────────────────────────

describe("SocialClipsGenerator — generate suggestions", () => {
  it("calls POST /api/projects/:id/clips when Gerar is clicked", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, clips: [] }) }) // load
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, suggestions: [makeSuggestion()] }),
      }); // generate
    global.fetch = fetchMock;
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => fetchMock.mock.calls.length >= 1);
    fireEvent.click(screen.getByRole("button", { name: /Gerar/i }));
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => c[1]?.method === "POST"
      );
      expect(postCall).toBeDefined();
    });
  });

  it("displays suggestions returned from the API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, clips: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          suggestions: [makeSuggestion({ title: "Best Moment" })],
        }),
      });
    global.fetch = fetchMock;
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => fetchMock.mock.calls.length >= 1);
    fireEvent.click(screen.getByRole("button", { name: /Gerar/i }));
    await waitFor(() => {
      expect(screen.getByText("Best Moment")).toBeInTheDocument();
    });
  });

  it("shows suggestion hook text", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, clips: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          suggestions: [makeSuggestion({ hookText: "Amazing hook here" })],
        }),
      });
    global.fetch = fetchMock;
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => fetchMock.mock.calls.length >= 1);
    fireEvent.click(screen.getByRole("button", { name: /Gerar/i }));
    await waitFor(() => {
      expect(screen.getByText(/"Amazing hook here\.\.\."/)).toBeInTheDocument();
    });
  });

  it("shows hook and viral scores for suggestions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, clips: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          suggestions: [makeSuggestion({ hookScore: 8, viralPotential: 9 })],
        }),
      });
    global.fetch = fetchMock;
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => fetchMock.mock.calls.length >= 1);
    fireEvent.click(screen.getByRole("button", { name: /Gerar/i }));
    await waitFor(() => {
      expect(screen.getByText(/Hook: 8\/10/)).toBeInTheDocument();
      expect(screen.getByText(/Viral: 9\/10/)).toBeInTheDocument();
    });
  });

  it("shows toast error when generation fails (success:false)", async () => {
    const { toast } = await import("sonner");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, clips: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false }),
      });
    global.fetch = fetchMock;
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => fetchMock.mock.calls.length >= 1);
    fireEvent.click(screen.getByRole("button", { name: /Gerar/i }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Erro ao gerar sugestoes");
    });
  });

  it("shows toast error when generation fetch rejects", async () => {
    const { toast } = await import("sonner");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, clips: [] }) })
      .mockRejectedValueOnce(new Error("Network error"));
    global.fetch = fetchMock;
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => fetchMock.mock.calls.length >= 1);
    fireEvent.click(screen.getByRole("button", { name: /Gerar/i }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Erro ao gerar sugestoes");
    });
  });

  it("renders Preview and Exportar Clip buttons per suggestion", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, clips: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, suggestions: [makeSuggestion()] }),
      });
    global.fetch = fetchMock;
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => fetchMock.mock.calls.length >= 1);
    fireEvent.click(screen.getByRole("button", { name: /Gerar/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Preview/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Exportar Clip/i })).toBeInTheDocument();
    });
  });

  it("calls onPlaySegment with suggestion startTime when Preview is clicked", async () => {
    const onPlaySegment = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, clips: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          suggestions: [makeSuggestion({ startTime: 75 })],
        }),
      });
    global.fetch = fetchMock;
    render(<SocialClipsGenerator {...defaultProps({ onPlaySegment })} />);
    await waitFor(() => fetchMock.mock.calls.length >= 1);
    fireEvent.click(screen.getByRole("button", { name: /Gerar/i }));
    await waitFor(() => screen.getByRole("button", { name: /Preview/i }));
    fireEvent.click(screen.getByRole("button", { name: /Preview/i }));
    expect(onPlaySegment).toHaveBeenCalledWith(75);
  });
});

// ─── Saved clips display ──────────────────────────────────────────────────

describe("SocialClipsGenerator — saved clips display", () => {
  it("renders Clips Salvos section heading when clips exist", async () => {
    global.fetch = mockFetch({ success: true, clips: [makeSavedClip()] });
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => {
      expect(screen.getByText("Clips Salvos")).toBeInTheDocument();
    });
  });

  it("shows clip duration", async () => {
    global.fetch = mockFetch({
      success: true,
      clips: [makeSavedClip({ duration: 45 })],
    });
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => {
      expect(screen.getByText("45s")).toBeInTheDocument();
    });
  });

  it("shows viral potential score for saved clip", async () => {
    global.fetch = mockFetch({
      success: true,
      clips: [makeSavedClip({ viralPotential: 7 })],
    });
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => {
      expect(screen.getByText(/7\/10/)).toBeInTheDocument();
    });
  });

  it("shows Pendente badge for pending clips", async () => {
    global.fetch = mockFetch({
      success: true,
      clips: [makeSavedClip({ status: "pending" })],
    });
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => {
      expect(screen.getByText("Pendente")).toBeInTheDocument();
    });
  });

  it("shows Processando... badge for processing clips", async () => {
    global.fetch = mockFetch({
      success: true,
      clips: [makeSavedClip({ status: "processing" })],
    });
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => {
      expect(screen.getByText("Processando...")).toBeInTheDocument();
    });
  });

  it("shows Pronto badge for ready clips", async () => {
    global.fetch = mockFetch({
      success: true,
      clips: [makeSavedClip({ status: "ready", clipUrl: "/clip.mp4" })],
    });
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => {
      expect(screen.getByText("Pronto")).toBeInTheDocument();
    });
  });

  it("shows download link for ready clips with clipUrl", async () => {
    global.fetch = mockFetch({
      success: true,
      clips: [makeSavedClip({ status: "ready", clipUrl: "/clip.mp4" })],
    });
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => {
      const link = document.querySelector("a[download]");
      expect(link).not.toBeNull();
      expect(link?.getAttribute("href")).toBe("/clip.mp4");
    });
  });

  it("does not show download link for pending clips", async () => {
    global.fetch = mockFetch({
      success: true,
      clips: [makeSavedClip({ status: "pending" })],
    });
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => {
      expect(document.querySelector("a[download]")).toBeNull();
    });
  });

  it("renders multiple saved clips", async () => {
    global.fetch = mockFetch({
      success: true,
      clips: [
        makeSavedClip({ id: "clip-1", title: "First Clip" }),
        makeSavedClip({ id: "clip-2", title: "Second Clip" }),
      ],
    });
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => {
      expect(screen.getByText("First Clip")).toBeInTheDocument();
      expect(screen.getByText("Second Clip")).toBeInTheDocument();
    });
  });
});

// ─── Save and export clip ─────────────────────────────────────────────────

describe("SocialClipsGenerator — export clip flow", () => {
  it("calls clips export API after saving when Exportar Clip is clicked", async () => {
    const savedClip = makeSavedClip({ id: "clip-new" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, clips: [] }) }) // load
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, suggestions: [makeSuggestion()] }),
      }) // generate
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, savedClips: [savedClip] }),
      }) // save
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, clipUrl: "/exported.mp4" }),
      }); // export
    global.fetch = fetchMock;
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => fetchMock.mock.calls.length >= 1);
    fireEvent.click(screen.getByRole("button", { name: /Gerar/i }));
    await waitFor(() => screen.getByRole("button", { name: /Exportar Clip/i }));
    fireEvent.click(screen.getByRole("button", { name: /Exportar Clip/i }));
    await waitFor(() => {
      const exportCall = fetchMock.mock.calls.find(
        (c) => c[0]?.includes("/clips/clip-new/export")
      );
      expect(exportCall).toBeDefined();
    });
  });

  it("shows toast success when export succeeds", async () => {
    const { toast } = await import("sonner");
    const savedClip = makeSavedClip({ id: "clip-new" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, clips: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, suggestions: [makeSuggestion()] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, savedClips: [savedClip] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, clipUrl: "/exported.mp4" }),
      });
    global.fetch = fetchMock;
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => fetchMock.mock.calls.length >= 1);
    fireEvent.click(screen.getByRole("button", { name: /Gerar/i }));
    await waitFor(() => screen.getByRole("button", { name: /Exportar Clip/i }));
    fireEvent.click(screen.getByRole("button", { name: /Exportar Clip/i }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Clip exportado!");
    });
  });

  it("shows toast error when save step fails", async () => {
    const { toast } = await import("sonner");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, clips: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, suggestions: [makeSuggestion()] }),
      })
      .mockRejectedValueOnce(new Error("Save failed"));
    global.fetch = fetchMock;
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => fetchMock.mock.calls.length >= 1);
    fireEvent.click(screen.getByRole("button", { name: /Gerar/i }));
    await waitFor(() => screen.getByRole("button", { name: /Exportar Clip/i }));
    fireEvent.click(screen.getByRole("button", { name: /Exportar Clip/i }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Erro ao salvar clip");
    });
  });
});

// ─── formatTime utility ───────────────────────────────────────────────────

describe("SocialClipsGenerator — time formatting", () => {
  it("formats suggestion time range with mm:ss pattern", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, clips: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          suggestions: [makeSuggestion({ startTime: 65, endTime: 125 })],
        }),
      });
    global.fetch = fetchMock;
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => fetchMock.mock.calls.length >= 1);
    fireEvent.click(screen.getByRole("button", { name: /Gerar/i }));
    await waitFor(() => {
      expect(screen.getByText(/1:05/)).toBeInTheDocument();
      expect(screen.getByText(/2:05/)).toBeInTheDocument();
    });
  });

  it("zero-pads seconds below 10", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, clips: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          suggestions: [makeSuggestion({ startTime: 63, endTime: 70 })],
        }),
      });
    global.fetch = fetchMock;
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => fetchMock.mock.calls.length >= 1);
    fireEvent.click(screen.getByRole("button", { name: /Gerar/i }));
    await waitFor(() => {
      expect(screen.getByText(/1:03/)).toBeInTheDocument();
      expect(screen.getByText(/1:10/)).toBeInTheDocument();
    });
  });
});

// ─── Score colors ─────────────────────────────────────────────────────────

describe("SocialClipsGenerator — score color classes", () => {
  it("applies emerald color class for score >= 8", async () => {
    global.fetch = mockFetch({
      success: true,
      clips: [makeSavedClip({ viralPotential: 9 })],
    });
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => {
      const scoreEl = screen.getByText(/9\/10/);
      expect(scoreEl.className).toContain("text-emerald-400");
    });
  });

  it("applies amber color class for score >= 6 and < 8", async () => {
    global.fetch = mockFetch({
      success: true,
      clips: [makeSavedClip({ viralPotential: 7 })],
    });
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => {
      const scoreEl = screen.getByText(/7\/10/);
      expect(scoreEl.className).toContain("text-amber-400");
    });
  });

  it("applies zinc color class for score < 6", async () => {
    global.fetch = mockFetch({
      success: true,
      clips: [makeSavedClip({ viralPotential: 4 })],
    });
    render(<SocialClipsGenerator {...defaultProps()} />);
    await waitFor(() => {
      const scoreEl = screen.getByText(/4\/10/);
      expect(scoreEl.className).toContain("text-zinc-400");
    });
  });
});
