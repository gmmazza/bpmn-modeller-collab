import type { ModelerLike } from "../editor";
import { markerClass, cssForDimension, type ColorDimension, type AnnotationDimension } from "./layerModel";

const STYLE_ID = "bpmn-layer-styles";

function styleEl(): HTMLStyleElement {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  return el;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] as string);
}

export function createLayerView(modeler: ModelerLike) {
  let marked: Array<{ id: string; cls: string }> = [];
  const annotOn = new Set<string>();

  function clearMarkers() {
    const canvas = modeler.get("canvas");
    for (const { id, cls } of marked) {
      try {
        canvas.removeMarker(id, cls);
      } catch {
        /* element gone */
      }
    }
    marked = [];
  }

  function applyColor(dim: ColorDimension | null): void {
    clearMarkers();
    const el = styleEl();
    if (!dim) {
      el.textContent = "";
      return;
    }
    el.textContent = cssForDimension(dim);
    const canvas = modeler.get("canvas");
    for (const [id, cat] of Object.entries(dim.assignments)) {
      const cls = markerClass(dim.id, cat);
      try {
        canvas.addMarker(id, cls);
        marked.push({ id, cls });
      } catch {
        /* element gone */
      }
    }
  }

  function setAnnotation(dim: AnnotationDimension, on: boolean): void {
    const overlays = modeler.get("overlays");
    const type = `layer-annot-${dim.id}`;
    if (on) {
      if (annotOn.has(dim.id)) return;
      for (const [id, txt] of Object.entries(dim.assignments)) {
        if (!txt) continue;
        try {
          overlays.add(id, type, {
            position: { top: -14, right: 8 },
            html: `<div class="doc-badge">${escapeHtml(txt)}</div>`,
          });
        } catch {
          /* element gone */
        }
      }
      annotOn.add(dim.id);
    } else {
      try {
        overlays.remove({ type });
      } catch {
        /* none */
      }
      annotOn.delete(dim.id);
    }
  }

  function legend(dim: ColorDimension): Array<{ color: string; label: string }> {
    return dim.categories.map((c) => ({ color: c.fill, label: c.label }));
  }

  function clear(): void {
    clearMarkers();
    styleEl().textContent = "";
    const overlays = modeler.get("overlays");
    for (const id of annotOn) {
      try {
        overlays.remove({ type: `layer-annot-${id}` });
      } catch {
        /* none */
      }
    }
    annotOn.clear();
  }

  return { applyColor, setAnnotation, legend, clear };
}

export type LayerView = ReturnType<typeof createLayerView>;
