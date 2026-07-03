import type { BpmnChanges } from "./bpmnDiff";

// diagram-js marker classes coloured by src/diff.css. `moved` (layoutChanged) was
// previously NOT rendered — moving/resizing an element showed no diff. It is now.
export const DIFF_CLS = { added: "diff-added", removed: "diff-removed", changed: "diff-changed", moved: "diff-moved" };

interface CanvasLike {
  addMarker(id: string, cls: string): void;
  removeMarker(id: string, cls: string): void;
}

// Apply diff markers to a diagram-js canvas. `side` selects which changes matter for the
// version THIS canvas shows: the OLDER version highlights what was removed; the NEWER
// what was added; both highlight changed + moved. Returns the ids marked (to clear later).
export function applyDiffMarkers(canvas: CanvasLike, changes: BpmnChanges, side: "old" | "new"): string[] {
  const marked: string[] = [];
  const add = (ids: string[], cls: string): void => {
    for (const id of ids) {
      try { canvas.addMarker(id, cls); marked.push(id); } catch { /* element not in this version */ }
    }
  };
  if (side === "old") add(changes.removed, DIFF_CLS.removed);
  else add(changes.added, DIFF_CLS.added);
  add(changes.changed, DIFF_CLS.changed);
  add(changes.layoutChanged, DIFF_CLS.moved);
  return marked;
}

export function clearDiffMarkers(canvas: CanvasLike, ids: string[]): void {
  for (const id of ids) {
    for (const cls of Object.values(DIFF_CLS)) {
      try { canvas.removeMarker(id, cls); } catch { /* already gone */ }
    }
  }
}
