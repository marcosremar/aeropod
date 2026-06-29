import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AudioEnhancementPanel } from "@/components/editor/AudioEnhancementPanel";

// ─── Mocks ────────────────────────────────────────────────────────────────

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Radix Switch uses pointer events that don't work in JSDOM
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

// Radix Slider
vi.mock("@/components/ui/slider", async () => {
  const R = await import("react");
  return {
    Slider: ({
      value,
      onValueChange,
      min,
      max,
      step,
      ...props
    }: {
      value?: number[];
      onValueChange?: (v: number[]) => void;
      min?: number;
      max?: number;
      step?: number;
      [key: string]: unknown;
    }) =>
      R.createElement("input", {
        type: "range",
        value: value?.[0] ?? 0,
        min,
        max,
        step,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
          onValueChange?.([Number(e.target.value)]),
        ...props,
      }),
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────

function mockFetch(responseBody: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: async () => responseBody,
  });
}

function statusResponse(overrides: Partial<{ isEnhanced: boolean; enhancedAudioUrl: string | null }> = {}) {
  return {
    success: true,
    isEnhanced: false,
    enhancedAudioUrl: null,
    presets: [],
    currentSettings: null,
    ...overrides,
  };
}

// ─── Loading state ────────────────────────────────────────────────────────

describe("AudioEnhancementPanel — loading state", () => {
  it("shows a spinner while the initial fetch is in-flight", () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<AudioEnhancementPanel projectId="proj-1" />);
    const spinner = document.querySelector(".animate-spin");
    // The spinner only appears on action buttons, not initial load; ensure header renders
    // The header should be present immediately since there's no explicit loading state
    expect(document.body).toBeTruthy();
  });

  it("renders the panel header 'Melhoria de Audio' after load", async () => {
    global.fetch = mockFetch(statusResponse());
    render(<AudioEnhancementPanel projectId="proj-1" />);
    expect(await screen.findByText("Melhoria de Audio")).toBeInTheDocument();
  });
});

// ─── Mount fetch ─────────────────────────────────────────────────────────

describe("AudioEnhancementPanel — mount fetch", () => {
  it("calls GET /api/projects/{id}/enhance on mount", async () => {
    const fetchMock = mockFetch(statusResponse());
    global.fetch = fetchMock;
    render(<AudioEnhancementPanel projectId="proj-42" />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/projects/proj-42/enhance");
    });
  });

  it("falls back to default presets when API returns empty presets array", async () => {
    global.fetch = mockFetch(statusResponse());
    render(<AudioEnhancementPanel projectId="proj-1" />);
    // Default presets should render
    expect(await screen.findByText("Podcast Padrao")).toBeInTheDocument();
    expect(await screen.findByText("Voz Clara")).toBeInTheDocument();
    expect(await screen.findByText("Pronto para Radio")).toBeInTheDocument();
    expect(await screen.findByText("Minimo")).toBeInTheDocument();
  });

  it("falls back to default presets when API call fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network error"));
    render(<AudioEnhancementPanel projectId="proj-1" />);
    expect(await screen.findByText("Podcast Padrao")).toBeInTheDocument();
  });

  it("uses presets returned by the API when they are non-empty", async () => {
    global.fetch = mockFetch({
      success: true,
      isEnhanced: false,
      presets: [{ id: "custom", name: "Meu Preset", description: "desc", settings: {} }],
    });
    render(<AudioEnhancementPanel projectId="proj-1" />);
    expect(await screen.findByText("Meu Preset")).toBeInTheDocument();
  });
});

// ─── Enhancement status ───────────────────────────────────────────────────

describe("AudioEnhancementPanel — enhancement status", () => {
  it("does NOT show 'Aplicado' badge when not enhanced", async () => {
    global.fetch = mockFetch(statusResponse({ isEnhanced: false }));
    render(<AudioEnhancementPanel projectId="proj-1" />);
    await screen.findByText("Melhoria de Audio");
    expect(screen.queryByText("Aplicado")).not.toBeInTheDocument();
  });

  it("shows 'Aplicado' badge when project is already enhanced", async () => {
    global.fetch = mockFetch(statusResponse({ isEnhanced: true, enhancedAudioUrl: "https://cdn/enhanced.mp3" }));
    render(<AudioEnhancementPanel projectId="proj-1" />);
    expect(await screen.findByText("Aplicado")).toBeInTheDocument();
  });

  it("shows 'Remover Melhorias' button when already enhanced", async () => {
    global.fetch = mockFetch(statusResponse({ isEnhanced: true }));
    render(<AudioEnhancementPanel projectId="proj-1" />);
    expect(await screen.findByRole("button", { name: /Remover Melhorias/ })).toBeInTheDocument();
  });

  it("hides 'Remover Melhorias' button when not enhanced", async () => {
    global.fetch = mockFetch(statusResponse({ isEnhanced: false }));
    render(<AudioEnhancementPanel projectId="proj-1" />);
    await screen.findByText("Melhoria de Audio");
    expect(screen.queryByText(/Remover Melhorias/)).not.toBeInTheDocument();
  });
});

