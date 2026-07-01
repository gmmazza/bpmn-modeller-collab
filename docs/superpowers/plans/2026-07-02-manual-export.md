# Plan 4 — Manual lineal + exportar a HTML Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Generar un **manual lineal** del proceso: recorre el flujo del diagrama (inicio → `sequenceFlow`) y arma un documento de corrido — introducción (`_proceso.md`) + una sección por paso con su nota (o "sin documentar") — visible en la app y **exportable a un HTML autocontenido** (imágenes incrustadas), imprimible a PDF desde el navegador.

**Architecture:** `flowOrder.ts` (puro) ordena los ids de elementos recorriendo el grafo desde los eventos de inicio; un adaptador extrae el grafo de bpmn-js. `manualBuild.ts` (puro) compone el markdown del manual desde `_proceso.md` + las notas por elemento. Se renderiza con el `renderMarkdown` seguro del Plan 1. `manualExport.ts` envuelve el HTML en un documento standalone e incrusta las imágenes `assets/…` como data URIs (leídas por `docsClient.readAsset`).

**Tech Stack:** TypeScript + Vite, Vitest (happy-dom), bpmn-js, `markdown-it`/DOMPurify (Plan 1).

## Global Constraints

- **Orden del flujo:** DFS desde el/los evento(s) de inicio siguiendo las aristas salientes en orden; set de visitados (no loops); los elementos inalcanzables se **anexan al final** (nunca se pierden).
- **Render seguro:** el manual se renderiza con `renderMarkdown` (Plan 1, markdown-it + DOMPurify). El export es HTML autocontenido con imágenes como **data URIs** (base64) — no depende de rutas del disco.
- **Reuso:** `docsClient.readNote`/`readProcessNote`/`readAsset`, `base64.bytesToBase64`, el adaptador de elementos.
- **Tests:** Vitest happy-dom. Lógica pura (orden de flujo, build del markdown, wrap+inline del export) testeada; el wiring bpmn-js/UI se cierra con build + manual.
- **Gate por tarea:** `npm test` + `npm run typecheck`; wiring agrega `npm run build`.
- **Rama:** `feat/plan4-manual` (apilada sobre Plan 3).

---

### Task 1: `flowOrder.ts` — orden del flujo (puro) + adaptador

**Files:**
- Create: `src/processDocs/flowOrder.ts`
- Test: `src/processDocs/flowOrder.test.ts`

**Interfaces:**
- Produces:
  - `interface FlowNode { id: string; name: string; type: string }`
  - `interface FlowGraph { nodes: FlowNode[]; edges: Array<{ source: string; target: string }>; starts: string[] }`
  - `function orderFlow(graph: FlowGraph): string[]` — DFS desde `starts` (en orden) siguiendo `edges`; visitados; inalcanzables al final.
  - `function graphFromModeler(modeler: { get(name: string): any }): FlowGraph` — construye el grafo desde `elementRegistry` (flow nodes documentables + `sequenceFlow`; starts = eventos cuyo tipo termina en `StartEvent`, o si no hay, el primer nodo).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { orderFlow, type FlowGraph } from "./flowOrder";

