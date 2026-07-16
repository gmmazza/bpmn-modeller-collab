import { describe, it, expect } from "vitest";
import { folderOf, buildMasterSubs } from "./masterSubsIndex";

describe("folderOf", () => {
  it("returns the dir prefix, or '' for a root file", () => {
    expect(folderOf("a/b/c.bpmn")).toBe("a/b");
    expect(folderOf("root.bpmn")).toBe("");
  });
});

describe("buildMasterSubs", () => {
  const resolve = (id: string): string | null => ({
    P_diag: "f/Diagnóstico.bpmn",
    P_motor: "f/Motor.bpmn",
    P_other: "otra/Otro.bpmn",   // different folder
    P_amb: null,                  // ambiguous/absent
  } as Record<string, string | null>)[id] ?? null;

  it("maps a master to its same-folder resolved subs, de-duped", () => {
    const links: Record<string, string[]> = { "f/Rep.bpmn": ["P_diag", "P_motor", "P_diag"] };
    const m = buildMasterSubs(["f/Rep.bpmn"], (x) => links[x] ?? [], resolve);
    expect(m.get("f/Rep.bpmn")).toEqual(["f/Diagnóstico.bpmn", "f/Motor.bpmn"]);
  });

  it("drops subs in a different folder and unresolved/ambiguous links", () => {
    const links: Record<string, string[]> = { "f/Rep.bpmn": ["P_other", "P_amb", "P_diag"] };
    const m = buildMasterSubs(["f/Rep.bpmn"], (x) => links[x] ?? [], resolve);
    expect(m.get("f/Rep.bpmn")).toEqual(["f/Diagnóstico.bpmn"]);
  });

  it("supports a sub referenced by two masters in the same folder (multi-parent)", () => {
    const links: Record<string, string[]> = { "f/Rep.bpmn": ["P_motor"], "f/Gar.bpmn": ["P_motor"] };
    const m = buildMasterSubs(["f/Rep.bpmn", "f/Gar.bpmn"], (x) => links[x] ?? [], resolve);
    expect(m.get("f/Rep.bpmn")).toEqual(["f/Motor.bpmn"]);
    expect(m.get("f/Gar.bpmn")).toEqual(["f/Motor.bpmn"]);
  });

  it("omits a master with no same-folder subs", () => {
    const links: Record<string, string[]> = { "f/Rep.bpmn": ["P_other"] };
    const m = buildMasterSubs(["f/Rep.bpmn"], (x) => links[x] ?? [], resolve);
    expect(m.has("f/Rep.bpmn")).toBe(false);
  });
});
