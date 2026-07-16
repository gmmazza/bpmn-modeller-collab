import { describe, it, expect } from "vitest";
import type { TreeNode } from "../fileTree";
import { nestSubprocesses } from "./nestSubprocesses";

function file(name: string, path: string): TreeNode {
  return { name, path, kind: "file", children: [] };
}
function dir(name: string, path: string, children: TreeNode[]): TreeNode {
  return { name, path, kind: "dir", children };
}

describe("nestSubprocesses", () => {
  it("nests subs under their master and removes them from the flat list", () => {
    const nodes = [file("Rep", "f/Rep.bpmn"), file("Diag", "f/Diag.bpmn"), file("Solo", "f/Solo.bpmn")];
    const map = new Map([["f/Rep.bpmn", ["f/Diag.bpmn"]]]);
    const out = nestSubprocesses(dirWrap(nodes), map);
    const kids = out[0].children.map((n) => n.path);
    expect(kids).toContain("f/Rep.bpmn");
    expect(kids).toContain("f/Solo.bpmn");
    expect(kids).not.toContain("f/Diag.bpmn");                    // removed from flat
    const rep = out[0].children.find((n) => n.path === "f/Rep.bpmn")!;
    expect(rep.children.map((n) => n.path)).toEqual(["f/Diag.bpmn"]); // nested
  });

  it("shows a multi-parent sub under each master", () => {
    const nodes = [file("Rep", "f/Rep.bpmn"), file("Gar", "f/Gar.bpmn"), file("Motor", "f/Motor.bpmn")];
    const map = new Map([["f/Rep.bpmn", ["f/Motor.bpmn"]], ["f/Gar.bpmn", ["f/Motor.bpmn"]]]);
    const out = nestSubprocesses(dirWrap(nodes), map);
    const rep = out[0].children.find((n) => n.path === "f/Rep.bpmn")!;
    const gar = out[0].children.find((n) => n.path === "f/Gar.bpmn")!;
    expect(rep.children.map((n) => n.path)).toEqual(["f/Motor.bpmn"]);
    expect(gar.children.map((n) => n.path)).toEqual(["f/Motor.bpmn"]);
    expect(out[0].children.some((n) => n.path === "f/Motor.bpmn")).toBe(false); // not flat
  });

  it("recurses into nested masters and guards cycles", () => {
    const nodes = [file("A", "f/A.bpmn"), file("B", "f/B.bpmn")];
    const map = new Map([["f/A.bpmn", ["f/B.bpmn"]], ["f/B.bpmn", ["f/A.bpmn"]]]); // A->B->A
    const out = nestSubprocesses(dirWrap(nodes), map);
    const a = out[0].children.find((n) => n.path === "f/A.bpmn")!;
    const b = a.children.find((n) => n.path === "f/B.bpmn")!;
    expect(b).toBeTruthy();
    expect(b.children.some((n) => n.path === "f/A.bpmn")).toBe(false); // cycle stopped
  });

  it("leaves orphan subs and non-masters untouched", () => {
    const nodes = [file("Solo", "f/Solo.bpmn")];
    const out = nestSubprocesses(dirWrap(nodes), new Map());
    expect(out[0].children.map((n) => n.path)).toEqual(["f/Solo.bpmn"]);
  });
});

function dirWrap(children: TreeNode[]): TreeNode[] {
  return [dir("f", "f", children)];
}
