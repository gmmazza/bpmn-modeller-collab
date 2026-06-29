import type { ModelerLike, Editor } from "./editor";
import type { BpmnChanges } from "./bpmnDiff";

const CLS = { added: "diff-added", removed: "diff-removed", changed: "diff-changed" };

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
    if (c) {
      for (const id of marked) {
        try {
          c.removeMarker(id, CLS.added);
          c.removeMarker(id, CLS.removed);
          c.removeMarker(id, CLS.changed);
        } catch {
          /* element not present in this version */
        }
      }
    }
    marked = [];
  }

  function applyMarkers() {
    clearMarkers();
    const c = canvas();
    if (!c) return;
    const add = (ids: string[], cls: string) => {
      for (const id of ids) {
        try {
          c.addMarker(id, cls);
          marked.push(id);
        } catch {
          /* element not present in this version */
        }
      }
    };
    if (showing === "mine") {
      add(changes.removed, CLS.removed);
      add(changes.changed, CLS.changed);
    } else {
      add(changes.added, CLS.added);
      add(changes.changed, CLS.changed);
    }
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
