import { describe, it, expect, beforeEach } from "vitest";
import {
  getPresets, setPresets, addPreset, updatePreset, removePreset,
  validatePreset, getLastPresetId, setLastPresetId, type Preset,
} from "./terminalPresets";

beforeEach(() => localStorage.clear());

describe("terminalPresets", () => {
  it("returns [] when nothing stored, and [] on invalid JSON", () => {
    expect(getPresets()).toEqual([]);
    localStorage.setItem("bpmn-compartida.llmPresets", "{ not json");
    expect(getPresets()).toEqual([]);
  });

  it("round-trips through localStorage, dropping malformed entries", () => {
    const list: Preset[] = [{ id: "p1", label: "Claude", command: "claude" }];
    setPresets(list);
    expect(getPresets()).toEqual(list);
    localStorage.setItem("bpmn-compartida.llmPresets", JSON.stringify([{ id: "p1" }, { label: "x", command: "y" }]));
    expect(getPresets()).toEqual([]); // both malformed (missing fields) → dropped
  });

  it("addPreset appends with the lowest free p<n> id, immutably", () => {
    const a = addPreset([], "Claude", "claude");
    expect(a).toEqual([{ id: "p1", label: "Claude", command: "claude" }]);
    const b = addPreset(a, "Gemini", "gemini");
    expect(b.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(a).toHaveLength(1); // original untouched
  });

  it("addPreset ignores empty label or command", () => {
    expect(addPreset([], "", "claude")).toEqual([]);
    expect(addPreset([], "x", "  ")).toEqual([]);
  });

  it("updatePreset patches by id, removePreset drops by id (immutable)", () => {
    const a = addPreset(addPreset([], "Claude", "claude"), "Gemini", "gemini");
    const u = updatePreset(a, "p1", { command: "claude --review" });
    expect(u.find((p) => p.id === "p1")!.command).toBe("claude --review");
    expect(a.find((p) => p.id === "p1")!.command).toBe("claude"); // original untouched
    const r = removePreset(a, "p1");
    expect(r.map((p) => p.id)).toEqual(["p2"]);
  });

  it("validatePreset requires non-empty label and command", () => {
    expect(validatePreset("Claude", "claude")).toBe(true);
    expect(validatePreset(" ", "claude")).toBe(false);
    expect(validatePreset("Claude", "")).toBe(false);
  });

  it("last preset id round-trips and clears", () => {
    expect(getLastPresetId()).toBeNull();
    setLastPresetId("p2");
    expect(getLastPresetId()).toBe("p2");
    setLastPresetId(null);
    expect(getLastPresetId()).toBeNull();
  });
});
