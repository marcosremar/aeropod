import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { mockFetch, jsonResponse, restoreFetch } from "../helpers/mock-fetch";

// sonner is imported by UploadModal
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  }),
}));

import { CTA } from "@/components/landing/CTA";
import { Comparison } from "@/components/landing/Comparison";
import { FAQ } from "@/components/landing/FAQ";
import { Features } from "@/components/landing/Features";
import { Footer } from "@/components/landing/Footer";
import { Header } from "@/components/landing/Header";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Pricing } from "@/components/landing/Pricing";
import { Problem } from "@/components/landing/Problem";

import { AuthProvider, useAuth } from "@/components/auth/AuthProvider";
import { LoginModal } from "@/components/auth/LoginModal";
import { NewProjectButton } from "@/components/dashboard/NewProjectButton";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { UploadModal } from "@/components/dashboard/UploadModal";

import { toast } from "sonner";

afterEach(() => {
  restoreFetch();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Landing components
// ---------------------------------------------------------------------------

describe("CTA", () => {
  it("renders headline, copy and an embedded waitlist form", () => {
    render(<CTA />);
    expect(
      screen.getByText("Seja um dos primeiros a testar")
    ).toBeInTheDocument();
    expect(screen.getByText(/Vagas limitadas para o beta/i)).toBeInTheDocument();
    // WaitlistForm is embedded
    expect(screen.getByTestId("email-input")).toBeInTheDocument();
    expect(screen.getByTestId("submit-button")).toBeInTheDocument();
  });

  it("validates email locally before submitting", () => {
    render(<CTA />);
    fireEvent.click(screen.getByTestId("submit-button"));
    expect(screen.getByTestId("error-message")).toBeInTheDocument();
    expect(
      screen.getByText(/insira um email valido/i)
    ).toBeInTheDocument();
  });
});

describe("Comparison", () => {
  it("renders the heading and all comparison feature rows", () => {
    render(<Comparison />);
    expect(screen.getByText("Nao e so cortar silencio")).toBeInTheDocument();
    expect(screen.getByText("Funcionalidade")).toBeInTheDocument();
    expect(screen.getByText("AeroPod")).toBeInTheDocument();
    expect(screen.getByText("Remove silencio e 'ums'")).toBeInTheDocument();
    expect(
      screen.getByText("Entende o conteudo semanticamente")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Regravacao inline de trechos")
    ).toBeInTheDocument();
  });
});

describe("FAQ", () => {
  it("renders the heading and question titles", () => {
    render(<FAQ />);
    expect(screen.getByText("Perguntas frequentes")).toBeInTheDocument();
    expect(
      screen.getByText("Funciona com qualquer tipo de podcast?")
    ).toBeInTheDocument();
    expect(
      screen.getByText("E se a IA errar na selecao?")
    ).toBeInTheDocument();
  });

  it("toggles an item open when its question button is clicked", () => {
    render(<FAQ />);
    // first item open by default, clicking a closed one toggles it
    const secondQuestion = screen.getByText("E se a IA errar na selecao?");
    fireEvent.click(secondQuestion);
    expect(
      screen.getByText(/Voce tem controle total/i)
    ).toBeInTheDocument();
  });
});

describe("Features", () => {
  it("renders the section heading and feature cards", () => {
    render(<Features />);
    expect(screen.getByText("Selecao inteligente")).toBeInTheDocument();
    expect(screen.getByText("Deteccao de erros")).toBeInTheDocument();
    expect(screen.getByText("Regravacao inline")).toBeInTheDocument();
    expect(screen.getByText("Export pronto")).toBeInTheDocument();
    expect(screen.getByText("Economize horas")).toBeInTheDocument();
  });
});

describe("Footer", () => {
  it("renders the brand, copyright year and nav links", () => {
    render(<Footer />);
    expect(screen.getByText("AeroPod")).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(String(new Date().getFullYear())))
    ).toBeInTheDocument();
    expect(screen.getByText("Termos")).toBeInTheDocument();
    expect(screen.getByText("Privacidade")).toBeInTheDocument();
    expect(screen.getByText("Contato")).toBeInTheDocument();
  });
});