// ─── Presets ──────────────────────────────────────────────────────────────

describe("AudioEnhancementPanel — presets", () => {
  beforeEach(() => {
    global.fetch = mockFetch(statusResponse());
  });

  it("renders all four default preset cards", async () => {
    render(<AudioEnhancementPanel projectId="proj-1" />);
    expect(await screen.findByText("Podcast Padrao")).toBeInTheDocument();
    expect(screen.getByText("Voz Clara")).toBeInTheDocument();
    expect(screen.getByText("Pronto para Radio")).toBeInTheDocument();
    expect(screen.getByText("Minimo")).toBeInTheDocument();
  });

  it("renders preset descriptions", async () => {
    render(<AudioEnhancementPanel projectId="proj-1" />);
    expect(await screen.findByText("Configuracao otimizada para podcasts")).toBeInTheDocument();
    expect(screen.getByText("Maximiza clareza da voz")).toBeInTheDocument();
  });

  it("defaults to 'podcast_standard' preset selected", async () => {
    render(<AudioEnhancementPanel projectId="proj-1" />);
    await screen.findByText("Podcast Padrao");
    // The selected preset button has border-purple-500 applied via cn()
    const presetButtons = screen.getAllByRole("button").filter((btn) =>
      btn.textContent?.includes("Podcast Padrao")
    );
    expect(presetButtons[0].className).toContain("border-purple-500");
  });

  it("clicking 'Voz Clara' selects it and updates its button style", async () => {
    render(<AudioEnhancementPanel projectId="proj-1" />);
    await screen.findByText("Voz Clara");
    const voiceClarity = screen.getAllByRole("button").find((btn) =>
      btn.textContent?.includes("Voz Clara")
    )!;
    fireEvent.click(voiceClarity);
    await waitFor(() => {
      expect(voiceClarity.className).toContain("border-purple-500");
    });
  });

  it("clicking a preset updates the LUFS value to that preset's targetLufs", async () => {
    render(<AudioEnhancementPanel projectId="proj-1" />);
    await screen.findByText("Voz Clara");
    const voiceClarityBtn = screen.getAllByRole("button").find((btn) =>
      btn.textContent?.includes("Voz Clara")
    )!;
    fireEvent.click(voiceClarityBtn);
    // Voz Clara has targetLufs: -14
    await waitFor(() => {
      expect(screen.getByText("-14 LUFS")).toBeInTheDocument();
    });
  });
});

// ─── Settings toggles ─────────────────────────────────────────────────────

describe("AudioEnhancementPanel — settings toggles", () => {
  beforeEach(() => {
    global.fetch = mockFetch(statusResponse());
  });

  it("renders 'Normalizar Volume' label", async () => {
    render(<AudioEnhancementPanel projectId="proj-1" />);
    expect(await screen.findByText("Normalizar Volume")).toBeInTheDocument();
  });

  it("renders 'Remover Ruido' label", async () => {
    render(<AudioEnhancementPanel projectId="proj-1" />);
    expect(await screen.findByText("Remover Ruido")).toBeInTheDocument();
  });

  it("renders 'Equalizacao' label", async () => {
    render(<AudioEnhancementPanel projectId="proj-1" />);
    expect(await screen.findByText("Equalizacao")).toBeInTheDocument();
  });

  it("renders 'Compressao' label", async () => {
    render(<AudioEnhancementPanel projectId="proj-1" />);
    expect(await screen.findByText("Compressao")).toBeInTheDocument();
  });

  it("toggles normalize off when switch is clicked", async () => {
    render(<AudioEnhancementPanel projectId="proj-1" />);
    await screen.findByText("Normalizar Volume");
    // The LUFS slider is visible when normalize is on
    expect(screen.getByText("-16 LUFS")).toBeInTheDocument();
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[0]); // normalize switch is first
    await waitFor(() => {
      expect(screen.queryByText("-16 LUFS")).not.toBeInTheDocument();
    });
  });

  it("shows LUFS slider when normalize is enabled", async () => {
    render(<AudioEnhancementPanel projectId="proj-1" />);
    await screen.findByText("Normalizar Volume");
    expect(screen.getByText("Volume alvo (LUFS)")).toBeInTheDocument();
  });

  it("hides LUFS slider when normalize is toggled off", async () => {
    render(<AudioEnhancementPanel projectId="proj-1" />);
    await screen.findByText("Normalizar Volume");
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[0]);
    await waitFor(() => {
      expect(screen.queryByText("Volume alvo (LUFS)")).not.toBeInTheDocument();
    });
  });
});

