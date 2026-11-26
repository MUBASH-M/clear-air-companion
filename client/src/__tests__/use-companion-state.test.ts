import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCompanionState } from "@/hooks/use-companion-state";
import { Place } from "@/lib/air";
import { appStateReducer, createInitialAppState, getNextTabIndex, getStoredCounts } from "@/lib/appState";
import { DEFAULT_PROFILE } from "@/lib/companion";

const SINGAPORE: Place = { name: "Singapore", region: "Singapore", lat: 1.35, lon: 103.82, approx: "ip" };
const JAIPUR: Place = { name: "Jaipur", region: "Rajasthan", lat: 26.91, lon: 75.79 };
const BENGALURU: Place = { name: "Bengaluru", region: "Karnataka", lat: 12.97, lon: 77.59, approx: "gps" };

describe("useCompanionState hook", () => {
  it("auto-detects the user's current location on mount without a hardcoded default city", async () => {
    const detectLocation = vi.fn(async () => SINGAPORE);
    const { result } = renderHook(() => useCompanionState({ detectLocation }));

    expect(result.current.place).toBeNull();
    expect(result.current.locatingInitial).toBe(true);
    expect(result.current.locInitError).toBe(false);

    await waitFor(() => {
      expect(result.current.locatingInitial).toBe(false);
    });

    expect(detectLocation).toHaveBeenCalledTimes(1);
    expect(detectLocation).toHaveBeenCalledWith("en");
    expect(result.current.place).toEqual(SINGAPORE);
    expect(result.current.locInitError).toBe(false);
  });

  it("preserves a manually chosen city if an initial auto-detect resolves later", async () => {
    let resolveDetect!: (place: Place) => void;
    const detectLocation = vi.fn(
      () =>
        new Promise<Place>((resolve) => {
          resolveDetect = resolve;
        }),
    );

    const { result } = renderHook(() => useCompanionState({ detectLocation }));

    act(() => {
      result.current.selectPlace(JAIPUR);
    });

    expect(result.current.place).toEqual(JAIPUR);
    expect(result.current.locatingInitial).toBe(false);

    await act(async () => {
      resolveDetect(SINGAPORE);
    });

    expect(result.current.place).toEqual(JAIPUR);
    expect(result.current.locInitError).toBe(false);
  });

  it("re-detects current location when autoDetectLocation(true) is triggered after manual selection", async () => {
    const detectLocation = vi.fn(async () => BENGALURU);
    const { result } = renderHook(() =>
      useCompanionState({ detectLocation, autoDetectOnMount: false }),
    );

    act(() => {
      result.current.selectPlace(JAIPUR);
    });
    expect(result.current.place).toEqual(JAIPUR);

    await act(async () => {
      await result.current.autoDetectLocation(true);
    });

    expect(detectLocation).toHaveBeenCalledTimes(1);
    expect(result.current.place).toEqual(BENGALURU);
    expect(result.current.locatingInitial).toBe(false);
  });

  it("sets locInitError cleanly without defaulting to a hardcoded city when detection fails", async () => {
    const detectLocation = vi.fn(async () => {
      throw new Error("Could not determine location");
    });

    const { result } = renderHook(() => useCompanionState({ detectLocation }));

    await waitFor(() => {
      expect(result.current.locatingInitial).toBe(false);
    });

    expect(result.current.place).toBeNull();
    expect(result.current.locInitError).toBe(true);
  });

  it("syncs document.documentElement.lang, updates profile/actions/pledges/messages, and clears user data safely", async () => {
    const detectLocation = vi.fn(async () => BENGALURU);
    const { result } = renderHook(() =>
      useCompanionState({ detectLocation, autoDetectOnMount: false }),
    );

    expect(document.documentElement.lang).toBe("en");

    act(() => {
      result.current.setLang("hi");
      result.current.selectPlace(BENGALURU);
      result.current.setTab("profile");
      result.current.updateProfile({ children: true, commute: "two_wheeler" });
      result.current.toggleDone("mask", "Wear N95");
      result.current.setJoined((prev) => ({ ...prev, idle: true }));
      result.current.setMessages((prev) => [...prev, { role: "user", text: "Hello" }]);
    });

    expect(document.documentElement.lang).toBe("hi");
    expect(result.current.tab).toBe("profile");
    expect(result.current.profileTouched).toBe(true);
    expect(result.current.profile.children).toBe(true);
    expect(result.current.profile.commute).toBe("two_wheeler");
    expect(result.current.stored).toEqual({ actions: 1, messages: 1, groups: 1 });

    // Undo logged action
    act(() => {
      result.current.toggleDone("mask");
    });
    expect(result.current.stored.actions).toBe(0);

    // Clear user data preserves place and lang
    act(() => {
      result.current.toggleDone("ventilation", "Open windows");
      result.current.clearUserData();
    });

    expect(result.current.profile).toEqual(DEFAULT_PROFILE);
    expect(result.current.profileTouched).toBe(false);
    expect(result.current.stored).toEqual({ actions: 0, messages: 0, groups: 0 });
    expect(result.current.place).toEqual(BENGALURU);
    expect(result.current.lang).toBe("hi");
  });

  it("passes the updated language to subsequent forced location detection calls", async () => {
    const detectLocation = vi.fn(async () => BENGALURU);
    const { result } = renderHook(() =>
      useCompanionState({ detectLocation, autoDetectOnMount: false }),
    );

    act(() => {
      result.current.setLang("hi");
    });

    await act(async () => {
      await result.current.autoDetectLocation(true);
    });

    expect(detectLocation).toHaveBeenCalledWith("hi");
  });
});

