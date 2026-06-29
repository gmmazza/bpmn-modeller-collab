import { describe, it, expect, beforeEach } from "vitest";
import { showHelp } from "./help";

describe("showHelp", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("renders Funciones and Atajos with a known shortcut, then closes", () => {
    showHelp();
    const box = document.querySelector(".help-box");
    expect(box).not.toBeNull();
    const text = box!.textContent ?? "";
    expect(text).toContain("Funciones");
    expect(text).toContain("Atajos de teclado");
    expect(text).toContain("Guardar");
    expect(box!.querySelector("kbd")).not.toBeNull();
    (document.querySelector(".help-close") as HTMLElement).click();
    expect(document.getElementById("help-modal")).toBeNull();
  });

  it("shows only one help modal at a time", () => {
    showHelp();
    showHelp();
    expect(document.querySelectorAll(".help-box").length).toBe(1);
  });
});
