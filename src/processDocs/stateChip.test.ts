import { describe, it, expect, vi, afterEach } from "vitest";
import { createStateChip } from "./stateChip";

afterEach(() => { document.body.innerHTML = ""; });

describe("createStateChip", () => {
  it("shows the current state's glyph (icon-only) with the label in the tooltip", () => {
    const chip = createStateChip("haciendo", vi.fn());
    expect(chip.dataset.ideaState).toBe("true");
    expect(chip.textContent).toBe("◑");
    expect(chip.title).toBe("haciendo");
    expect(chip.className).toContain("state-haciendo");
  });

  it("opens a menu with the five states on click", () => {
    const chip = createStateChip("pendiente", vi.fn());
    document.body.append(chip);
    chip.click();
    const opts = document.querySelectorAll(".idea-state-menu [data-state-option]");
    expect(opts).toHaveLength(5);
    expect(document.querySelector('[data-state-option="hecho"]')?.textContent).toContain("●");
  });

  it("picking an option fires onPick with the state and closes the menu", () => {
    const onPick = vi.fn();
    const chip = createStateChip("pendiente", onPick);
    document.body.append(chip);
    chip.click();
    (document.querySelector('[data-state-option="hecho"]') as HTMLButtonElement).click();
    expect(onPick).toHaveBeenCalledWith("hecho");
    expect(document.querySelector(".idea-state-menu")).toBeNull();
  });

  it("honors a custom data attribute", () => {
    const chip = createStateChip("pendiente", vi.fn(), "threadState");
    expect(chip.dataset.threadState).toBe("true");
  });
});
