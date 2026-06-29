import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";
import { LoginModal } from "@/components/auth/LoginModal";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    type,
    disabled,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    type?: string;
    disabled?: boolean;
    className?: string;
  }) =>
    React.createElement(
      "button",
      { onClick, type, disabled, className },
      children
    ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
    React.createElement("input", props),
}));

vi.mock("lucide-react", () => ({
  X: () => React.createElement("span", { "data-testid": "close-icon" }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function defaultProps(
  overrides: Partial<{
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
  }> = {}
) {
  return {
    isOpen: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    ...overrides,
  };
}

function fillForm(email = "test@example.com", password = "secret123") {
  fireEvent.change(screen.getByPlaceholderText("your@email.com"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByPlaceholderText("••••••••"), {
    target: { value: password },
  });
}

async function submitForm() {
  await act(async () => {
    fireEvent.submit(document.querySelector("form")!);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("LoginModal", () => {
  // ── Visibility ───────────────────────────────────────────────────────────────

  describe("visibility", () => {
    it("renders the modal when isOpen is true", () => {
      render(<LoginModal {...defaultProps()} />);
      expect(screen.getByText("Welcome to AeroPod")).toBeInTheDocument();
    });

    it("renders nothing when isOpen is false", () => {
      render(<LoginModal {...defaultProps({ isOpen: false })} />);
      expect(screen.queryByText("Welcome to AeroPod")).not.toBeInTheDocument();
    });

    it("shows the 'Sign in to your account' subtitle", () => {
      render(<LoginModal {...defaultProps()} />);
      expect(screen.getByText("Sign in to your account")).toBeInTheDocument();
    });

    it("shows the email and password input fields", () => {
      render(<LoginModal {...defaultProps()} />);
      expect(screen.getByPlaceholderText("your@email.com")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
    });

    it("shows the Sign In submit button", () => {
      render(<LoginModal {...defaultProps()} />);
      expect(
        screen.getByRole("button", { name: "Sign In" })
      ).toBeInTheDocument();
    });

    it("shows the close icon button", () => {
      render(<LoginModal {...defaultProps()} />);
      expect(screen.getByTestId("close-icon")).toBeInTheDocument();
    });
  });

  // ── Initial state ─────────────────────────────────────────────────────────────

  describe("initial state", () => {
    it("email and password inputs are empty by default", () => {
      render(<LoginModal {...defaultProps()} />);
      expect(
        (screen.getByPlaceholderText("your@email.com") as HTMLInputElement).value
      ).toBe("");
      expect(
        (screen.getByPlaceholderText("••••••••") as HTMLInputElement).value
      ).toBe("");
    });

    it("does not show an error message initially", () => {
      render(<LoginModal {...defaultProps()} />);
      expect(screen.queryByText(/Failed to login/i)).not.toBeInTheDocument();
    });

    it("Sign In button is enabled initially", () => {
      render(<LoginModal {...defaultProps()} />);
      expect(screen.getByRole("button", { name: "Sign In" })).not.toBeDisabled();
    });

    it("email input type is 'email'", () => {
      render(<LoginModal {...defaultProps()} />);
      expect(screen.getByPlaceholderText("your@email.com")).toHaveAttribute(
        "type",
        "email"
      );
    });

    it("password input type is 'password'", () => {
      render(<LoginModal {...defaultProps()} />);
      expect(screen.getByPlaceholderText("••••••••")).toHaveAttribute(
        "type",
        "password"
      );
    });
  });

  // ── Field interaction ─────────────────────────────────────────────────────────

  describe("field interaction", () => {
    it("updates the email field when the user types", () => {
      render(<LoginModal {...defaultProps()} />);
      fireEvent.change(screen.getByPlaceholderText("your@email.com"), {
        target: { value: "user@test.com" },
      });
      expect(
        (screen.getByPlaceholderText("your@email.com") as HTMLInputElement).value
      ).toBe("user@test.com");
    });

    it("updates the password field when the user types", () => {
      render(<LoginModal {...defaultProps()} />);
      fireEvent.change(screen.getByPlaceholderText("••••••••"), {
        target: { value: "mypassword" },
      });
      expect(
        (screen.getByPlaceholderText("••••••••") as HTMLInputElement).value
      ).toBe("mypassword");
    });

    it("email input has required attribute", () => {
      render(<LoginModal {...defaultProps()} />);
      expect(screen.getByPlaceholderText("your@email.com")).toHaveAttribute(
        "required"
      );
    });

    it("password input has required attribute", () => {
      render(<LoginModal {...defaultProps()} />);
      expect(screen.getByPlaceholderText("••••••••")).toHaveAttribute("required");
    });
  });

  // ── Close behaviour ───────────────────────────────────────────────────────────

  describe("close behaviour", () => {
    it("calls onClose when the close button (X icon) is clicked", () => {
      const props = defaultProps();
      render(<LoginModal {...props} />);
      fireEvent.click(screen.getByTestId("close-icon").closest("button")!);
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when the backdrop is clicked", () => {
      const props = defaultProps();
      render(<LoginModal {...props} />);
      // The backdrop is the absolute-positioned div behind the modal
      const backdrop = document
        .querySelector(".fixed.inset-0")!
        .querySelector(".absolute.inset-0")!;
      fireEvent.click(backdrop);
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ── Submission — success ──────────────────────────────────────────────────────

  describe("form submission — success", () => {
    function setupSuccessfulFetch() {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { id: "1", email: "test@example.com" } }),
      } as Response);
    }

    it("calls POST /api/auth/login with email and password as JSON", async () => {
      setupSuccessfulFetch();
      render(<LoginModal {...defaultProps()} />);
      fillForm("user@example.com", "pass123");
      await submitForm();

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/auth/login",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "user@example.com", password: "pass123" }),
        })
      );
    });

    it("calls onSuccess after a successful login", async () => {
      setupSuccessfulFetch();
      const props = defaultProps();
      render(<LoginModal {...props} />);
      fillForm();
      await submitForm();

      expect(props.onSuccess).toHaveBeenCalledTimes(1);
    });

    it("calls onClose after a successful login", async () => {
      setupSuccessfulFetch();
      const props = defaultProps();
      render(<LoginModal {...props} />);
      fillForm();
      await submitForm();

      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it("does not show an error message on success", async () => {
      setupSuccessfulFetch();
      render(<LoginModal {...defaultProps()} />);
      fillForm();
      await submitForm();

      expect(screen.queryByText(/Failed to login/i)).not.toBeInTheDocument();
    });

    it("works correctly when onSuccess prop is not provided", async () => {
      setupSuccessfulFetch();
      const props = { isOpen: true, onClose: vi.fn() };
      render(<LoginModal {...props} />);
      fillForm();
      await submitForm();

      expect(props.onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ── Submission — loading state ─────────────────────────────────────────────────

  describe("form submission — loading state", () => {
    it("shows 'Signing in...' on the button while the request is in-flight", async () => {
      mockFetch.mockReturnValueOnce(new Promise(() => {}));
      render(<LoginModal {...defaultProps()} />);
      fillForm();

      await act(async () => {
        fireEvent.submit(document.querySelector("form")!);
      });

      expect(screen.getByText("Signing in...")).toBeInTheDocument();
    });

    it("disables inputs while the request is in-flight", async () => {
      mockFetch.mockReturnValueOnce(new Promise(() => {}));
      render(<LoginModal {...defaultProps()} />);
      fillForm();

      await act(async () => {
        fireEvent.submit(document.querySelector("form")!);
      });

      expect(screen.getByPlaceholderText("your@email.com")).toBeDisabled();
      expect(screen.getByPlaceholderText("••••••••")).toBeDisabled();
    });

    it("disables the submit button while the request is in-flight", async () => {
      mockFetch.mockReturnValueOnce(new Promise(() => {}));
      render(<LoginModal {...defaultProps()} />);
      fillForm();

      await act(async () => {
        fireEvent.submit(document.querySelector("form")!);
      });

      expect(screen.getByRole("button", { name: "Signing in..." })).toBeDisabled();
    });
  });

  // ── Submission — failure ──────────────────────────────────────────────────────

  describe("form submission — failure", () => {
    it("shows the server error message when the API returns an error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Invalid credentials" }),
      } as Response);

      render(<LoginModal {...defaultProps()} />);
      fillForm();
      await submitForm();

      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });

    it("shows a generic error when the API returns no error field", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({}),
      } as Response);

      render(<LoginModal {...defaultProps()} />);
      fillForm();
      await submitForm();

      expect(screen.getByText("Failed to login")).toBeInTheDocument();
    });

    it("shows an error when fetch itself rejects (network error)", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      render(<LoginModal {...defaultProps()} />);
      fillForm();
      await submitForm();

      expect(screen.getByText("Network error")).toBeInTheDocument();
    });

    it("re-enables the submit button after a login failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Invalid credentials" }),
      } as Response);

      render(<LoginModal {...defaultProps()} />);
      fillForm();
      await submitForm();

      expect(screen.getByRole("button", { name: "Sign In" })).not.toBeDisabled();
    });

    it("re-enables inputs after a login failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Oops" }),
      } as Response);

      render(<LoginModal {...defaultProps()} />);
      fillForm();
      await submitForm();

      expect(screen.getByPlaceholderText("your@email.com")).not.toBeDisabled();
      expect(screen.getByPlaceholderText("••••••••")).not.toBeDisabled();
    });

    it("does not call onSuccess on failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Bad" }),
      } as Response);

      const props = defaultProps();
      render(<LoginModal {...props} />);
      fillForm();
      await submitForm();

      expect(props.onSuccess).not.toHaveBeenCalled();
    });

    it("does not call onClose on failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Bad" }),
      } as Response);

      const props = defaultProps();
      render(<LoginModal {...props} />);
      fillForm();
      await submitForm();

      expect(props.onClose).not.toHaveBeenCalled();
    });

    it("clears the previous error message before a new submission attempt", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: "First error" }),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: "Second error" }),
        } as Response);

      render(<LoginModal {...defaultProps()} />);
      fillForm();
      await submitForm();

      expect(screen.getByText("First error")).toBeInTheDocument();

      await submitForm();

      expect(screen.queryByText("First error")).not.toBeInTheDocument();
      expect(screen.getByText("Second error")).toBeInTheDocument();
    });
  });
});
