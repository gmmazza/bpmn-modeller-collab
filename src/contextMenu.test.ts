import { describe, it, expect, beforeEach } from "vitest";
import { openContextMenu } from "./contextMenu";

describe("openContextMenu", () => {
  beforeEach(() => { document.body.innerHTML = ""; });
  it("renders items and fires onClick, then closes", () => {
    let clicked = "";
    openContextMenu({ left: 10, bottom: 20, right: 10, top: 0 } as DOMRect, [
      { label: "Renombrar", onClick: () => { clicked = "Renombrar"; } },
      { label: "Borrar", danger: true, onClick: () => { clicked = "Borrar"; } },
    ]);
    const pop = document.querySelector(".ctx-menu")!;
    expect(pop).not.toBeNull();
    const buttons = pop.querySelectorAll("button");
    expect(Array.from(buttons).map((b) => b.textContent)).toEqual(["Renombrar", "Borrar"]);
    (buttons[1] as HTMLElement).click();
    expect(clicked).toBe("Borrar");
    expect(document.querySelector(".ctx-menu")).toBeNull(); // closed after click
  });
  it("only one menu at a time", () => {
    const a = { left: 0, bottom: 0, right: 0, top: 0 } as DOMRect;
    openContextMenu(a, [{ label: "A", onClick() {} }]);
    openContextMenu(a, [{ label: "B", onClick() {} }]);
    expect(document.querySelectorAll(".ctx-menu").length).toBe(1);
  });
});
