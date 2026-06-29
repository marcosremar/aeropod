import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NewProjectButton } from "@/components/dashboard/NewProjectButton";

describe("NewProjectButton", () => {
  it("renders a button with 'New Project' label", () => {
    render(<NewProjectButton onClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: /new project/i })).toBeInTheDocument();
  });

  it("calls onClick when the button is clicked", () => {
    const handleClick = vi.fn();
    render(<NewProjectButton onClick={handleClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when not clicked", () => {
    const handleClick = vi.fn();
    render(<NewProjectButton onClick={handleClick} />);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("calls onClick each time it is clicked", () => {
    const handleClick = vi.fn();
    render(<NewProjectButton onClick={handleClick} />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(3);
  });
});
