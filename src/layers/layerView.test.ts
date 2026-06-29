import { describe, it, expect } from "vitest";
import { createLayerView } from "./layerView";
import type { ColorDimension, AnnotationDimension } from "./layerModel";

function fakeModeler() {
  const added: Array<[string, string]> = [];
  const removed: Array<[string, string]> = [];
  const overlaysAdded: Array<{ id: string; type: string; html: string }> = [];
  const overlaysRemoved: Array<{ type: string }> = [];
  const canvas = { addMarker: (id: string, c: string) => added.push([id, c]), removeMarker: (id: string, c: string) => removed.push([id, c]) };
  const overlays = {
    add: (id: string, type: string, o: { html: string }) => overlaysAdded.push({ id, type, html: o.html }),
    remove: (q: { type: string }) => overlaysRemoved.push(q),
  };
  const modeler = { get: (n: string) => (n === "canvas" ? canvas : n === "overlays" ? overlays : undefined), importXML: async () => ({}), saveXML: async () => ({ xml: "" }), saveSVG: async () => ({ svg: "" }), on() {} } as any;
  return { modeler, added, removed, overlaysAdded, overlaysRemoved };
}

const colorDim: ColorDimension = {
  id: "madurez", label: "M", type: "color",
  categories: [{ id: "manual", label: "Manual", fill: "#F1948A", stroke: "#C0392B" }],
  assignments: { t1: "manual" },
};
const annDim: AnnotationDimension = { id: "docs", label: "Docs", type: "annotation", assignments: { t1: "📋 Remito", t2: "" } };

describe("layerView", () => {
  it("applyColor adds a marker per assignment and writes the style", () => {
    const f = fakeModeler();
    const view = createLayerView(f.modeler);
    view.applyColor(colorDim);
    expect(f.added).toContainEqual(["t1", "l-madurez-manual"]);
    const style = document.getElementById("bpmn-layer-styles") as HTMLStyleElement;
    expect(style.textContent).toContain("l-madurez-manual");
  });

  it("applyColor(null) clears prior markers and empties the style", () => {
    const f = fakeModeler();
    const view = createLayerView(f.modeler);
    view.applyColor(colorDim);
    view.applyColor(null);
    expect(f.removed).toContainEqual(["t1", "l-madurez-manual"]);
    expect((document.getElementById("bpmn-layer-styles") as HTMLStyleElement).textContent).toBe("");
  });

  it("setAnnotation adds a badge per non-empty assignment and removes on off", () => {
    const f = fakeModeler();
    const view = createLayerView(f.modeler);
    view.setAnnotation(annDim, true);
    expect(f.overlaysAdded).toHaveLength(1); // t2 empty → skipped
    expect(f.overlaysAdded[0].id).toBe("t1");
    expect(f.overlaysAdded[0].html).toContain("Remito");
    view.setAnnotation(annDim, false);
    expect(f.overlaysRemoved).toContainEqual({ type: "layer-annot-docs" });
  });

  it("legend maps categories to color/label rows", () => {
    const view = createLayerView(fakeModeler().modeler);
    expect(view.legend(colorDim)).toEqual([{ color: "#F1948A", label: "Manual" }]);
  });
});
