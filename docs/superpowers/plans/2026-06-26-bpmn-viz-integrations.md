# BPMN viz/integration features (plugin port) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Obsidian plugin's bpmn-js visualization/editing features to our editor — color picker, properties panel, minimap, grid, token simulation, activity heatmap, sketchy renderer, and SVG/PNG export — gated where appropriate by a small settings panel.

**Architecture:** All features are bpmn-js `additionalModules` (framework-agnostic). We parameterize `createBpmnModeler` to assemble modules + textRenderer + properties-panel parent from a `VizSettings` object, add a `mountModeler()` step in `main.ts` that can recreate the modeler when settings change, and add toolbar buttons (Propiedades / Export SVG / Export PNG / ⚙). Always-on: color-picker, minimap, grid, properties-panel, token-simulation. Behind ⚙ (localStorage): sketchy and heatmap.

**Tech Stack:** Existing Vanilla TS + Vite + Vitest + bpmn-js; new: bpmn-js-color-picker, bpmn-js-properties-panel (+@bpmn-io/properties-panel), diagram-js-minimap, diagram-js-grid, bpmn-js-token-simulation, bpmn-js-sketchy, heatmap-ts.

## Global Constraints

- Reuse the existing editor/diff/state/fsClient untouched except where listed. The features are renderer-only (bundled by Vite, work in web and the Electron build).
- Always-on modules: `colorPicker`, `minimap`, `grid`, `propertiesPanel`(+provider), `tokenSimulation`(+`simulation-support`). Behind ⚙ settings (localStorage key `bpmn-compartida.viz`): `sketchy` (adds the sketchy renderer + Comic Sans textRenderer) and `heatmap` (activity heatmap over the token simulation).
- Settings changes apply by recreating the modeler and reloading the open file; if the open file is dirty, save first.
- Export SVG/PNG = browser/OS download (not written to the folder). PNG must actually work (SVG→canvas→PNG), unlike the plugin.
- `VizSettings` shape: `{ sketchy: boolean; heatmap: boolean }`, defaults both `false`.
- Version compatibility: the app uses bpmn-js ^17.11. Install module versions compatible with bpmn-js 17; if typecheck/build/runtime breaks, bump `bpmn-js` and `bpmn-moddle` to ^18 (the plugin proves 18 works with all these modules). After any bump, the existing editor tests AND the diff tests must stay green.
- Gates after each task: `npm test`, `npm run typecheck`, `npm run build` all green.

## File Structure

```
package.json              # MODIFY: add the 7 module deps (+ @bpmn-io/properties-panel); maybe bump bpmn-js/bpmn-moddle to ^18
src/vizSettings.ts        # NEW: VizSettings persistence (localStorage)
src/vizSettings.test.ts   # NEW
src/editor.ts             # MODIFY: selectedModuleKeys(settings) [pure]; createBpmnModeler(container, opts); ModelerLike gains saveSVG
src/editor.test.ts        # MODIFY: add selectedModuleKeys tests
src/exporters.ts          # NEW: exportSvg / exportPng / triggerDownload / svgToPngBlob (download+toBlob injectable)
src/exporters.test.ts     # NEW
src/heatmap.ts            # NEW: createHeatmapController(modeler, container) — port of the plugin heatmap (build/manual validated)
src/viz.css               # NEW: toolbar/properties-panel/settings-panel styling; module CSS imported in main.ts
src/main.ts               # MODIFY: mountModeler(), toolbar buttons, ⚙ settings panel, applyVizSettings(), wire exports
```

---

## Task 1: Dependencies + version compatibility

**Files:**
- Modify: `package.json` (+ `package-lock.json`), `src/main.ts` (CSS imports only)

**Interfaces:**
- Produces: the 7 feature modules installed and importable; module CSS loaded; existing suite + build still green. No app behavior change yet (modules not wired until Task 3/6).

- [ ] **Step 1: Install the feature modules**

```bash
npm install bpmn-js-color-picker bpmn-js-properties-panel @bpmn-io/properties-panel diagram-js-minimap diagram-js-grid bpmn-js-token-simulation bpmn-js-sketchy heatmap-ts
```