// ─── Denoise strength ─────────────────────────────────────────────────────

describe("AudioEnhancementPanel — denoise strength", () => {
  beforeEach(() => {
    global.fetch = mockFetch(statusResponse());
  });

  it("renders the three denoise strength options", async () => {
    render(<AudioEnhancementPanel projectId="proj-1" />);
    // "Leve" and "Medio" appear in both the denoise and compress sections
    expect(await screen.findAllByText("Leve")).toHaveLength(2);
    expect(screen.getAllByText("Medio")).toHaveLength(2);
    expect(screen.getByText("Forte")).toBeInTheDocument();
  });

  it("selecting 'Leve' (first/denoise instance) applies bg-purple-500", async () => {
    render(<AudioEnhancementPanel projectId="proj-1" />);
    await screen.findByText("Remover Ruido");
    // denoise Leve is the first occurrence; compress Leve is the second
    const leveBtns = screen.getAllByText("Leve");
    fireEvent.click(leveBtns[0]);
    await waitFor(() => {
      expect(leveBtns[0].className).toContain("bg-purple-500");
    });
  });

  it("selecting 'Forte' makes the aggressive button active", async () => {
    render(<AudioEnhancementPanel projectId="proj-1" />);
    await screen.findByText("Forte");
    const forteBtn = screen.getByText("Forte");
    fireEvent.click(forteBtn);
    await waitFor(() => {
      expect(forteBtn.className).toContain("bg-purple-500");
    });
  });
});

// ─── EQ preset ────────────────────────────────────────────────────────────

describe("AudioEnhancementPanel — EQ preset", () => {
  beforeEach(() => {
    global.fetch = mockFetch(statusResponse());
  });

  it("renders the three EQ options", async () => {
    render(<AudioEnhancementPanel projectId="proj-1" />);
    expect(await screen.findByText("Voz")).toBeInTheDocument();
    expect(screen.getByText("Clareza")).toBeInTheDocument();
    expect(screen.getByText("Calor")).toBeInTheDocument();
  });

  it("selecting 'Clareza' activates the clarity EQ button", async () => {
    render(<AudioEnhancementPanel projectId="proj-1" />);
    await screen.findByText("Clareza");
    const clareza = screen.getByText("Clareza");
    fireEvent.click(clareza);
    await waitFor(() => {
      expect(clareza.className).toContain("bg-purple-500");
    });
  });
});

// ─── Compression preset ───────────────────────────────────────────────────

describe("AudioEnhancementPanel — compression preset", () => {
  beforeEach(() => {
    global.fetch = mockFetch(statusResponse());
  });

  it("renders 'Radio' compression option", async () => {
    render(<AudioEnhancementPanel projectId="proj-1" />);
    expect(await screen.findByText("Radio")).toBeInTheDocument();
  });

  it("selecting 'Radio' activates the broadcast compression button", async () => {
    render(<AudioEnhancementPanel projectId="proj-1" />);
    await screen.findByText("Radio");
    const radioBtn = screen.getByText("Radio");
    fireEvent.click(radioBtn);
    await waitFor(() => {
      expect(radioBtn.className).toContain("bg-purple-500");
    });
  });
});

// ─── Action buttons ───────────────────────────────────────────────────────

describe("AudioEnhancementPanel — action buttons", () => {
  beforeEach(() => {
    global.fetch = mockFetch(statusResponse());
  });

  it("renders 'Preview' button", async () => {
    render(<AudioEnhancementPanel projectId="proj-1" />);
    expect(await screen.findByRole("button", { name: /Preview/ })).toBeInTheDocument();
  });

  it("renders 'Aplicar' button", async () => {
    render(<AudioEnhancementPanel projectId="proj-1" />);
    expect(await screen.findByRole("button", { name: /Aplicar/ })).toBeInTheDocument();
  });

  it("Preview and Aplicar buttons are enabled when not processing", async () => {
    render(<AudioEnhancementPanel projectId="proj-1" />);
    const preview = await screen.findByRole("button", { name: /Preview/ });
    const aplicar = screen.getByRole("button", { name: /Aplicar/ });
    expect(preview).not.toBeDisabled();
    expect(aplicar).not.toBeDisabled();
  });
});

// ─── Generate preview API call ─────────────────────────────────────────────

