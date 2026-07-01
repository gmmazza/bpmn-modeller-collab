import { describe, it, expect, vi } from "vitest";
import { renderIdeasPanelV2, STATE_GLYPH, type IdeasPanelHandlers } from "./ideasPanelView";
import type { IdeaNote } from "./ideaNote";

function handlers(): IdeasPanelHandlers {
  return { onAdd: vi.fn(), onEstado: vi.fn(), onScope: vi.fn(), onOpen: vi.fn(), onSetState: vi.fn() };
}
function n(p: Partial<IdeaNote>): IdeaNote {
  return { id: "idea-1", estado: "pendiente", anchor: null, anchorLabel: "", autor: "A", fecha: "2026-07-01", motivo: "", mejora: "", description: "x", comments: [], ...p };
}

describe("renderIdeasPanelV2", () => {
  it("has a glyph for each of the 5 states", () => {
    expect(Object.keys(STATE_GLYPH)).toHaveLength(5);
  });

  it("renders one row per idea with its state chip and opens on row click", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderIdeasPanelV2(c, {
      ideas: [n({ id: "idea-1", estado: "haciendo", description: "primera", anchor: "A", anchorLabel: "Val", comments: [{ author: "b", date: "d", text: "t" }] }), n({ id: "idea-2", estado: "rechazado", description: "segunda" })],
      estado: "todas", scope: "todas", selectedLabel: null,
    }, h);
    const rows = c.querySelectorAll("[data-idea-row]");
    expect(rows).toHaveLength(2);
    expect(c.textContent).toContain("primera");
    (rows[0].querySelector("[data-idea-open]") as HTMLElement).click();
    expect(h.onOpen).toHaveBeenCalledWith("idea-1");
  });

  it("quick-add fires onAdd with text + anchor flag", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderIdeasPanelV2(c, { ideas: [], estado: "todas", scope: "todas", selectedLabel: "Validar" }, h);
    const input = c.querySelector<HTMLInputElement>("[data-idea-input]")!;
    input.value = "nueva";
    (c.querySelector("[data-idea-anchor]") as HTMLInputElement).checked = true;
    (c.querySelector("[data-idea-add]") as HTMLButtonElement).click();
    expect(h.onAdd).toHaveBeenCalledWith("nueva", true);
  });

  it("the estado filter fires onEstado", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderIdeasPanelV2(c, { ideas: [], estado: "todas", scope: "todas", selectedLabel: null }, h);
    const sel = c.querySelector<HTMLSelectElement>("[data-filter-estado]")!;
    sel.value = "activas";
    sel.dispatchEvent(new Event("change"));
    expect(h.onEstado).toHaveBeenCalledWith("activas");
  });

  it("selecting a state in the row chip fires onSetState", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderIdeasPanelV2(c, { ideas: [n({ id: "idea-1" })], estado: "todas", scope: "todas", selectedLabel: null }, h);
    const chip = c.querySelector<HTMLSelectElement>("[data-idea-state]")!;
    chip.value = "hecho";
    chip.dispatchEvent(new Event("change"));
    expect(h.onSetState).toHaveBeenCalledWith("idea-1", "hecho");
  });
});
