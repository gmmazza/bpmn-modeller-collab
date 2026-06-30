export interface Category {
  id: string;
  label: string;
  fill: string;
  stroke: string;
}
export interface ColorDimension {
  id: string;
  label: string;
  type: "color";
  categories: Category[];
  assignments: Record<string, string>;
}
export interface AnnotationDimension {
  id: string;
  label: string;
  type: "annotation";
  assignments: Record<string, string>;
}
export type Dimension = ColorDimension | AnnotationDimension;
export interface LayerFile {
  version: 1;
  dimensions: Dimension[];
}

export function markerClass(dimId: string, catId: string): string {
  return `l-${dimId}-${catId}`;
}

export function cssForDimension(dim: ColorDimension): string {
  return dim.categories
    .map((c) => {
      const sel = `.djs-element.${markerClass(dim.id, c.id)} .djs-visual`;
      // Normal renderer: the shape is a single <rect>/<circle> as the visual's first
      // child, whose fill/stroke we override directly.
      // Sketchy renderer (bpmn-js-sketchy / rough.js): the shape is a <g> wrapping two
      // <path>s — a fill path (fill set) and an outline path (fill="none"). Each carries
      // its own presentation attributes, so we must target the paths, not the wrapper.
      return [
        `${sel} > :first-child { fill: ${c.fill} !important; stroke: ${c.stroke} !important; }`,
        `${sel} > :first-child path:not([fill="none"]) { fill: ${c.fill} !important; }`,
        `${sel} > :first-child path[fill="none"] { stroke: ${c.stroke} !important; }`,
      ].join("\n");
    })
    .join("\n");
}

export function defaultLayerFile(): LayerFile {
  return {
    version: 1,
    dimensions: [
      {
        id: "madurez",
        label: "Automatización (madurez)",
        type: "color",
        categories: [
          { id: "manual", label: "Manual", fill: "#F1948A", stroke: "#C0392B" },
          { id: "asistido", label: "Asistido", fill: "#F7DC6F", stroke: "#B7950B" },
          { id: "auto", label: "Automatizado", fill: "#82E0AA", stroke: "#1E8449" },
        ],
        assignments: {},
      },
      {
        id: "actores",
        label: "Actores",
        type: "color",
        categories: [
          { id: "cliente", label: "Cliente", fill: "#AED6F1", stroke: "#2471A3" },
          { id: "transp", label: "Transporte", fill: "#D2B4DE", stroke: "#6C3483" },
          { id: "deposito", label: "Depósito", fill: "#A3E4D7", stroke: "#148F77" },
          { id: "lab", label: "Laboratorio", fill: "#A9CCE3", stroke: "#1F618D" },
          { id: "taller", label: "Taller", fill: "#F5CBA7", stroke: "#CA6F1E" },
          { id: "terceros", label: "Terceros", fill: "#D7DBDD", stroke: "#717D7E" },
          { id: "admin", label: "Administración", fill: "#F9E79F", stroke: "#B7950B" },
        ],
        assignments: {},
      },
      { id: "docs", label: "Documentos / Apps", type: "annotation", assignments: {} },
    ],
  };
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}
function normAssignments(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (isStr(v)) out[k] = v;
  }
  return out;
}
function normDimension(raw: unknown): Dimension | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (!isStr(d.id) || !isStr(d.label)) return null;
  if (d.type === "annotation") {
    return { id: d.id, label: d.label, type: "annotation", assignments: normAssignments(d.assignments) };
  }
  if (d.type === "color") {
    if (!Array.isArray(d.categories)) return null;
    const categories: Category[] = [];
    for (const c of d.categories) {
      if (c && typeof c === "object") {
        const cc = c as Record<string, unknown>;
        if (isStr(cc.id) && isStr(cc.label) && isStr(cc.fill) && isStr(cc.stroke)) {
          categories.push({ id: cc.id, label: cc.label, fill: cc.fill, stroke: cc.stroke });
        }
      }
    }
    if (categories.length === 0) return null;
    return { id: d.id, label: d.label, type: "color", categories, assignments: normAssignments(d.assignments) };
  }
  return null;
}

export function normalizeLayerFile(raw: unknown): LayerFile {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as Record<string, unknown>).dimensions)) {
    return defaultLayerFile();
  }
  const dims = ((raw as Record<string, unknown>).dimensions as unknown[])
    .map(normDimension)
    .filter((d): d is Dimension => d !== null);
  return { version: 1, dimensions: dims };
}

const DEFAULT_FILL = "#AED6F1";

export function baseSlug(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "capa"
  );
}

