import { describe, it, expect, beforeEach } from "vitest";
import { pickFolder } from "./folderPicker";
import type { TreeEntry } from "./types";

const entries: TreeEntry[] = [
  { path: "Ventas", kind: "dir" },
  { path: "Ventas/Sub", kind: "dir" },
  { path: "Compras", kind: "dir" },
];

describe("pickFolder", () => {
  beforeEach(() => { document.body.innerHTML = ""; });
  it("lists root + folders and resolves the chosen path", async () => {
    const p = pickFolder(entries, { title: "Mover a…" });
    const options = Array.from(document.querySelectorAll(".fp-folder")).map((b) => b.getAttribute("data-path"));
    expect(options).toEqual(["", "Compras", "Ventas", "Ventas/Sub"]);
    (document.querySelector('.fp-folder[data-path="Compras"]') as HTMLElement).click();
    (document.querySelector(".fp-confirm") as HTMLElement).click();
    expect(await p).toBe("Compras");
  });
  it("disables a path and its descendants; cancel resolves null", async () => {
    const p = pickFolder(entries, { title: "Mover a…", disabledPath: "Ventas" });
    expect((document.querySelector('.fp-folder[data-path="Ventas"]') as HTMLButtonElement).disabled).toBe(true);
    expect((document.querySelector('.fp-folder[data-path="Ventas/Sub"]') as HTMLButtonElement).disabled).toBe(true);
    (document.querySelector(".fp-cancel") as HTMLElement).click();
    expect(await p).toBeNull();
  });
});