describe("orderFlow", () => {
  it("orders a simple linear flow from the start", () => {
    const g: FlowGraph = {
      nodes: [{ id: "S", name: "inicio", type: "bpmn:StartEvent" }, { id: "A", name: "a", type: "bpmn:Task" }, { id: "E", name: "fin", type: "bpmn:EndEvent" }],
      edges: [{ source: "S", target: "A" }, { source: "A", target: "E" }],
      starts: ["S"],
    };
    expect(orderFlow(g)).toEqual(["S", "A", "E"]);
  });

  it("follows gateway branches depth-first in edge order", () => {
    const g: FlowGraph = {
      nodes: ["S", "G", "A", "B", "E"].map((id) => ({ id, name: id, type: "bpmn:Task" })),
      edges: [
        { source: "S", target: "G" }, { source: "G", target: "A" }, { source: "G", target: "B" },
        { source: "A", target: "E" }, { source: "B", target: "E" },
      ],
      starts: ["S"],
    };
    expect(orderFlow(g)).toEqual(["S", "G", "A", "E", "B"]);
  });

  it("appends unreachable nodes at the end and does not loop", () => {
    const g: FlowGraph = {
      nodes: ["S", "A", "X"].map((id) => ({ id, name: id, type: "bpmn:Task" })),
      edges: [{ source: "S", target: "A" }, { source: "A", target: "S" }], // loop S->A->S
      starts: ["S"],
    };
    expect(orderFlow(g)).toEqual(["S", "A", "X"]); // X unreachable, appended; no infinite loop
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/flowOrder.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/flowOrder.ts
export interface FlowNode { id: string; name: string; type: string }
export interface FlowGraph {
  nodes: FlowNode[];
  edges: Array<{ source: string; target: string }>;
  starts: string[];
}

export function orderFlow(graph: FlowGraph): string[] {
  const out: string[] = [];
  const visited = new Set<string>();
  const outgoing = new Map<string, string[]>();
  for (const e of graph.edges) {
    const list = outgoing.get(e.source) ?? [];
    list.push(e.target);
    outgoing.set(e.source, list);
  }
  const known = new Set(graph.nodes.map((n) => n.id));
  function dfs(id: string): void {
    if (visited.has(id) || !known.has(id)) return;
    visited.add(id);
    out.push(id);
    for (const t of outgoing.get(id) ?? []) dfs(t);
  }
  for (const s of graph.starts) dfs(s);
  for (const n of graph.nodes) if (!visited.has(n.id)) out.push(n.id);
  return out;
}

export function graphFromModeler(modeler: { get(name: string): any }): FlowGraph {
  const reg = modeler.get("elementRegistry");
  const all: any[] = reg.getAll();
  const nodes: FlowNode[] = [];
  const edges: Array<{ source: string; target: string }> = [];
  const incoming = new Set<string>();
  for (const el of all) {
    const type: string = el.businessObject?.$type ?? "";
    if (type === "bpmn:SequenceFlow") {
      const source = el.businessObject?.sourceRef?.id ?? el.source?.id;
      const target = el.businessObject?.targetRef?.id ?? el.target?.id;
      if (source && target) { edges.push({ source, target }); incoming.add(target); }
    } else if (type && type !== "bpmn:Process" && type !== "bpmn:Collaboration" && type !== "bpmn:Participant" && !type.startsWith("bpmndi") && type !== "label") {
      nodes.push({ id: el.id, name: el.businessObject?.name ?? "", type });
    }
  }
  let starts = nodes.filter((n) => n.type.endsWith("StartEvent")).map((n) => n.id);
  if (starts.length === 0) starts = nodes.filter((n) => !incoming.has(n.id)).map((n) => n.id);
  return { nodes, edges, starts };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/flowOrder.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add src/processDocs/flowOrder.ts src/processDocs/flowOrder.test.ts
git commit -m "feat(docs): flow ordering (DFS from start) + bpmn graph adapter"
```

---

### Task 2: `manualBuild.ts` — markdown del manual (puro)

**Files:**
- Create: `src/processDocs/manualBuild.ts`
- Test: `src/processDocs/manualBuild.test.ts`

**Interfaces:**
- Produces:
  - `interface ManualStep { name: string; type: string; note: string | null }`
  - `function friendlyType(type: string): string`
  - `function buildManualMarkdown(processName: string, processNote: string | null, steps: ManualStep[]): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildManualMarkdown, friendlyType } from "./manualBuild";

describe("manualBuild", () => {
  it("maps bpmn types to friendly labels", () => {
    expect(friendlyType("bpmn:Task")).toBe("Tarea");
    expect(friendlyType("bpmn:ExclusiveGateway")).toBe("Compuerta");
    expect(friendlyType("bpmn:StartEvent")).toBe("Evento");
    expect(friendlyType("bpmn:CallActivity")).toBe("Subproceso");
  });

  it("builds a manual with intro and one section per step", () => {
    const md = buildManualMarkdown("Validación", "Este proceso valida facturas.", [
      { name: "Validar factura", type: "bpmn:Task", note: "Revisar el PDF." },
      { name: "¿OK?", type: "bpmn:ExclusiveGateway", note: null },
    ]);
    expect(md).toContain("# Manual: Validación");
    expect(md).toContain("Este proceso valida facturas.");
    expect(md).toContain("## 1. Validar factura");
    expect(md).toContain("Revisar el PDF.");
    expect(md).toContain("## 2. ¿OK?");
    expect(md).toContain("_Sin documentar._");
  });

  it("uses a placeholder name for unnamed steps", () => {
    const md = buildManualMarkdown("P", null, [{ name: "", type: "bpmn:Task", note: null }]);
    expect(md).toContain("## 1. (sin nombre)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/manualBuild.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/manualBuild.ts
export interface ManualStep { name: string; type: string; note: string | null }

export function friendlyType(type: string): string {
  if (type.endsWith("Task")) return "Tarea";
  if (type.endsWith("Gateway")) return "Compuerta";
  if (type.endsWith("Event")) return "Evento";
  if (type === "bpmn:SubProcess" || type === "bpmn:CallActivity") return "Subproceso";
  return type.replace(/^bpmn:/, "");
}

export function buildManualMarkdown(processName: string, processNote: string | null, steps: ManualStep[]): string {
  const parts: string[] = [`# Manual: ${processName}`, ""];
  if (processNote && processNote.trim()) parts.push(processNote.trim(), "");
  parts.push("---", "");
  steps.forEach((s, i) => {
    const name = s.name && s.name.trim() ? s.name : "(sin nombre)";
    parts.push(`## ${i + 1}. ${name}`, `*${friendlyType(s.type)}*`, "");
    parts.push(s.note && s.note.trim() ? s.note.trim() : "_Sin documentar._", "");
  });
  return parts.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/manualBuild.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/manualBuild.ts src/processDocs/manualBuild.test.ts
git commit -m "feat(docs): build linear manual markdown from steps"
```

---

### Task 3: `manualExport.ts` — HTML autocontenido + imágenes incrustadas

**Files:**
- Create: `src/processDocs/manualExport.ts`
- Test: `src/processDocs/manualExport.test.ts`

**Interfaces:**
- Produces:
  - `function manualHtmlDocument(title: string, bodyHtml: string): string` — documento HTML completo con CSS mínimo.
  - `async function inlineImages(html: string, toDataUri: (ref: string) => Promise<string | null>): Promise<string>` — reemplaza `src="assets/…"` por el data URI (o deja el `src` si no resuelve).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { manualHtmlDocument, inlineImages } from "./manualExport";

describe("manualExport", () => {
  it("wraps body html in a standalone document with the title", () => {
    const doc = manualHtmlDocument("Mi Proceso", "<h1>Hola</h1>");
    expect(doc).toContain("<!DOCTYPE html>");
    expect(doc).toContain("<title>Mi Proceso</title>");
    expect(doc).toContain("<h1>Hola</h1>");
    expect(doc).toContain("<style>");
  });

  it("inlines an assets/ image as a data URI", async () => {
    const toDataUri = vi.fn(async (ref: string) => (ref === "assets/x.png" ? "data:image/png;base64,AAAA" : null));
    const out = await inlineImages('<img src="assets/x.png"> <img src="https://ext/y.png">', toDataUri);
    expect(out).toContain('src="data:image/png;base64,AAAA"');
    expect(out).toContain('src="https://ext/y.png"'); // external left untouched
    expect(toDataUri).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/manualExport.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/manualExport.ts
const STYLE = `body{font-family:system-ui,Segoe UI,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#1f2937}
h1,h2{line-height:1.25}h2{margin-top:2rem;border-top:1px solid #e5e7eb;padding-top:1rem}
img{max-width:100%}iframe{width:100%;aspect-ratio:16/9;border:0}code{background:#f3f4f6;padding:0 3px;border-radius:3px}
blockquote{border-left:3px solid #e5e7eb;margin:0;padding-left:12px;color:#6b7280}`;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function manualHtmlDocument(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title><style>${STYLE}</style></head>
<body>${bodyHtml}</body></html>`;
}

export async function inlineImages(html: string, toDataUri: (ref: string) => Promise<string | null>): Promise<string> {
  const refs = new Set<string>();
  const re = /<img\b[^>]*\bsrc="(assets\/[^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) refs.add(m[1]);
  let out = html;
  for (const ref of refs) {
    const uri = await toDataUri(ref);
    if (uri) out = out.split(`src="${ref}"`).join(`src="${uri}"`);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/manualExport.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/manualExport.ts src/processDocs/manualExport.test.ts
git commit -m "feat(docs): standalone HTML manual document + image inlining"
```

---

### Task 4: Vista "Manual" + generar/exportar + integración

**Files:**
- Create: `src/processDocs/manualController.ts` (orquesta: junta pasos, construye, muestra, exporta)
- Modify: `src/main.ts` (botón "Manual" + montaje del modal)
- Modify: `src/app.css` (estilos del modal del manual)
- Test: `src/processDocs/manualController.test.ts`

**Interfaces:**
- Consumes: `orderFlow`/`graphFromModeler`/`FlowNode` (T1), `buildManualMarkdown`/`ManualStep` (T2), `manualHtmlDocument`/`inlineImages` (T3), `renderMarkdown` (Plan 1), `base64.bytesToBase64`.
- Produces:
  - `interface ManualDeps { graph(): FlowGraph; processName(): string; readProcessNote(): Promise<string | null>; readNote(elementId: string): Promise<string | null>; readAsset(name: string): Promise<Uint8Array | null> }`
  - `async function buildManual(deps: ManualDeps): Promise<{ markdown: string; html: string }>` — junta el orden + notas, construye el markdown, lo renderiza.
  - `async function exportManualHtml(deps: ManualDeps): Promise<string>` — construye + inlinea imágenes + envuelve en documento standalone.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildManual, exportManualHtml, type ManualDeps } from "./manualController";
import type { FlowGraph } from "./flowOrder";

function deps(): ManualDeps {
  const graph: FlowGraph = {
    nodes: [{ id: "S", name: "inicio", type: "bpmn:StartEvent" }, { id: "A", name: "Validar", type: "bpmn:Task" }],
    edges: [{ source: "S", target: "A" }],
    starts: ["S"],
  };
  return {
    graph: () => graph,
    processName: () => "Proc",
    readProcessNote: async () => "Intro del proceso.",
    readNote: async (id) => (id === "A" ? "---\nelement: A\n---\nContenido con ![](assets/x.png)" : null),
    readAsset: async (name) => (name === "x.png" ? new Uint8Array([1, 2, 3]) : null),
  };
}

describe("manualController", () => {
  it("builds a manual with intro, ordered steps and rendered html", async () => {
    const { markdown, html } = await buildManual(deps());
    expect(markdown).toContain("# Manual: Proc");
    expect(markdown).toContain("Intro del proceso.");
    expect(markdown).toContain("## 1. inicio");
    expect(markdown).toContain("## 2. Validar");
    expect(markdown).toContain("Contenido con"); // frontmatter stripped, body kept
    expect(html).toContain("<h1>Manual: Proc</h1>");
  });

  it("exports a standalone HTML with the asset inlined as a data URI", async () => {
    const doc = await exportManualHtml(deps());
    expect(doc).toContain("<!DOCTYPE html>");
    expect(doc).toContain("data:image/png;base64,"); // x.png inlined
    expect(doc).not.toContain('src="assets/x.png"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/manualController.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/manualController.ts
import { orderFlow, type FlowGraph, type FlowNode } from "./flowOrder";
import { buildManualMarkdown, type ManualStep } from "./manualBuild";
import { manualHtmlDocument, inlineImages } from "./manualExport";
import { renderMarkdown } from "./markdownRender";
import { parseFrontmatter } from "./frontmatter";
import { bytesToBase64 } from "./base64";

export interface ManualDeps {
  graph(): FlowGraph;
  processName(): string;
  readProcessNote(): Promise<string | null>;
  readNote(elementId: string): Promise<string | null>;
  readAsset(name: string): Promise<Uint8Array | null>;
}

async function assembleMarkdown(deps: ManualDeps): Promise<string> {
  const graph = deps.graph();
  const byId = new Map<string, FlowNode>(graph.nodes.map((n) => [n.id, n]));
  const order = orderFlow(graph);
  const processNoteRaw = await deps.readProcessNote();
  const processNote = processNoteRaw ? parseFrontmatter(processNoteRaw).body : null;
  const steps: ManualStep[] = [];
  for (const id of order) {
    const node = byId.get(id);
    if (!node) continue;
    const raw = await deps.readNote(id);
    steps.push({ name: node.name, type: node.type, note: raw ? parseFrontmatter(raw).body : null });
  }
  return buildManualMarkdown(deps.processName(), processNote, steps);
}

export async function buildManual(deps: ManualDeps): Promise<{ markdown: string; html: string }> {
  const markdown = await assembleMarkdown(deps);
  return { markdown, html: renderMarkdown(markdown) };
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" };

export async function exportManualHtml(deps: ManualDeps): Promise<string> {
  const { html } = await buildManual(deps);
  const inlined = await inlineImages(html, async (ref) => {
    const name = ref.replace(/^assets\//, "");
    const bytes = await deps.readAsset(name);
    if (!bytes) return null;
    const ext = name.split(".").pop()?.toLowerCase() ?? "png";
    return `data:${MIME[ext] ?? "application/octet-stream"};base64,${bytesToBase64(bytes)}`;
  });
  return manualHtmlDocument(`Manual: ${deps.processName()}`, inlined);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/manualController.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire into `main.ts`**

Add a toolbar button `manual` (near `exportSvg`/`exportPng`, `src/main.ts` ~line 558):
```ts
          <button class="btn icon-only" id="manual" type="button" title="Manual del proceso">${icon("help")}<span style="font-size:11px">Manual</span></button>
```
Build the `ManualDeps` and wire a click that shows a modal with the rendered manual + an "Exportar HTML" button. Add near the other button handlers:
```ts
    function manualDeps(): import("./processDocs/manualController").ManualDeps {
      return {
        graph: () => graphFromModeler(modeler),
        processName: () => docsFileId.replace(/\.bpmn$/i, "").split("/").pop() ?? docsFileId,
        readProcessNote: () => docsClient.readProcessNote(docsFileId),
        readNote: (id) => docsClient.readNote(docsFileId, id),
        readAsset: (name) => docsClient.readAsset(docsFileId, name),
      };
    }
    $("manual").addEventListener("click", () => void (async () => {
      if (!docsFileId) { showToast("Abrí un diagrama primero"); return; }
      const { html } = await buildManual(manualDeps());
      showManualModal(html);
    })().catch(onError));
```
Add a `showManualModal(html)` that creates an overlay with the rendered manual, a close button, and an "Exportar HTML" button that calls `exportManualHtml(manualDeps())` and triggers a download (Blob + `<a download>`), plus a "Imprimir" button (`window.print()` scoped to the manual — simplest: `window.open` the export HTML and call print, or a print stylesheet). Import `graphFromModeler`, `buildManual`, `exportManualHtml` at the top of `main.ts`.

Download helper:
```ts
    function downloadHtml(filename: string, html: string): void {
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
```

- [ ] **Step 6: Styles in `src/app.css`**

```css
.manual-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 1500; display: flex; align-items: center; justify-content: center; }
.manual-box { background: var(--surface); color: var(--text); width: 820px; max-width: 92vw; max-height: 88vh; border-radius: var(--radius); box-shadow: var(--shadow); display: flex; flex-direction: column; }
.manual-head { display: flex; gap: 8px; justify-content: flex-end; padding: 10px 14px; border-bottom: 1px solid var(--border); }
.manual-body { padding: 16px 20px; overflow: auto; }
.manual-body img { max-width: 100%; }
.manual-body h2 { border-top: 1px solid var(--border); padding-top: 12px; margin-top: 20px; }
```

- [ ] **Step 7: Typecheck, full suite, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green.

- [ ] **Step 8: Manual verification (build/exe)**

Abrir un diagrama con varias tareas documentadas → botón **Manual** → modal con el manual de corrido (intro + Paso 1, 2, 3… con notas, "Sin documentar" donde falte, imágenes visibles). **Exportar HTML** → descarga un `.html` que abre standalone con las imágenes incrustadas. **Imprimir** → diálogo de impresión (Guardar como PDF).

- [ ] **Step 9: Commit**

```bash
git add src/processDocs/manualController.ts src/processDocs/manualController.test.ts src/main.ts src/app.css
git commit -m "feat(docs): manual view + HTML/print export wired into toolbar"
```

---

## Self-Review

**Spec coverage (sección F del spec 2026-06-30):**
- Recorrido del flujo (inicio → sequenceFlow, ramas, sin loops, inalcanzables al final) → Task 1. ✓
- Manual de corrido con intro (`_proceso.md`) + nota por paso o "sin documentar" → Tasks 2, 4. ✓
- Vista "Manual" en la app → Task 4. ✓
- Exportar a HTML autocontenido (imágenes incrustadas) + imprimir/PDF del navegador → Tasks 3, 4. ✓

**Placeholder scan:** sin TBD/TODO; Task 4 (wiring/modal) usa anclas concretas + verificación manual. El adaptador `graphFromModeler` y el modal no se unit-testean (gate build+manual); `orderFlow`/`buildManualMarkdown`/`manualHtmlDocument`/`inlineImages`/`buildManual`/`exportManualHtml` sí.

**Type consistency:** `FlowGraph`/`FlowNode` (T1) → T4; `ManualStep` (T2) → T4; `manualHtmlDocument`/`inlineImages` (T3) → T4; `ManualDeps` (T4) construido en `main.ts`. Reusa `parseFrontmatter` (Plan 1), `renderMarkdown` (Plan 1), `bytesToBase64` (Plan 2b), `docsClient.read*` (Plan 1/2b).

**Nota de ejecución:** `graphFromModeler` lee `sourceRef`/`targetRef` del businessObject (o `source`/`target` del shape) — confirmar contra el modelo real de bpmn-js durante la implementación; si difiere, ajustar el adaptador (la lógica pura `orderFlow` no depende de eso). El manual usa `renderMarkdown` (Plan 1) que sanea con DOMPurify — el export es seguro por construcción.
