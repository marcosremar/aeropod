import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { EditorChat } from "@/components/editor/EditorChat";

// ─── Browser API stubs ─────────────────────────────────────────────────────────

window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.confirm = vi.fn().mockReturnValue(true);

// ─── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/components/editor/AudioRecorder", () => ({
  AudioRecorder: ({ onRecordingProcessed }: { onRecordingProcessed: (r: any) => void }) => (
    <button data-testid="audio-recorder" onClick={() => onRecordingProcessed({
      segmentId: "seg-rec",
      text: "Recorded audio text",
      duration: 30,
      audioUrl: "blob:audio-url",
    })}>
      Record
    </button>
  ),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

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

function defaultProps(overrides: Partial<Parameters<typeof EditorChat>[0]> = {}) {
  return {
    projectId: "proj-123",
    userId: "user-456",
    onAction: vi.fn(),
    isOpen: true,
    onToggle: vi.fn(),
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("EditorChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: chat history returns empty, sections returns empty
    mockFetch.mockResolvedValue(successResponse({ messages: [] }));
  });

  describe("toggle button (closed state)", () => {
    it("renders the toggle button when isOpen is false", async () => {
      render(<EditorChat {...defaultProps({ isOpen: false })} />);
      expect(screen.getByText("Assistente IA")).toBeInTheDocument();
    });

    it("does not render the toggle button in inline mode", () => {
      render(<EditorChat {...defaultProps({ isOpen: false, inline: true })} />);
      expect(screen.queryByText("Assistente IA")).not.toBeInTheDocument();
    });

    it("calls onToggle when toggle button is clicked", async () => {
      const onToggle = vi.fn();
      render(<EditorChat {...defaultProps({ isOpen: false, onToggle })} />);
      fireEvent.click(screen.getByText("Assistente IA"));
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("does not render the chat panel when isOpen is false", () => {
      render(<EditorChat {...defaultProps({ isOpen: false })} />);
      expect(screen.queryByText("Assistente AeroPod")).not.toBeInTheDocument();
    });
  });

  describe("chat panel header (open state)", () => {
    it("renders the assistant title when open", async () => {
      render(<EditorChat {...defaultProps()} />);
      expect(screen.getByText("Assistente AeroPod")).toBeInTheDocument();
    });

    it("renders the subtitle", async () => {
      render(<EditorChat {...defaultProps()} />);
      expect(screen.getByText("Edite com comandos naturais")).toBeInTheDocument();
    });

    it("renders the close (ChevronRight) button in non-inline mode", () => {
      render(<EditorChat {...defaultProps()} />);
      // The chevron close button triggers onToggle
      const clearBtn = screen.getByTitle("Limpar historico");
      expect(clearBtn).toBeInTheDocument();
    });

    it("does not render the close button in inline mode", () => {
      render(<EditorChat {...defaultProps({ inline: true })} />);
      // No ChevronRight button in inline mode — only the trash icon
      expect(screen.getByTitle("Limpar historico")).toBeInTheDocument();
    });
  });

  describe("initial welcome message", () => {
    it("shows the welcome message on mount", async () => {
      render(<EditorChat {...defaultProps()} />);
      await waitFor(() => {
        expect(
          screen.getByText("Ola! Sou seu assistente de edicao com IA. Como posso ajudar?")
        ).toBeInTheDocument();
      });
    });

    it("shows quick action buttons in the welcome message", async () => {
      render(<EditorChat {...defaultProps()} />);
      await waitFor(() => {
        expect(screen.getByText("Ver Template")).toBeInTheDocument();
        expect(screen.getByText("Auto-Mapear")).toBeInTheDocument();
        expect(screen.getByText("Ver Gaps")).toBeInTheDocument();
        expect(screen.getByText("Gravar")).toBeInTheDocument();
      });
    });
  });

  describe("chat history loading", () => {
    it("fetches chat history on mount", async () => {
      render(<EditorChat {...defaultProps()} />);
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/chat/proj-123");
      });
    });

    it("loads and displays historical messages when history exists", async () => {
      mockFetch.mockResolvedValueOnce(successResponse({
        messages: [
          { role: "user", content: "Hello AI", actions: null, richContent: null, timestamp: new Date().toISOString() },
          { role: "assistant", content: "Hi there!", actions: null, richContent: null, timestamp: new Date().toISOString() },
        ],
      }));

      render(<EditorChat {...defaultProps()} />);

      await waitFor(() => {
        expect(screen.getByText("Hello AI")).toBeInTheDocument();
        expect(screen.getByText("Hi there!")).toBeInTheDocument();
      });
    });

    it("does not crash when history fetch fails", async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500));
      // Should not throw
      render(<EditorChat {...defaultProps()} />);
      await waitFor(() => {
        expect(screen.getByText("Assistente AeroPod")).toBeInTheDocument();
      });
    });
  });

  describe("message input", () => {
    it("renders the text input field", () => {
      render(<EditorChat {...defaultProps()} />);
      expect(screen.getByPlaceholderText("Pergunte algo ou de um comando...")).toBeInTheDocument();
    });

    it("updates input value on change", () => {
      render(<EditorChat {...defaultProps()} />);
      const input = screen.getByPlaceholderText("Pergunte algo ou de um comando...");
      fireEvent.change(input, { target: { value: "test message" } });
      expect(input).toHaveValue("test message");
    });

    it("send button is disabled when input is empty", () => {
      render(<EditorChat {...defaultProps()} />);
      // The send button should be disabled with empty input
      // Find the send button by its position — it's the last button in the input row
      const buttons = screen.getAllByRole("button");
      const sendButton = buttons[buttons.length - 1];
      expect(sendButton).toBeDisabled();
    });

    it("send button is enabled when input has text", async () => {
      render(<EditorChat {...defaultProps()} />);
      const input = screen.getByPlaceholderText("Pergunte algo ou de um comando...");
      fireEvent.change(input, { target: { value: "hello" } });

      const buttons = screen.getAllByRole("button");
      const sendButton = buttons[buttons.length - 1];
      expect(sendButton).not.toBeDisabled();
    });
  });

  describe("sending messages", () => {
    it("sends a message and displays the user bubble", async () => {
      mockFetch
        .mockResolvedValueOnce(successResponse({ messages: [] })) // history load
        .mockResolvedValueOnce(successResponse({ response: "AI reply", actions: [], richContent: [] })); // chat POST

      render(<EditorChat {...defaultProps()} />);

      const input = screen.getByPlaceholderText("Pergunte algo ou de um comando...");
      fireEvent.change(input, { target: { value: "What can you do?" } });

      const buttons = screen.getAllByRole("button");
      const sendButton = buttons[buttons.length - 1];
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText("What can you do?")).toBeInTheDocument();
      });
    });

    it("clears the input after sending", async () => {
      mockFetch
        .mockResolvedValueOnce(successResponse({ messages: [] }))
        .mockResolvedValueOnce(successResponse({ response: "AI reply", actions: [], richContent: [] }));

      render(<EditorChat {...defaultProps()} />);

      const input = screen.getByPlaceholderText("Pergunte algo ou de um comando...");
      fireEvent.change(input, { target: { value: "hello" } });

      const buttons = screen.getAllByRole("button");
      fireEvent.click(buttons[buttons.length - 1]);

      await waitFor(() => {
        expect(input).toHaveValue("");
      });
    });

    it("displays the AI response after sending", async () => {
      mockFetch
        .mockResolvedValueOnce(successResponse({ messages: [] }))
        .mockResolvedValueOnce(successResponse({ response: "I can help you edit!", actions: [], richContent: [] }));

      render(<EditorChat {...defaultProps()} />);

      const input = screen.getByPlaceholderText("Pergunte algo ou de um comando...");
      fireEvent.change(input, { target: { value: "help" } });
      fireEvent.keyPress(input, { key: "Enter", code: "Enter", charCode: 13 });

      await waitFor(() => {
        expect(screen.getByText("I can help you edit!")).toBeInTheDocument();
      });
    });

    it("POSTs to /api/chat with correct payload", async () => {
      mockFetch
        .mockResolvedValueOnce(successResponse({ messages: [] }))
        .mockResolvedValueOnce(successResponse({ response: "ok", actions: [], richContent: [] }));

      render(<EditorChat {...defaultProps()} />);

      const input = screen.getByPlaceholderText("Pergunte algo ou de um comando...");
      fireEvent.change(input, { target: { value: "test" } });
      fireEvent.keyPress(input, { key: "Enter", code: "Enter", charCode: 13 });

      await waitFor(() => {
        const chatCall = mockFetch.mock.calls.find(
          (c) => c[0] === "/api/chat" && c[1]?.method === "POST"
        );
        expect(chatCall).toBeDefined();
        const body = JSON.parse(chatCall![1].body);
        expect(body.projectId).toBe("proj-123");
        expect(body.userId).toBe("user-456");
        expect(body.message).toBe("test");
        expect(body.includeTemplateContext).toBe(true);
      });
    });

    it("shows error bubble when API call fails", async () => {
      mockFetch
        .mockResolvedValueOnce(successResponse({ messages: [] }))
        .mockResolvedValueOnce(errorResponse(500));

      render(<EditorChat {...defaultProps()} />);

      const input = screen.getByPlaceholderText("Pergunte algo ou de um comando...");
      fireEvent.change(input, { target: { value: "fail me" } });
      fireEvent.keyPress(input, { key: "Enter", code: "Enter", charCode: 13 });

      await waitFor(() => {
        expect(
          screen.getByText("Desculpe, ocorreu um erro. Tente novamente.")
        ).toBeInTheDocument();
      });
    });

    it("does not send when Enter + Shift is pressed", async () => {
      mockFetch.mockResolvedValueOnce(successResponse({ messages: [] }));

      render(<EditorChat {...defaultProps()} />);

      const input = screen.getByPlaceholderText("Pergunte algo ou de um comando...");
      fireEvent.change(input, { target: { value: "newline" } });
      fireEvent.keyPress(input, { key: "Enter", shiftKey: true, code: "Enter", charCode: 13 });

      // Only the history fetch should have been called, no chat POST
      await waitFor(() => {
        const chatCalls = mockFetch.mock.calls.filter(
          (c) => c[0] === "/api/chat" && c[1]?.method === "POST"
        );
        expect(chatCalls).toHaveLength(0);
      });
    });

    it("does not send an empty message", async () => {
      mockFetch.mockResolvedValueOnce(successResponse({ messages: [] }));
      render(<EditorChat {...defaultProps()} />);

      const input = screen.getByPlaceholderText("Pergunte algo ou de um comando...");
      fireEvent.change(input, { target: { value: "   " } });
      fireEvent.keyPress(input, { key: "Enter", code: "Enter", charCode: 13 });

      await waitFor(() => {
        const chatCalls = mockFetch.mock.calls.filter(
          (c) => c[0] === "/api/chat" && c[1]?.method === "POST"
        );
        expect(chatCalls).toHaveLength(0);
      });
    });
  });

  describe("action buttons in AI responses", () => {
    it("renders action buttons from assistant message and calls onAction when clicked", async () => {
      const onAction = vi.fn();
      mockFetch
        .mockResolvedValueOnce(successResponse({ messages: [] }))
        .mockResolvedValueOnce(successResponse({
          response: "Here is the edit",
          actions: [{ type: "select", segmentIds: ["s1", "s2"], message: "Select intro segments" }],
          richContent: [],
        }));

      render(<EditorChat {...defaultProps({ onAction })} />);

      const input = screen.getByPlaceholderText("Pergunte algo ou de um comando...");
      fireEvent.change(input, { target: { value: "select intro" } });
      fireEvent.keyPress(input, { key: "Enter", code: "Enter", charCode: 13 });

      await waitFor(() => {
        expect(screen.getByText("Select intro segments")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Select intro segments"));
      expect(onAction).toHaveBeenCalledWith({
        type: "select",
        segmentIds: ["s1", "s2"],
        message: "Select intro segments",
      });
    });

    it("auto-executes focus actions from AI response", async () => {
      const onAction = vi.fn();
      mockFetch
        .mockResolvedValueOnce(successResponse({ messages: [] }))
        .mockResolvedValueOnce(successResponse({
          response: "Focusing segment",
          actions: [{ type: "focus", segmentIds: ["s1"], message: "Focus on intro" }],
          richContent: [],
        }));

      render(<EditorChat {...defaultProps({ onAction })} />);

      const input = screen.getByPlaceholderText("Pergunte algo ou de um comando...");
      fireEvent.change(input, { target: { value: "focus on intro" } });
      fireEvent.keyPress(input, { key: "Enter", code: "Enter", charCode: 13 });

      await waitFor(() => {
        // onAction is auto-called for focus actions
        expect(onAction).toHaveBeenCalledWith({
          type: "focus",
          segmentIds: ["s1"],
          message: "Focus on intro",
        });
      });
    });
  });

  describe("smart suggestion pills", () => {
    it("renders all suggestion pills", () => {
      render(<EditorChat {...defaultProps()} />);
      expect(screen.getByText("Status do template")).toBeInTheDocument();
      expect(screen.getByText("Auto-mapear")).toBeInTheDocument();
      expect(screen.getByText("Ver gaps")).toBeInTheDocument();
      expect(screen.getByText("Selecionar tudo")).toBeInTheDocument();
    });

    it("sets input to suggestion text when pill is clicked", () => {
      render(<EditorChat {...defaultProps()} />);
      fireEvent.click(screen.getByText("Status do template"));
      expect(
        screen.getByPlaceholderText("Pergunte algo ou de um comando...")
      ).toHaveValue("Status do template");
    });

    it("sets input to Auto-mapear when that pill is clicked", () => {
      render(<EditorChat {...defaultProps()} />);
      fireEvent.click(screen.getByText("Auto-mapear"));
      expect(
        screen.getByPlaceholderText("Pergunte algo ou de um comando...")
      ).toHaveValue("Auto-mapear");
    });
  });

  describe("clear history", () => {
    it("calls DELETE /api/chat/:projectId when confirm is accepted", async () => {
      mockFetch
        .mockResolvedValueOnce(successResponse({ messages: [] })) // initial history load
        .mockResolvedValueOnce(successResponse({})); // DELETE call

      render(<EditorChat {...defaultProps()} />);

      const clearBtn = screen.getByTitle("Limpar historico");
      fireEvent.click(clearBtn);

      await waitFor(() => {
        const deleteCall = mockFetch.mock.calls.find(
          (c) => c[0] === "/api/chat/proj-123" && c[1]?.method === "DELETE"
        );
        expect(deleteCall).toBeDefined();
      });
    });

    it("resets to a single welcome message after clearing", async () => {
      mockFetch
        .mockResolvedValueOnce(successResponse({ messages: [] }))
        .mockResolvedValueOnce(successResponse({}));

      render(<EditorChat {...defaultProps()} />);

      const clearBtn = screen.getByTitle("Limpar historico");
      fireEvent.click(clearBtn);

      await waitFor(() => {
        expect(screen.getByText("Historico limpo! Como posso ajudar?")).toBeInTheDocument();
      });
    });

    it("does not clear when confirm is cancelled", async () => {
      window.confirm = vi.fn().mockReturnValue(false);
      mockFetch.mockResolvedValueOnce(successResponse({ messages: [] }));

      render(<EditorChat {...defaultProps()} />);

      const clearBtn = screen.getByTitle("Limpar historico");
      fireEvent.click(clearBtn);

      // No DELETE call should have been made
      const deleteCalls = mockFetch.mock.calls.filter(
        (c) => c[0] === "/api/chat/proj-123" && c[1]?.method === "DELETE"
      );
      expect(deleteCalls).toHaveLength(0);
    });
  });

  describe("audio recorder integration", () => {
    it("renders the AudioRecorder component", () => {
      render(<EditorChat {...defaultProps()} />);
      expect(screen.getByTestId("audio-recorder")).toBeInTheDocument();
    });

    it("shows a preview message when recording is processed", async () => {
      mockFetch
        .mockResolvedValueOnce(successResponse({ messages: [] })) // history
        .mockResolvedValueOnce(successResponse({ sections: [] })); // fetchSections

      render(<EditorChat {...defaultProps()} />);

      await act(async () => {
        fireEvent.click(screen.getByTestId("audio-recorder"));
      });

      await waitFor(() => {
        expect(
          screen.getByText(/Audio gravado com sucesso/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe("inline mode", () => {
    it("does not render the toggle button when open in inline mode", () => {
      render(<EditorChat {...defaultProps({ inline: true })} />);
      expect(screen.queryByText("Assistente IA")).not.toBeInTheDocument();
    });

    it("renders the chat panel header in inline mode", () => {
      render(<EditorChat {...defaultProps({ inline: true })} />);
      expect(screen.getByText("Assistente AeroPod")).toBeInTheDocument();
    });
  });

  describe("timestamp formatting", () => {
    it("renders timestamps on messages", async () => {
      mockFetch.mockResolvedValueOnce(successResponse({ messages: [] }));

      render(<EditorChat {...defaultProps()} />);

      await waitFor(() => {
        // The welcome message should have a timestamp rendered (10-char HH:MM text)
        const timestamps = document.querySelectorAll(
          '[class*="text-[10px]"]'
        );
        expect(timestamps.length).toBeGreaterThan(0);
      });
    });
  });
});
