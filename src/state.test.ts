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
