import { describe, it, expect, vi, afterEach } from "vitest";
import { renderIdeasPanelV2, STATE_GLYPH, type IdeasPanelHandlers } from "./ideasPanelView";
import type { IdeaNote } from "./ideaNote";

function handlers(): IdeasPanelHandlers {
  return { onAdd: vi.fn(), onEstado: vi.fn(), onScope: vi.fn(), onOpen: vi.fn(), onSetState: vi.fn(), onClearFocus: vi.fn(), onObjectFilter: vi.fn() };
}
function n(p: Partial<IdeaNote>): IdeaNote {
  return { id: "idea-1", estado: "pendiente", anchor: null, anchorLabel: "", autor: "A", fecha: "2026-07-01", motivo: "", mejora: "", fuente: null, description: "x", comments: [], ...p };
}
const base = { objectOptions: [] as { id: string; label: string }[], objectFilter: null as string | null };
afterEach(() => { document.body.innerHTML = ""; });

describe("renderIdeasPanelV2", () => {
  it("has a glyph for each of the 5 states", () => {
    expect(Object.keys(STATE_GLYPH)).toHaveLength(5);
  });

  it("renders one row per idea with its state chip and opens on row click", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderIdeasPanelV2(c, {
      ideas: [n({ id: "idea-1", estado: "haciendo", description: "primera", anchor: "A", anchorLabel: "Val", comments: [{ author: "b", date: "d", text: "t" }] }), n({ id: "idea-2", estado: "rechazado", description: "segunda" })],
      estado: "todas", scope: "todas", focus: null, ...base,
    }, h);
    const rows = c.querySelectorAll("[data-idea-row]");
    expect(rows).toHaveLength(2);
    expect(c.textContent).toContain("primera");
    expect(rows[0].querySelector("[data-idea-state]")).not.toBeNull();
    (rows[0].querySelector("[data-idea-open]") as HTMLElement).click();
    expect(h.onOpen).toHaveBeenCalledWith("idea-1");
  });

  it("quick-add fires onAdd with the text and clears the input; Enter also submits", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderIdeasPanelV2(c, { ideas: [], estado: "todas", scope: "todas", focus: null, ...base }, h);
    const input = c.querySelector<HTMLInputElement>("[data-idea-input]")!;
    input.value = "nueva";
    (c.querySelector("[data-idea-add]") as HTMLButtonElement).click();
    expect(h.onAdd).toHaveBeenCalledWith("nueva");
    expect(input.value).toBe("");
    input.value = "otra";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(h.onAdd).toHaveBeenCalledWith("otra");
  });

  it("shows a focus header with 'ver todas' when an element is focused", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderIdeasPanelV2(c, { ideas: [], estado: "todas", scope: "todas", focus: { id: "A", label: "Validar" }, ...base }, h);
    expect(c.textContent).toContain("Ideas de: Validar");
    (c.querySelector("[data-idea-clear-focus]") as HTMLButtonElement).click();
    expect(h.onClearFocus).toHaveBeenCalled();
    // quick-add is scoped to the focused element
    expect(c.querySelector<HTMLInputElement>("[data-idea-input]")!.placeholder).toContain("Validar");
  });

  it("the estado filter fires onEstado", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderIdeasPanelV2(c, { ideas: [], estado: "todas", scope: "todas", focus: null, ...base }, h);
    const sel = c.querySelector<HTMLSelectElement>("[data-filter-estado]")!;
    sel.value = "activas";
    sel.dispatchEvent(new Event("change"));
    expect(h.onEstado).toHaveBeenCalledWith("activas");
  });

  it("the row state chip opens a menu and picking a state fires onSetState", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderIdeasPanelV2(c, { ideas: [n({ id: "idea-1" })], estado: "todas", scope: "todas", focus: null, ...base }, h);
    (c.querySelector("[data-idea-state]") as HTMLButtonElement).click();
    (document.querySelector('[data-state-option="hecho"]') as HTMLButtonElement).click();
    expect(h.onSetState).toHaveBeenCalledWith("idea-1", "hecho");
  });
});
