import { SetStateAction, useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { Place, detectCurrentLocation } from "@/lib/air";
import { appStateReducer, createInitialAppState, getStoredCounts } from "@/lib/appState";
import { ChatMsg, Profile } from "@/lib/companion";
import { Lang } from "@/lib/knowledge";
import { TabId } from "@/lib/ui-copy";

export interface UseCompanionStateOptions {
  detectLocation?: (lang: Lang) => Promise<Place>;
  autoDetectOnMount?: boolean;
}

export function useCompanionState(options: UseCompanionStateOptions = {}) {
  const { detectLocation = detectCurrentLocation, autoDetectOnMount = true } = options;

  const [state, dispatch] = useReducer(appStateReducer, undefined, createInitialAppState);
  const langRef = useRef<Lang>(state.lang);
  langRef.current = state.lang;

  const detectLocationRef = useRef(detectLocation);
  detectLocationRef.current = detectLocation;

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setLang = useCallback((lang: Lang) => {
    dispatch({ type: "SET_LANG", lang });
  }, []);

  const selectPlace = useCallback((place: Place) => {
    dispatch({ type: "SELECT_PLACE", place });
  }, []);

  const autoDetectLocation = useCallback(async (force = false) => {
    dispatch({ type: "LOCATION_DETECT_START", force });
    try {
      const detected = await detectLocationRef.current(langRef.current);
      if (!mountedRef.current) return;
      dispatch({ type: "LOCATION_DETECT_SUCCESS", place: detected, force });
    } catch {
      if (!mountedRef.current) return;
      dispatch({ type: "LOCATION_DETECT_ERROR", force });
    }
  }, []);

  useEffect(() => {
    if (!autoDetectOnMount) return;
    void autoDetectLocation(false);
  }, [autoDetectLocation, autoDetectOnMount]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = state.lang;
    }
  }, [state.lang]);

  const setTab = useCallback((tab: TabId) => {
    dispatch({ type: "SET_TAB", tab });
  }, []);

  const toggleDone = useCallback((id: string, title?: string) => {
    dispatch({ type: "TOGGLE_DONE", id, title });
  }, []);

  const updateProfile = useCallback((patch: Partial<Profile>) => {
    dispatch({ type: "UPDATE_PROFILE", patch });
  }, []);

  const setJoined = useCallback((updater: SetStateAction<Record<string, boolean>>) => {
    dispatch({ type: "SET_JOINED", updater });
  }, []);

  const setMessages = useCallback((updater: SetStateAction<ChatMsg[]>) => {
    dispatch({ type: "SET_MESSAGES", updater });
  }, []);

  const clearUserData = useCallback(() => {
    dispatch({ type: "CLEAR_USER_DATA" });
  }, []);

  const stored = useMemo(
    () => getStoredCounts(state),
    [state.done, state.messages, state.joined],
  );

  return {
    state,
    ...state,
    stored,
    setLang,
    selectPlace,
    autoDetectLocation,
    setTab,
    toggleDone,
    updateProfile,
    setJoined,
    setMessages,
    clearUserData,
  };
}