- [ ] **Step 2: Add the module CSS imports to `src/main.ts`**

After the existing `import "./diff.css";` line, add:

```ts
import "bpmn-js-color-picker/colors/color-picker.css";
import "bpmn-js-token-simulation/assets/css/bpmn-js-token-simulation.css";
import "diagram-js-minimap/assets/diagram-js-minimap.css";
import "@bpmn-io/properties-panel/dist/assets/properties-panel.css";
import "./viz.css";
```

Create an empty `src/viz.css` for now (filled in Task 6):

```css
/* viz toolbar / properties panel / settings panel — filled in Task 6 */
```

- [ ] **Step 3: Verify gates; resolve compatibility if needed**

Run: `npm test && npm run typecheck && npm run build`
Expected: existing 80 tests pass, no type errors, build succeeds.

If `npm run build`/`typecheck` fails with a bpmn-js/diagram-js version conflict (e.g., duplicate diagram-js, peer-dep mismatch, or a module importing a newer bpmn-js API), bump the core and retry:

```bash
npm install bpmn-js@^18 bpmn-moddle@^9
npm test && npm run typecheck && npm run build
```

(The diff feature uses `bpmn-moddle` + `bpmn-js-differ`; after the bump, confirm `src/bpmnDiff.test.ts` and `src/diffView.test.ts` still pass — they are part of `npm test`.) If a CSS import path doesn't resolve, check the package's `package.json` `exports`/`assets` and correct the path; do not drop the stylesheet.

> This task is dependency-establishment: its "test" is the full suite + build staying green. Record in the report exactly which versions ended up installed and whether bpmn-js was bumped.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/main.ts src/viz.css
git commit -m "chore: add bpmn-js viz/integration module deps + CSS"
```

---

## Task 2: Viz settings persistence (`vizSettings.ts`)

**Files:**
- Create: `src/vizSettings.ts`, `src/vizSettings.test.ts`

**Interfaces:**
- Produces:
  - `interface VizSettings { sketchy: boolean; heatmap: boolean }`
  - `getVizSettings(): VizSettings` (defaults `{ sketchy: false, heatmap: false }`)
  - `setVizSettings(s: VizSettings): void`

- [ ] **Step 1: Write the failing test `src/vizSettings.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getVizSettings, setVizSettings } from "./vizSettings";

