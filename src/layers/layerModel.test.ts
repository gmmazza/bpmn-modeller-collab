import { describe, it, expect } from "vitest";
import {
  defaultLayerFile,
  normalizeLayerFile,
  markerClass,
  cssForDimension,
  baseSlug, slugId, deriveStroke,
  addColorDimension, addAnnotationDimension, renameDimension, deleteDimension,
  addCategory, updateCategory, deleteCategory, mergeTemplate,
  type ColorDimension,
  type LayerFile,
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

const empty: LayerFile = { version: 1, dimensions: [] };

describe("layer mutations", () => {
  it("baseSlug strips accents/punctuation and lowercases", () => {
    expect(baseSlug("Automatización (madurez)")).toBe("automatizacion-madurez");
    expect(baseSlug("   ")).toBe("capa");
  });

  it("slugId disambiguates collisions", () => {
    expect(slugId("Manual", [])).toBe("manual");
    expect(slugId("Manual", ["manual"])).toBe("manual-2");
    expect(slugId("Manual", ["manual", "manual-2"])).toBe("manual-3");
  });

  it("deriveStroke darkens a hex fill ~38%", () => {
    expect(deriveStroke("#AED6F1")).toBe("#6c8595");
    expect(deriveStroke("AED6F1")).toBe("#6c8595"); // tolerates missing '#'
    expect(deriveStroke("not-a-color")).toBe("not-a-color"); // passthrough
  });

  it("addColorDimension seeds one category with derived stroke", () => {
    const { lf, id } = addColorDimension(empty, "Madurez");
    expect(id).toBe("madurez");
    const dim = lf.dimensions[0] as ColorDimension;
    expect(dim.type).toBe("color");
    expect(dim.categories).toHaveLength(1);
    expect(dim.categories[0].stroke).toBe(deriveStroke(dim.categories[0].fill));
  });

  it("addAnnotationDimension adds an annotation dimension", () => {
    const { lf, id } = addAnnotationDimension(empty, "Docs");
    expect(id).toBe("docs");
    expect(lf.dimensions[0]).toMatchObject({ id: "docs", type: "annotation", assignments: {} });
  });

  it("renameDimension changes the label, not the id, and keeps assignments", () => {
    const base = addColorDimension(empty, "Madurez").lf;
    const withAssign: LayerFile = {
      version: 1,
      dimensions: [{ ...(base.dimensions[0] as ColorDimension), assignments: { E1: "categoria-1" } }],
    };
    const out = renameDimension(withAssign, "madurez", "Nivel");
    expect(out.dimensions[0].id).toBe("madurez");
    expect(out.dimensions[0].label).toBe("Nivel");
    expect(out.dimensions[0].assignments).toEqual({ E1: "categoria-1" });
  });

  it("deleteDimension removes by id", () => {
    const lf = addColorDimension(empty, "Madurez").lf;
    expect(deleteDimension(lf, "madurez").dimensions).toHaveLength(0);
  });

  it("addCategory appends with derived stroke and unique id", () => {
    const lf = addColorDimension(empty, "Madurez").lf;
    const { lf: lf2, id } = addCategory(lf, "madurez", "Manual", "#F1948A");
    expect(id).toBe("manual");
    const dim = lf2.dimensions[0] as ColorDimension;
    expect(dim.categories).toHaveLength(2);
    expect(dim.categories[1]).toMatchObject({ id: "manual", label: "Manual", fill: "#F1948A", stroke: deriveStroke("#F1948A") });
  });

  it("updateCategory recomputes stroke when fill changes", () => {
    const lf = addColorDimension(empty, "Madurez").lf;
    const out = updateCategory(lf, "madurez", "categoria-1", { label: "Manual", fill: "#F1948A" });
    const dim = out.dimensions[0] as ColorDimension;
    expect(dim.categories[0]).toMatchObject({ label: "Manual", fill: "#F1948A", stroke: deriveStroke("#F1948A") });
  });

  it("deleteCategory removes the category and cascades its assignments", () => {
    const seed = addColorDimension(empty, "Madurez").lf;
    const withCats = addCategory(seed, "madurez", "Manual", "#F1948A").lf;
    const dim0 = withCats.dimensions[0] as ColorDimension;
    const assigned: LayerFile = {
      version: 1,
      dimensions: [{ ...dim0, assignments: { E1: "categoria-1", E2: "manual" } }],
    };
    const out = deleteCategory(assigned, "madurez", "manual");
    const dim = out.dimensions[0] as ColorDimension;
    expect(dim.categories.map((c) => c.id)).toEqual(["categoria-1"]);
    expect(dim.assignments).toEqual({ E1: "categoria-1" });
  });

  it("mergeTemplate adds missing dims, never overwrites, drops template assignments", () => {
    const current = addColorDimension(empty, "Madurez").lf;
    const tmplDim = { ...(addColorDimension(empty, "Madurez").lf.dimensions[0] as ColorDimension), label: "OTRO", assignments: { X: "categoria-1" } };
    const newDim = addColorDimension(empty, "Actores").lf.dimensions[0] as ColorDimension;
    const merged = mergeTemplate(current, [tmplDim, { ...newDim, assignments: { Y: "categoria-1" } }]);
    expect(merged.dimensions.map((d) => d.id)).toEqual(["madurez", "actores"]);
    expect(merged.dimensions[0].label).toBe("Madurez"); // existing not overwritten
    expect(merged.dimensions[1].assignments).toEqual({}); // template assignments dropped
  });
});
