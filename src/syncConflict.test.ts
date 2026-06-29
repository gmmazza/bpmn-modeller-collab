import { describe, it, expect } from "vitest";
import { isSyncConflict } from "./syncConflict";

describe("isSyncConflict", () => {
  it("flags Drive/OS '(1)' duplicates", () => {
    expect(isSyncConflict("proceso (1).bpmn")).toBe(true);
  });
  it("flags Syncthing conflicts", () => {
    expect(isSyncConflict("proceso.sync-conflict-20260626-PC.bpmn")).toBe(true);
  });
  it("flags OneDrive '-PCNAME' conflicts", () => {
    expect(isSyncConflict("proceso-DESKTOP-A1B2C3.bpmn")).toBe(true);
  });
  it("flags Spanish 'conflicto'", () => {
    expect(isSyncConflict("proceso-conflicto.bpmn")).toBe(true);
  });
  it("does not flag a normal name", () => {
    expect(isSyncConflict("proceso.bpmn")).toBe(false);
  });
});
