# BPMN layered visualization (POC port) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "layered" visualization to the editor — recolor the diagram by a chosen dimension (madurez/actores/…) and overlay annotation badges, with a legend, driven by per-diagram data in a synced sidecar `<name>.layers.json`, plus the ability to assign elements to categories.

**Architecture:** Non-destructive overlay (never mutates the `.bpmn`): a pure `layerModel` (types + defaults + CSS generation), a `layersClient` that loads/saves the sidecar via new `fsClient.readSidecar/writeSidecar`, a `layerView` that applies `canvas.addMarker` + a generated `<style>` (color dims) and `overlays.add` badges (annotation dims), a `renderLayersPanel` UI, and `main.ts` wiring that loads on open, repaints on selection, and saves on assign.

**Tech Stack:** Existing Vanilla TS + Vite + Vitest + bpmn-js (`canvas`/`overlays`/`selection` services). No new dependencies.

## Global Constraints

- Non-destructive: layers NEVER modify the `.bpmn`. Coloring = `canvas.addMarker(id, "l-<dim>-<cat>")` + a generated `<style id="bpmn-layer-styles">`; annotations = `overlays.add`.
- Sidecar `<baseName>.layers.json` (baseName = filename without `.bpmn`), read/written via `fsClient`. It is NOT a `.bpmn`, so it never appears in `listFiles`/watcher.
- Two dimension types: `color` (categories with `fill`/`stroke`, assignments elementId→categoryId) and `annotation` (assignments elementId→free text → HTML badge).
- Default dimensions when no sidecar: `madurez` (manual `#F1948A`/`#C0392B`, asistido `#F7DC6F`/`#B7950B`, auto `#82E0AA`/`#1E8449`), `actores` (cliente `#AED6F1`/`#2471A3`, transp `#D2B4DE`/`#6C3483`, deposito `#A3E4D7`/`#148F77`, lab `#A9CCE3`/`#1F618D`, taller `#F5CBA7`/`#CA6F1E`, terceros `#D7DBDD`/`#717D7E`, admin `#F9E79F`/`#B7950B`), `docs` (annotation).
- Marker class format: `l-<dimId>-<catId>`. CSS targets `.djs-element.<class> .djs-visual > :first-child`.
- v1: view (color + annotation) + legend + assign elements to categories (persisted) + seeded defaults. A UI to create new dimensions/categories is OUT of v1 (sidecar is hand-editable; model supports it).
- Reuse `fsClient` (only additive sidecar methods), `editor`/`ModelerLike`, `main.ts` shell. Do not touch state/watcher/diff/lockManager/history/identity.
- Annotation badge text is escaped (it comes from a synced file).
- Gates after each task: `npm test`, `npm run typecheck`, `npm run build` green.

## File Structure

```
src/layers/layerModel.ts       # NEW (pure): types, defaultLayerFile, normalizeLayerFile, markerClass, cssForDimension
src/layers/layerModel.test.ts  # NEW
src/fsClient.ts                # MODIFY: add readSidecar(id, suffix) / writeSidecar(id, suffix, text)
src/fsClient.test.ts           # MODIFY: add sidecar round-trip tests
src/layers/layersClient.ts     # NEW: createLayersClient(api).load/save
src/layers/layersClient.test.ts# NEW
src/layers/layerView.ts        # NEW: createLayerView(modeler).applyColor/setAnnotation/legend/clear
src/layers/layerView.test.ts   # NEW
src/layers/layersPanel.ts      # NEW: renderLayersPanel(container, state, handlers)
src/layers/layersPanel.test.ts # NEW
src/main.ts                    # MODIFY: load sidecar on open, Capas panel, assign on selection, save
src/layers.css                 # NEW: panel + badge + legend styles (imported in main.ts)
```

---

## Task 1: Layer model (`layers/layerModel.ts`)

**Files:**
- Create: `src/layers/layerModel.ts`, `src/layers/layerModel.test.ts`

