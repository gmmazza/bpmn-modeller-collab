# Capas personalizables y plantillas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir crear/editar dimensiones de capas y categorías desde la app (por documento) y guardarlas/aplicarlas como plantillas compartidas en la carpeta de trabajo.

**Architecture:** Aditiva sobre el sistema de capas data-driven existente. Funciones puras de mutación en `layerModel.ts`, un cliente de plantillas en `layerTemplates.ts` (archivo por plantilla en `.layer-templates/`), un render de modal en `layersModal.ts`, un botón en el panel, y wiring en `main.ts` que reusa el camino actual de re-aplicación de colores. No se refactoriza el render/aplicación.

**Tech Stack:** TypeScript, Vite, Vitest (happy-dom), File System Access API / Electron IPC (vía `fsClient`).

## Global Constraints

- Datos de usuario siempre via `textContent` / `input.value`, **nunca** `innerHTML` (XSS).
- Nunca bloquear la actualización visual en la escritura de disco: re-aplicar/renderizar primero, `save` al final (los clientes de nube pueden bloquear el sidecar).
- No usar `window.prompt`/`window.alert`/`window.confirm` (no soportados en Electron): toda entrada va por inputs/botones in-app.
- IDs de dimensión/categoría son **inmutables** tras crearse; renombrar cambia solo el `label`.
- Funciones de mutación **puras** (sin disco ni DOM) y testeadas antes del wiring.
- El borde (`stroke`) de una categoría se **deriva** del relleno (`fill`); el usuario solo elige el relleno.
- Plantillas: **un archivo por plantilla** en `.layer-templates/<slug>.json`, definiciones **sin** `assignments`.
- Aplicar plantilla = **fusionar agregando lo que falta** por `id`; nunca pisa dimensiones existentes ni toca asignaciones.
- Fuera de alcance (YAGNI): reordenar dimensiones/categorías.

---

### Task 1: Mutaciones puras del modelo de capas

**Files:**
- Modify: `src/layers/layerModel.ts` (agregar al final, tras `normalizeLayerFile`)
- Test: `src/layers/layerModel.test.ts` (agregar casos)

**Interfaces:**
- Consumes: tipos existentes `Category`, `ColorDimension`, `AnnotationDimension`, `Dimension`, `LayerFile` (ya en el archivo).
- Produces:
  - `baseSlug(label: string): string`
  - `slugId(label: string, existingIds: string[]): string`
  - `deriveStroke(fill: string): string`
  - `addColorDimension(lf: LayerFile, label: string): { lf: LayerFile; id: string }`
  - `addAnnotationDimension(lf: LayerFile, label: string): { lf: LayerFile; id: string }`
  - `renameDimension(lf: LayerFile, id: string, label: string): LayerFile`
  - `deleteDimension(lf: LayerFile, id: string): LayerFile`
  - `addCategory(lf: LayerFile, dimId: string, label: string, fill: string): { lf: LayerFile; id: string }`
  - `updateCategory(lf: LayerFile, dimId: string, catId: string, patch: { label?: string; fill?: string }): LayerFile`
  - `deleteCategory(lf: LayerFile, dimId: string, catId: string): LayerFile`
  - `mergeTemplate(lf: LayerFile, templateDims: Dimension[]): LayerFile`

- [ ] **Step 1: Write the failing tests**

Agregar a `src/layers/layerModel.test.ts`:

```ts
import {
  baseSlug, slugId, deriveStroke,
  addColorDimension, addAnnotationDimension, renameDimension, deleteDimension,
  addCategory, updateCategory, deleteCategory, mergeTemplate,
  type LayerFile, type ColorDimension,
} from "./layerModel";

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/layers/layerModel.test.ts`
Expected: FAIL (`baseSlug`/`slugId`/… are not exported).

- [ ] **Step 3: Implement the mutations**

Agregar al final de `src/layers/layerModel.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/layers/layerModel.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/layers/layerModel.ts src/layers/layerModel.test.ts
git commit -m "feat(layers): pure mutations (dimensions/categories) + slug/stroke helpers"
```

---

### Task 2: Cliente de plantillas + métodos genéricos de path en fsClient

