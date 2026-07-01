import { describe, it, expect, vi } from "vitest";
import { renderIdeasPanel, type IdeasPanelHandlers } from "./ideasPanel";
import type { Idea } from "./ideasModel";

function handlers(): IdeasPanelHandlers {
  return { onAdd: vi.fn(), onToggle: vi.fn(), onToggleShow: vi.fn(), onToggleFilter: vi.fn() };
}
const ideas: Idea[] = [
  { done: false, anchor: "A", anchorLabel: "Validar", text: "idea uno", author: "Ana", date: "2026-07-01" },
  { done: true, anchor: null, anchorLabel: "", text: "idea dos", author: "Beto", date: "2026-06-30" },
];

describe("renderIdeasPanel", () => {
  it("lists ideas with checkboxes reflecting done", () => {
    const c = document.createElement("div");
    renderIdeasPanel(c, { ideas, showOnDiagram: true, filterPending: false, selectedLabel: "Validar" }, handlers());
    const boxes = c.querySelectorAll<HTMLInputElement>("[data-idea-check]");
    expect(boxes).toHaveLength(2);
    expect(boxes[1].checked).toBe(true);
    expect(c.textContent).toContain("idea uno");
  });

  it("quick-add fires onAdd with the text and anchor-to-selection flag", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderIdeasPanel(c, { ideas: [], showOnDiagram: false, filterPending: true, selectedLabel: "Validar" }, h);
    const input = c.querySelector<HTMLInputElement>("[data-idea-input]")!;
    input.value = "nueva idea";
    const anchor = c.querySelector<HTMLInputElement>("[data-idea-anchor]")!;
    anchor.checked = true;
    (c.querySelector("[data-idea-add]") as HTMLButtonElement).click();
    expect(h.onAdd).toHaveBeenCalledWith("nueva idea", true);
  });

  it("toggling a checkbox fires onToggle with the index", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderIdeasPanel(c, { ideas, showOnDiagram: true, filterPending: false, selectedLabel: null }, h);
    c.querySelectorAll<HTMLInputElement>("[data-idea-check]")[0].dispatchEvent(new Event("change"));
    expect(h.onToggle).toHaveBeenCalledWith(0);
  });

  it("the show-on-diagram switch reflects state and fires onToggleShow", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderIdeasPanel(c, { ideas, showOnDiagram: false, filterPending: false, selectedLabel: null }, h);
    const sw = c.querySelector<HTMLInputElement>("[data-idea-show]")!;
    expect(sw.checked).toBe(false);
    sw.checked = true; sw.dispatchEvent(new Event("change"));
    expect(h.onToggleShow).toHaveBeenCalledWith(true);
  });
});
