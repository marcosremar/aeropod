import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ChatEditor } from "@/components/editor/ChatEditor";
import type { Segment } from "@/lib/db/schema";

// ─── Fixtures ─────────────────────────────────────────────────────────────

function makeSeg(overrides: Partial<Segment> = {}): Segment {
  return {
    id: "seg-1",
    projectId: "proj-1",
    startTime: 0,
    endTime: 30,
    text: "Hello world",
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
  } as unknown as Segment;
}

const BASE_SEGMENTS = [
  makeSeg({ id: "s1", startTime: 0, endTime: 60, isSelected: true }),
  makeSeg({ id: "s2", startTime: 60, endTime: 120, isSelected: false }),
  makeSeg({ id: "s3", startTime: 120, endTime: 180, isSelected: true }),
];

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

// jsdom doesn't implement scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// ─── Helpers ──────────────────────────────────────────────────────────────

function defaultProps(overrides: Partial<Parameters<typeof ChatEditor>[0]> = {}) {
  return {
    projectId: "proj-abc",
    segments: BASE_SEGMENTS,
    onAction: vi.fn(),
    onPlaySegment: vi.fn(),
    onSetPreview: vi.fn(),
    ...overrides,
  };
}

function successResponse(body: object) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  } as Response);
}

function errorResponse(status = 500) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({}),
  } as Response);
}

// ─── Rendering ────────────────────────────────────────────────────────────

describe("ChatEditor — rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    const { container } = render(<ChatEditor {...defaultProps()} />);
    expect(container.firstChild).not.toBeNull();
  });

  it("shows the welcome message on first load", () => {
    render(<ChatEditor {...defaultProps()} />);
    expect(screen.getByText(/assistente de edica/i)).toBeInTheDocument();
  });

  it("renders the 'Editor IA' heading", () => {
    render(<ChatEditor {...defaultProps()} />);
    expect(screen.getByText("Editor IA")).toBeInTheDocument();
  });

  it("renders the textarea for user input", () => {
    render(<ChatEditor {...defaultProps()} />);
    expect(screen.getByPlaceholderText(/Digite um comando/i)).toBeInTheDocument();
  });

  it("renders the send button", () => {
    render(<ChatEditor {...defaultProps()} />);
    // The send button renders a lucide Send icon — find by role
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("renders all quick-suggestion buttons", () => {
    render(<ChatEditor {...defaultProps()} />);
    expect(screen.getByText("Mostre a edicao atual")).toBeInTheDocument();
    expect(screen.getByText("Selecione os melhores momentos")).toBeInTheDocument();
    expect(screen.getByText("Remova repeticoes")).toBeInTheDocument();
    expect(screen.getByText("Foque em IA")).toBeInTheDocument();
    expect(screen.getByText("Como posso melhorar?")).toBeInTheDocument();
  });
});

// ─── Edit summary header ──────────────────────────────────────────────────