export function slugId(label: string, existingIds: string[]): string {
  const base = baseSlug(label);
  let id = base;
  let n = 2;
  while (existingIds.includes(id)) id = `${base}-${n++}`;
  return id;
}

export function deriveStroke(fill: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(fill.trim());
  if (!m) return fill;
  const n = parseInt(m[1], 16);
  const f = 0.62; // darken ~38%
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.round(x * f));
  return "#" + ch.map((x) => x.toString(16).padStart(2, "0")).join("");
}

function dimIds(lf: LayerFile): string[] {
  return lf.dimensions.map((d) => d.id);
}
function catIds(dim: ColorDimension): string[] {
  return dim.categories.map((c) => c.id);
}

export function addColorDimension(lf: LayerFile, label: string): { lf: LayerFile; id: string } {
  const id = slugId(label, dimIds(lf));
  const dim: ColorDimension = {
    id,
    label,
    type: "color",
    categories: [{ id: "categoria-1", label: "Categoría 1", fill: DEFAULT_FILL, stroke: deriveStroke(DEFAULT_FILL) }],
    assignments: {},
  };
  return { lf: { ...lf, dimensions: [...lf.dimensions, dim] }, id };
}

export function addAnnotationDimension(lf: LayerFile, label: string): { lf: LayerFile; id: string } {
  const id = slugId(label, dimIds(lf));
  const dim: AnnotationDimension = { id, label, type: "annotation", assignments: {} };
  return { lf: { ...lf, dimensions: [...lf.dimensions, dim] }, id };
}

export function renameDimension(lf: LayerFile, id: string, label: string): LayerFile {
  return { ...lf, dimensions: lf.dimensions.map((d) => (d.id === id ? { ...d, label } : d)) };
}

export function deleteDimension(lf: LayerFile, id: string): LayerFile {
  return { ...lf, dimensions: lf.dimensions.filter((d) => d.id !== id) };
}

export function addCategory(lf: LayerFile, dimId: string, label: string, fill: string): { lf: LayerFile; id: string } {
  let id = "";
  const dimensions = lf.dimensions.map((d) => {
    if (d.id !== dimId || d.type !== "color") return d;
    id = slugId(label, catIds(d));
    return { ...d, categories: [...d.categories, { id, label, fill, stroke: deriveStroke(fill) }] };
  });
  return { lf: { ...lf, dimensions }, id };
}

export function updateCategory(
  lf: LayerFile,
  dimId: string,
  catId: string,
  patch: { label?: string; fill?: string },
): LayerFile {
  return {
    ...lf,
    dimensions: lf.dimensions.map((d) => {
      if (d.id !== dimId || d.type !== "color") return d;
      return {
        ...d,
        categories: d.categories.map((c) => {
          if (c.id !== catId) return c;
          const next: Category = { ...c };
          if (patch.label !== undefined) next.label = patch.label;
          if (patch.fill !== undefined) {
            next.fill = patch.fill;
            next.stroke = deriveStroke(patch.fill);
          }
          return next;
        }),
      };
    }),
  };
}

export function deleteCategory(lf: LayerFile, dimId: string, catId: string): LayerFile {
  return {
    ...lf,
    dimensions: lf.dimensions.map((d) => {
      if (d.id !== dimId || d.type !== "color") return d;
      const assignments = Object.fromEntries(Object.entries(d.assignments).filter(([, v]) => v !== catId));
      return { ...d, categories: d.categories.filter((c) => c.id !== catId), assignments };
    }),
  };
}

export function mergeTemplate(lf: LayerFile, templateDims: Dimension[]): LayerFile {
  const existing = new Set(dimIds(lf));
  const toAdd = templateDims
    .filter((d) => !existing.has(d.id))
    .map((d) => ({ ...d, assignments: {} as Record<string, string> }));
  return { ...lf, dimensions: [...lf.dimensions, ...toAdd] };
}

export function reorderCategory(lf: LayerFile, dimId: string, fromIndex: number, toIndex: number): LayerFile {
  return {
    ...lf,
    dimensions: lf.dimensions.map((d) => {
      if (d.id !== dimId || d.type !== "color") return d;
      const cats = [...d.categories];
      if (
        fromIndex < 0 || fromIndex >= cats.length ||
        toIndex < 0 || toIndex >= cats.length ||
        fromIndex === toIndex
      ) {
        return d;
      }
      const [moved] = cats.splice(fromIndex, 1);
      cats.splice(toIndex, 0, moved);
      return { ...d, categories: cats };
    }),
  };
}