describe("Header", () => {
  it("renders logo, nav links and auth buttons", () => {
    render(<Header />);
    expect(screen.getByText("AeroPod")).toBeInTheDocument();
    expect(screen.getByText("Como Funciona")).toBeInTheDocument();
    expect(screen.getByText("Features")).toBeInTheDocument();
    expect(screen.getByText("Precos")).toBeInTheDocument();
    expect(screen.getByText("FAQ")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Entrar" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Dashboard" })
    ).toBeInTheDocument();
  });
});

describe("HowItWorks", () => {
  it("renders heading and the three steps", () => {
    render(<HowItWorks />);
    expect(screen.getByText("Como funciona")).toBeInTheDocument();
    expect(screen.getByText("Grave falando livremente")).toBeInTheDocument();
    expect(screen.getByText("IA analisa e seleciona")).toBeInTheDocument();
    expect(screen.getByText("Revise e publique")).toBeInTheDocument();
    expect(screen.getByText("Passo 1")).toBeInTheDocument();
  });
});

describe("Pricing", () => {
  it("renders all plans with their prices and CTAs", () => {
    render(<Pricing />);
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Starter")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("Unlimited")).toBeInTheDocument();
    expect(screen.getByText("R$ 79")).toBeInTheDocument();
    expect(screen.getByText("Mais popular")).toBeInTheDocument();
  });

  it("renders disabled CTA buttons (coming soon)", () => {
    render(<Pricing />);
    const escolherPro = screen.getByRole("button", { name: "Escolher Pro" });
    expect(escolherPro).toBeDisabled();
  });
});

