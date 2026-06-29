import { describe, it, expect } from "vitest";
import { createEditor, type ModelerLike, selectedModuleKeys } from "./editor";

function fakeModeler(): ModelerLike & { fire: (event: string) => void; isReadOnly: () => boolean } {
  const handlers: Record<string, Array<() => void>> = {};
  let readonly = false;
  let lastXml = "";
  return {
    async importXML(xml: string) {
      lastXml = xml;
    },
    async saveXML() {
      return { xml: lastXml };
    },
    async saveSVG() {
      return { svg: "" };
    },
    on(event: string, cb: () => void) {
      (handlers[event] ??= []).push(cb);
    },
    get(name: string) {
      if (name === "modeling") return {};
      if (name === "readOnly" || name === "editorActions") return { readOnly: (v: boolean) => (readonly = v) };
      return {};
    },
    isReadOnly: () => readonly,
    fire: (event: string) => (handlers[event] ?? []).forEach((h) => h()),
  };
}

describe("editor", () => {
  it("round-trips xml through load/getXml", async () => {
    const ed = createEditor(fakeModeler());
    await ed.load("<defs/>");
    expect(await ed.getXml()).toBe("<defs/>");
  });

  it("is clean after load and dirty after a change event", async () => {
    const m = fakeModeler();
    const ed = createEditor(m);
    const seen: boolean[] = [];
    ed.onDirtyChange((d) => seen.push(d));
    await ed.load("<defs/>");
    expect(ed.isDirty()).toBe(false);
    m.fire("commandStack.changed");
    expect(ed.isDirty()).toBe(true);
    expect(seen).toContain(true);
  });
});

describe("selectedModuleKeys", () => {
  const base = ["colorPicker", "minimap", "grid", "properties", "tokenSim", "lint"];
  it("includes the always-on modules and no sketchy by default", () => {
    expect(selectedModuleKeys({ sketchy: false, heatmap: false })).toEqual(base);
  });
  it("adds sketchy when enabled", () => {
    expect(selectedModuleKeys({ sketchy: true, heatmap: false })).toEqual([...base, "sketchy"]);
  });
  it("heatmap does not change the module list", () => {
    expect(selectedModuleKeys({ sketchy: false, heatmap: true })).toEqual(base);
  });
});
