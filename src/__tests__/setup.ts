import "@testing-library/jest-dom";
import { vi } from "vitest";
import React from "react";

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
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// --- jsdom polyfills needed by Radix UI / media components ---

// ResizeObserver (used by Radix Slider, etc.)
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// matchMedia
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

// scrollIntoView / pointer capture (Radix Select/Tabs)
if (typeof Element !== "undefined") {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = vi.fn(() => false);
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = vi.fn();
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = vi.fn();
  }
}

// HTMLMediaElement methods (AudioPlayer / preview players)
if (typeof window !== "undefined" && window.HTMLMediaElement) {
  window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  window.HTMLMediaElement.prototype.pause = vi.fn();
  window.HTMLMediaElement.prototype.load = vi.fn();
}
