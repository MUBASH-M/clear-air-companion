import { Place } from "@/lib/air";
import { ChatMsg, DEFAULT_PROFILE, Profile } from "@/lib/companion";
import { Lang } from "@/lib/knowledge";
import { DoneAction, TAB_ORDER, TabId } from "@/lib/ui-copy";

export type AppState = {
  lang: Lang;
  place: Place | null;
  locatingInitial: boolean;
  locInitError: boolean;
  userPickedPlace: boolean;
  profile: Profile;
  profileTouched: boolean;
  tab: TabId;
  done: Record<string, DoneAction>;
  joined: Record<string, boolean>;
  messages: ChatMsg[];
};

export type AppAction =
  | { type: "SET_LANG"; lang: Lang }
  | { type: "SET_TAB"; tab: TabId }
  | { type: "SELECT_PLACE"; place: Place }
  | { type: "LOCATION_DETECT_START"; force?: boolean }
  | { type: "LOCATION_DETECT_SUCCESS"; place: Place; force?: boolean }
  | { type: "LOCATION_DETECT_ERROR"; force?: boolean }
  | { type: "UPDATE_PROFILE"; patch: Partial<Profile> }
  | { type: "TOGGLE_DONE"; id: string; title?: string; now?: number }
  | { type: "SET_JOINED"; updater: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>) }
  | { type: "SET_MESSAGES"; updater: ChatMsg[] | ((prev: ChatMsg[]) => ChatMsg[]) }
  | { type: "CLEAR_USER_DATA" };

export function createInitialAppState(): AppState {
  return {
    lang: "en",
    place: null,
    locatingInitial: true,
    locInitError: false,
    userPickedPlace: false,
    profile: { ...DEFAULT_PROFILE },
    profileTouched: false,
    tab: "today",
    done: {},
    joined: {},
    messages: [],
  };
}

export function appStateReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_LANG":
      return state.lang === action.lang ? state : { ...state, lang: action.lang };

    case "SET_TAB":
      return state.tab === action.tab ? state : { ...state, tab: action.tab };

    case "SELECT_PLACE":
      return {
        ...state,
        place: action.place,
        userPickedPlace: true,
        locatingInitial: false,
        locInitError: false,
      };

    case "LOCATION_DETECT_START":
      return {
        ...state,
        userPickedPlace: action.force ? false : state.userPickedPlace,
        locatingInitial: true,
        locInitError: false,
      };

    case "LOCATION_DETECT_SUCCESS":
      if (!action.force && state.userPickedPlace) {
        return { ...state, locatingInitial: false };
      }
      return {
        ...state,
        place: action.place,
        locatingInitial: false,
        locInitError: false,
      };

    case "LOCATION_DETECT_ERROR":
      if (!action.force && state.userPickedPlace) {
        return { ...state, locatingInitial: false };
      }
      return {
        ...state,
        locatingInitial: false,
        locInitError: true,
      };

    case "UPDATE_PROFILE":
      return {
        ...state,
        profile: { ...state.profile, ...action.patch },
        profileTouched: true,
      };

    case "TOGGLE_DONE": {
      const next = { ...state.done };
      if (next[action.id]) {
        delete next[action.id];
      } else {
        next[action.id] = { ts: action.now ?? Date.now(), title: action.title };
      }
      return { ...state, done: next };
    }

    case "SET_JOINED": {
      const next = typeof action.updater === "function" ? action.updater(state.joined) : action.updater;
      return { ...state, joined: next };
    }

    case "SET_MESSAGES": {
      const next = typeof action.updater === "function" ? action.updater(state.messages) : action.updater;
      return { ...state, messages: next };
    }

    case "CLEAR_USER_DATA":
      return {
        ...state,
        profile: { ...DEFAULT_PROFILE },
        profileTouched: false,
        done: {},
        joined: {},
        messages: [],
      };
  }
}

export function getStoredCounts(state: Pick<AppState, "done" | "messages" | "joined">) {
  return {
    actions: Object.keys(state.done).length,
    messages: state.messages.length,
    groups: Object.values(state.joined).filter(Boolean).length,
  };
}

export function getNextTabIndex(currentIndex: number, key: string, total = TAB_ORDER.length): number | null {
  if (total <= 0) return null;
  if (key === "ArrowRight") return (currentIndex + 1) % total;
  if (key === "ArrowLeft") return (currentIndex - 1 + total) % total;
  if (key === "Home") return 0;
  if (key === "End") return total - 1;
  return null;
}
