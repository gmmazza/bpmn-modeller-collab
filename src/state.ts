import type { LockState } from "./types";

export type AppState =
  | { kind: "signedOut" }
  | { kind: "browsing"; folderId: string }
  | {
      kind: "editing";
      folderId: string;
      fileId: string;
      lock: LockState;
      dirty: boolean;
      conflict: boolean;
    };

export type AppEvent =
  | { type: "signedIn" }
  | { type: "signedOut" }
  | { type: "folderSelected"; folderId: string }
  | { type: "openedFile"; fileId: string; lock: LockState }
  | { type: "lockChanged"; lock: LockState }
  | { type: "dirtyChanged"; dirty: boolean }
  | { type: "externalChange" }
  | { type: "reloaded" }
  | { type: "resolvedConflict"; keepMine: boolean }
  | { type: "closedFile" };

export const initialState: AppState = { kind: "signedOut" };

export function reduce(state: AppState, event: AppEvent): AppState {
  switch (event.type) {
    case "signedOut":
      return initialState;
    case "signedIn":
      return state.kind === "signedOut" ? state : state; // folder selection drives next transition
    case "folderSelected":
      return { kind: "browsing", folderId: event.folderId };
    case "openedFile":
      // Allowed from browsing OR editing (switching files) — carry the folder over.
      if (state.kind !== "browsing" && state.kind !== "editing") return state;
      return {
        kind: "editing",
        folderId: state.folderId,
        fileId: event.fileId,
        lock: event.lock,
        dirty: false,
        conflict: false,
      };
    case "lockChanged":
      return state.kind === "editing" ? { ...state, lock: event.lock } : state;
    case "dirtyChanged":
      return state.kind === "editing" ? { ...state, dirty: event.dirty } : state;
    case "externalChange":
      if (state.kind !== "editing") return state;
      return state.dirty ? { ...state, conflict: true } : state;
    case "reloaded":
      return state.kind === "editing" ? { ...state, dirty: false, conflict: false } : state;
    case "resolvedConflict":
      if (state.kind !== "editing") return state;
      return { ...state, conflict: false, dirty: event.keepMine };
    case "closedFile":
      return state.kind === "editing" ? { kind: "browsing", folderId: state.folderId } : state;
  }
}