describe("vizSettings", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to all-off when nothing stored", () => {
    expect(getVizSettings()).toEqual({ sketchy: false, heatmap: false });
  });

  it("persists and reads back", () => {
    setVizSettings({ sketchy: true, heatmap: false });
    expect(getVizSettings()).toEqual({ sketchy: true, heatmap: false });
  });

  it("falls back to defaults on corrupt JSON", () => {
    localStorage.setItem("bpmn-compartida.viz", "{not json");
    expect(getVizSettings()).toEqual({ sketchy: false, heatmap: false });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/vizSettings.test.ts`
Expected: FAIL — cannot find module `./vizSettings`.

- [ ] **Step 3: Write `src/vizSettings.ts`**

```ts
export interface VizSettings {
  sketchy: boolean;
  heatmap: boolean;
}

const KEY = "bpmn-compartida.viz";
const DEFAULTS: VizSettings = { sketchy: false, heatmap: false };

export function getVizSettings(): VizSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { sketchy: !!parsed.sketchy, heatmap: !!parsed.heatmap };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setVizSettings(s: VizSettings): void {
  localStorage.setItem(KEY, JSON.stringify({ sketchy: !!s.sketchy, heatmap: !!s.heatmap }));
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/vizSettings.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/vizSettings.ts src/vizSettings.test.ts
git commit -m "feat: viz settings persistence (sketchy/heatmap toggles)"
```

---

## Task 3: Parameterize the modeler (`editor.ts`)

**Files:**
- Modify: `src/editor.ts`, `src/editor.test.ts`

**Interfaces:**
- Consumes: `VizSettings` from `./vizSettings`.
- Produces:
  - `selectedModuleKeys(settings: VizSettings): string[]` (pure) — always
    `["colorPicker","minimap","grid","properties","tokenSim"]`, plus `"sketchy"` when `settings.sketchy`.
  - `ModelerLike` gains `saveSVG(): Promise<{ svg: string }>`.
  - `createBpmnModeler(container, opts?: { propertiesParent?: HTMLElement; settings?: VizSettings }): Promise<ModelerLike>`.

- [ ] **Step 1: Add the failing test to `src/editor.test.ts`**

Append:

```ts
import { selectedModuleKeys } from "./editor";

describe("selectedModuleKeys", () => {
  const base = ["colorPicker", "minimap", "grid", "properties", "tokenSim"];
  it("includes the always-on modules and no sketchy by default", () => {
    expect(selectedModuleKeys({ sketchy: false, heatmap: false })).toEqual(base);
  });
  it("adds sketchy when enabled", () => {
    expect(selectedModuleKeys({ sketchy: true, heatmap: false })).toEqual([...base, "sketchy"]);
  });
  it("heatmap does not change the module list", () => {
    expect(selectedModuleKeys({ sketchy: false, heatmap: true })).toEqual(base);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/editor.test.ts`
Expected: FAIL — `selectedModuleKeys` not exported.

- [ ] **Step 3: Edit `src/editor.ts`**

Add `import type { VizSettings } from "./vizSettings";` at the top.

Add `saveSVG` to `ModelerLike`:

```ts
export interface ModelerLike {
  importXML(xml: string): Promise<unknown>;
  saveXML(opts?: { format?: boolean }): Promise<{ xml?: string }>;
  saveSVG(): Promise<{ svg: string }>;
  on(event: string, cb: () => void): void;
  get(name: string): any;
}
```

Add the pure selector:

```ts
export function selectedModuleKeys(settings: VizSettings): string[] {
  const keys = ["colorPicker", "minimap", "grid", "properties", "tokenSim"];
  if (settings.sketchy) keys.push("sketchy");
  return keys;
}
```

Replace `createBpmnModeler` with the parameterized version (dynamic imports keep the bpmn-js chunk split):

```ts
const COMIC_SANS_TEXT_RENDERER = {
  defaultStyle: { fontFamily: '"Comic Sans MS"', fontWeight: "normal", fontSize: 14, lineHeight: 1.1 },
  externalStyle: { fontSize: 14, lineHeight: 1.1 },
};

export async function createBpmnModeler(
  container: HTMLElement,
  opts: { propertiesParent?: HTMLElement; settings?: VizSettings } = {},
): Promise<ModelerLike> {
  const settings = opts.settings ?? { sketchy: false, heatmap: false };
  const keys = selectedModuleKeys(settings);

  const [
    { default: BpmnModeler },
    colorPicker,
    propertiesPanel,
    minimap,
    grid,
    tokenSim,
    simSupport,
    sketchy,
  ] = await Promise.all([
    import("bpmn-js/lib/Modeler"),
    import("bpmn-js-color-picker"),
    import("bpmn-js-properties-panel"),
    import("diagram-js-minimap"),
    import("diagram-js-grid"),
    import("bpmn-js-token-simulation"),
    import("bpmn-js-token-simulation/lib/simulation-support"),
    import("bpmn-js-sketchy"),
  ]);

  const byKey: Record<string, unknown> = {
    colorPicker: colorPicker.default,
    properties: [propertiesPanel.BpmnPropertiesPanelModule, propertiesPanel.BpmnPropertiesProviderModule],
    minimap: minimap.default,
    grid: grid.default,
    tokenSim: [tokenSim.default, simSupport.default],
    sketchy: sketchy.default,
  };
  const additionalModules = keys.flatMap((k) => {
    const m = byKey[k];
    return Array.isArray(m) ? m : [m];
  });

  const config: Record<string, unknown> = { container, additionalModules };
  if (opts.propertiesParent) config.propertiesPanel = { parent: opts.propertiesParent };
  if (settings.sketchy) config.textRenderer = COMIC_SANS_TEXT_RENDERER;

  return new BpmnModeler(config) as unknown as ModelerLike;
}
```

- [ ] **Step 4: Run the editor test — expect PASS**

Run: `npx vitest run src/editor.test.ts`
Expected: PASS (existing editor tests + 3 new `selectedModuleKeys` tests).

- [ ] **Step 5: Verify build (the dynamic imports must resolve)**

Run: `npm run typecheck && npm run build`
Expected: clean + build succeeds. If a module's import shape differs (e.g., a named vs default export), adjust the destructuring/`byKey` mapping minimally to match the actual package, keeping `selectedModuleKeys` and the public signature unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/editor.ts src/editor.test.ts
git commit -m "feat: parameterized modeler (modules per settings, properties panel, sketchy)"
```

---

## Task 4: Exporters (`exporters.ts`)

**Files:**
- Create: `src/exporters.ts`, `src/exporters.test.ts`

**Interfaces:**
- Consumes: `ModelerLike` (`saveSVG`).
- Produces:
  - `triggerDownload(content: Blob | string, filename: string, mime: string): void`
  - `svgToPngBlob(svg: string): Promise<Blob | null>`
  - `exportSvg(modeler: ModelerLike, baseName: string, download?, ): Promise<void>`
  - `exportPng(modeler: ModelerLike, baseName: string, download?, toBlob?): Promise<void>`
  - `download` and `toBlob` params are injectable (default to the real impls) for testing.

- [ ] **Step 1: Write the failing test `src/exporters.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { exportSvg, exportPng } from "./exporters";

function fakeModeler(svg: string) {
  return { async saveSVG() { return { svg }; } } as any;
}

describe("exporters", () => {
  it("exportSvg downloads the SVG with a .svg filename", async () => {
    const download = vi.fn();
    await exportSvg(fakeModeler("<svg/>"), "proceso", download);
    expect(download).toHaveBeenCalledWith("<svg/>", "proceso.svg", "image/svg+xml");
  });

  it("exportPng converts to a PNG blob and downloads with .png", async () => {
    const download = vi.fn();
    const blob = new Blob(["x"], { type: "image/png" });
    const toBlob = vi.fn().mockResolvedValue(blob);
    await exportPng(fakeModeler("<svg/>"), "proceso", download, toBlob);
    expect(toBlob).toHaveBeenCalledWith("<svg/>");
    expect(download).toHaveBeenCalledWith(blob, "proceso.png", "image/png");
  });

  it("exportPng throws when conversion yields null", async () => {
    const toBlob = vi.fn().mockResolvedValue(null);
    await expect(exportPng(fakeModeler("<svg/>"), "p", vi.fn(), toBlob)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/exporters.test.ts`
Expected: FAIL — cannot find module `./exporters`.

- [ ] **Step 3: Write `src/exporters.ts`**

```ts
import type { ModelerLike } from "./editor";

export function triggerDownload(content: Blob | string, filename: string, mime: string): void {
  const blob = typeof content === "string" ? new Blob([content], { type: mime }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Rasterize an SVG string to a PNG blob via an offscreen canvas.
export function svgToPngBlob(svg: string): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    const sized = /width=|height=/.test(svg) ? svg : svg;
    const img = new Image();
    const svgUrl = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml" }));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width || 1200;
      canvas.height = img.naturalHeight || img.height || 800;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(svgUrl);
        resolve(null);
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(svgUrl);
      canvas.toBlob((b) => resolve(b), "image/png");
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(svgUrl);
      reject(e instanceof Error ? e : new Error("svg load failed"));
    };
    img.src = svgUrl;
  });
}

export async function exportSvg(
  modeler: ModelerLike,
  baseName: string,
  download: (c: Blob | string, f: string, m: string) => void = triggerDownload,
): Promise<void> {
  const { svg } = await modeler.saveSVG();
  download(svg, `${baseName}.svg`, "image/svg+xml");
}

export async function exportPng(
  modeler: ModelerLike,
  baseName: string,
  download: (c: Blob | string, f: string, m: string) => void = triggerDownload,
  toBlob: (svg: string) => Promise<Blob | null> = svgToPngBlob,
): Promise<void> {
  const { svg } = await modeler.saveSVG();
  const blob = await toBlob(svg);
  if (!blob) throw new Error("No se pudo generar el PNG");
  download(blob, `${baseName}.png`, "image/png");
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/exporters.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/exporters.ts src/exporters.test.ts
git commit -m "feat: SVG/PNG exporters (download + real SVG→PNG rasterization)"
```

---

## Task 5: Heatmap controller (`heatmap.ts`)

**Files:**
- Create: `src/heatmap.ts`

**Interfaces:**
- Consumes: `ModelerLike` (`get("canvas"|"elementRegistry"|"simulationTrace"|"simulationSupport")`, `on`), `heatmap-ts`.
- Produces: `createHeatmapController(modeler: ModelerLike, container: HTMLElement): { start(): void; stop(): void }`.
- Validated by typecheck + build + manual (DOM + token-simulation runtime; no unit test, consistent with `editor.ts`/`diffView.ts` glue).

- [ ] **Step 1: Write `src/heatmap.ts`** (port of the plugin's heatmap, encapsulated)

```ts
import type { ModelerLike } from "./editor";
import HeatMap, { type DataPoint } from "heatmap-ts";

// Activity heatmap over the token simulation. Beta: known zoom-rendering TODO
// (positions use the current viewbox; re-render on zoom is not wired).
export function createHeatmapController(modeler: ModelerLike, container: HTMLElement) {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let heatMap: HeatMap | null = null;

  function start(): void {
    const canvas = modeler.get("canvas");
    const registry = modeler.get("elementRegistry");
    const simulationTrace = modeler.get("simulationTrace");
    const simulationSupport = modeler.get("simulationSupport");

    heatMap = new HeatMap({
      container,
      maxOpacity: 0.8,
      radius: 50,
      blur: 0.8,
      width: container.clientWidth,
      height: container.clientHeight,
    });

    const counts = new Map<string, number>();
    let lastIndex = 0;
    simulationTrace.start();

    const update = () => {
      const history: string[] = simulationSupport.getHistory();
      for (let i = lastIndex; i < history.length; i++) {
        if (!history[i].startsWith("Flow")) {
          counts.set(history[i], (counts.get(history[i]) || 0) + 1);
        }
        lastIndex = i + 1;
      }
      const vb = canvas.viewbox();
      const data: DataPoint[] = [];
      for (const [id, value] of counts) {
        const el = registry.get(id);
        if (!el) continue;
        data.push({
          x: vb.scale * (el.x + el.width / 2 - vb.x),
          y: vb.scale * (el.y + el.height / 2 - vb.y),
          value: value * 4,
        });
      }
      heatMap?.setData({ data });
    };

    intervalId = setInterval(update, 1000);

    modeler.on("tokenSimulation.toggleMode", () => {
      simulationTrace.stop();
      counts.clear();
      lastIndex = 0;
      heatMap?.setData({ data: [] });
      simulationTrace.start();
    });
  }

  function stop(): void {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    heatMap?.setData({ data: [] });
  }

  return { start, stop };
}
```

- [ ] **Step 2: Verify gates**

Run: `npm run typecheck && npm run build`
Expected: clean + build succeeds. If `heatmap-ts`'s type export differs (e.g., no named `DataPoint`), adjust the import to the actual shape, keeping the controller's public API the same.

- [ ] **Step 3: Commit**

```bash
git add src/heatmap.ts
git commit -m "feat: token-simulation activity heatmap controller (beta)"
```

---

## Task 6: Wire it into the app (`main.ts` + `viz.css`)

**Files:**
- Modify: `src/main.ts`, `src/viz.css`

**Interfaces:**
- Consumes: `createBpmnModeler` (new signature), `getVizSettings`/`setVizSettings`, `exportSvg`/`exportPng`, `createHeatmapController`.
- Produces: the integrated UI. `main.ts` is validated by typecheck + build + the manual checklist (no unit test, as today).

- [ ] **Step 1: Add imports to `src/main.ts`**

Alongside the existing imports add:

```ts
import { getVizSettings, setVizSettings, type VizSettings } from "./vizSettings";
import { exportSvg, exportPng } from "./exporters";
import { createHeatmapController } from "./heatmap";
```

- [ ] **Step 2: Add toolbar buttons + properties/settings containers to the `startApp` shell**

In `startApp`, change the shell `innerHTML` so the `<header>` includes the new buttons and add a properties-panel aside + a hidden settings panel. Replace the current header/main/footer template with:

```ts
    root.innerHTML = `
      <header>
        <span id="who"></span>
        <button id="newfile">Nuevo diagrama</button>
        <button id="props">Propiedades</button>
        <button id="exportSvg">Exportar SVG</button>
        <button id="exportPng">Exportar PNG</button>
        <button id="settings">⚙</button>
        <button id="changedir">Cambiar carpeta</button>
      </header>
      <div id="vizsettings" class="viz-settings" hidden></div>
      <div id="sync"></div>
      <div id="conflict"></div>
      <main>
        <aside id="files"></aside>
        <section id="canvas" style="height:80vh"></section>
        <aside id="propspanel" class="props-panel" hidden></aside>
        <aside id="history" hidden></aside>
      </main>
      <footer>
        <button id="save" hidden>Guardar</button>
        <button id="checkin" hidden>Check in</button>
        <button id="close" hidden>Cerrar</button>
      </footer>`;
```

- [ ] **Step 3: Replace the modeler-creation block in `startApp` with a `mountModeler()` function**

In `startApp`, the current code does:
```ts
    const modeler = (await createBpmnModeler($("canvas") as HTMLElement)) as ModelerLike;
    editor = createEditor(modeler);
    diffView = createDiffView(modeler, editor);
    editor.onDirtyChange((dirty) => {
      state = reduce(state, { type: "dirtyChanged", dirty });
    });
```
Replace those lines with a call `await mountModeler();` and add these declarations near the other outer `let`s at the top of `bootstrap` (next to `let editor` / `let diffView`):

```ts
  let modeler: ModelerLike;
  let heatmap: { start(): void; stop(): void } | null = null;
```

Then define `mountModeler` inside `bootstrap` (e.g. just above `startApp`):

```ts
  async function mountModeler(): Promise<void> {
    const $ = (id: string) => document.getElementById(id)!;
    const canvasEl = $("canvas") as HTMLElement;
    const propsEl = $("propspanel") as HTMLElement;
    const settings = getVizSettings();

    if (heatmap) {
      heatmap.stop();
      heatmap = null;
    }
    if (modeler && typeof (modeler as any).destroy === "function") {
      (modeler as any).destroy();
    }
    canvasEl.innerHTML = "";

    modeler = await createBpmnModeler(canvasEl, { propertiesParent: propsEl, settings });
    editor = createEditor(modeler);
    diffView = createDiffView(modeler, editor);
    editor.onDirtyChange((dirty) => {
      state = reduce(state, { type: "dirtyChanged", dirty });
    });
    if (settings.heatmap) {
      heatmap = createHeatmapController(modeler, canvasEl);
      heatmap.start();
    }
  }
```

- [ ] **Step 4: Wire the new buttons (in `startApp`, where the other button listeners are set up)**

Add:

```ts
    $("props").addEventListener("click", () => {
      (document.getElementById("propspanel") as HTMLElement).hidden =
        !(document.getElementById("propspanel") as HTMLElement).hidden;
    });
    $("exportSvg").addEventListener("click", guard(async () => {
      if (state.kind === "editing") await exportSvg(modeler, baseName(state.fileId));
    }));
    $("exportPng").addEventListener("click", guard(async () => {
      if (state.kind === "editing") await exportPng(modeler, baseName(state.fileId));
    }));
    $("settings").addEventListener("click", () => renderVizSettings());
```

Add a `baseName` helper inside `bootstrap` (filename without `.bpmn`):

```ts
  const baseName = (id: string) => id.replace(/\.bpmn$/i, "");
```

- [ ] **Step 5: Add the ⚙ settings panel + `applyVizSettings`**

Add inside `bootstrap`:

```ts
  function renderVizSettings(): void {
    const panel = document.getElementById("vizsettings") as HTMLElement;
    if (!panel.hidden) {
      panel.hidden = true;
      return;
    }
    const s = getVizSettings();
    panel.innerHTML = `
      <label><input type="checkbox" id="set-sketchy" ${s.sketchy ? "checked" : ""}/> Estilo sketchy (dibujado a mano)</label>
      <label><input type="checkbox" id="set-heatmap" ${s.heatmap ? "checked" : ""}/> Heatmap de simulación (beta)</label>
      <p class="hint">Se aplica recreando el editor; si tenés cambios sin guardar, se guardan primero.</p>`;
    panel.hidden = false;
    const onToggle = () => {
      const next: VizSettings = {
        sketchy: (document.getElementById("set-sketchy") as HTMLInputElement).checked,
        heatmap: (document.getElementById("set-heatmap") as HTMLInputElement).checked,
      };
      void applyVizSettings(next).catch(onError);
    };
    (document.getElementById("set-sketchy") as HTMLInputElement).addEventListener("change", onToggle);
    (document.getElementById("set-heatmap") as HTMLInputElement).addEventListener("change", onToggle);
  }

  async function applyVizSettings(next: VizSettings): Promise<void> {
    setVizSettings(next);
    // Preserve the open file across the modeler rebuild.
    const open = state.kind === "editing" ? state.fileId : null;
    if (open && state.kind === "editing" && state.dirty) await save(open);
    await mountModeler();
    if (open) {
      const xml = await api.getXml(open);
      await editor.load(xml);
      editor.setReadOnly(state.kind === "editing" && state.lock !== "mine");
    }
  }
```

- [ ] **Step 6: Stop the heatmap on logout/changedir/close**

In `showFolderGate` (top, where `pollTimer` is cleared) add:

```ts
    if (heatmap) {
      heatmap.stop();
      heatmap = null;
    }
```

- [ ] **Step 7: Fill `src/viz.css`**

```css
header button { margin-right: 6px; }
.viz-settings { background: #f3f4f6; padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
.viz-settings label { display: block; margin: 4px 0; font-size: 14px; }
.viz-settings .hint { font-size: 12px; color: #6b7280; margin: 6px 0 0; }
.props-panel { width: 320px; overflow: auto; border-left: 1px solid #e5e7eb; }
main { display: flex; }
#canvas { flex: 1; }
```

- [ ] **Step 8: Verify gates**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests pass (no new failures), typecheck clean, build succeeds. `main.ts` has no unit test; these gates validate it.

- [ ] **Step 9: Manual smoke (best-effort; document if headless)**

Run: `npm run dev`, open in Chrome/Edge, pick a folder, open a `.bpmn`. Verify: minimap + grid visible; **Propiedades** toggles the panel; color-picker appears on element selection (context pad); the token-simulation play button appears; **Exportar SVG**/**PNG** download files; **⚙** toggles sketchy/heatmap and the editor rebuilds keeping the open diagram. If headless, note "skipped" and rely on the build.

- [ ] **Step 10: Commit**

```bash
git add src/main.ts src/viz.css
git commit -m "feat: integrate viz features into the app (toolbar, properties, export, settings)"
```

---

## Self-Review notes (resolved)

- **Spec coverage:** color-picker/minimap/grid/properties/token-sim always-on (Task 3 modules + Task 6 wiring); sketchy + heatmap behind ⚙ (Task 2 settings, Task 3 sketchy module, Task 5 heatmap, Task 6 panel/apply); export SVG/PNG download (Task 4 + Task 6 buttons); compat risk (Task 1). All spec sections map to a task.
- **Type consistency:** `VizSettings` `{sketchy,heatmap}` is identical across vizSettings/editor/main. `selectedModuleKeys` keys match the `byKey` map in `createBpmnModeler`. `ModelerLike.saveSVG` added in Task 3 is consumed by Task 4 exporters. `mountModeler`/`applyVizSettings`/`baseName`/`heatmap` are all defined in `bootstrap` before use.
- **Empirical parts (flagged, not placeholders):** Task 1 version compat and the Task 3/5 "adjust import shape if the package differs" are real decision procedures with concrete verification (suite + build), because exact dependency interop can't be known until installed. The implementer records the resolved versions/shapes in the report.
- **Reuse:** state/fsClient/folder/ipcFs/watcher/lockManager/history/bpmnDiff/diffView/syncConflict/identity unchanged. `editor.ts` gains a backward-compatible `createBpmnModeler` (opts optional) + a pure helper; `main.ts` gains the toolbar/settings/mount refactor.
```
