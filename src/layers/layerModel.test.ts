import { describe, it, expect } from "vitest";
import {
  defaultLayerFile,
  normalizeLayerFile,
  markerClass,
  cssForDimension,
  type ColorDimension,
} from "./layerModel";

describe("layerModel", () => {
  it("markerClass formats l-<dim>-<cat>", () => {
    expect(markerClass("madurez", "manual")).toBe("l-madurez-manual");
  });

  it("defaultLayerFile seeds madurez, actores, docs", () => {
    const lf = defaultLayerFile();
    expect(lf.version).toBe(1);
    expect(lf.dimensions.map((d) => d.id)).toEqual(["madurez", "actores", "docs"]);
    const docs = lf.dimensions.find((d) => d.id === "docs")!;
    expect(docs.type).toBe("annotation");
  });

  it("cssForDimension emits a rule per category", () => {
    const dim: ColorDimension = {
      id: "madurez", label: "M", type: "color",
      categories: [{ id: "manual", label: "Manual", fill: "#F1948A", stroke: "#C0392B" }],
      assignments: {},
    };
    const css = cssForDimension(dim);
    expect(css).toContain(".djs-element.l-madurez-manual .djs-visual > :first-child");
    expect(css).toContain("fill: #F1948A !important");
    expect(css).toContain("stroke: #C0392B !important");
    // Sketchy renderer (rough.js): fill lives on inner <path>s, not the wrapper.
    expect(css).toContain('.djs-visual > :first-child path:not([fill="none"]) { fill: #F1948A !important; }');
    expect(css).toContain('.djs-visual > :first-child path[fill="none"] { stroke: #C0392B !important; }');
  });

  it("normalizeLayerFile keeps a valid file", () => {
    const raw = {
      version: 1,
      dimensions: [
        { id: "x", label: "X", type: "color", categories: [{ id: "a", label: "A", fill: "#fff", stroke: "#000" }], assignments: { e1: "a" } },
        { id: "n", label: "N", type: "annotation", assignments: { e2: "hi" } },
      ],
    };
    const lf = normalizeLayerFile(raw);
    expect(lf.dimensions).toHaveLength(2);
    expect((lf.dimensions[0] as any).categories[0].id).toBe("a");
  });

  it("normalizeLayerFile drops invalid dimensions", () => {
    const raw = { version: 1, dimensions: [{ id: "ok", label: "Ok", type: "annotation", assignments: {} }, { nope: true }, { id: "c", type: "color" }] };
    const lf = normalizeLayerFile(raw);
    expect(lf.dimensions.map((d) => d.id)).toEqual(["ok"]);
  });

  it("normalizeLayerFile falls back to defaults on non-object", () => {
    expect(normalizeLayerFile(null).dimensions.map((d) => d.id)).toEqual(["madurez", "actores", "docs"]);
  });
});