describe("Problem", () => {
  it("renders the heading and the three problem cards", () => {
    render(<Problem />);
    expect(screen.getByText("Horas ouvindo gravacao")).toBeInTheDocument();
    expect(screen.getByText("Decidindo o que cortar")).toBeInTheDocument();
    expect(screen.getByText("Reorganizando trechos")).toBeInTheDocument();
    expect(screen.getAllByText(/exaustivo/i).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Auth components
// ---------------------------------------------------------------------------

describe("AuthProvider / useAuth", () => {
  function Consumer() {
    const { user, isLoading } = useAuth();
    return (
      <div>
        <span data-testid="loading">{String(isLoading)}</span>
        <span data-testid="user">{user ? user.email : "none"}</span>
      </div>
    );
  }

  it("loads an existing session from /api/auth/me", async () => {
    mockFetch({
      "/api/auth/me": jsonResponse({ user: { id: "u1", email: "a@b.c" } }),
    });
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false")
    );
    expect(screen.getByTestId("user").textContent).toBe("a@b.c");
  });

  it("leaves user null when there is no session", async () => {
    mockFetch({
      "/api/auth/me": jsonResponse({}, { status: 401, ok: false }),
    });
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false")
    );
    expect(screen.getByTestId("user").textContent).toBe("none");
  });

  it("throws when useAuth is used outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(
      /useAuth must be used within an AuthProvider/
    );
    spy.mockRestore();
  });
});

describe("LoginModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <LoginModal isOpen={false} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the form when open", () => {
    render(<LoginModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText("Welcome to AeroPod")).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("submits credentials and calls onSuccess + onClose on success", async () => {
    const fetchMock = mockFetch({
      "/api/auth/login": jsonResponse({ user: { id: "u1", email: "a@b.c" } }),
    });
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(
      <LoginModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />
    );

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "a@b.c" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows an error message when login fails", async () => {
    mockFetch({
      "/api/auth/login": jsonResponse(
        { error: "Invalid credentials" },
        { status: 401, ok: false }
      ),
    });
    render(<LoginModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "a@b.c" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<LoginModal isOpen={true} onClose={onClose} />);
    // X button is the first button in the modal
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(onClose).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Dashboard components
// ---------------------------------------------------------------------------

describe("NewProjectButton", () => {
  it("renders and fires onClick", () => {
    const onClick = vi.fn();
    render(<NewProjectButton onClick={onClick} />);
    const btn = screen.getByRole("button", { name: /New Project/i });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("ProjectCard", () => {
  const baseProject = {
    id: "p1",
    title: "My Podcast",
    status: "ready" as const,
    duration: 125,
    createdAt: new Date().toISOString(),
  };

  it("renders title, formatted duration and ready CTA", () => {
    render(<ProjectCard project={baseProject} onDelete={vi.fn()} />);
    expect(screen.getByText("My Podcast")).toBeInTheDocument();
    expect(screen.getByText("2:05")).toBeInTheDocument();
    expect(screen.getByText("Pronto")).toBeInTheDocument();
    expect(screen.getByText("Clique para editar")).toBeInTheDocument();
  });

  it("renders error message for failed projects", () => {
    render(
      <ProjectCard
        project={{
          ...baseProject,
          status: "failed",
          errorMessage: "Something broke",
        }}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText("Falhou")).toBeInTheDocument();
    expect(screen.getByText("Something broke")).toBeInTheDocument();
  });

  it("shows progress while processing", () => {
    render(
      <ProjectCard
        project={{ ...baseProject, status: "transcribing", progress: 42 }}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText("Transcrevendo")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  it("calls onDelete after confirm", async () => {
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValue(true);
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<ProjectCard project={baseProject} onDelete={onDelete} />);
    // delete button is the last button rendered (Trash2)
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith("p1"));
    confirmSpy.mockRestore();
  });

  it("does not call onDelete when confirm is cancelled", () => {
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValue(false);
    const onDelete = vi.fn();
    render(<ProjectCard project={baseProject} onDelete={onDelete} />);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onDelete).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

describe("UploadModal", () => {
  it("does not render its content when closed", () => {
    render(
      <UploadModal
        isOpen={false}
        onClose={vi.fn()}
        onUploadSuccess={vi.fn()}
      />
    );
    expect(screen.queryByText("Novo Projeto")).not.toBeInTheDocument();
  });

  it("renders the dialog with fields when open", () => {
    render(
      <UploadModal isOpen={true} onClose={vi.fn()} onUploadSuccess={vi.fn()} />
    );
    expect(screen.getByText("Novo Projeto")).toBeInTheDocument();
    expect(
      screen.getByText(/Arraste e solte seu arquivo aqui/i)
    ).toBeInTheDocument();
    expect(screen.getByText("Titulo do Projeto *")).toBeInTheDocument();
    // language buttons
    expect(screen.getByText("Portugues")).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
  });

  it("submit is disabled without a file/title and shows error on empty submit", () => {
    render(
      <UploadModal isOpen={true} onClose={vi.fn()} onUploadSuccess={vi.fn()} />
    );
    const submit = screen.getByRole("button", { name: "Criar Projeto" });
    expect(submit).toBeDisabled();
  });

  it("uploads a valid file, calls upload + process endpoints and toasts success", async () => {
    const fetchMock = mockFetch({
      "/api/upload": jsonResponse({ projectId: "proj-1" }),
      "/api/process/": jsonResponse({ ok: true }),
    });
    const onUploadSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <UploadModal
        isOpen={true}
        onClose={onClose}
        onUploadSuccess={onUploadSuccess}
      />
    );

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(["data"], "episode.mp3", { type: "audio/mpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    // file name and auto-filled title visible
    expect(screen.getByDisplayValue("episode")).toBeInTheDocument();

    const submit = screen.getByRole("button", { name: "Criar Projeto" });
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/process/proj-1",
        expect.objectContaining({ method: "POST" })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/upload",
      expect.objectContaining({ method: "POST" })
    );
    expect(toast.success).toHaveBeenCalled();
    // onUploadSuccess fires after a 1s setTimeout
    await waitFor(() => expect(onUploadSuccess).toHaveBeenCalled(), {
      timeout: 2000,
    });
  });

  it("shows an error and toasts when the upload request fails", async () => {
    mockFetch({
      "/api/upload": jsonResponse({}, { status: 500, ok: false }),
    });

    render(
      <UploadModal isOpen={true} onClose={vi.fn()} onUploadSuccess={vi.fn()} />
    );

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(["data"], "episode.mp3", { type: "audio/mpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    const submit = screen.getByRole("button", { name: "Criar Projeto" });
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);

    expect(
      await screen.findByText("Falha ao fazer upload. Tente novamente.")
    ).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalled();
  });
});
