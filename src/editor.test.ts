import { describe, it, expect } from "vitest";
import { createEditor, type ModelerLike, selectedModuleKeys } from "./editor";

function fakeModeler(): ModelerLike & {
  fire: (event: string) => void;
  fireBus: (event: string) => unknown;
  keyboardBound: () => boolean;
} {
  const handlers: Record<string, Array<() => void>> = {};
  // A minimal eventBus that records veto handlers and returns false if any handler does.
  const busHandlers: Record<string, Array<() => unknown>> = {};
  const eventBus = {
    on: (event: string, _prio: number, cb: () => unknown) => { (busHandlers[event] ??= []).push(cb); },
    fire: (event: string): unknown => {
      for (const h of busHandlers[event] ?? []) { const r = h(); if (r === false) return false; }
      return undefined;
    },
  };
  let bound = true; // diagram-js keyboard is bound after init
  const keyboard = { _node: {}, bind: () => { bound = true; }, unbind: () => { bound = false; } };
  let lastXml = "";
  return {
    async importXML(xml: string) { lastXml = xml; },
    async saveXML() { return { xml: lastXml }; },
    async saveSVG() { return { svg: "" }; },
    on(event: string, cb: () => void) { (handlers[event] ??= []).push(cb); },
    get(name: string) {
      if (name === "eventBus") return eventBus;
      if (name === "keyboard") return keyboard;
      return {};
    },
    fire: (event: string) => (handlers[event] ?? []).forEach((h) => h()),
    fireBus: (event: string) => eventBus.fire(event),
    keyboardBound: () => bound,
  };
}

describe("editor", () => {
  it("round-trips xml through load/getXml", async () => {
    const ed = createEditor(fakeModeler());
    await ed.load("<defs/>");
    expect(await ed.getXml()).toBe("<defs/>");
  });

  it("setReadOnly vetoes editing interactions and toggles the keyboard", () => {
    const m = fakeModeler();
    const ed = createEditor(m);
    // Editable by default: interaction events pass through, keyboard bound.
    expect(m.fireBus("shape.move.start")).toBeUndefined();
    expect(m.keyboardBound()).toBe(true);
    // Read-only: editing interactions are vetoed (false) and the keyboard is unbound.
    ed.setReadOnly(true);
    expect(m.fireBus("shape.move.start")).toBe(false);
    expect(m.fireBus("directEditing.activate")).toBe(false);
    expect(m.fireBus("create.start")).toBe(false);
    expect(m.keyboardBound()).toBe(false);
    // Back to editable.
    ed.setReadOnly(false);
    expect(m.fireBus("shape.move.start")).toBeUndefined();
    expect(m.keyboardBound()).toBe(true);
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