**Files:**
- Modify: `src/fsClient.ts` (agregar métodos genéricos al objeto retornado; excluir `.layer-templates` de `listTree`)
- Create: `src/layers/layerTemplates.ts`
- Test: `src/layers/layerTemplates.test.ts`

**Interfaces:**
- Consumes: `baseSlug` y tipos `Dimension` de `./layerModel`; `normalizeLayerFile` de `./layerModel`; `createFsClient` de `../fsClient`; `createFakeDir` de `../testHelpers/fakeDir`.
- Produces:
  - En `fsClient` (objeto retornado por `createFsClient`):
    - `readPath(rel: string): Promise<string | null>`
    - `writePath(rel: string, text: string): Promise<void>`
    - `deletePath(rel: string): Promise<void>`
    - `listDir(rel: string): Promise<{ name: string; kind: "file" | "directory" }[]>`
  - `src/layers/layerTemplates.ts`:
    - `interface TemplatesApi { listDir; readPath; writePath; deletePath }` (forma exacta arriba)
    - `interface Template { name: string; dimensions: Dimension[] }`
    - `createTemplatesClient(api: TemplatesApi)` con métodos:
      - `list(): Promise<{ slug: string; name: string }[]>`
      - `load(slug: string): Promise<Template | null>`
      - `save(name: string, dimensions: Dimension[]): Promise<void>`
      - `remove(slug: string): Promise<void>`

- [ ] **Step 1: Add the generic path methods to fsClient**

En `src/fsClient.ts`, dentro del objeto `return { ... }`, justo después del método `writeSidecar` (que termina en la línea con `},` tras `await writeTextAt(\`${baseName(id)}.${suffix}\`, text);`), agregar:

```ts
    async readPath(rel: string): Promise<string | null> {
      try {
        return await readTextAt(rel);
      } catch {
        return null;
      }
    },
    async writePath(rel: string, text: string): Promise<void> {
      await writeTextAt(rel, text);
    },
    async deletePath(rel: string): Promise<void> {
      await removeFileAt(rel);
    },
    async listDir(rel: string): Promise<{ name: string; kind: "file" | "directory" }[]> {
      try {
        const d = await getDir(rel, false);
        const out: { name: string; kind: "file" | "directory" }[] = [];
        for await (const [name, h] of (d as any).entries()) out.push({ name, kind: (h as any).kind });
        return out;
      } catch {
        return [];
      }
    },
```

- [ ] **Step 2: Exclude `.layer-templates` from the file tree**

En `src/fsClient.ts`, en `listTree`, la línea:

```ts
          if (name === HISTORY_DIR) continue;
```

reemplazarla por:

```ts
          if (name === HISTORY_DIR || name === ".layer-templates") continue;
```

- [ ] **Step 3: Write the failing test**

Crear `src/layers/layerTemplates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createFsClient } from "../fsClient";
import { createFakeDir } from "../testHelpers/fakeDir";
import { createTemplatesClient } from "./layerTemplates";
import { addColorDimension, type LayerFile } from "./layerModel";

function clientOverFakeDir() {
  const dir = createFakeDir();
  const fs = createFsClient(dir as unknown as FileSystemDirectoryHandle);
  return createTemplatesClient(fs);
}

describe("templates client", () => {
  it("returns [] when the templates folder is absent", async () => {
    const t = clientOverFakeDir();
    expect(await t.list()).toEqual([]);
    expect(await t.load("nope")).toBeNull();
  });

  it("saves (stripping assignments), lists, loads, and removes", async () => {
    const t = clientOverFakeDir();
    const lf: LayerFile = addColorDimension({ version: 1, dimensions: [] }, "Madurez").lf;
    const withAssign: LayerFile = {
      version: 1,
      dimensions: [{ ...(lf.dimensions[0] as any), assignments: { E1: "categoria-1" } }],
    };
    await t.save("Mi plantilla", withAssign.dimensions);

    const list = await t.list();
    expect(list).toEqual([{ slug: "mi-plantilla", name: "Mi plantilla" }]);

    const loaded = await t.load("mi-plantilla");
    expect(loaded?.name).toBe("Mi plantilla");
    expect(loaded?.dimensions[0].assignments).toEqual({}); // stripped

    await t.remove("mi-plantilla");
    expect(await t.list()).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- src/layers/layerTemplates.test.ts`
