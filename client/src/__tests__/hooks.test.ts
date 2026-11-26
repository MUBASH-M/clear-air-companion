import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIsMobile } from "@/hooks/use-mobile";
import { reducer as toastReducer, toast, useToast } from "@/hooks/use-toast";

describe("useToast & toast reducer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    const { result, unmount } = renderHook(() => useToast());
    act(() => {
      result.current.dismiss();
      vi.runAllTimers();
    });
    unmount();
    vi.useRealTimers();
  });

  it("adds, enforces TOAST_LIMIT=1, updates, dismisses, and removes toasts via reducer", () => {
    let state = { toasts: [] as Array<{ id: string; title?: string; open?: boolean }> };

    state = toastReducer(state, {
      type: "ADD_TOAST",
      toast: { id: "1", title: "First", open: true },
    });
    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0].title).toBe("First");

    // Adding a second toast replaces the first because TOAST_LIMIT = 1
    state = toastReducer(state, {
      type: "ADD_TOAST",
      toast: { id: "2", title: "Second", open: true },
    });
    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0].id).toBe("2");

    // Updating existing toast merges fields
    state = toastReducer(state, {
      type: "UPDATE_TOAST",
      toast: { id: "2", title: "Second Updated" },
    });
    expect(state.toasts[0].title).toBe("Second Updated");

    // Dismiss sets open=false
    state = toastReducer(state, { type: "DISMISS_TOAST", toastId: "2" });
    expect(state.toasts[0].open).toBe(false);

    // Remove deletes the matching toast
    state = toastReducer(state, { type: "REMOVE_TOAST", toastId: "2" });
    expect(state.toasts).toHaveLength(0);
  });

  it("publishes, updates, and dismisses toasts reactively through useToast", () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toasts).toHaveLength(0);

    let handle!: ReturnType<typeof toast>;
    act(() => {
      handle = toast({ title: "Location updated", description: "Now showing Jaipur" });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].id).toBe(handle.id);
    expect(result.current.toasts[0].open).toBe(true);
    expect(result.current.toasts[0].title).toBe("Location updated");

    act(() => {
      handle.update({ id: handle.id, title: "Air quality refreshed" });
    });
    expect(result.current.toasts[0].title).toBe("Air quality refreshed");

    act(() => {
      handle.dismiss();
    });
    expect(result.current.toasts[0].open).toBe(false);

    act(() => {
      vi.runAllTimers();
    });
    expect(result.current.toasts).toHaveLength(0);
  });
});

describe("useIsMobile hook", () => {
  function mockViewport(initialWidth: number) {
    let width = initialWidth;
    const listeners = new Set<() => void>();

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      get: () => width,
    });

    const addEventListener = vi.fn((_event: string, cb: () => void) => {
      listeners.add(cb);
    });
    const removeEventListener = vi.fn((_event: string, cb: () => void) => {
      listeners.delete(cb);
    });

    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: width < 768,
        media: query,
        onchange: null,
        addEventListener,
        removeEventListener,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );

    return {
      setWidth(nextWidth: number) {
        width = nextWidth;
        listeners.forEach((cb) => cb());
      },
      addEventListener,
      removeEventListener,
    };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects mobile (<768px) and desktop (>=768px) viewports and reacts to resize events", () => {
    const viewport = mockViewport(1024);
    const { result, unmount } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);
    expect(viewport.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));

    act(() => {
      viewport.setWidth(390);
    });
    expect(result.current).toBe(true);

    act(() => {
      viewport.setWidth(768);
    });
    expect(result.current).toBe(false);

    unmount();
    expect(viewport.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("starts as mobile when initial innerWidth is below 768px", () => {
    mockViewport(540);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });
});