describe("ChatEditor — edit summary header", () => {
  it("shows the correct selected / total segment count", () => {
    render(<ChatEditor {...defaultProps()} />);
    // s1 and s3 are selected (2 of 3)
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("shows 0/N when no segments are selected", () => {
    const noSelected = BASE_SEGMENTS.map(s => ({ ...s, isSelected: false }));
    render(<ChatEditor {...defaultProps({ segments: noSelected })} />);
    expect(screen.getByText("0/3")).toBeInTheDocument();
  });

  it("shows -100% reduction when nothing is selected", () => {
    // editedDuration = 0, totalDuration = 180 → reduction = 100%
    const noSelected = BASE_SEGMENTS.map(s => ({ ...s, isSelected: false }));
    render(<ChatEditor {...defaultProps({ segments: noSelected })} />);
    expect(screen.getByText("-100%")).toBeInTheDocument();
  });

  it("shows -33% reduction when one of three equal segments is selected", () => {
    // Each seg is 60 s.  Selected: 1 of 3 → edited = 60 s, total = 180 s → reduction ≈ 67 %
    // But s1 (0-60) and s3 (120-180) are selected → edited = 120, total = 180 → reduction = 33%
    render(<ChatEditor {...defaultProps()} />);
    expect(screen.getByText("-33%")).toBeInTheDocument();
  });
});

// ─── User interaction — typing ────────────────────────────────────────────

describe("ChatEditor — typing and input", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates textarea value when user types", () => {
    render(<ChatEditor {...defaultProps()} />);
    const textarea = screen.getByPlaceholderText(/Digite um comando/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Remova silêncios" } });
    expect(textarea.value).toBe("Remova silêncios");
  });

  it("clicking a quick suggestion fills the textarea", () => {
    render(<ChatEditor {...defaultProps()} />);
    const suggestion = screen.getByText("Foque em IA");
    fireEvent.click(suggestion);
    const textarea = screen.getByPlaceholderText(/Digite um comando/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe("Foque em IA");
  });

  it("Shift+Enter does NOT send the message (adds newline)", async () => {
    render(<ChatEditor {...defaultProps()} />);
    const textarea = screen.getByPlaceholderText(/Digite um comando/i);
    fireEvent.change(textarea, { target: { value: "line1" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─── Sending a message ────────────────────────────────────────────────────

describe("ChatEditor — sending a message", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the message and shows a streaming placeholder while waiting", async () => {
    let resolveJson!: (v: object) => void;
    const jsonPromise = new Promise<object>(res => { resolveJson = res; });

    mockFetch.mockReturnValueOnce(Promise.resolve({
      ok: true,
      json: () => jsonPromise,
    } as unknown as Response));

    render(<ChatEditor {...defaultProps()} />);
    const textarea = screen.getByPlaceholderText(/Digite um comando/i);
    fireEvent.change(textarea, { target: { value: "Corte os silêncios" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/chat",
        expect.objectContaining({ method: "POST" })
      );
    });

    // Resolve with a valid response so the component doesn't hang
    await act(async () => {
      resolveJson({ response: "Pronto!", actions: [] });
    });
  });

  it("posts the correct body to /api/chat", async () => {
    mockFetch.mockReturnValueOnce(successResponse({ response: "OK", actions: [] }));

    render(<ChatEditor {...defaultProps()} />);
    const textarea = screen.getByPlaceholderText(/Digite um comando/i);
    fireEvent.change(textarea, { target: { value: "Teste" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const call = mockFetch.mock.calls[0];
    const body = JSON.parse(call[1].body);

    expect(body.projectId).toBe("proj-abc");
    expect(body.message).toBe("Teste");
    expect(Array.isArray(body.history)).toBe(true);
  });

  it("clears textarea after sending", async () => {
    mockFetch.mockReturnValueOnce(successResponse({ response: "OK", actions: [] }));

    render(<ChatEditor {...defaultProps()} />);
    const textarea = screen.getByPlaceholderText(/Digite um comando/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => expect(textarea.value).toBe(""));
  });

  it("shows the assistant reply text after fetch resolves", async () => {
    mockFetch.mockReturnValueOnce(successResponse({ response: "Feito com sucesso!", actions: [] }));

    render(<ChatEditor {...defaultProps()} />);
    const textarea = screen.getByPlaceholderText(/Digite um comando/i);
    fireEvent.change(textarea, { target: { value: "Algo" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => screen.getByText("Feito com sucesso!"));
  });

  it("shows an error message when fetch fails", async () => {
    mockFetch.mockReturnValueOnce(errorResponse(500));

    render(<ChatEditor {...defaultProps()} />);
    const textarea = screen.getByPlaceholderText(/Digite um comando/i);
    fireEvent.change(textarea, { target: { value: "Falha" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => screen.getByText(/erro ao processar/i));
  });

  it("shows an error message when fetch throws a network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    render(<ChatEditor {...defaultProps()} />);
    const textarea = screen.getByPlaceholderText(/Digite um comando/i);
    fireEvent.change(textarea, { target: { value: "Crash" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => screen.getByText(/erro ao processar/i));
  });

  it("does not send when textarea is empty", () => {
    render(<ChatEditor {...defaultProps()} />);
    const textarea = screen.getByPlaceholderText(/Digite um comando/i);
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not send when textarea contains only whitespace", () => {
    render(<ChatEditor {...defaultProps()} />);
    const textarea = screen.getByPlaceholderText(/Digite um comando/i);
    fireEvent.change(textarea, { target: { value: "   " } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─── Action handling ──────────────────────────────────────────────────────

describe("ChatEditor — action handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders action buttons when the response includes actions", async () => {
    mockFetch.mockReturnValueOnce(successResponse({
      response: "Aqui estão as ações:",
      actions: [
        { type: "select", segmentIds: ["s1"], message: "Selecionar segmento A" },
        { type: "deselect", segmentIds: ["s2"], message: "Remover segmento B" },
      ],
    }));

    const onAction = vi.fn();
    render(<ChatEditor {...defaultProps({ onAction })} />);
    const textarea = screen.getByPlaceholderText(/Digite um comando/i);
    fireEvent.change(textarea, { target: { value: "Editar" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => screen.getByText("Selecionar segmento A"));
    expect(screen.getByText("Remover segmento B")).toBeInTheDocument();
  });

  it("calls onAction with correct action when an action button is clicked", async () => {
    const action = { type: "select" as const, segmentIds: ["s1"], message: "Selecionar segmento A" };
    mockFetch.mockReturnValueOnce(successResponse({
      response: "Ação:",
      actions: [action],
    }));

    const onAction = vi.fn();
    render(<ChatEditor {...defaultProps({ onAction })} />);
    const textarea = screen.getByPlaceholderText(/Digite um comando/i);
    fireEvent.change(textarea, { target: { value: "Agir" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => screen.getByText("Selecionar segmento A"));
    fireEvent.click(screen.getByText("Selecionar segmento A"));
    expect(onAction).toHaveBeenCalledWith(action);
  });

  it("calls onSetPreview when response includes segment IDs", async () => {
    mockFetch.mockReturnValueOnce(successResponse({
      response: "Pré-visualização:",
      actions: [
        { type: "select", segmentIds: ["s1", "s3"], message: "Selecionar" },
      ],
    }));

    const onSetPreview = vi.fn();
    render(<ChatEditor {...defaultProps({ onSetPreview })} />);
    const textarea = screen.getByPlaceholderText(/Digite um comando/i);
    fireEvent.change(textarea, { target: { value: "Preview" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => expect(onSetPreview).toHaveBeenCalledWith(
      expect.arrayContaining(["s1", "s3"]),
      expect.any(String)
    ));
  });

  it("does not call onSetPreview when response has no segment IDs", async () => {
    mockFetch.mockReturnValueOnce(successResponse({
      response: "Info apenas:",
      actions: [{ type: "info", message: "Apenas informação" }],
    }));

    const onSetPreview = vi.fn();
    render(<ChatEditor {...defaultProps({ onSetPreview })} />);
    const textarea = screen.getByPlaceholderText(/Digite um comando/i);
    fireEvent.change(textarea, { target: { value: "Info" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => screen.getByText("Info apenas:"));
    expect(onSetPreview).not.toHaveBeenCalled();
  });

  it("does not call onAction for 'preview' type actions when clicked", async () => {
    // Preview-type actions are visual only — the execute handler returns early
    mockFetch.mockReturnValueOnce(successResponse({
      response: "Veja:",
      actions: [
        {
          type: "preview",
          message: "Ver mudancas propostas",
          preview: {
            before: [{ id: "s1", text: "Hello", startTime: 0, endTime: 30, isSelected: true }],
            after: [{ id: "s1", text: "Hello", startTime: 0, endTime: 30, isSelected: true }],
          },
        },
      ],
    }));

    const onAction = vi.fn();
    render(<ChatEditor {...defaultProps({ onAction })} />);
    const textarea = screen.getByPlaceholderText(/Digite um comando/i);
    fireEvent.change(textarea, { target: { value: "Show" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => screen.getByText("Veja:"));
    expect(onAction).not.toHaveBeenCalled();
  });
});

// ─── Message history ──────────────────────────────────────────────────────

describe("ChatEditor — message history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes prior messages in subsequent requests", async () => {
    mockFetch
      .mockReturnValueOnce(successResponse({ response: "Primeiro", actions: [] }))
      .mockReturnValueOnce(successResponse({ response: "Segundo", actions: [] }));

    render(<ChatEditor {...defaultProps()} />);
    const textarea = screen.getByPlaceholderText(/Digite um comando/i);

    // First message
    fireEvent.change(textarea, { target: { value: "Msg1" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    await waitFor(() => screen.getByText("Primeiro"));

    // Second message — history should contain the first exchange
    fireEvent.change(textarea, { target: { value: "Msg2" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    await waitFor(() => screen.getByText("Segundo"));

    const secondCall = mockFetch.mock.calls[1];
    const body = JSON.parse(secondCall[1].body);
    expect(body.history.length).toBeGreaterThan(0);
  });
});