Expected: FAIL (`./layerTemplates` does not exist).

- [ ] **Step 5: Implement the templates client**

Crear `src/layers/layerTemplates.ts`:

```ts
import { baseSlug, normalizeLayerFile, type Dimension } from "./layerModel";

const DIR = ".layer-templates";

export interface TemplatesApi {
  listDir(rel: string): Promise<{ name: string; kind: "file" | "directory" }[]>;
  readPath(rel: string): Promise<string | null>;
  writePath(rel: string, text: string): Promise<void>;
  deletePath(rel: string): Promise<void>;
}

export interface Template {
  name: string;
  dimensions: Dimension[];
}

function stripAssignments(dims: Dimension[]): Dimension[] {
  return dims.map((d) => ({ ...d, assignments: {} as Record<string, string> }));
}

export function createTemplatesClient(api: TemplatesApi) {
  return {
    async list(): Promise<{ slug: string; name: string }[]> {
      const entries = await api.listDir(DIR);
      const out: { slug: string; name: string }[] = [];
      for (const e of entries) {
        if (e.kind !== "file" || !e.name.endsWith(".json")) continue;
        const slug = e.name.replace(/\.json$/i, "");
        let name = slug;
        const txt = await api.readPath(`${DIR}/${e.name}`);
        if (txt) {
          try {
            const j = JSON.parse(txt);
            if (typeof j.name === "string" && j.name.trim()) name = j.name;
          } catch {
            /* keep slug as name */
          }
        }
        out.push({ slug, name });
      }
      return out;
    },
    async load(slug: string): Promise<Template | null> {
      const txt = await api.readPath(`${DIR}/${slug}.json`);
      if (!txt) return null;
      try {
        const j = JSON.parse(txt);
        const name = typeof j.name === "string" && j.name.trim() ? j.name : slug;
        const dimensions = normalizeLayerFile({ version: 1, dimensions: j.dimensions }).dimensions;
        return { name, dimensions };
      } catch {
        return null;
      }
    },
    async save(name: string, dimensions: Dimension[]): Promise<void> {
      const body = { version: 1, name, dimensions: stripAssignments(dimensions) };
      await api.writePath(`${DIR}/${baseSlug(name)}.json`, JSON.stringify(body, null, 2));
    },
    async remove(slug: string): Promise<void> {
      await api.deletePath(`${DIR}/${slug}.json`);
    },
  };
}

export type TemplatesClient = ReturnType<typeof createTemplatesClient>;
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- src/layers/layerTemplates.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/fsClient.ts src/layers/layerTemplates.ts src/layers/layerTemplates.test.ts
git commit -m "feat(layers): templates client over per-file .layer-templates/; generic fsClient path ops"
```

---

### Task 3: Render del modal "Gestionar capas"

**Files:**
- Create: `src/layers/layersModal.ts`
- Test: `src/layers/layersModal.test.ts`

**Interfaces:**
- Consumes: tipos `LayerFile`, `ColorDimension` de `./layerModel`.
- Produces:
  - `interface LayersModalState { layers: LayerFile; templates: { slug: string; name: string }[] }`
  - `interface LayersModalHandlers { onAddColorDim(): void; onAddAnnotationDim(): void; onRenameDim(id: string, label: string): void; onDeleteDim(id: string): void; onAddCategory(dimId: string): void; onUpdateCategory(dimId: string, catId: string, patch: { label?: string; fill?: string }): void; onDeleteCategory(dimId: string, catId: string): void; onApplyTemplate(slug: string): void; onSaveTemplate(name: string): void; onDeleteTemplate(slug: string): void }`
  - `renderLayersModal(container: HTMLElement, state: LayersModalState, handlers: LayersModalHandlers): void`

- [ ] **Step 1: Write the failing test**

