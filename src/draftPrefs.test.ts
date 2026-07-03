import { describe, it, expect, beforeEach } from "vitest";
import { getAutosave, setAutosave } from "./draftPrefs";

describe("draftPrefs (autosave toggle)", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to ON when nothing stored", () => {
    expect(getAutosave()).toBe(true);
  });

  it("persists OFF and reads it back", () => {
    setAutosave(false);
    expect(getAutosave()).toBe(false);
    expect(localStorage.getItem("bpmn-compartida.autosave")).toBe("0");
  });

  it("persists ON and reads it back", () => {
    setAutosave(false);
    setAutosave(true);
    expect(getAutosave()).toBe(true);
    expect(localStorage.getItem("bpmn-compartida.autosave")).toBe("1");
  });

  it("treats any non-\"1\" stored value as OFF", () => {
    localStorage.setItem("bpmn-compartida.autosave", "garbage");
    expect(getAutosave()).toBe(false);
  });
});
