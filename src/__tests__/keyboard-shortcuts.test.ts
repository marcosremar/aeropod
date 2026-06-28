import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts, EDITOR_SHORTCUTS } from "@/hooks/useKeyboardShortcuts";

function fireKeydown(
  key: string,
  modifiers: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean } = {}
) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ctrlKey: modifiers.ctrlKey ?? false,
    shiftKey: modifiers.shiftKey ?? false,
    altKey: modifiers.altKey ?? false,
    metaKey: modifiers.metaKey ?? false,
  });
  window.dispatchEvent(event);
  return event;
}

describe("useKeyboardShortcuts", () => {
  describe("key matching", () => {
    it("fires action when the correct key is pressed", () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([{ key: "a", action, description: "test" }])
      );
      fireKeydown("a");
      expect(action).toHaveBeenCalledTimes(1);
    });

    it("does not fire action for a different key", () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([{ key: "a", action, description: "test" }])
      );
      fireKeydown("b");
      expect(action).not.toHaveBeenCalled();
    });

    it("matches keys case-insensitively", () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([{ key: "A", action, description: "test" }])
      );
      fireKeydown("a");
      expect(action).toHaveBeenCalledTimes(1);
    });
  });

  describe("ctrl modifier", () => {
    it("fires when ctrl is required and ctrlKey is pressed", () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([{ key: "s", ctrl: true, action, description: "save" }])
      );
      fireKeydown("s", { ctrlKey: true });
      expect(action).toHaveBeenCalledTimes(1);
    });

    it("fires when ctrl is required and metaKey is pressed (Mac cmd)", () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([{ key: "s", ctrl: true, action, description: "save" }])
      );
      fireKeydown("s", { metaKey: true });
      expect(action).toHaveBeenCalledTimes(1);
    });

    it("does not fire when ctrl is required but neither ctrlKey nor metaKey is pressed", () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([{ key: "s", ctrl: true, action, description: "save" }])
      );
      fireKeydown("s");
      expect(action).not.toHaveBeenCalled();
    });

    it("does not fire when ctrl is NOT required but ctrlKey is pressed", () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([{ key: "a", action, description: "test" }])
      );
      fireKeydown("a", { ctrlKey: true });
      expect(action).not.toHaveBeenCalled();
    });
  });

  describe("shift modifier", () => {
    it("fires when shift is required and shiftKey is pressed", () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([{ key: "?", shift: true, action, description: "help" }])
      );
      fireKeydown("?", { shiftKey: true });
      expect(action).toHaveBeenCalledTimes(1);
    });

    it("does not fire when shift is required but shiftKey is not pressed", () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([{ key: "?", shift: true, action, description: "help" }])
      );
      fireKeydown("?");
      expect(action).not.toHaveBeenCalled();
    });

    it("does not fire when shift is NOT required but shiftKey is pressed", () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([{ key: "a", action, description: "test" }])
      );
      fireKeydown("a", { shiftKey: true });
      expect(action).not.toHaveBeenCalled();
    });
  });

  describe("alt modifier", () => {
    it("fires when alt is required and altKey is pressed", () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([{ key: "f", alt: true, action, description: "alt-f" }])
      );
      fireKeydown("f", { altKey: true });
      expect(action).toHaveBeenCalledTimes(1);
    });

    it("does not fire when alt is NOT required but altKey is pressed", () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([{ key: "f", action, description: "test" }])
      );
      fireKeydown("f", { altKey: true });
      expect(action).not.toHaveBeenCalled();
    });
  });

  describe("enabled flag", () => {
    it("does not fire when enabled is false", () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([{ key: "a", action, description: "test" }], false)
      );
      fireKeydown("a");
      expect(action).not.toHaveBeenCalled();
    });

    it("fires when enabled is true (explicit)", () => {
      const action = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([{ key: "a", action, description: "test" }], true)
      );
      fireKeydown("a");
      expect(action).toHaveBeenCalledTimes(1);
    });
  });

  describe("first match wins", () => {
    it("fires only the first matching shortcut and stops", () => {
      const action1 = vi.fn();
      const action2 = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([
          { key: "a", action: action1, description: "first" },
          { key: "a", action: action2, description: "second" },
        ])
      );
      fireKeydown("a");
      expect(action1).toHaveBeenCalledTimes(1);
      expect(action2).not.toHaveBeenCalled();
    });
  });

  describe("cleanup on unmount", () => {
    it("removes the event listener when the component unmounts", () => {
      const action = vi.fn();
      const { unmount } = renderHook(() =>
        useKeyboardShortcuts([{ key: "a", action, description: "test" }])
      );
      unmount();
      fireKeydown("a");
      expect(action).not.toHaveBeenCalled();
    });
  });

  describe("multiple shortcuts", () => {
    it("fires the correct action for each different key", () => {
      const actionA = vi.fn();
      const actionB = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts([
          { key: "a", action: actionA, description: "a" },
          { key: "b", action: actionB, description: "b" },
        ])
      );
      fireKeydown("b");
      expect(actionA).not.toHaveBeenCalled();
      expect(actionB).toHaveBeenCalledTimes(1);
    });
  });
});

describe("EDITOR_SHORTCUTS", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(EDITOR_SHORTCUTS)).toBe(true);
    expect(EDITOR_SHORTCUTS.length).toBeGreaterThan(0);
  });

  it("every shortcut has a key and description", () => {
    for (const s of EDITOR_SHORTCUTS) {
      expect(typeof s.key).toBe("string");
      expect(s.key.length).toBeGreaterThan(0);
      expect(typeof s.description).toBe("string");
      expect(s.description.length).toBeGreaterThan(0);
    }
  });

  it("includes a ctrl+e shortcut for export", () => {
    const exportShortcut = EDITOR_SHORTCUTS.find(
      (s) => s.key === "e" && s.ctrl === true
    );
    expect(exportShortcut).toBeDefined();
    expect(exportShortcut?.description).toMatch(/export/i);
  });

  it("includes a spacebar shortcut for play/pause", () => {
    const playPause = EDITOR_SHORTCUTS.find((s) => s.key === " ");
    expect(playPause).toBeDefined();
    expect(playPause?.description).toMatch(/play|pause/i);
  });

  it("has no duplicate key+modifier combos", () => {
    const keys = EDITOR_SHORTCUTS.map(
      (s) => `${s.key}|ctrl=${!!s.ctrl}|shift=${!!s.shift}|alt=${!!s.alt}`
    );
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });
});