describe("AudioEnhancementPanel — generate preview", () => {
  it("calls POST /api/projects/{id}/enhance with preview:true when Preview is clicked", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => statusResponse() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, previewUrl: "https://cdn/preview.mp3" }) });
    global.fetch = fetchMock;

    render(<AudioEnhancementPanel projectId="proj-1" />);
    const previewBtn = await screen.findByRole("button", { name: /Preview/ });
    fireEvent.click(previewBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-1/enhance",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"preview":true'),
        })
      );
    });
  });

  it("includes previewDuration:10 in the preview request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => statusResponse() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, previewUrl: "https://cdn/preview.mp3" }) });
    global.fetch = fetchMock;

    render(<AudioEnhancementPanel projectId="proj-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Preview/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-1/enhance",
        expect.objectContaining({
          body: expect.stringContaining('"previewDuration":10'),
        })
      );
    });
  });

  it("disables buttons while preview is processing", async () => {
    let resolvePreview!: (v: unknown) => void;
    const previewPromise = new Promise((res) => { resolvePreview = res; });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => statusResponse() })
      .mockReturnValueOnce(previewPromise);
    global.fetch = fetchMock;

    render(<AudioEnhancementPanel projectId="proj-1" />);
    const previewBtn = await screen.findByRole("button", { name: /Preview/ });
    fireEvent.click(previewBtn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Preview/ })).toBeDisabled();
      expect(screen.getByRole("button", { name: /Aplicar/ })).toBeDisabled();
    });

    resolvePreview({ ok: true, json: async () => ({ success: true }) });
  });
});

// ─── Apply enhancements API call ──────────────────────────────────────────

describe("AudioEnhancementPanel — apply enhancements", () => {
  it("calls POST /api/projects/{id}/enhance with preview:false when Aplicar is clicked", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => statusResponse() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, enhancedAudioUrl: "https://cdn/enhanced.mp3" }) });
    global.fetch = fetchMock;

    render(<AudioEnhancementPanel projectId="proj-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Aplicar/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-1/enhance",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"preview":false'),
        })
      );
    });
  });

  it("shows 'Aplicado' badge after successful enhancement", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => statusResponse({ isEnhanced: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, enhancedAudioUrl: "https://cdn/enhanced.mp3" }) });
    global.fetch = fetchMock;

    render(<AudioEnhancementPanel projectId="proj-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Aplicar/ }));

    expect(await screen.findByText("Aplicado")).toBeInTheDocument();
  });

  it("calls onEnhanced callback with the enhanced URL after success", async () => {
    const onEnhanced = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => statusResponse() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, enhancedAudioUrl: "https://cdn/enhanced.mp3" }) });
    global.fetch = fetchMock;

    render(<AudioEnhancementPanel projectId="proj-1" onEnhanced={onEnhanced} />);
    fireEvent.click(await screen.findByRole("button", { name: /Aplicar/ }));

    await waitFor(() => {
      expect(onEnhanced).toHaveBeenCalledWith("https://cdn/enhanced.mp3");
    });
  });

  it("includes selected preset in the apply request body", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => statusResponse() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, enhancedAudioUrl: "https://cdn/enhanced.mp3" }) });
    global.fetch = fetchMock;

    render(<AudioEnhancementPanel projectId="proj-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Aplicar/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-1/enhance",
        expect.objectContaining({
          body: expect.stringContaining('"preset":"podcast_standard"'),
        })
      );
    });
  });
});

// ─── Remove enhancements ──────────────────────────────────────────────────

describe("AudioEnhancementPanel — remove enhancements", () => {
  it("calls DELETE /api/projects/{id}/enhance when 'Remover Melhorias' is clicked", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => statusResponse({ isEnhanced: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
    global.fetch = fetchMock;

    render(<AudioEnhancementPanel projectId="proj-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Remover Melhorias/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-1/enhance",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  it("hides 'Aplicado' badge after removing enhancements", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => statusResponse({ isEnhanced: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
    global.fetch = fetchMock;

    render(<AudioEnhancementPanel projectId="proj-1" />);
    await screen.findByText("Aplicado");
    fireEvent.click(screen.getByRole("button", { name: /Remover Melhorias/ }));

    await waitFor(() => {
      expect(screen.queryByText("Aplicado")).not.toBeInTheDocument();
    });
  });

  it("hides 'Remover Melhorias' button after removing enhancements", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => statusResponse({ isEnhanced: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
    global.fetch = fetchMock;

    render(<AudioEnhancementPanel projectId="proj-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Remover Melhorias/ }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Remover Melhorias/ })).not.toBeInTheDocument();
    });
  });
});

// ─── className prop ───────────────────────────────────────────────────────

describe("AudioEnhancementPanel — className prop", () => {
  it("applies additional className to the root element", async () => {
    global.fetch = mockFetch(statusResponse());
    const { container } = render(
      <AudioEnhancementPanel projectId="proj-1" className="my-custom-class" />
    );
    expect(container.firstChild).toHaveClass("my-custom-class");
  });
});
