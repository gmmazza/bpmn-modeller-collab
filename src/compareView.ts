// Side-by-side revision compare: a lightweight read-only bpmn-js viewer for the second
// pane, plus synchronized pan/zoom between the two canvases. The diff colouring is
// applied via src/diffMarkers.ts (shared with the conflict flow's diffView).

export interface ViewerLike {
  importXML(xml: string): Promise<unknown>;
  get(name: string): any;
  destroy(): void;
}

// The historical (right) compare pane. A bare bpmn-js Modeler — not the app's fully
// loaded one — so it ships selection + copyPaste (to copy elements into the current
// diagram) plus MoveCanvas (drag-hand pan). Its palette/context-pad are hidden via CSS
// (#canvas2) and mutation is vetoed by installViewSelectGuard, so it's select+copy only,
// never editing. Loaded dynamically; diagram-js CSS is already imported by main.ts.
export async function createCompareModeler(container: HTMLElement): Promise<ViewerLike> {
  const { default: BpmnModeler } = await import("bpmn-js/lib/Modeler");
  const { CANON_MODDLE } = await import("./canonModdle");
  // Register the canon descriptor here too: the cross-modeler copy (src/main.ts:1889-1893)
  // runs its COPY half in THIS pane, so without it, elements copied from a historical
  // revision arrive stripped of canon content even when the main editor is registered
  // (SPIKE F3 / spike case 9). Required, not optional.
  return new BpmnModeler({ container, moddleExtensions: { canon: CANON_MODDLE } }) as unknown as ViewerLike;
}

interface Syncable {
  get(name: string): any; // eventBus, canvas, selection, elementRegistry…
}

// Keep the historical pane SELECTABLE but not EDITABLE: veto every mutation-initiation
// interaction (move/create/resize/connect/bendpoint/direct-edit) at high priority, while
// leaving click-selection and our Shift+drag rubber-band untouched. Mirrors editor.ts'
// installReadOnlyGuard but deliberately does NOT block selection/lasso.
export function installViewSelectGuard(m: Syncable): void {
  const eventBus = m.get("eventBus");
  if (!eventBus?.on) return;
  const BLOCK = [
    "shape.move.start", "create.start", "resize.start", "connect.start",
    "connectionSegment.move.start", "bendpoint.move.start", "directEditing.activate",
    "element.dblclick",
  ];
  for (const e of BLOCK) eventBus.on(e, 20000, () => false);
}

// Make a SHIFT+drag on empty canvas draw a selection box (rubber-band / lasso) so several
// elements can be selected at once — a plain click still selects one, and a plain drag on
// empty canvas still PANS (MoveCanvas), because we only intercept when Shift is held.
export function enableRubberBandSelect(m: Syncable): void {
  const canvas = m.get("canvas");
  const eventBus = m.get("eventBus");
  const selection = m.get("selection");
  const elementRegistry = m.get("elementRegistry");
  const container: HTMLElement = canvas.getContainer();

  eventBus.on("element.mousedown", 1500, (e: any) => {
    if (e.element !== canvas.getRootElement()) return; // element clicks/drags: leave to default
    if (!e.originalEvent?.shiftKey) return; // no Shift → let MoveCanvas pan the background
    const startX = e.originalEvent.clientX, startY = e.originalEvent.clientY;
    const rect = container.getBoundingClientRect();
    const box = document.createElement("div");
    box.className = "compare-lasso";
    container.appendChild(box);
    let moved = false;
    const onMove = (ev: MouseEvent): void => {
      if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 3) moved = true;
      box.style.left = `${Math.min(startX, ev.clientX) - rect.left}px`;
      box.style.top = `${Math.min(startY, ev.clientY) - rect.top}px`;
      box.style.width = `${Math.abs(ev.clientX - startX)}px`;
      box.style.height = `${Math.abs(ev.clientY - startY)}px`;
    };
    const onUp = (ev: MouseEvent): void => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
      box.remove();
      if (!moved) return; // it was a click, not a drag
      const vb = canvas.viewbox();
      const toModel = (cx: number, cy: number) => ({ x: vb.x + (cx - rect.left) / vb.scale, y: vb.y + (cy - rect.top) / vb.scale });
      const a = toModel(Math.min(startX, ev.clientX), Math.min(startY, ev.clientY));
      const b = toModel(Math.max(startX, ev.clientX), Math.max(startY, ev.clientY));
      // Select every shape that INTERSECTS the box (more forgiving than full enclosure).
      // Skip the root, connections (no x/width) and labels.
      const hits = elementRegistry.filter((el: any) =>
        el !== canvas.getRootElement() && !el.labelTarget &&
        typeof el.x === "number" && typeof el.width === "number" &&
        el.x < b.x && el.x + el.width > a.x && el.y < b.y && el.y + el.height > a.y,
      );
      // Defer so it wins over diagram-js's own mouseup (which would clear the selection).
      setTimeout(() => selection.select(hits), 0);
    };
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
    return false; // block canvas pan while Shift box-selecting
  });
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
