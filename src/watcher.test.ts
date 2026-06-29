import { describe, it, expect } from "vitest";
import { isOwnWrite, classifyChange, diffTree } from "./watcher";

describe("watcher classification", () => {
  const lastWrites = new Map<string, string>([["open", "5"]]);

  it("treats a change matching our last write as our own", () => {
    expect(isOwnWrite({ fileId: "open", version: "5" }, lastWrites)).toBe(true);
    expect(isOwnWrite({ fileId: "open", version: "6" }, lastWrites)).toBe(false);
    expect(isOwnWrite({ fileId: "other", version: "1" }, lastWrites)).toBe(false);
  });

  it("classifies an external edit to the open file as reload-open", () => {
    expect(classifyChange({ fileId: "open", version: "6" }, "open", lastWrites)).toBe("reload-open");
  });

  it("ignores our own write to the open file", () => {
    expect(classifyChange({ fileId: "open", version: "5" }, "open", lastWrites)).toBe("ignore");
  });

  it("classifies a change to a different file as list-changed", () => {
    expect(classifyChange({ fileId: "other", version: "1" }, "open", lastWrites)).toBe("list-changed");
  });

  it("classifies a removal of a non-open file as list-changed", () => {
    expect(classifyChange({ fileId: "other", removed: true }, "open", lastWrites)).toBe("list-changed");
  });
});

describe("diffTree", () => {
  const lastWrites = new Map<string, string>([["open.bpmn", "5"]]);
  const versions = (m: Record<string, string>) => new Map(Object.entries(m));
  const entries = (m: Record<string, string>) =>
    Object.entries(m).map(([path, version]) => ({ path, kind: "file" as const, version }));

  it("flags reloadOpen when the open file changed externally", () => {
    const r = diffTree(versions({ "open.bpmn": "5" }), entries({ "open.bpmn": "6" }), "open.bpmn", lastWrites);
    expect(r.reloadOpen).toBe(true);
  });
  it("ignores our own write to the open file", () => {
    const r = diffTree(versions({ "open.bpmn": "5" }), entries({ "open.bpmn": "5" }), "open.bpmn", lastWrites);
    expect(r.reloadOpen).toBe(false);
    expect(r.structureChanged).toBe(false);
  });
  it("flags structureChanged on add/remove", () => {
    const r = diffTree(versions({ "a.bpmn": "1" }), entries({ "a.bpmn": "1", "b.bpmn": "2" }), null, lastWrites);
    expect(r.structureChanged).toBe(true);
  });
});