Crear `src/layers/layersModal.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { renderLayersModal, type LayersModalHandlers } from "./layersModal";
import { addColorDimension, addAnnotationDimension, type LayerFile } from "./layerModel";

function sampleState() {
  let lf: LayerFile = { version: 1, dimensions: [] };
  lf = addColorDimension(lf, "Madurez").lf; // dim "madurez" with category "categoria-1"
  lf = addAnnotationDimension(lf, "Docs").lf; // dim "docs"
  return { layers: lf, templates: [{ slug: "base", name: "Base" }] };
}

function noopHandlers(): LayersModalHandlers {
  return {
    onAddColorDim: vi.fn(), onAddAnnotationDim: vi.fn(), onRenameDim: vi.fn(),
    onDeleteDim: vi.fn(), onAddCategory: vi.fn(), onUpdateCategory: vi.fn(),
    onDeleteCategory: vi.fn(), onApplyTemplate: vi.fn(), onSaveTemplate: vi.fn(),
    onDeleteTemplate: vi.fn(),
  };
}

describe("renderLayersModal", () => {
  it("renders a row per dimension and a color input per category", () => {
    const c = document.createElement("div");
    renderLayersModal(c, sampleState(), noopHandlers());
    expect(c.querySelectorAll(".lm-dim")).toHaveLength(2);
    expect(c.querySelectorAll('.lm-cat input[type="color"]')).toHaveLength(1);
    expect(c.querySelectorAll(".lm-template-row")).toHaveLength(1);
  });

  it("uses textContent for user data (no innerHTML injection)", () => {
    const c = document.createElement("div");
    const state = sampleState();
    state.templates = [{ slug: "x", name: "<img src=x onerror=alert(1)>" }];
    renderLayersModal(c, state, noopHandlers());
    expect(c.querySelector("img")).toBeNull();
  });

  it("wires add-dimension buttons", () => {
    const c = document.createElement("div");
    const h = noopHandlers();
    renderLayersModal(c, sampleState(), h);
    (c.querySelector(".lm-add-color") as HTMLButtonElement).click();
    (c.querySelector(".lm-add-annot") as HTMLButtonElement).click();
    expect(h.onAddColorDim).toHaveBeenCalledOnce();
    expect(h.onAddAnnotationDim).toHaveBeenCalledOnce();
  });

  it("emits onUpdateCategory with the new fill", () => {
    const c = document.createElement("div");
    const h = noopHandlers();
    renderLayersModal(c, sampleState(), h);
    const color = c.querySelector('.lm-cat input[type="color"]') as HTMLInputElement;
    color.value = "#123456";
    color.dispatchEvent(new Event("change"));
    expect(h.onUpdateCategory).toHaveBeenCalledWith("madurez", "categoria-1", { fill: "#123456" });
  });

  it("emits onDeleteCategory", () => {
    const c = document.createElement("div");
    const h = noopHandlers();
    renderLayersModal(c, sampleState(), h);
    (c.querySelector(".lm-cat .lm-del-cat") as HTMLButtonElement).click();
    expect(h.onDeleteCategory).toHaveBeenCalledWith("madurez", "categoria-1");
  });

  it("emits onApplyTemplate and onSaveTemplate", () => {
    const c = document.createElement("div");
    const h = noopHandlers();
    renderLayersModal(c, sampleState(), h);
    (c.querySelector(".lm-template-row .lm-apply") as HTMLButtonElement).click();
    expect(h.onApplyTemplate).toHaveBeenCalledWith("base");
    const input = c.querySelector(".lm-save-name") as HTMLInputElement;
    input.value = "Nueva";
    (c.querySelector(".lm-save-btn") as HTMLButtonElement).click();
    expect(h.onSaveTemplate).toHaveBeenCalledWith("Nueva");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/layers/layersModal.test.ts`
Expected: FAIL (`./layersModal` does not exist).

- [ ] **Step 3: Implement the modal render**

Crear `src/layers/layersModal.ts`:

