import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import React from "react";
import { AuthProvider, useAuth } from "@/components/auth/AuthProvider";

// ── Global fetch mock ─────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeOkResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  } as Response);
}

function makeErrorResponse(body: unknown, status = 400) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

/** Consumer component that surfaces the auth context values for assertions. */
function AuthConsumer() {
  const { user, isLoading, login, logout } = useAuth();

  return (
    <div>
      <span data-testid="loading">{isLoading ? "loading" : "ready"}</span>
      <span data-testid="user">{user ? user.email : "none"}</span>
      <span data-testid="user-name">{user?.name ?? ""}</span>
      <span data-testid="user-plan">{user?.plan ?? ""}</span>
      <button onClick={() => login("test@example.com")}>login</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>
  );
}

// ── AuthProvider: session check on mount ──────────────────────────────────────

describe("AuthProvider – session check on mount", () => {
  it("starts in loading state before the session fetch resolves", () => {
    // Never resolve so we can observe the loading state
    mockFetch.mockReturnValue(new Promise(() => {}));
    renderWithProvider();
    expect(screen.getByTestId("loading").textContent).toBe("loading");
  });

  it("sets user when /api/auth/me returns a valid session", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          user: { id: "u1", email: "alice@example.com", name: "Alice", plan: "pro" },
        }),
    } as Response);

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("ready");
    });

    expect(screen.getByTestId("user").textContent).toBe("alice@example.com");
    expect(screen.getByTestId("user-name").textContent).toBe("Alice");
    expect(screen.getByTestId("user-plan").textContent).toBe("pro");
  });

  it("leaves user null when /api/auth/me returns 401", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "Not authenticated" }),
    } as Response);

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("ready");
    });

    expect(screen.getByTestId("user").textContent).toBe("none");
  });

  it("leaves user null when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("ready");
    });

    expect(screen.getByTestId("user").textContent).toBe("none");
    consoleSpy.mockRestore();
  });

  it("calls /api/auth/me on mount", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response);

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("ready");
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/auth/me");
  });
});

// ── AuthProvider: login ───────────────────────────────────────────────────────

describe("AuthProvider – login", () => {
  it("sets user on successful login", async () => {
    // Mount: 401 (no session)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response);

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("ready");
    });

    // Login: 200
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          user: { id: "u2", email: "test@example.com", name: "Tester" },
        }),
    } as Response);

    await act(async () => {
      fireEvent.click(screen.getByText("login"));
    });

    expect(screen.getByTestId("user").textContent).toBe("test@example.com");
  });

  it("posts to /api/auth/login with the email", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response);

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("ready");
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ user: { id: "u3", email: "test@example.com" } }),
    } as Response);

    await act(async () => {
      fireEvent.click(screen.getByText("login"));
    });

    const loginCall = mockFetch.mock.calls[1];
    expect(loginCall[0]).toBe("/api/auth/login");
    expect(loginCall[1]?.method).toBe("POST");
    expect(JSON.parse(loginCall[1]?.body as string)).toEqual({ email: "test@example.com" });
  });

  it("throws when login returns non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response);

    let thrownError: Error | null = null;

    function ConsumerWithCapture() {
      const { login } = useAuth();
      return (
        <button
          onClick={async () => {
            try {
              await login("bad@example.com");
            } catch (e) {
              thrownError = e as Error;
            }
          }}
        >
          login-bad
        </button>
      );
    }

    render(
      <AuthProvider>
        <ConsumerWithCapture />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/auth/me");
    });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Invalid credentials" }),
    } as Response);

    await act(async () => {
      fireEvent.click(screen.getByText("login-bad"));
    });

    expect(thrownError).not.toBeNull();
    expect(thrownError!.message).toBe("Invalid credentials");
  });

  it("throws 'Failed to login' when error response has no message", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response);

    let thrownError: Error | null = null;

    function ConsumerWithCapture() {
      const { login } = useAuth();
      return (
        <button
          onClick={async () => {
            try {
              await login("bad@example.com");
            } catch (e) {
              thrownError = e as Error;
            }
          }}
        >
          login-bad
        </button>
      );
    }

    render(
      <AuthProvider>
        <ConsumerWithCapture />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/auth/me");
    });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response);

    await act(async () => {
      fireEvent.click(screen.getByText("login-bad"));
    });

    expect(thrownError!.message).toBe("Failed to login");
  });
});

// ── AuthProvider: logout ──────────────────────────────────────────────────────

describe("AuthProvider – logout", () => {
  it("clears user on logout", async () => {
    // Mount with valid session
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ user: { id: "u1", email: "alice@example.com" } }),
    } as Response);

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("alice@example.com");
    });

    // Logout
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response);

    await act(async () => {
      fireEvent.click(screen.getByText("logout"));
    });

    expect(screen.getByTestId("user").textContent).toBe("none");
  });

  it("posts to /api/auth/logout", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ user: { id: "u1", email: "alice@example.com" } }),
    } as Response);

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("alice@example.com");
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);

    await act(async () => {
      fireEvent.click(screen.getByText("logout"));
    });

    const logoutCall = mockFetch.mock.calls[1];
    expect(logoutCall[0]).toBe("/api/auth/logout");
    expect(logoutCall[1]?.method).toBe("POST");
  });

  it("still clears user even if logout fetch fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ user: { id: "u1", email: "alice@example.com" } }),
    } as Response);

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("alice@example.com");
    });

    // Logout fetch rejects
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    await act(async () => {
      fireEvent.click(screen.getByText("logout"));
    });

    // user should be cleared regardless
    expect(screen.getByTestId("user").textContent).toBe("none");
  });
});

// ── useAuth hook ──────────────────────────────────────────────────────────────

describe("useAuth", () => {
  it("throws when used outside AuthProvider", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      render(<AuthConsumer />);
    }).toThrow("useAuth must be used within an AuthProvider");

    consoleSpy.mockRestore();
  });

  it("provides user, isLoading, login, and logout", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response);

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("ready");
    });

    expect(screen.getByTestId("user")).toBeInTheDocument();
    expect(screen.getByText("login")).toBeInTheDocument();
    expect(screen.getByText("logout")).toBeInTheDocument();
  });
});
