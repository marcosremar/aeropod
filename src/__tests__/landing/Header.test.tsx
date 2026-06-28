import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Header } from "@/components/landing/Header";

describe("Header", () => {
  it("renders the AeroPod brand logo text", () => {
    render(<Header />);
    expect(screen.getByText("AeroPod")).toBeInTheDocument();
  });

  it("logo links to the home page", () => {
    render(<Header />);
    const logo = screen.getByText("AeroPod").closest("a");
    expect(logo).toHaveAttribute("href", "/");
  });

  it("renders all navigation links", () => {
    render(<Header />);
    expect(screen.getByText("Como Funciona")).toBeInTheDocument();
    expect(screen.getByText("Features")).toBeInTheDocument();
    expect(screen.getByText("Precos")).toBeInTheDocument();
    expect(screen.getByText("FAQ")).toBeInTheDocument();
  });

  it("navigation links point to the correct anchors", () => {
    render(<Header />);
    expect(screen.getByText("Como Funciona").closest("a")).toHaveAttribute("href", "#como-funciona");
    expect(screen.getByText("Features").closest("a")).toHaveAttribute("href", "#features");
    expect(screen.getByText("Precos").closest("a")).toHaveAttribute("href", "#precos");
    expect(screen.getByText("FAQ").closest("a")).toHaveAttribute("href", "#faq");
  });

  it("renders an Entrar login button", () => {
    render(<Header />);
    expect(screen.getByText("Entrar")).toBeInTheDocument();
  });

  it("login button links to /login", () => {
    render(<Header />);
    const loginLink = screen.getByText("Entrar").closest("a");
    expect(loginLink).toHaveAttribute("href", "/login");
  });

  it("renders a Dashboard button", () => {
    render(<Header />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("Dashboard button links to /dashboard", () => {
    render(<Header />);
    const dashboardLink = screen.getByText("Dashboard").closest("a");
    expect(dashboardLink).toHaveAttribute("href", "/dashboard");
  });
});

describe("Features", () => {
  it("renders the section headline", async () => {
    const { Features } = await import("@/components/landing/Features");
    render(<Features />);
    expect(screen.getByText(/Tudo que voce precisa para editar/i)).toBeInTheDocument();
    expect(screen.getByText(/sem editar/i)).toBeInTheDocument();
  });

  it("renders the section subheadline", async () => {
    const { Features } = await import("@/components/landing/Features");
    render(<Features />);
    expect(screen.getByText(/Features pensadas para quem quer publicar mais/i)).toBeInTheDocument();
  });

  it("renders all six feature cards", async () => {
    const { Features } = await import("@/components/landing/Features");
    render(<Features />);
    expect(screen.getByText("Selecao inteligente")).toBeInTheDocument();
    expect(screen.getByText("Deteccao de erros")).toBeInTheDocument();
    expect(screen.getByText("Regravacao inline")).toBeInTheDocument();
    expect(screen.getByText("Reorganizacao narrativa")).toBeInTheDocument();
    expect(screen.getByText("Export pronto")).toBeInTheDocument();
    expect(screen.getByText("Economize horas")).toBeInTheDocument();
  });

  it("renders feature descriptions", async () => {
    const { Features } = await import("@/components/landing/Features");
    render(<Features />);
    expect(screen.getByText(/IA identifica os momentos mais interessantes/i)).toBeInTheDocument();
    expect(screen.getByText(/Baixe seu episodio editado em MP3/i)).toBeInTheDocument();
  });
});
