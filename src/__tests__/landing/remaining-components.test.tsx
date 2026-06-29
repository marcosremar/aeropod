import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FAQ } from "@/components/landing/FAQ";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Pricing } from "@/components/landing/Pricing";
import { Comparison } from "@/components/landing/Comparison";
import { Footer } from "@/components/landing/Footer";
import { Problem } from "@/components/landing/Problem";

describe("FAQ", () => {
  it("renders the section heading", () => {
    render(<FAQ />);
    expect(screen.getByText("Perguntas frequentes")).toBeInTheDocument();
  });

  it("renders the section subheading", () => {
    render(<FAQ />);
    expect(
      screen.getByText(/Tudo que voce precisa saber/i)
    ).toBeInTheDocument();
  });

  it("renders all FAQ question buttons", () => {
    render(<FAQ />);
    expect(
      screen.getByText("Funciona com qualquer tipo de podcast?")
    ).toBeInTheDocument();
    expect(
      screen.getByText("E se a IA errar na selecao?")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Posso ajustar manualmente o resultado?")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Quanto tempo leva para processar?")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Preciso seguir um roteiro ao gravar?")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Qual a qualidade do audio exportado?")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Posso cancelar a assinatura a qualquer momento?")
    ).toBeInTheDocument();
  });

  it("first FAQ item is open by default", () => {
    render(<FAQ />);
    const firstButton = screen.getByText(
      "Funciona com qualquer tipo de podcast?"
    ).closest("button");
    // The chevron for the first (open) item should have rotate-180 class
    const chevron = firstButton?.querySelector("svg");
    expect(chevron?.getAttribute("class")).toContain("rotate-180");
  });

  it("clicking a closed question opens it and rotates its chevron", () => {
    render(<FAQ />);
    const secondQuestion = screen.getByText("E se a IA errar na selecao?");
    const button = secondQuestion.closest("button")!;
    // Initially closed — no rotate-180 on chevron
    expect(button.querySelector("svg")?.getAttribute("class")).not.toContain("rotate-180");
    fireEvent.click(button);
    expect(button.querySelector("svg")?.getAttribute("class")).toContain("rotate-180");
  });

  it("clicking the open question closes it", () => {
    render(<FAQ />);
    const firstButton = screen
      .getByText("Funciona com qualquer tipo de podcast?")
      .closest("button")!;
    // Open initially
    fireEvent.click(firstButton);
    expect(firstButton.querySelector("svg")?.getAttribute("class")).not.toContain(
      "rotate-180"
    );
  });

  it("opening a new question closes the previously open one", () => {
    render(<FAQ />);
    const firstButton = screen
      .getByText("Funciona com qualquer tipo de podcast?")
      .closest("button")!;
    const secondButton = screen
      .getByText("E se a IA errar na selecao?")
      .closest("button")!;

    // First is open; click second
    fireEvent.click(secondButton);
    expect(secondButton.querySelector("svg")?.getAttribute("class")).toContain("rotate-180");
    expect(firstButton.querySelector("svg")?.getAttribute("class")).not.toContain(
      "rotate-180"
    );
  });
});

describe("HowItWorks", () => {
  it("renders the section heading", () => {
    render(<HowItWorks />);
    expect(screen.getByText("Como funciona")).toBeInTheDocument();
  });

  it("renders the section subheading", () => {
    render(<HowItWorks />);
    expect(
      screen.getByText(/Tres passos simples/i)
    ).toBeInTheDocument();
  });

  it("renders all three step titles", () => {
    render(<HowItWorks />);
    expect(screen.getByText("Grave falando livremente")).toBeInTheDocument();
    expect(screen.getByText("IA analisa e seleciona")).toBeInTheDocument();
    expect(screen.getByText("Revise e publique")).toBeInTheDocument();
  });

  it("renders step number labels", () => {
    render(<HowItWorks />);
    expect(screen.getByText("Passo 1")).toBeInTheDocument();
    expect(screen.getByText("Passo 2")).toBeInTheDocument();
    expect(screen.getByText("Passo 3")).toBeInTheDocument();
  });

  it("renders step descriptions", () => {
    render(<HowItWorks />);
    expect(
      screen.getByText(/Sem roteiro, sem preocupacao/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Nossa IA assiste tudo/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Veja o resultado/i)
    ).toBeInTheDocument();
  });
});