```ts
import type { LayerFile, ColorDimension } from "./layerModel";

export interface LayersModalState {
  layers: LayerFile;
  templates: { slug: string; name: string }[];
}

export interface LayersModalHandlers {
  onAddColorDim(): void;
  onAddAnnotationDim(): void;
  onRenameDim(id: string, label: string): void;
  onDeleteDim(id: string): void;
  onAddCategory(dimId: string): void;
  onUpdateCategory(dimId: string, catId: string, patch: { label?: string; fill?: string }): void;
  onDeleteCategory(dimId: string, catId: string): void;
  onApplyTemplate(slug: string): void;
  onSaveTemplate(name: string): void;
  onDeleteTemplate(slug: string): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function renderLayersModal(
  container: HTMLElement,
  state: LayersModalState,
  handlers: LayersModalHandlers,
): void {
  container.innerHTML = "";

  // ---- Templates ----
  const tplH = el("h3", undefined, "Plantillas");
  container.appendChild(tplH);
  const tplList = el("div", "lm-templates");
  for (const t of state.templates) {
    const row = el("div", "lm-template-row");
    row.appendChild(el("span", "lm-template-name", t.name));
    const apply = el("button", "btn lm-apply", "Aplicar");
    apply.type = "button";
    apply.addEventListener("click", () => handlers.onApplyTemplate(t.slug));
    const del = el("button", "btn icon-only lm-del-template", "🗑");
    del.type = "button";
    del.title = "Borrar plantilla";
    del.addEventListener("click", () => handlers.onDeleteTemplate(t.slug));
    row.append(apply, del);
    tplList.appendChild(row);
  }
  container.appendChild(tplList);

  const saveRow = el("div", "lm-save-row");
  const saveName = el("input", "lm-save-name");
  saveName.type = "text";
  saveName.placeholder = "Nombre de plantilla";
  const saveBtn = el("button", "btn lm-save-btn", "Guardar actual como plantilla");
  saveBtn.type = "button";
  saveBtn.addEventListener("click", () => {
    const name = saveName.value.trim();
    if (name) handlers.onSaveTemplate(name);
  });
  saveRow.append(saveName, saveBtn);
  container.appendChild(saveRow);

  // ---- Dimensions ----
  container.appendChild(el("h3", undefined, "Capas"));
  for (const dim of state.layers.dimensions) {
    const block = el("div", "lm-dim");
    const head = el("div", "lm-dim-head");
    const name = el("input", "lm-dim-name");
    name.type = "text";
    name.value = dim.label;
    name.addEventListener("change", () => handlers.onRenameDim(dim.id, name.value.trim() || dim.label));
    const badge = el("span", "lm-badge", dim.type === "color" ? "color" : "anotación");
    const del = el("button", "btn icon-only lm-del-dim", "🗑");
    del.type = "button";
    del.title = "Borrar capa";
    del.addEventListener("click", () => handlers.onDeleteDim(dim.id));
    head.append(name, badge, del);
    block.appendChild(head);

    if (dim.type === "color") {
      const cd = dim as ColorDimension;
      for (const cat of cd.categories) {
        const row = el("div", "lm-cat");
        const color = el("input", "lm-cat-color");
        color.type = "color";
        color.value = cat.fill;
        color.addEventListener("change", () => handlers.onUpdateCategory(dim.id, cat.id, { fill: color.value }));
        const label = el("input", "lm-cat-name");
        label.type = "text";
        label.value = cat.label;
        label.addEventListener("change", () => handlers.onUpdateCategory(dim.id, cat.id, { label: label.value.trim() || cat.label }));
        const cdel = el("button", "btn icon-only lm-del-cat", "🗑");
        cdel.type = "button";
        cdel.title = "Borrar categoría";
        cdel.addEventListener("click", () => handlers.onDeleteCategory(dim.id, cat.id));
        row.append(color, label, cdel);
        block.appendChild(row);
      }
      const addCat = el("button", "btn lm-add-cat", "+ categoría");
      addCat.type = "button";
      addCat.addEventListener("click", () => handlers.onAddCategory(dim.id));
      block.appendChild(addCat);
    }
    container.appendChild(block);
  }

  // ---- Add dimension actions ----
  const actions = el("div", "lm-actions");
  const addColor = el("button", "btn lm-add-color", "+ capa de color");
  addColor.type = "button";
  addColor.addEventListener("click", () => handlers.onAddColorDim());
  const addAnnot = el("button", "btn lm-add-annot", "+ anotación");
  addAnnot.type = "button";
  addAnnot.addEventListener("click", () => handlers.onAddAnnotationDim());
  actions.append(addColor, addAnnot);
  container.appendChild(actions);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/layers/layersModal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/layers/layersModal.ts src/layers/layersModal.test.ts
git commit -m "feat(layers): modal render for managing dimensions/categories/templates"
```

