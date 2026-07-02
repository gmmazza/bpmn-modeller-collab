import type { ModelerLike, Editor } from "./editor";
import type { BpmnChanges } from "./bpmnDiff";
import { applyDiffMarkers, clearDiffMarkers } from "./diffMarkers";

export function createDiffView(modeler: ModelerLike, editor: Editor) {
  let active = false;
  let mineXml = "";
  let theirXml = "";
  let changes: BpmnChanges = { added: [], removed: [], changed: [], layoutChanged: [] };
  let showing: "mine" | "theirs" = "mine";
  let marked: string[] = [];

  const canvas = () => modeler.get("canvas");

  function clearMarkers() {
    const c = canvas();
    if (c) clearDiffMarkers(c, marked);
    marked = [];
  }

  function applyMarkers() {
    clearMarkers();
    const c = canvas();
    if (!c) return;
    // "mine" is the version things are removed FROM (the old side); "theirs" the new.
    marked = applyDiffMarkers(c, changes, showing === "mine" ? "old" : "new");
  }

  return {
    async show(mine: string, their: string, ch: BpmnChanges): Promise<void> {
      active = true;
      mineXml = mine;
      theirXml = their;
      changes = ch;
      showing = "mine";
      await editor.load(mineXml);
      editor.setReadOnly(true);
      applyMarkers();
    },
    async toggle(): Promise<"mine" | "theirs"> {
      if (!active) return showing;
      showing = showing === "mine" ? "theirs" : "mine";
      await editor.load(showing === "mine" ? mineXml : theirXml);
      editor.setReadOnly(true);
      applyMarkers();
      return showing;
    },
    showing: () => showing,
    isActive: () => active,
    async close(): Promise<void> {
      active = false;
      clearMarkers();
    },
  };
}

export type DiffView = ReturnType<typeof createDiffView>;
