import { describe, it, expect } from "vitest";
import { applyDiffMarkers, clearDiffMarkers } from "./diffMarkers";
import type { BpmnChanges } from "./bpmnDiff";

function fakeCanvas() {
  const marks = new Map<string, Set<string>>();
  return {
    marks,
    addMarker(id: string, cls: string) {
      if (!marks.has(id)) marks.set(id, new Set());
      marks.get(id)!.add(cls);
    },
    removeMarker(id: string, cls: string) { marks.get(id)?.delete(cls); },
  };
}

const changes: BpmnChanges = { added: ["A"], removed: ["R"], changed: ["C"], layoutChanged: ["M"] };

describe("applyDiffMarkers", () => {
  it("the NEW side marks added + changed + moved (not removed)", () => {
    const c = fakeCanvas();
    const ids = applyDiffMarkers(c, changes, "new");
    expect([...(c.marks.get("A") ?? [])]).toContain("diff-added");
    expect([...(c.marks.get("C") ?? [])]).toContain("diff-changed");
    expect([...(c.marks.get("M") ?? [])]).toContain("diff-moved"); // layoutChanged now rendered
    expect(c.marks.has("R")).toBe(false);
    expect(ids.sort()).toEqual(["A", "C", "M"]);
  });

  it("the OLD side marks removed + changed + moved (not added)", () => {
    const c = fakeCanvas();
    const ids = applyDiffMarkers(c, changes, "old");
    expect([...(c.marks.get("R") ?? [])]).toContain("diff-removed");
    expect([...(c.marks.get("C") ?? [])]).toContain("diff-changed");
    expect([...(c.marks.get("M") ?? [])]).toContain("diff-moved");
    expect(c.marks.has("A")).toBe(false);
    expect(ids.sort()).toEqual(["C", "M", "R"]);
  });

  it("clearDiffMarkers removes every diff class from the given ids", () => {
    const c = fakeCanvas();
    const ids = applyDiffMarkers(c, changes, "new");
    clearDiffMarkers(c, ids);
    for (const id of ids) expect(c.marks.get(id)!.size).toBe(0);
  });
});
