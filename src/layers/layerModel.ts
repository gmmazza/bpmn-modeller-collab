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
