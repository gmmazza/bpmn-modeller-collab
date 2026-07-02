import { describe, it, expect } from "vitest";
import { reduce, initialState } from "./state";
import type { AppState } from "./state";

describe("app reducer", () => {
  it("starts signed out", () => {
    expect(initialState.kind).toBe("signedOut");
  });

  it("signing in with a folder goes to browsing", () => {
    const s = reduce(reduce(initialState, { type: "signedIn" }), {
      type: "folderSelected",
      folderId: "F",
    });
    expect(s).toEqual({ kind: "browsing", folderId: "F" });
  });

  it("opening a file goes to editing, clean, no conflict", () => {
    const browsing: AppState = { kind: "browsing", folderId: "F" };
    const s = reduce(browsing, { type: "openedFile", fileId: "f1", lock: "mine" });
    expect(s).toEqual({ kind: "editing", folderId: "F", fileId: "f1", lock: "mine", dirty: false, conflict: false });
  });

  it("opening another file while editing switches to it (no-op bug fixed)", () => {
    const editing: AppState = { kind: "editing", folderId: "F", fileId: "f1", lock: "mine", dirty: true, conflict: false };
    const s = reduce(editing, { type: "openedFile", fileId: "f2", lock: "free" });
    expect(s).toEqual({ kind: "editing", folderId: "F", fileId: "f2", lock: "free", dirty: false, conflict: false });
  });

  it("lockChanged updates the lock (check-out / check-in) while editing", () => {
    const editing: AppState = { kind: "editing", folderId: "F", fileId: "f1", lock: "free", dirty: false, conflict: false };
    expect(reduce(editing, { type: "lockChanged", lock: "mine" })).toMatchObject({ lock: "mine" });
    const mine: AppState = { ...editing, lock: "mine" };
    expect(reduce(mine, { type: "lockChanged", lock: "free" })).toMatchObject({ lock: "free" });
  });

  it("external change while clean stays clean (caller auto-reloads)", () => {
    const editing: AppState = { kind: "editing", folderId: "F", fileId: "f1", lock: "mine", dirty: false, conflict: false };
    expect(reduce(editing, { type: "externalChange" })).toEqual(editing);
  });

  it("external change while dirty raises conflict", () => {
    const editing: AppState = { kind: "editing", folderId: "F", fileId: "f1", lock: "mine", dirty: true, conflict: false };
    const s = reduce(editing, { type: "externalChange" });
    expect(s).toMatchObject({ conflict: true });
  });

  it("resolving conflict clears the flag and dirties per choice", () => {
    const conflicted: AppState = { kind: "editing", folderId: "F", fileId: "f1", lock: "mine", dirty: true, conflict: true };
    expect(reduce(conflicted, { type: "resolvedConflict", keepMine: false })).toMatchObject({ conflict: false, dirty: false });
    expect(reduce(conflicted, { type: "resolvedConflict", keepMine: true })).toMatchObject({ conflict: false, dirty: true });
  });

  it("closing a file returns to browsing", () => {
    const editing: AppState = { kind: "editing", folderId: "F", fileId: "f1", lock: "mine", dirty: false, conflict: false };
    expect(reduce(editing, { type: "closedFile" })).toEqual({ kind: "browsing", folderId: "F" });
  });
});