---

### Task 4: Botón "Gestionar capas…" en el panel

**Files:**
- Modify: `src/layers/layersPanel.ts`
- Test: `src/layers/layersPanel.test.ts` (agregar caso)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `LayersPanelHandlers` gana `onManage(): void`; el panel renderiza un botón `.lm-open` que lo invoca.

- [ ] **Step 1: Write the failing test**

Agregar a `src/layers/layersPanel.test.ts` (dentro del `describe` existente; usa el mismo patrón de `renderLayersPanel` que el resto del archivo):

```ts
it("renders a 'Gestionar capas' button wired to onManage", () => {
  const c = document.createElement("div");
  const onManage = vi.fn();
  renderLayersPanel(
    c,
    { layers: { version: 1, dimensions: [] }, activeColorId: null, annotationsOn: [], selectedId: null },
    { onPickColor: vi.fn(), onToggleAnnotation: vi.fn(), onAssign: vi.fn(), onManage },
  );
  const btn = c.querySelector(".lm-open") as HTMLButtonElement;
  expect(btn).not.toBeNull();
  btn.click();
  expect(onManage).toHaveBeenCalledOnce();
});
```

> Si el archivo de test aún no importa `vi`, agregá `vi` al `import { describe, it, expect, vi } from "vitest";`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/layers/layersPanel.test.ts`
Expected: FAIL (TypeScript/`onManage` no existe; `.lm-open` no encontrado).

- [ ] **Step 3: Implement the button**

En `src/layers/layersPanel.ts`:

1. Agregar a la interfaz `LayersPanelHandlers`:

```ts
  onManage(): void;
```

2. Al final de `renderLayersPanel`, después del bloque `if (state.selectedId) { ... }` y antes del cierre de la función, agregar:

```ts
  // --- manage (CRUD + templates) ---
  const manage = document.createElement("button");
  manage.type = "button";
  manage.className = "btn lm-open";
  manage.textContent = "Gestionar capas…";
  manage.addEventListener("click", () => handlers.onManage());
  container.appendChild(manage);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/layers/layersPanel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/layers/layersPanel.ts src/layers/layersPanel.test.ts
git commit -m "feat(layers): 'Gestionar capas' button in the layers panel"
```

---

### Task 5: Wiring en main.ts + estilos del modal

**Files:**
- Modify: `src/main.ts`
- Modify: `src/app.css`

**Interfaces:**
- Consumes: `addColorDimension`, `addAnnotationDimension`, `renameDimension`, `deleteDimension`, `addCategory`, `updateCategory`, `deleteCategory`, `mergeTemplate` de `./layers/layerModel`; `renderLayersModal` de `./layers/layersModal`; `createTemplatesClient` de `./layers/layerTemplates`. El `onManage` agregado a `LayersPanelHandlers`.
- Produces: nada para tareas posteriores (es la última).

- [ ] **Step 1: Extend the layerModel import**

En `src/main.ts`, reemplazar la línea 26:

```ts
import type { LayerFile } from "./layers/layerModel";
```

por:

```ts
import {
  addColorDimension, addAnnotationDimension, renameDimension, deleteDimension,
  addCategory, updateCategory, deleteCategory, mergeTemplate, type LayerFile,
} from "./layers/layerModel";
```

- [ ] **Step 2: Add the new imports**

En `src/main.ts`, después de la línea 25 (`import { renderLayersPanel } from "./layers/layersPanel";`), agregar:

```ts
import { renderLayersModal, type LayersModalHandlers } from "./layers/layersModal";
import { createTemplatesClient, type TemplatesClient } from "./layers/layerTemplates";
```

- [ ] **Step 3: Add state variables**

En `src/main.ts`, después de la línea 85 (`let selectedId: string | null = null;`), agregar:

```ts
  let templatesClient: TemplatesClient | null = null;
  let layersModalEl: HTMLElement | null = null;
```

- [ ] **Step 4: Wire `onManage` into the panel handlers**

En `src/main.ts`, dentro de `renderLayers()`, en el objeto de handlers que se pasa a `renderLayersPanel` (después de `onAssign`), agregar:

```ts
        onManage: () => {
          void openLayersManager().catch(onError);
        },