describe("appStateReducer & pure selectors", () => {
  it("initializes cleanly with no hardcoded default city", () => {
    const state = createInitialAppState();
    expect(state.place).toBeNull();
    expect(state.locatingInitial).toBe(true);
    expect(state.locInitError).toBe(false);
    expect(state.userPickedPlace).toBe(false);
    expect(state.lang).toBe("en");
    expect(state.tab).toBe("today");
    expect(state.profile).toEqual(DEFAULT_PROFILE);
    expect(state.profileTouched).toBe(false);
  });

  it("handles SET_LANG and SET_TAB idempotently without unnecessary references", () => {
    const initial = createInitialAppState();
    expect(appStateReducer(initial, { type: "SET_LANG", lang: "en" })).toBe(initial);
    expect(appStateReducer(initial, { type: "SET_TAB", tab: "today" })).toBe(initial);

    const updated = appStateReducer(initial, { type: "SET_TAB", tab: "map" });
    expect(updated.tab).toBe("map");
    expect(appStateReducer(updated, { type: "SET_TAB", tab: "map" })).toBe(updated);
  });

  it("ignores late non-forced LOCATION_DETECT_ERROR after manual place selection", () => {
    let state = createInitialAppState();
    state = appStateReducer(state, { type: "SELECT_PLACE", place: JAIPUR });
    state = appStateReducer(state, { type: "LOCATION_DETECT_ERROR", force: false });

    expect(state.place).toEqual(JAIPUR);
    expect(state.locInitError).toBe(false);
    expect(state.locatingInitial).toBe(false);
  });

  it("records deterministic timestamps when toggling actions and computes stored counts", () => {
    let state = createInitialAppState();
    state = appStateReducer(state, { type: "TOGGLE_DONE", id: "plan-outdoor", title: "Move indoors", now: 12345 });
    state = appStateReducer(state, { type: "SET_JOINED", updater: { idle: true, burn: false } });
    state = appStateReducer(state, { type: "SET_MESSAGES", updater: [{ role: "user", text: "AQI?" }] });

    expect(state.done["plan-outdoor"]).toEqual({ ts: 12345, title: "Move indoors" });
    expect(getStoredCounts(state)).toEqual({ actions: 1, messages: 1, groups: 1 });
  });

  it("computes ARIA tablist keyboard navigation indices including wrap-around", () => {
    expect(getNextTabIndex(0, "ArrowRight", 7)).toBe(1);
    expect(getNextTabIndex(6, "ArrowRight", 7)).toBe(0);
    expect(getNextTabIndex(0, "ArrowLeft", 7)).toBe(6);
    expect(getNextTabIndex(3, "ArrowLeft", 7)).toBe(2);
    expect(getNextTabIndex(4, "Home", 7)).toBe(0);
    expect(getNextTabIndex(1, "End", 7)).toBe(6);
    expect(getNextTabIndex(2, "Enter", 7)).toBeNull();
    expect(getNextTabIndex(0, "ArrowRight", 0)).toBeNull();
  });
});
