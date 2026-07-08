import { describe, it, expect, vi, afterEach } from "vitest";
import { renderIdeasPanelV2, STATE_GLYPH, type IdeasPanelHandlers } from "./ideasPanelView";
import type { IdeaNote } from "./ideaNote";

function handlers(): IdeasPanelHandlers {
  return { onAdd: vi.fn(), onEstado: vi.fn(), onScope: vi.fn(), onFuente: vi.fn(), onOpen: vi.fn(), onSetState: vi.fn(), onClearFocus: vi.fn(), onObjectFilter: vi.fn() };
}
function n(p: Partial<IdeaNote>): IdeaNote {
  return { id: "idea-1", estado: "pendiente", anchor: null, anchorLabel: "", autor: "A", fecha: "2026-07-01", motivo: "", mejora: "", fuente: null, description: "x", comments: [], ...p };
}
const base = { fuente: "todas" as const, fuenteOptions: [] as string[], objectOptions: [] as { id: string; label: string }[], objectFilter: null as string | null };
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

  it("the fuente filter select renders one option per entry in fuenteOptions plus 'todas'", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderIdeasPanelV2(c, {
      ideas: [n({ id: "idea-1", fuente: "x.docx" }), n({ id: "idea-2", fuente: "y.pdf" }), n({ id: "idea-3", fuente: "x.docx" })],
      estado: "todas", scope: "todas", focus: null, ...base, fuenteOptions: ["x.docx", "y.pdf"],
    }, h);
    const sel = c.querySelector<HTMLSelectElement>("[data-filter-fuente]")!;
    expect([...sel.options].map((o) => o.value)).toEqual(["todas", "x.docx", "y.pdf"]);
    sel.value = "x.docx";
    sel.dispatchEvent(new Event("change"));
    expect(h.onFuente).toHaveBeenCalledWith("x.docx");
  });

  it("keeps fuenteOptions unchanged even when the (already-filtered) ideas list only contains one fuente", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderIdeasPanelV2(c, {
      // Simulates the controller passing an already-narrowed row list (fuente="a.docx")
      // alongside the full set of fuenteOptions computed from the unfiltered ideas.
      ideas: [n({ id: "idea-1", fuente: "a.docx" })],
      estado: "todas", scope: "todas", focus: null, ...base, fuente: "a.docx", fuenteOptions: ["a.docx", "b.pdf"],
    }, h);
    const sel = c.querySelector<HTMLSelectElement>("[data-filter-fuente]")!;
    expect([...sel.options].map((o) => o.value)).toEqual(["todas", "a.docx", "b.pdf"]);
  });

  it("a row with a fuente shows a 📎 badge that fires onFuente on click", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderIdeasPanelV2(c, {
      ideas: [n({ id: "idea-1", fuente: "acta.docx" }), n({ id: "idea-2", fuente: null })],
      estado: "todas", scope: "todas", focus: null, ...base,
    }, h);
    const rows = c.querySelectorAll("[data-idea-row]");
    const badge = rows[0].querySelector<HTMLButtonElement>(".idea-fuente-badge")!;
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe("📎 acta.docx");
    expect(rows[1].querySelector(".idea-fuente-badge")).toBeNull();
    badge.click();
    expect(h.onFuente).toHaveBeenCalledWith("acta.docx");
  });
});