**Interfaces:**
- Produces:
  - `interface Category { id: string; label: string; fill: string; stroke: string }`
  - `interface ColorDimension { id: string; label: string; type: "color"; categories: Category[]; assignments: Record<string,string> }`
  - `interface AnnotationDimension { id: string; label: string; type: "annotation"; assignments: Record<string,string> }`
  - `type Dimension = ColorDimension | AnnotationDimension`
  - `interface LayerFile { version: 1; dimensions: Dimension[] }`
  - `markerClass(dimId: string, catId: string): string` → `l-<dimId>-<catId>`
  - `cssForDimension(dim: ColorDimension): string`
  - `defaultLayerFile(): LayerFile`
  - `normalizeLayerFile(raw: unknown): LayerFile`

- [ ] **Step 1: Write the failing test `src/layers/layerModel.test.ts`**

```ts
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
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/layers/layerModel.test.ts`
Expected: FAIL — cannot find module `./layerModel`.

- [ ] **Step 3: Write `src/layers/layerModel.ts`**

```ts
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
    .map(
      (c) =>
        `.djs-element.${markerClass(dim.id, c.id)} .djs-visual > :first-child { fill: ${c.fill} !important; stroke: ${c.stroke} !important; }`,
    )
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
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/layers/layerModel.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/layers/layerModel.ts src/layers/layerModel.test.ts
git commit -m "feat(layers): pure layer model (types, defaults, css, normalize)"
```

---

## Task 2: Sidecar read/write in `fsClient.ts`

**Files:**
- Modify: `src/fsClient.ts`, `src/fsClient.test.ts`

**Interfaces:**
- Produces (added to the object returned by `createFsClient`):
  - `readSidecar(id: string, suffix: string): Promise<string | null>` — reads `<baseName(id)>.<suffix>`; null if absent.
  - `writeSidecar(id: string, suffix: string, text: string): Promise<void>` — writes `<baseName(id)>.<suffix>`.

- [ ] **Step 1: Add the failing test to `src/fsClient.test.ts`** (append a new describe block)

```ts
describe("fsClient sidecars", () => {
  it("readSidecar returns null when absent, then round-trips after write", async () => {
    expect(await fs.readSidecar("proceso.bpmn", "layers.json")).toBeNull();
    await fs.writeSidecar("proceso.bpmn", "layers.json", '{"version":1}');
    expect(await fs.readSidecar("proceso.bpmn", "layers.json")).toBe('{"version":1}');
  });

  it("sidecar name strips .bpmn and is not listed by listFiles", async () => {
    await fs.writeSidecar("proceso.bpmn", "layers.json", "{}");
    // stored as proceso.layers.json (not a .bpmn), so listFiles ignores it
    expect((await fs.listFiles()).map((f) => f.id)).toEqual(["proceso.bpmn"]);
  });
});
```

(These reuse the existing `fs`/`dir`/`seedFile` setup at the top of `fsClient.test.ts`, where `proceso.bpmn` is seeded in `beforeEach`.)

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/fsClient.test.ts`
Expected: FAIL — `fs.readSidecar` is not a function.

- [ ] **Step 3: Add the methods to the returned object in `src/fsClient.ts`**

In the `return { ... }` object of `createFsClient` (next to `setLock`), add:

```ts
    async readSidecar(id: string, suffix: string): Promise<string | null> {
      try {
        return await readText(`${baseName(id)}.${suffix}`);
      } catch {
        return null;
      }
    },
    async writeSidecar(id: string, suffix: string, text: string): Promise<void> {
      await writeText(`${baseName(id)}.${suffix}`, text);
    },
```

(`baseName`, `readText`, `writeText` already exist in `fsClient.ts`.)

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/fsClient.test.ts`
Expected: PASS (existing fsClient tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/fsClient.ts src/fsClient.test.ts
git commit -m "feat: fsClient sidecar read/write (for layer data)"
```

---

## Task 3: Layers client (`layers/layersClient.ts`)

**Files:**
- Create: `src/layers/layersClient.ts`, `src/layers/layersClient.test.ts`

**Interfaces:**
- Consumes: `readSidecar`/`writeSidecar` (Task 2); `defaultLayerFile`/`normalizeLayerFile`/`LayerFile` (Task 1).
- Produces: `createLayersClient(api: { readSidecar(id,suffix): Promise<string|null>; writeSidecar(id,suffix,text): Promise<void> })` →
  - `load(fileId: string): Promise<LayerFile>` (defaults if absent/invalid)
  - `save(fileId: string, layers: LayerFile): Promise<void>`

- [ ] **Step 1: Write the failing test `src/layers/layersClient.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createLayersClient } from "./layersClient";
import { defaultLayerFile } from "./layerModel";