describe("Pricing", () => {
  it("renders the section heading", () => {
    render(<Pricing />);
    expect(
      screen.getByText(/Planos para todo tamanho de podcast/i)
    ).toBeInTheDocument();
  });

  it("renders the section subheading", () => {
    render(<Pricing />);
    expect(
      screen.getByText(/Comece gratis, escale conforme cresce/i)
    ).toBeInTheDocument();
  });

  it("renders all four plan names", () => {
    render(<Pricing />);
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Starter")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("Unlimited")).toBeInTheDocument();
  });

  it("renders plan prices", () => {
    render(<Pricing />);
    expect(screen.getByText("R$ 0")).toBeInTheDocument();
    expect(screen.getByText("R$ 29")).toBeInTheDocument();
    expect(screen.getByText("R$ 79")).toBeInTheDocument();
    expect(screen.getByText("R$ 149")).toBeInTheDocument();
  });

  it("marks the Pro plan as most popular", () => {
    render(<Pricing />);
    expect(screen.getByText("Mais popular")).toBeInTheDocument();
  });

  it("renders CTA buttons for each plan", () => {
    render(<Pricing />);
    expect(screen.getByText("Experimentar gratis")).toBeInTheDocument();
    expect(screen.getByText("Comecar agora")).toBeInTheDocument();
    expect(screen.getByText("Escolher Pro")).toBeInTheDocument();
    expect(screen.getByText("Falar com vendas")).toBeInTheDocument();
  });

  it("shows 'Disponivel em breve' notice on all plans", () => {
    render(<Pricing />);
    const notices = screen.getAllByText("Disponivel em breve");
    expect(notices).toHaveLength(4);
  });
});

describe("Comparison", () => {
  it("renders the section heading", () => {
    render(<Comparison />);
    expect(screen.getByText("Nao e so cortar silencio")).toBeInTheDocument();
  });

  it("renders the section subheading", () => {
    render(<Comparison />);
    expect(
      screen.getByText(/Comparado com editores tradicionais/i)
    ).toBeInTheDocument();
  });

  it("renders column headers for competitors and AeroPod", () => {
    render(<Comparison />);
    expect(screen.getByText("Editores tradicionais")).toBeInTheDocument();
    expect(screen.getByText("AeroPod")).toBeInTheDocument();
  });

  it("renders all comparison features", () => {
    render(<Comparison />);
    expect(
      screen.getByText("Remove silencio e 'ums'")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Entende o conteudo semanticamente")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Seleciona melhores momentos")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Detecta erros e contradicoes")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Reorganiza narrativa automaticamente")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Regravacao inline de trechos")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Funciona sem roteiro previo")
    ).toBeInTheDocument();
  });
});

describe("Footer", () => {
  it("renders the AeroPod brand name", () => {
    render(<Footer />);
    expect(screen.getByText("AeroPod")).toBeInTheDocument();
  });

  it("renders the copyright notice", () => {
    render(<Footer />);
    expect(screen.getByText(/Todos os direitos reservados/i)).toBeInTheDocument();
  });

  it("renders legal navigation links", () => {
    render(<Footer />);
    expect(screen.getByText("Termos")).toBeInTheDocument();
    expect(screen.getByText("Privacidade")).toBeInTheDocument();
    expect(screen.getByText("Contato")).toBeInTheDocument();
  });
});

describe("Problem", () => {
  it("renders the section heading", () => {
    render(<Problem />);
    expect(screen.getByText(/Editar podcast e/i)).toBeInTheDocument();
    expect(screen.getByText("exaustivo")).toBeInTheDocument();
  });

  it("renders the section subheading", () => {
    render(<Problem />);
    expect(
      screen.getByText(/Cada 30 minutos de episodio exige 3-4 horas/i)
    ).toBeInTheDocument();
  });

  it("renders all three problem cards", () => {
    render(<Problem />);
    expect(screen.getByText("Horas ouvindo gravacao")).toBeInTheDocument();
    expect(screen.getByText("Decidindo o que cortar")).toBeInTheDocument();
    expect(screen.getByText("Reorganizando trechos")).toBeInTheDocument();
  });

  it("renders problem descriptions", () => {
    render(<Problem />);
    expect(
      screen.getByText(/Voce precisa ouvir cada minuto/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Escolher entre tantas opcoes e exaustivo/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Mesmo apos cortar, ainda precisa reorganizar/i)
    ).toBeInTheDocument();
  });

  it("renders the conclusion statement", () => {
    render(<Problem />);
    expect(
      screen.getByText(/Voce publica menos do que gostaria/i)
    ).toBeInTheDocument();
  });
});