```

- [ ] **Step 5: Add the manager functions**

En `src/main.ts`, justo después de la función `assignLayer` (después de su `}` de cierre, ~línea 401), agregar:

```ts
  const layersModalHandlers: LayersModalHandlers = {
    onAddColorDim: () => void applyLayerEdit((lf) => addColorDimension(lf, "Nueva capa").lf),
    onAddAnnotationDim: () => void applyLayerEdit((lf) => addAnnotationDimension(lf, "Nueva anotación").lf),
    onRenameDim: (id, label) => void applyLayerEdit((lf) => renameDimension(lf, id, label)),
    onDeleteDim: (id) => void applyLayerEdit((lf) => deleteDimension(lf, id)),
    onAddCategory: (dimId) => void applyLayerEdit((lf) => addCategory(lf, dimId, "Nueva categoría", "#AED6F1").lf),
    onUpdateCategory: (dimId, catId, patch) => void applyLayerEdit((lf) => updateCategory(lf, dimId, catId, patch)),
    onDeleteCategory: (dimId, catId) => void applyLayerEdit((lf) => deleteCategory(lf, dimId, catId)),
    onApplyTemplate: (slug) => void applyTemplate(slug),
    onSaveTemplate: (name) => void saveTemplate(name),
    onDeleteTemplate: (slug) => void deleteTemplate(slug),
  };

  // Apply a structural edit: mutate → reconcile active state → re-color (never gated
  // on the disk write) → re-render panel + modal → persist the sidecar last.
  async function applyLayerEdit(mutate: (lf: LayerFile) => LayerFile): Promise<void> {
    if (!layerFile || state.kind !== "editing") return;
    layerFile = mutate(layerFile);
    if (activeColorId && !layerFile.dimensions.some((d) => d.id === activeColorId && d.type === "color")) {
      activeColorId = null;
    }
    annotationsOn = annotationsOn.filter((id) =>
      layerFile!.dimensions.some((d) => d.id === id && d.type === "annotation"),
    );
    reapplyLayers();
    renderLayers();
    await refreshLayersModal();
    await layersClient.save(state.fileId, layerFile);
  }

  async function applyTemplate(slug: string): Promise<void> {
    if (!templatesClient) return;
    const t = await templatesClient.load(slug);
    if (!t) return;
    await applyLayerEdit((lf) => mergeTemplate(lf, t.dimensions));
  }

  async function saveTemplate(name: string): Promise<void> {
    if (!templatesClient || !layerFile || !name.trim()) return;
    await templatesClient.save(name.trim(), layerFile.dimensions);
    await refreshLayersModal();
  }

  async function deleteTemplate(slug: string): Promise<void> {
    if (!templatesClient) return;
    await templatesClient.remove(slug);
    await refreshLayersModal();
  }

  async function openLayersManager(): Promise<void> {
    if (layersModalEl || !layerFile || state.kind !== "editing") return;
    templatesClient = createTemplatesClient(api);
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "layers-modal";
    overlay.innerHTML = `
      <div class="lm-box" role="dialog" aria-modal="true" aria-label="Gestionar capas">
        <div class="lm-head">
          <h2>Gestionar capas</h2>
          <button class="btn icon-only lm-close" type="button" title="Cerrar">${icon("close")}</button>
        </div>
        <div class="lm-body"></div>
      </div>`;
    document.body.appendChild(overlay);
    layersModalEl = overlay;
    const close = (): void => {
      overlay.remove();
      layersModalEl = null;
      document.removeEventListener("keydown", onKey);
    };
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") close();
    }
    overlay.querySelector(".lm-close")!.addEventListener("click", close);
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", onKey);
    await refreshLayersModal();
  }

  async function refreshLayersModal(): Promise<void> {
    if (!layersModalEl || !layerFile || !templatesClient) return;
    const body = layersModalEl.querySelector(".lm-body") as HTMLElement;
    const templates = await templatesClient.list();
    renderLayersModal(body, { layers: layerFile, templates }, layersModalHandlers);
  }