function fakeApi(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    async readSidecar(id: string, suffix: string) {
      return store.get(`${id}:${suffix}`) ?? null;
    },
    async writeSidecar(id: string, suffix: string, text: string) {
      store.set(`${id}:${suffix}`, text);
    },
  };
}

describe("layersClient", () => {
  it("load returns defaults when no sidecar", async () => {
    const lc = createLayersClient(fakeApi());
    const lf = await lc.load("proceso.bpmn");
    expect(lf.dimensions.map((d) => d.id)).toEqual(["madurez", "actores", "docs"]);
  });

  it("load parses+normalizes an existing sidecar", async () => {
    const api = fakeApi({
      "proceso.bpmn:layers.json": JSON.stringify({
        version: 1,
        dimensions: [{ id: "n", label: "N", type: "annotation", assignments: { e1: "hi" } }],
      }),
    });
    const lf = await createLayersClient(api).load("proceso.bpmn");
    expect(lf.dimensions.map((d) => d.id)).toEqual(["n"]);
  });

  it("load falls back to defaults on invalid JSON", async () => {
    const api = fakeApi({ "proceso.bpmn:layers.json": "{not json" });
    const lf = await createLayersClient(api).load("proceso.bpmn");
    expect(lf.dimensions.map((d) => d.id)).toEqual(["madurez", "actores", "docs"]);
  });

  it("save writes the sidecar JSON", async () => {
    const api = fakeApi();
    await createLayersClient(api).save("proceso.bpmn", defaultLayerFile());
    const stored = api.store.get("proceso.bpmn:layers.json")!;
    expect(JSON.parse(stored).dimensions[0].id).toBe("madurez");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/layers/layersClient.test.ts`
Expected: FAIL — cannot find module `./layersClient`.

- [ ] **Step 3: Write `src/layers/layersClient.ts`**

```ts
import { defaultLayerFile, normalizeLayerFile, type LayerFile } from "./layerModel";

export interface SidecarApi {
  readSidecar(id: string, suffix: string): Promise<string | null>;
  writeSidecar(id: string, suffix: string, text: string): Promise<void>;
}

const SUFFIX = "layers.json";

export function createLayersClient(api: SidecarApi) {
  return {
    async load(fileId: string): Promise<LayerFile> {
      const txt = await api.readSidecar(fileId, SUFFIX);
      if (!txt) return defaultLayerFile();
      try {
        return normalizeLayerFile(JSON.parse(txt));
      } catch {
        return defaultLayerFile();
      }
    },
    async save(fileId: string, layers: LayerFile): Promise<void> {
      await api.writeSidecar(fileId, SUFFIX, JSON.stringify(layers, null, 2));
    },
  };
}

export type LayersClient = ReturnType<typeof createLayersClient>;
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/layers/layersClient.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/layers/layersClient.ts src/layers/layersClient.test.ts
git commit -m "feat(layers): sidecar-backed layers client (load/save)"
```

---

## Task 4: Layer view (`layers/layerView.ts`)

**Files:**
- Create: `src/layers/layerView.ts`, `src/layers/layerView.test.ts`

**Interfaces:**
- Consumes: `ModelerLike` (`get("canvas"|"overlays")`); `LayerFile` types, `markerClass`, `cssForDimension` (Task 1).
- Produces: `createLayerView(modeler: ModelerLike)` →
  - `applyColor(dim: ColorDimension | null): void` — clears prior markers, sets the `<style>`, adds markers per assignment. `null` = Original (no markers, empty style).
  - `setAnnotation(dim: AnnotationDimension, on: boolean): void`
  - `legend(dim: ColorDimension): Array<{ color: string; label: string }>`
  - `clear(): void`

- [ ] **Step 1: Write the failing test `src/layers/layerView.test.ts`**

```ts
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
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/layers/layerView.test.ts`
Expected: FAIL — cannot find module `./layerView`.

- [ ] **Step 3: Write `src/layers/layerView.ts`**

```ts
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
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/layers/layerView.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/layers/layerView.ts src/layers/layerView.test.ts
git commit -m "feat(layers): layer view — canvas markers + annotation overlays + legend"
```

---

## Task 5: Layers panel (`layers/layersPanel.ts`)

**Files:**
- Create: `src/layers/layersPanel.ts`, `src/layers/layersPanel.test.ts`

**Interfaces:**
- Consumes: `LayerFile`, `ColorDimension`, `AnnotationDimension`, `Dimension` (Task 1).
- Produces: `renderLayersPanel(container: HTMLElement, state: LayersPanelState, handlers: LayersPanelHandlers): void` where:
  - `interface LayersPanelState { layers: LayerFile; activeColorId: string | null; annotationsOn: string[]; selectedId: string | null }`
  - `interface LayersPanelHandlers { onPickColor(dimId: string | null): void; onToggleAnnotation(dimId: string, on: boolean): void; onAssign(dimId: string, elementId: string, value: string | null): void }`
  - Renders: color-layer radios (`Original` + each color dim, `activeColorId` checked); annotation checkboxes (checked if in `annotationsOn`); a legend for the active color dim; and, when `selectedId` is set, an **assign** control — a `<select>` of the active color dim's categories (current value from its `assignments[selectedId]`), and a text input per ON annotation dim (current value from `assignments[selectedId]`).

- [ ] **Step 1: Write the failing test `src/layers/layersPanel.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { renderLayersPanel } from "./layersPanel";
import { defaultLayerFile } from "./layerModel";

function baseState(over: Partial<Parameters<typeof renderLayersPanel>[1]> = {}) {
  return { layers: defaultLayerFile(), activeColorId: null, annotationsOn: [], selectedId: null, ...over };
}

describe("renderLayersPanel", () => {
  it("renders Original + a radio per color dimension", () => {
    const el = document.createElement("div");
    renderLayersPanel(el, baseState(), { onPickColor: vi.fn(), onToggleAnnotation: vi.fn(), onAssign: vi.fn() });
    const radios = el.querySelectorAll<HTMLInputElement>('input[name="layer-color"]');
    // Original + madurez + actores = 3
    expect(radios.length).toBe(3);
  });

  it("picking a color radio fires onPickColor with the dim id", () => {
    const el = document.createElement("div");
    const onPickColor = vi.fn();
    renderLayersPanel(el, baseState(), { onPickColor, onToggleAnnotation: vi.fn(), onAssign: vi.fn() });
    const madurez = el.querySelector<HTMLInputElement>('input[name="layer-color"][value="madurez"]')!;
    madurez.checked = true;
    madurez.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onPickColor).toHaveBeenCalledWith("madurez");
  });

  it("assign select fires onAssign for the selected element on the active color dim", () => {
    const el = document.createElement("div");
    const onAssign = vi.fn();
    renderLayersPanel(el, baseState({ activeColorId: "madurez", selectedId: "t1" }), {
      onPickColor: vi.fn(), onToggleAnnotation: vi.fn(), onAssign,
    });
    const sel = el.querySelector<HTMLSelectElement>("select.assign-color")!;
    sel.value = "manual";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onAssign).toHaveBeenCalledWith("madurez", "t1", "manual");
  });

  it("toggling an annotation checkbox fires onToggleAnnotation", () => {
    const el = document.createElement("div");
    const onToggleAnnotation = vi.fn();
    renderLayersPanel(el, baseState(), { onPickColor: vi.fn(), onToggleAnnotation, onAssign: vi.fn() });
    const docs = el.querySelector<HTMLInputElement>('input[data-annot="docs"]')!;
    docs.checked = true;
    docs.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onToggleAnnotation).toHaveBeenCalledWith("docs", true);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/layers/layersPanel.test.ts`
Expected: FAIL — cannot find module `./layersPanel`.

- [ ] **Step 3: Write `src/layers/layersPanel.ts`**

```ts
import type { LayerFile, ColorDimension, AnnotationDimension } from "./layerModel";

export interface LayersPanelState {
  layers: LayerFile;
  activeColorId: string | null;
  annotationsOn: string[];
  selectedId: string | null;
}
export interface LayersPanelHandlers {
  onPickColor(dimId: string | null): void;
  onToggleAnnotation(dimId: string, on: boolean): void;
  onAssign(dimId: string, elementId: string, value: string | null): void;
}

function colorDims(lf: LayerFile): ColorDimension[] {
  return lf.dimensions.filter((d): d is ColorDimension => d.type === "color");
}
function annotationDims(lf: LayerFile): AnnotationDimension[] {
  return lf.dimensions.filter((d): d is AnnotationDimension => d.type === "annotation");
}

export function renderLayersPanel(
  container: HTMLElement,
  state: LayersPanelState,
  handlers: LayersPanelHandlers,
): void {
  container.innerHTML = "";
  const h = document.createElement("h3");
  h.textContent = "Capas";
  container.appendChild(h);

  // --- color layer radios ---
  const colorH = document.createElement("h4");
  colorH.textContent = "Capa de color";
  container.appendChild(colorH);

  const addRadio = (value: string | null, label: string) => {
    const wrap = document.createElement("label");
    const r = document.createElement("input");
    r.type = "radio";
    r.name = "layer-color";
    r.value = value ?? "";
    if (value !== null) r.dataset.color = value;
    r.checked = state.activeColorId === value;
    r.addEventListener("change", () => {
      if (r.checked) handlers.onPickColor(value);
    });
    wrap.appendChild(r);
    wrap.appendChild(document.createTextNode(" " + label));
    container.appendChild(wrap);
  };
  addRadio(null, "Original");
  for (const d of colorDims(state.layers)) addRadio(d.id, d.label);

  // --- legend for the active color dim ---
  const active = colorDims(state.layers).find((d) => d.id === state.activeColorId) ?? null;
  if (active) {
    const legend = document.createElement("div");
    legend.className = "legend";
    for (const c of active.categories) {
      const row = document.createElement("div");
      row.className = "row";
      const sw = document.createElement("span");
      sw.className = "sw";
      sw.style.background = c.fill;
      row.appendChild(sw);
      row.appendChild(document.createTextNode(" " + c.label));
      legend.appendChild(row);
    }
    container.appendChild(legend);
  }

  // --- annotation toggles ---
  const annDimsList = annotationDims(state.layers);
  if (annDimsList.length) {
    const annH = document.createElement("h4");
    annH.textContent = "Anotación";
    container.appendChild(annH);
    for (const d of annDimsList) {
      const wrap = document.createElement("label");
      const c = document.createElement("input");
      c.type = "checkbox";
      c.dataset.annot = d.id;
      c.checked = state.annotationsOn.includes(d.id);
      c.addEventListener("change", () => handlers.onToggleAnnotation(d.id, c.checked));
      wrap.appendChild(c);
      wrap.appendChild(document.createTextNode(" " + d.label));
      container.appendChild(wrap);
    }
  }

  // --- assign (needs a selected element) ---
  if (state.selectedId) {
    const assignH = document.createElement("h4");
    assignH.textContent = "Asignar al elemento";
    container.appendChild(assignH);

    if (active) {
      const sel = document.createElement("select");
      sel.className = "assign-color";
      const none = document.createElement("option");
      none.value = "";
      none.textContent = `— ${active.label} —`;
      sel.appendChild(none);
      for (const c of active.categories) {
        const o = document.createElement("option");
        o.value = c.id;
        o.textContent = c.label;
        sel.appendChild(o);
      }
      sel.value = active.assignments[state.selectedId] ?? "";
      sel.addEventListener("change", () =>
        handlers.onAssign(active.id, state.selectedId!, sel.value || null),
      );
      container.appendChild(sel);
    }

    for (const d of annDimsList) {
      if (!state.annotationsOn.includes(d.id)) continue;
      const inp = document.createElement("input");
      inp.type = "text";
      inp.className = "assign-annot";
      inp.dataset.annot = d.id;
      inp.placeholder = d.label;
      inp.value = d.assignments[state.selectedId] ?? "";
      inp.addEventListener("change", () =>
        handlers.onAssign(d.id, state.selectedId!, inp.value || null),
      );
      container.appendChild(inp);
    }
  }
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/layers/layersPanel.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/layers/layersPanel.ts src/layers/layersPanel.test.ts
git commit -m "feat(layers): layers panel (color radios, annotation toggles, legend, assign)"
```

---

## Task 6: Wire layers into the app (`main.ts` + `layers.css`)

**Files:**
- Modify: `src/main.ts`
- Create: `src/layers.css`

**Interfaces:**
- Consumes: `createLayersClient` (Task 3), `createLayerView` (Task 4), `renderLayersPanel`/`LayersPanelState` (Task 5), `LayerFile`/`Dimension` types (Task 1), `fsClient` (now with sidecar ops).
- Produces: the integrated layers UI. `main.ts` validated by typecheck + build + manual.

- [ ] **Step 1: Add imports + CSS to `src/main.ts`**

After the existing CSS imports add:

```ts
import "./layers.css";
```
With the other module imports add:

```ts
import { createLayersClient } from "./layers/layersClient";
import { createLayerView, type LayerView } from "./layers/layerView";
import { renderLayersPanel } from "./layers/layersPanel";
import type { LayerFile } from "./layers/layerModel";
```

- [ ] **Step 2: Add a Capas panel container to the app shell**

In `startApp`'s `root.innerHTML`, add an aside for layers next to the others inside `<main>` (after `#propspanel`):

```html
        <aside id="layerspanel" class="layers-panel" hidden></aside>
```
And add a header button to toggle it (next to the others):

```html
        <button id="layers">Capas</button>
```

- [ ] **Step 3: Add outer state + a `LayerView`/client in `bootstrap`**

Near the other outer `let`s, add:

```ts
  const layersClient = createLayersClient(api);
  let layerView: LayerView | null = null;
  let layerFile: LayerFile | null = null;
  let activeColorId: string | null = null;
  let annotationsOn: string[] = [];
  let selectedId: string | null = null;
```

(`api` is the `FsClient` created earlier in `bootstrap` — `createLayersClient(api)` works because `FsClient` now has `readSidecar`/`writeSidecar`. If `api` is assigned later than this line, create the layers client lazily inside `mountModeler`/`openFile` instead; keep `let layersClient`.)

> NOTE for the implementer: in the current `main.ts`, `api` is assigned in the entry/`showFolderGate` flow (it's `let api: FsClient`). Declare `let layersClient: ReturnType<typeof createLayersClient>;` near the other `let`s and set `layersClient = createLayersClient(api);` right after each `api = createFsClient(...)` assignment (there are two: the saved-dir branch and the pick branch). This guarantees it's ready before any file opens.

- [ ] **Step 4: Create the `layerView` in `mountModeler`**

In `mountModeler`, after `diffView = createDiffView(modeler, editor);`, add:

```ts
    layerView = createLayerView(modeler);
    // re-apply the active layer after a modeler rebuild
    selectedId = null;
    if (layerFile) reapplyLayers();
    modeler.get("eventBus").on("selection.changed", (e: { newSelection: Array<{ id: string }> }) => {
      selectedId = e.newSelection.length === 1 ? e.newSelection[0].id : null;
      renderLayers();
    });
```

Add `eventBus` to `ModelerLike`? It already exposes `get(name)`, so `modeler.get("eventBus")` is fine without an interface change.

- [ ] **Step 5: Add `loadLayers`, `reapplyLayers`, `renderLayers`, and assignment handlers in `bootstrap`**

```ts
  async function loadLayers(fileId: string): Promise<void> {
    layerFile = await layersClient.load(fileId);
    activeColorId = null;
    annotationsOn = [];
    selectedId = null;
    reapplyLayers();
    renderLayers();
  }

  function reapplyLayers(): void {
    if (!layerView || !layerFile) return;
    const colorDim = layerFile.dimensions.find((d) => d.id === activeColorId && d.type === "color");
    layerView.applyColor((colorDim as any) ?? null);
    for (const d of layerFile.dimensions) {
      if (d.type === "annotation") layerView.setAnnotation(d, annotationsOn.includes(d.id));
    }
  }

  function renderLayers(): void {
    const panel = document.getElementById("layerspanel");
    if (!panel || panel.hidden || !layerFile) return;
    renderLayersPanel(
      panel as HTMLElement,
      { layers: layerFile, activeColorId, annotationsOn, selectedId },
      {
        onPickColor: (id) => {
          activeColorId = id;
          reapplyLayers();
          renderLayers();
        },
        onToggleAnnotation: (id, on) => {
          annotationsOn = on ? [...annotationsOn, id] : annotationsOn.filter((x) => x !== id);
          reapplyLayers();
          renderLayers();
        },
        onAssign: (dimId, elementId, value) => {
          void assignLayer(dimId, elementId, value).catch(onError);
        },
      },
    );
  }

  async function assignLayer(dimId: string, elementId: string, value: string | null): Promise<void> {
    if (!layerFile || state.kind !== "editing") return;
    const dim = layerFile.dimensions.find((d) => d.id === dimId);
    if (!dim) return;
    if (value === null) delete dim.assignments[elementId];
    else dim.assignments[elementId] = value;
    await layersClient.save(state.fileId, layerFile);
    reapplyLayers();
    renderLayers();
  }
```

- [ ] **Step 6: Wire the "Capas" toggle button (in `startApp`, with the other listeners)**

```ts
    $("layers").addEventListener("click", () => {
      const panel = document.getElementById("layerspanel") as HTMLElement;
      panel.hidden = !panel.hidden;
      renderLayers();
    });
```

- [ ] **Step 7: Load layers when a file opens**

In `openFile`, after the diagram XML is loaded (`await editor.load(xml);` … near where history loads), add:

```ts
    await loadLayers(fileId);
```

- [ ] **Step 8: Create `src/layers.css`**

```css
.layers-panel { width: 260px; overflow: auto; border-left: 1px solid #e5e7eb; padding: 8px 10px; font-family: sans-serif; }
.layers-panel h3 { margin: 0 0 6px; font-size: 14px; }
.layers-panel h4 { margin: 12px 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #888; }
.layers-panel label { display: block; margin: 2px 0; font-size: 13px; }
.layers-panel select.assign-color, .layers-panel input.assign-annot { width: 100%; box-sizing: border-box; margin: 4px 0; }
.layers-panel .legend .row { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 2px 0; }
.layers-panel .legend .sw { width: 14px; height: 14px; border-radius: 3px; border: 1px solid rgba(0,0,0,.25); display: inline-block; }
.doc-badge { background: #2C3E50; color: #fff; font-size: 11px; line-height: 1; padding: 4px 7px; border-radius: 6px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,.25); font-family: system-ui, sans-serif; }
```

- [ ] **Step 9: Verify gates**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests pass (no new failures), typecheck clean, build succeeds.

- [ ] **Step 10: Manual smoke (best-effort; note if headless)**

`npm run dev`, open a `.bpmn`, click **Capas**: pick *Automatización (madurez)* → elements recolor + legend shows; select an element → assign a category → it recolors and a `<name>.layers.json` appears in the folder; toggle *Documentos / Apps* → badges; switch to *Original* → colors clear.

- [ ] **Step 11: Commit**

```bash
git add src/main.ts src/layers.css
git commit -m "feat(layers): integrate layered visualization into the app"
```

---

## Self-Review notes (resolved)

- **Spec coverage:** sidecar storage (Task 2 + 3), non-destructive color/annotation overlay + legend (Task 4), defaults/normalize (Task 1), panel with pick/toggle/legend/assign (Task 5), load-on-open + save-on-assign + selection-driven assign + reapply-after-rebuild (Task 6). The out-of-v1 dimension/category editor is documented as a follow-up (model already supports it).
- **Type consistency:** `markerClass`/`cssForDimension`/`LayerFile`/`ColorDimension`/`AnnotationDimension` are defined in Task 1 and consumed unchanged in Tasks 3–6. `SidecarApi` (Task 3) matches the `readSidecar/writeSidecar` signatures added in Task 2. `LayersPanelState`/`Handlers` (Task 5) are exactly what `renderLayers` builds in Task 6. `layerView.applyColor(ColorDimension|null)` / `setAnnotation(AnnotationDimension, boolean)` match the calls in `reapplyLayers`.
- **Non-destructive invariant:** no task writes to the `.bpmn`; only `<base>.layers.json` via `writeSidecar`. Markers/overlays/`<style>` are runtime-only.
- **Sidecar isolation:** stored as `<base>.layers.json` (not `.bpmn`) → excluded from `listFiles`/watcher (verified by a Task 2 test).
- **Reuse:** `fsClient` gains only additive sidecar methods; `main.ts` integrates; state/watcher/diff/lockManager/history/identity untouched. Works in both web and Electron backends (sidecar ops go through the same dir handle).
```
