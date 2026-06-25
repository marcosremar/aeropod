import "@testing-library/jest-dom";
import { vi } from "vitest";
import React from "react";

// --- jsdom polyfills for Radix UI / browser APIs not implemented by jsdom ---
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver || (ResizeObserverMock as unknown as typeof ResizeObserver);

if (!globalThis.matchMedia) {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

// jsdom doesn't implement these on HTMLMediaElement / Element
if (typeof window !== "undefined") {
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  if (!window.HTMLElement.prototype.hasPointerCapture) {
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  }
  if (!window.HTMLElement.prototype.releasePointerCapture) {
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  }
  if (!window.HTMLElement.prototype.setPointerCapture) {
    window.HTMLElement.prototype.setPointerCapture = vi.fn();
  }
}

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => {
  const createMockComponent = (tag: string) => {
    return function MockComponent({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) {
      // Remove framer-motion specific props
      const {
        initial,
        animate,
        transition,
        whileInView,
        viewport,
        whileHover,
        whileTap,
        exit,
        variants,
        ...rest
      } = props;
      return React.createElement(tag, rest, children);
    };
  };

  return {
    motion: {
      div: createMockComponent("div"),
      h1: createMockComponent("h1"),
      h2: createMockComponent("h2"),
      p: createMockComponent("p"),
      span: createMockComponent("span"),
      section: createMockComponent("section"),
      button: createMockComponent("button"),
      a: createMockComponent("a"),
      ul: createMockComponent("ul"),
      li: createMockComponent("li"),
    },
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  };
});

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
