import { describe, it, expect, vi } from "vitest";
import { renderNotePanel, type NotePanelHandlers } from "./notePanel";

function handlers(): NotePanelHandlers {
  return { onTabChange: vi.fn(), onModeChange: vi.fn(), onBodyInput: vi.fn(), onSave: vi.fn(), onCreateNote: vi.fn() };
}

describe("renderNotePanel", () => {
  it("in read mode renders the note body as markdown", () => {
    const c = document.createElement("div");
    renderNotePanel(c, { tab: "step", mode: "read", stepLabel: "Validar factura", body: "# Hola", hasNote: true }, handlers());
    expect(c.querySelector("[data-note-read] h1")?.textContent).toBe("Hola");
    expect(c.textContent).toContain("Validar factura");
  });

  it("in edit mode shows a textarea bound to onBodyInput and a Save button", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderNotePanel(c, { tab: "step", mode: "edit", stepLabel: "X", body: "abc", hasNote: true }, h);
    const ta = c.querySelector("textarea[data-note-edit]") as HTMLTextAreaElement;
    expect(ta.value).toBe("abc");
    ta.value = "nuevo";
    ta.dispatchEvent(new Event("input"));
    expect(h.onBodyInput).toHaveBeenCalledWith("nuevo");
    (c.querySelector("[data-note-save]") as HTMLButtonElement).click();
    expect(h.onSave).toHaveBeenCalled();
  });

  it("shows a 'Documentar este paso' button when there is no note", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderNotePanel(c, { tab: "step", mode: "read", stepLabel: "X", body: "", hasNote: false }, h);
    const btn = c.querySelector("[data-note-create]") as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();
    expect(h.onCreateNote).toHaveBeenCalled();
  });

  it("fires onTabChange and onModeChange from the controls", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderNotePanel(c, { tab: "step", mode: "read", stepLabel: "X", body: "", hasNote: true }, h);
    (c.querySelector('[data-tab="process"]') as HTMLElement).click();
    expect(h.onTabChange).toHaveBeenCalledWith("process");
    (c.querySelector('[data-mode="edit"]') as HTMLElement).click();
    expect(h.onModeChange).toHaveBeenCalledWith("edit");
  });

  it("prompts to select a step when none is selected on the step tab", () => {
    const c = document.createElement("div");
    renderNotePanel(c, { tab: "step", mode: "read", stepLabel: null, body: "", hasNote: false }, handlers());
    expect(c.textContent).toContain("Seleccioná un paso");
  });
});
