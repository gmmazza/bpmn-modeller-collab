import { describe, it, expect, vi } from "vitest";
import { renderFileList, toRestorePoint, renderHistoryPanel, renderSyncWarning, renderConflictBar } from "./ui";
import type { DriveFile, User, Revision } from "./types";

const me: User = { name: "Ana", email: "ana@x.com" };

describe("ui", () => {
  it("renders a locked file with a steal button that fires onSteal", () => {
    const container = document.createElement("div");
    const files: DriveFile[] = [
      { id: "f1", name: "a.bpmn", modifiedTime: "t", version: "1", headRevisionId: "r",
        appProperties: { lockedByEmail: "bob@x.com", lockedByName: "Bob", lockedAt: "2026-06-23T10:00:00Z" } },
    ];
    const onSteal = vi.fn();
    renderFileList(container, files, me, { onOpen: vi.fn(), onSteal });
    expect(container.textContent).toContain("Bob");
    const stealBtn = container.querySelector("[data-steal]") as HTMLButtonElement;
    stealBtn.click();
    expect(onSteal).toHaveBeenCalledWith("f1");
  });

  it("flags an external revision author as external", () => {
    const rev: Revision = { id: "r1", modifiedTime: "t", lastModifyingUser: { displayName: "Agent", emailAddress: "agent@x.com" } };
    expect(toRestorePoint(rev, me)).toMatchObject({ isExternal: true, authorName: "Agent" });
    const mineRev: Revision = { id: "r2", modifiedTime: "t", lastModifyingUser: { displayName: "Ana", emailAddress: "ana@x.com" } };
    expect(toRestorePoint(mineRev, me).isExternal).toBe(false);
  });

  it("renders restore points with a working restore button", () => {
    const container = document.createElement("div");
    const onRestore = vi.fn();
    renderHistoryPanel(container, [{ id: "r1", modifiedTime: "2026-06-23T10:00:00Z", authorName: "Agent", authorEmail: "a@x.com", isExternal: true }], { onPreview: vi.fn(), onRestore });
    (container.querySelector("[data-restore]") as HTMLButtonElement).click();
    expect(onRestore).toHaveBeenCalledWith("r1");
  });
});

describe("renderConflictBar onDiff", () => {
  it("renders a 'Ver diferencias' button when onDiff is given", () => {
    const el = document.createElement("div");
    let clicked = false;
    renderConflictBar(el, { onDiscard() {}, onKeepMine() {}, onDiff() { clicked = true; } });
    const btn = el.querySelector<HTMLButtonElement>("[data-diff]");
    expect(btn).not.toBeNull();
    btn!.click();
    expect(clicked).toBe(true);
  });
  it("omits the button when onDiff is absent", () => {
    const el = document.createElement("div");
    renderConflictBar(el, { onDiscard() {}, onKeepMine() {} });
    expect(el.querySelector("[data-diff]")).toBeNull();
  });
});

describe("renderSyncWarning", () => {
  it("shows the conflicting names", () => {
    const el = document.createElement("div");
    renderSyncWarning(el, ["proceso (1).bpmn"]);
    expect(el.textContent).toContain("proceso (1).bpmn");
    expect(el.querySelector(".sync-warning")).not.toBeNull();
  });
  it("clears when there are none", () => {
    const el = document.createElement("div");
    renderSyncWarning(el, ["x"]);
    renderSyncWarning(el, []);
    expect(el.innerHTML).toBe("");
  });
});

import { promptText } from "./ui";

describe("promptText (Electron-safe prompt)", () => {
  it("resolves with the trimmed value on Aceptar", async () => {
    const p = promptText("¿Tu nombre?");
    const input = document.querySelector(".modal-input") as HTMLInputElement;
    input.value = "  Ana  ";
    (document.querySelector(".modal-ok") as HTMLButtonElement).click();
    expect(await p).toBe("Ana");
    expect(document.querySelector(".modal-overlay")).toBeNull(); // overlay removed
  });

  it("resolves null on Cancelar", async () => {
    const p = promptText("¿Tu nombre?");
    (document.querySelector(".modal-cancel") as HTMLButtonElement).click();
    expect(await p).toBeNull();
  });

  it("resolves null when the value is empty", async () => {
    const p = promptText("¿Tu nombre?");
    (document.querySelector(".modal-ok") as HTMLButtonElement).click();
    expect(await p).toBeNull();
  });
});
