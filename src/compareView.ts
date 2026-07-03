// Side-by-side revision compare: a lightweight read-only bpmn-js viewer for the second
// pane, plus synchronized pan/zoom between the two canvases. The diff colouring is
// applied via src/diffMarkers.ts (shared with the conflict flow's diffView).

export interface ViewerLike {
  importXML(xml: string): Promise<unknown>;
  get(name: string): any;
  destroy(): void;
}

// The historical (right) compare pane. A read-only bpmn-js NavigatedViewer: it ships
// MoveCanvas (drag-hand pan) + ZoomScroll (wheel zoom) but NO editing, selection-move or
// palette — compare is pure visualization on both panes. Loaded dynamically; diagram-js
// CSS is already imported by main.ts.
export async function createCompareModeler(container: HTMLElement): Promise<ViewerLike> {
  const { default: NavigatedViewer } = await import("bpmn-js/lib/NavigatedViewer");
  return new NavigatedViewer({ container }) as unknown as ViewerLike;
}

interface Syncable {
  get(name: string): any; // eventBus, canvas…
}

// Mirror pan/zoom both ways between two modelers/viewers. Returns an unsubscribe fn.
export function syncViewport(a: Syncable, b: Syncable): () => void {
  const ca = a.get("canvas"), cb = b.get("canvas");
  const ea = a.get("eventBus"), eb = b.get("eventBus");
  let guard = false;
  const mirror = (from: any, to: any) => () => {
    if (guard) return;
    guard = true;
    try { to.viewbox(from.viewbox()); } catch { /* not ready */ }
    guard = false;
  };
  const ha = mirror(ca, cb);
  const hb = mirror(cb, ca);
  ea.on("canvas.viewbox.changed", ha);
  eb.on("canvas.viewbox.changed", hb);
  return () => {
    try { ea.off("canvas.viewbox.changed", ha); } catch { /* noop */ }
    try { eb.off("canvas.viewbox.changed", hb); } catch { /* noop */ }
  };
}