```

> Nota: `icon` ya está importado en `main.ts` (se usa en la toolbar). `applyLayerEdit`, `applyTemplate`, etc. son declaraciones de función *hoisted*, por eso el objeto `layersModalHandlers` puede referenciarlas aunque aparezcan después.

- [ ] **Step 6: Add the modal styles**

Agregar al final de `src/app.css`:

```css
/* Gestionar capas (modal) */
.lm-box { background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); width: 560px; max-width: 92vw; max-height: 82vh; display: flex; flex-direction: column; }
.lm-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.lm-head h2 { margin: 0; font-size: 17px; }
.lm-body { padding: 12px 16px; overflow: auto; }
.lm-body h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 16px 0 8px; }
.lm-body h3:first-child { margin-top: 0; }
.lm-templates { display: flex; flex-direction: column; gap: 4px; }
.lm-template-row { display: flex; align-items: center; gap: 8px; }
.lm-template-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lm-save-row { display: flex; gap: 8px; margin-top: 8px; }
.lm-save-name { flex: 1; }
.lm-dim { border: 1px solid var(--border); border-radius: var(--radius); padding: 8px; margin-bottom: 8px; }
.lm-dim-head { display: flex; align-items: center; gap: 8px; }
.lm-dim-name { flex: 1; font-weight: 600; }
.lm-badge { font-size: 11px; color: var(--muted); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; }
.lm-cat { display: flex; align-items: center; gap: 8px; margin: 6px 0 0 8px; }
.lm-cat-color { width: 34px; height: 26px; padding: 0; border: 1px solid var(--border); border-radius: 4px; background: none; }
.lm-cat-name { flex: 1; }
.lm-add-cat { margin: 6px 0 0 8px; font-size: 12px; }
.lm-actions { display: flex; gap: 8px; margin-top: 8px; }
.lm-box input[type="text"] { background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 5px; padding: 5px 8px; }
```

- [ ] **Step 7: Verify the whole suite, types, and build**

Run: `npm test`
Expected: PASS (todos los tests, incluidos los nuevos).

Run: `npm run typecheck`
Expected: sin errores.

Run: `npm run build`
Expected: `✓ built`.

- [ ] **Step 8: Manual smoke (real app)**

Repackage and run (ver `scripts/pack.cjs` / `npm run pack:win`), abrir un diagrama, y verificar:
1. Panel Capas muestra "Gestionar capas…"; abre el modal.
2. "+ capa de color" crea una capa con 1 categoría; cambiar su color recolorea al instante si está activa.
3. "+ categoría" agrega; borrar una categoría asignada quita el color del elemento.
4. "Guardar actual como plantilla" crea `.layer-templates/<slug>.json`; "Aplicar" en otro diagrama fusiona sin pisar.
5. Cerrar con ×, click afuera y Escape.

- [ ] **Step 9: Commit**

```bash
git add src/main.ts src/app.css
git commit -m "feat(layers): wire custom-layers manager (CRUD + templates) into the app"
```

---

## Self-Review

**1. Spec coverage:**
- CRUD por documento (color + anotación) → Task 1 (mutaciones) + Task 3 (UI) + Task 5 (wiring). ✓
- Relleno con borde derivado → `deriveStroke` (Task 1), color input único (Task 3). ✓
- Plantillas en `.layer-templates/` archivo-por-plantilla, sin assignments → Task 2. ✓
- Modal con botón en panel → Task 4 + Task 5. ✓
- Aplicar = fusionar agregando lo que falta → `mergeTemplate` (Task 1), `applyTemplate` (Task 5). ✓
- Re-aplicar colores tras editar, persistir al final → `applyLayerEdit` (Task 5). ✓
- Capa activa borrada → vuelve a "Original"; anotaciones huérfanas se limpian → `applyLayerEdit` (Task 5). ✓
- `.layer-templates` oculto del árbol → Task 2 Step 2. ✓
- Tests: modelo, plantillas (fakeDir), modal → Tasks 1–3. ✓

**2. Placeholder scan:** Sin TBD/TODO; todo el código está completo en cada step. ✓

**3. Type consistency:** Nombres y firmas usados en Task 5 (`addColorDimension(...).lf`, `mergeTemplate(lf, dims)`, `renderLayersModal(container, {layers, templates}, handlers)`, `createTemplatesClient(api).{list,load,save,remove}`, `onManage`) coinciden con lo definido en Tasks 1–4. ✓
