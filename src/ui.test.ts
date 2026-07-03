import { describe, it, expect, vi } from "vitest";
import { renderFileList, toRestorePoint, renderHistoryPanel, renderSyncWarning, renderConflictBar, renderPreviewBar, renderCompareBar, reservationUntilIso, parseReserveMinutes } from "./ui";
import type { DriveFile, User, Revision, RestorePoint } from "./types";

const me: User = { name: "Ana", email: "ana@x.com" };

describe("reservation duration helpers", () => {
  it("computes lockedUntil as now + minutes", () => {
    const now = Date.parse("2026-07-02T10:00:00.000Z");
    expect(reservationUntilIso(now, 10)).toBe("2026-07-02T10:10:00.000Z");
    expect(reservationUntilIso(now, 120)).toBe("2026-07-02T12:00:00.000Z");
    expect(reservationUntilIso(now, 60 * 24)).toBe("2026-07-03T10:00:00.000Z");
  });

  it("parses custom minutes, rejecting empty/zero/negative/non-numeric", () => {
    expect(parseReserveMinutes("90")).toBe(90);
    expect(parseReserveMinutes("15.6")).toBe(16); // rounded
    expect(parseReserveMinutes(null)).toBeNull();
    expect(parseReserveMinutes("")).toBeNull();
    expect(parseReserveMinutes("0")).toBeNull();
    expect(parseReserveMinutes("-5")).toBeNull();
    expect(parseReserveMinutes("abc")).toBeNull();
  });
});

describe("renderPreviewBar", () => {
  it("announces the previewed revision and fires onExit", () => {
    const el = document.createElement("div");
    let exited = false;
    renderPreviewBar(el, "30/6/2026 — Beto (externo)", { onExit: () => { exited = true; } });
    const msg = el.querySelector(".preview-msg")!.textContent!;
    expect(msg).toContain("versión anterior");
    expect(msg).toContain("Beto");
    const exit = el.querySelector(".preview-exit") as HTMLElement;
    expect(exit.textContent).toBe("Volver a la versión actual");
    exit.click();
    expect(exited).toBe(true);
  });
});

describe("renderCompareBar", () => {
  it("shows the two labels, toggles orientation, copies and exits", () => {
    const el = document.createElement("div");
    let oriented = false, exited = false, copied = false;
    renderCompareBar(el, {
      leftLabel: "Actual (editable)", rightLabel: "2/7/2026 — Beto",
      orientation: "h", copyCount: 2, canCopy: true,
      onOrientation: () => { oriented = true; },
      onCopy: () => { copied = true; }, onExit: () => { exited = true; },
    });
    const title = el.querySelector(".compare-title")!.textContent!;
    expect(title).toContain("Actual (editable)");
    expect(title).toContain("Beto");

    const orient = el.querySelector(".compare-orient") as HTMLButtonElement;
    expect(orient.textContent).toContain("Apilar"); // h → offers stacking
    orient.click();
    expect(oriented).toBe(true);

    const copyBtn = el.querySelector(".compare-copy") as HTMLButtonElement;
    expect(copyBtn.textContent).toContain("(2)");
    expect(copyBtn.disabled).toBe(false);
    copyBtn.click();
    expect(copied).toBe(true);

    (el.querySelector(".compare-exit") as HTMLElement).click();
    expect(exited).toBe(true);
  });

  it("labels the orientation toggle for vertical and disables copy when not editable", () => {
    const el = document.createElement("div");
    renderCompareBar(el, {
      leftLabel: "v2", rightLabel: "v1", orientation: "v",
      copyCount: 0, canCopy: false, onOrientation: () => {},
      onCopy: () => {}, onExit: () => {},
    });
    expect((el.querySelector(".compare-orient") as HTMLElement).textContent).toContain("Lado a lado");
    expect((el.querySelector(".compare-copy") as HTMLButtonElement).disabled).toBe(true);
  });
});

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

  it("adds an 'Actual (editable)' row and compare checkboxes, highlights + sides the checked rows", () => {
    const container = document.createElement("div");
    const onToggle = vi.fn();
    const points: RestorePoint[] = [
      { id: "20", modifiedTime: "2026-06-23T10:00:00Z", authorName: "Beto", authorEmail: "b@x.com", isExternal: false },
      { id: "10", modifiedTime: "2026-06-20T10:00:00Z", authorName: "Ana", authorEmail: "a@x.com", isExternal: false },
    ];
    // "actual" (newest → izq) + revision "20" (→ der) are checked.
    renderHistoryPanel(container, points, { onPreview: vi.fn(), onRestore: vi.fn(), compare: { selected: ["actual", "20"], onToggle } });

    // The pseudo-row "Actual (editable)" sits on top with its own checkbox.
    const checks = container.querySelectorAll<HTMLInputElement>(".history-check");
    expect(checks.length).toBe(3); // actual + 2 revisions
    const actualCheck = container.querySelector<HTMLInputElement>('[data-compare="actual"]')!;
    expect(actualCheck.checked).toBe(true);

    // Checked rows are highlighted and labelled izq/der by recency (actual newest → izq).
    const checkedRows = container.querySelectorAll(".history-row.checked");
    expect(checkedRows.length).toBe(2);
    expect(container.querySelector('[data-compare="actual"]')!.closest(".history-row")!.querySelector(".history-side.izq")).not.toBeNull();
    expect(container.querySelector('[data-compare="20"]')!.closest(".history-row")!.querySelector(".history-side.der")).not.toBeNull();
    // Unchecked revision "10" has no side badge.
    expect(container.querySelector('[data-compare="10"]')!.closest(".history-row")!.querySelector(".history-side")).toBeNull();

    // Toggling a checkbox fires onToggle with (id, checked).
    const rev10 = container.querySelector<HTMLInputElement>('[data-compare="10"]')!;
    rev10.checked = true;
    rev10.dispatchEvent(new Event("change"));
    expect(onToggle).toHaveBeenCalledWith("10", true);
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
