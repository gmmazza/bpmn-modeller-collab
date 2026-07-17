import { describe, it, expect, beforeEach } from "vitest";
import { openContextMenu, computeMenuPosition } from "./contextMenu";

describe("computeMenuPosition", () => {
  const vp = { width: 1000, height: 800 };
  const size = { width: 200, height: 180 };

  it("opens below-and-right of the anchor when it fits", () => {
    const pos = computeMenuPosition({ left: 100, top: 40, bottom: 60 }, size, vp);
    expect(pos).toEqual({ left: 100, top: 60 });
  });

  it("shifts left so it never spills past the right edge", () => {
    const pos = computeMenuPosition({ left: 950, top: 40, bottom: 60 }, size, vp);
    expect(pos.left).toBe(1000 - 200 - 6); // clamped to viewport - width - margin
    expect(pos.left + size.width).toBeLessThanOrEqual(vp.width);
  });

  it("flips above the anchor when there is no room below", () => {
    const pos = computeMenuPosition({ left: 100, top: 700, bottom: 720 }, size, vp);
    expect(pos.top).toBe(700 - 180); // opened upward from the anchor's top
  });

  it("never positions off the top/left margins", () => {
    const pos = computeMenuPosition({ left: -50, top: 2, bottom: 4 }, { width: 200, height: 790 }, vp);
    expect(pos.left).toBeGreaterThanOrEqual(6);
    expect(pos.top).toBeGreaterThanOrEqual(6);
  });
});

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
