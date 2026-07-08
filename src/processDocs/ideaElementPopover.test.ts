import { describe, it, expect, vi, afterEach } from "vitest";
import { openIdeaElementPopover, type ElementPopoverHandlers } from "./ideaElementPopover";
import type { IdeaNote } from "./ideaNote";

function handlers(): ElementPopoverHandlers {
  return { onOpenThread: vi.fn(), onAddIdea: vi.fn(), onClose: vi.fn() };
}
function idea(id: string, description: string): IdeaNote {
  return { id, estado: "pendiente", anchor: "A", anchorLabel: "Val", autor: "Ana", fecha: "2026-07-01", motivo: "", mejora: "", fuente: null, description, comments: [] };
}
afterEach(() => { document.body.innerHTML = ""; });

describe("openIdeaElementPopover", () => {
  it("lists one row per idea with its description", () => {
    const pop = openIdeaElementPopover({ left: 10, top: 20 }, "Validar", [idea("idea-1", "avisar por mail"), idea("idea-2", "otra")], handlers());
    const rows = document.querySelectorAll("[data-pop-idea]");
    expect(rows).toHaveLength(2);
    expect(document.body.textContent).toContain("avisar por mail");
    pop.close();
  });

  it("shows an empty state when there are no ideas", () => {
    const pop = openIdeaElementPopover({ left: 0, top: 0 }, "Validar", [], handlers());
    expect(document.querySelector(".idea-pop-empty")).not.toBeNull();
    pop.close();
  });

  it("clicking a row fires onOpenThread and closes", () => {
    const h = handlers();
    openIdeaElementPopover({ left: 0, top: 0 }, "Validar", [idea("idea-1", "x")], h);
    (document.querySelector("[data-pop-idea]") as HTMLButtonElement).click();
    expect(h.onOpenThread).toHaveBeenCalledWith("idea-1");
    expect(document.querySelector(".idea-element-pop")).toBeNull();
  });

  it("adds a new idea from the input", () => {
    const h = handlers();
    const pop = openIdeaElementPopover({ left: 0, top: 0 }, "Validar", [], h);
    (document.querySelector<HTMLInputElement>("[data-pop-input]")!).value = "idea nueva";
    (document.querySelector("[data-pop-add]") as HTMLButtonElement).click();
    expect(h.onAddIdea).toHaveBeenCalledWith("idea nueva");
    pop.close();
  });

  it("does nothing on empty add", () => {
    const h = handlers();
    const pop = openIdeaElementPopover({ left: 0, top: 0 }, "Validar", [], h);
    (document.querySelector<HTMLInputElement>("[data-pop-input]")!).value = "   ";
    (document.querySelector("[data-pop-add]") as HTMLButtonElement).click();
    expect(h.onAddIdea).not.toHaveBeenCalled();
    pop.close();
  });

  it("Escape closes and fires onClose", async () => {
    const h = handlers();
    openIdeaElementPopover({ left: 0, top: 0 }, "Validar", [], h);
    await new Promise((r) => setTimeout(r, 0)); // let dismissal listeners attach
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".idea-element-pop")).toBeNull();
    expect(h.onClose).toHaveBeenCalled();
  });
});
