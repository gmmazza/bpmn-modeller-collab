import { describe, it, expect } from "vitest";
import { createEditor, type ModelerLike } from "./editor";
import { createDiffView } from "./diffView";
import type { BpmnChanges } from "./bpmnDiff";

function fakeModeler() {
  const added: Array<[string, string]> = [];
  const removed: Array<[string, string]> = [];
  const canvas = {
    addMarker: (id: string, cls: string) => added.push([id, cls]),
    removeMarker: (id: string, cls: string) => removed.push([id, cls]),
  };
  const modeler: ModelerLike = {
    async importXML() {
      return {};
    },
    async saveXML() {
      return { xml: "<x/>" };
    },
    async saveSVG() {
      return { svg: "" };
    },
    on() {},
    get(name: string) {
      if (name === "canvas") return canvas;
      return undefined;
    },
  };
  return { modeler, added, removed };
}

const changes: BpmnChanges = { added: ["A"], removed: ["R"], changed: ["C"], layoutChanged: [] };

describe("diffView", () => {
  it("marks removed+changed when showing mine", async () => {
    const { modeler, added } = fakeModeler();
    const view = createDiffView(modeler, createEditor(modeler));
    await view.show("<mine/>", "<their/>", changes);
    expect(view.showing()).toBe("mine");
    expect(added).toEqual(expect.arrayContaining([["R", "diff-removed"], ["C", "diff-changed"]]));
    expect(added.find(([id]) => id === "A")).toBeUndefined();
  });

  it("toggle switches to theirs and marks added+changed", async () => {
    const { modeler, added } = fakeModeler();
    const view = createDiffView(modeler, createEditor(modeler));
    await view.show("<mine/>", "<their/>", changes);
    added.length = 0;
    const now = await view.toggle();
    expect(now).toBe("theirs");
    expect(added).toEqual(expect.arrayContaining([["A", "diff-added"], ["C", "diff-changed"]]));
    expect(added.find(([id]) => id === "R")).toBeUndefined();
  });
});
