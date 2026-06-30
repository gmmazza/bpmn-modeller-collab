# Knowledge management de procesos — Plan 1: Fundación de documentación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Documentar y leer notas markdown ligadas a cada elemento de un diagrama BPMN (nota por elemento + página-proceso), con `_index.md` regenerado, render seguro de markdown, y persistencia en un sidecar `<diagrama>.docs/` que sobrevive a renombrar/mover/copiar/borrar.

**Architecture:** Sidecar hermano del `.bpmn` (igual que `.layers.json`), accedido solo vía `fsClient` (`readPath`/`writePath`/`deletePath`/`listDir`). Lógica pura en módulos pequeños (frontmatter, paths, índice, render), una vista DOM (`notePanel`) y un controlador testeable que cablea selección ↔ IO ↔ render. El diagrama es la verdad; `_index.md` se deriva.

**Tech Stack:** TypeScript + Vite, Vitest (happy-dom), bpmn-js. Nuevas dependencias: `markdown-it`, `dompurify`, `@types/markdown-it`.

## Global Constraints

- **TypeScript estricto**, sin framework de UI. Módulos exportan factorías `createX(api)` u funciones puras `renderX(container, state, handlers)`, siguiendo el patrón de `src/layers/`.
- **Acceso a disco solo vía `fsClient`** (web FS Access API / IPC Electron). Nunca tocar rutas directamente.
- **Tests:** Vitest con `environment: "happy-dom"`, `globals: true`. Igual estilo que `src/ui.test.ts` / `src/layers/layersModal.test.ts` (container `document.createElement("div")`, consultas por `data-*`). Usar `createFakeDir`/`createFsClient`/`seedFile` de `src/testHelpers/fakeDir.ts` para IO.
- **Gate por tarea:** `npm test` y `npm run typecheck` deben pasar antes de cada commit.
- **Sidecar:** carpeta `<base-del-bpmn>.docs/` hermana del archivo. Nota por elemento: `<elementId>.md`. Proceso: `_proceso.md`. Índice (derivado, no editar a mano): `_index.md`. Assets: `assets/`.
- **Frontmatter:** bloque `---` / `---` con pares `clave: valor` (solo strings). La app rellena `name`/`type` desde el modelo bpmn-js; nunca toca el cuerpo del usuario.
- **No romper el watermark** "Powered by bpmn.io" ni patrones existentes.

---

### Task 1: `frontmatter.ts` — parse/serialize de frontmatter

**Files:**
- Create: `src/processDocs/frontmatter.ts`
- Test: `src/processDocs/frontmatter.test.ts`

**Interfaces:**
- Produces:
  - `interface ParsedDoc { meta: Record<string, string>; body: string }`
  - `function parseFrontmatter(text: string): ParsedDoc`
  - `function serializeFrontmatter(meta: Record<string, string>, body: string): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter";

describe("frontmatter", () => {
  it("parses a frontmatter block and body", () => {
    const text = "---\nelement: Activity_1\nname: Validar factura\n---\nCuerpo libre\ncon dos líneas";
    const { meta, body } = parseFrontmatter(text);
    expect(meta).toEqual({ element: "Activity_1", name: "Validar factura" });
    expect(body).toBe("Cuerpo libre\ncon dos líneas");
  });

  it("returns empty meta and full text as body when there is no frontmatter", () => {
    const { meta, body } = parseFrontmatter("solo cuerpo");
    expect(meta).toEqual({});
    expect(body).toBe("solo cuerpo");
  });

  it("round-trips through serialize", () => {
    const out = serializeFrontmatter({ element: "Gateway_1", type: "bpmn:ExclusiveGateway" }, "texto");
    expect(out).toBe("---\nelement: Gateway_1\ntype: bpmn:ExclusiveGateway\n---\ntexto");
    expect(parseFrontmatter(out).meta).toEqual({ element: "Gateway_1", type: "bpmn:ExclusiveGateway" });
  });

  it("treats a malformed frontmatter (no closing fence) as plain body", () => {
    const text = "---\nelement: X\nsin cierre";
    const { meta, body } = parseFrontmatter(text);
    expect(meta).toEqual({});
    expect(body).toBe(text);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/frontmatter.test.ts`
Expected: FAIL — cannot find module `./frontmatter`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/frontmatter.ts
export interface ParsedDoc {
  meta: Record<string, string>;
  body: string;
}

export function parseFrontmatter(text: string): ParsedDoc {
  if (!text.startsWith("---\n")) return { meta: {}, body: text };
  const end = text.indexOf("\n---", 3);
  if (end < 0) return { meta: {}, body: text };
  const block = text.slice(4, end);
  const rest = text.slice(end + 4).replace(/^\n/, "");
  const meta: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (key) meta[key] = value;
  }
  return { meta, body: rest };
}

export function serializeFrontmatter(meta: Record<string, string>, body: string): string {
  const lines = Object.entries(meta).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join("\n")}\n---\n${body}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/frontmatter.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/frontmatter.ts src/processDocs/frontmatter.test.ts
git commit -m "feat(docs): frontmatter parse/serialize"
```

---

### Task 2: `docsPaths.ts` — rutas del sidecar

**Files:**
- Create: `src/processDocs/docsPaths.ts`
- Test: `src/processDocs/docsPaths.test.ts`

**Interfaces:**
- Produces:
  - `function docsDir(diagramId: string): string`
  - `function notePath(diagramId: string, elementId: string): string`
  - `function processNotePath(diagramId: string): string`
  - `function indexPath(diagramId: string): string`
  - `function assetsDir(diagramId: string): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { docsDir, notePath, processNotePath, indexPath, assetsDir } from "./docsPaths";

describe("docsPaths", () => {
  it("derives the sidecar dir from a diagram id (root)", () => {
    expect(docsDir("mi-proceso.bpmn")).toBe("mi-proceso.docs");
  });
  it("keeps the subfolder prefix", () => {
    expect(docsDir("sub/area/mi-proceso.bpmn")).toBe("sub/area/mi-proceso.docs");
  });
  it("builds note, process, index and assets paths", () => {
    expect(notePath("x.bpmn", "Activity_1")).toBe("x.docs/Activity_1.md");
    expect(processNotePath("x.bpmn")).toBe("x.docs/_proceso.md");
    expect(indexPath("x.bpmn")).toBe("x.docs/_index.md");
    expect(assetsDir("x.bpmn")).toBe("x.docs/assets");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/docsPaths.test.ts`
Expected: FAIL — cannot find module `./docsPaths`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/docsPaths.ts
export function docsDir(diagramId: string): string {
  return diagramId.replace(/\.bpmn$/i, ".docs");
}
export function notePath(diagramId: string, elementId: string): string {
  return `${docsDir(diagramId)}/${elementId}.md`;
}
export function processNotePath(diagramId: string): string {
  return `${docsDir(diagramId)}/_proceso.md`;
}
export function indexPath(diagramId: string): string {
  return `${docsDir(diagramId)}/_index.md`;
}
export function assetsDir(diagramId: string): string {
  return `${docsDir(diagramId)}/assets`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/docsPaths.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/docsPaths.ts src/processDocs/docsPaths.test.ts
git commit -m "feat(docs): sidecar path helpers"
```

---

### Task 3: `docsClient.ts` — IO de notas vía fsClient

**Files:**
- Create: `src/processDocs/docsClient.ts`
- Test: `src/processDocs/docsClient.test.ts`

**Interfaces:**
- Consumes: `docsPaths` (Task 2).
- Produces:
  - `interface DocsFsApi { readPath(rel): Promise<string|null>; writePath(rel, text): Promise<void>; deletePath(rel): Promise<void>; listDir(rel): Promise<{ name: string; kind: "file"|"directory" }[]> }`
  - `function createDocsClient(api: DocsFsApi)` returning:
    - `readNote(diagramId, elementId): Promise<string | null>`
    - `writeNote(diagramId, elementId, text): Promise<void>`
    - `deleteNote(diagramId, elementId): Promise<void>`
    - `readProcessNote(diagramId): Promise<string | null>`
    - `writeProcessNote(diagramId, text): Promise<void>`
    - `writeIndex(diagramId, text): Promise<void>`
    - `listDocumentedIds(diagramId): Promise<string[]>` (element ids con nota; excluye `_*.md`)
  - `type DocsClient = ReturnType<typeof createDocsClient>`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { createDocsClient } from "./docsClient";
import { createFsClient } from "../fsClient";
import { createFakeDir } from "../testHelpers/fakeDir";

function client() {
  const fs = createFsClient(createFakeDir());
  return createDocsClient(fs);
}

describe("docsClient", () => {
  it("writes and reads an element note", async () => {
    const c = client();
    await c.writeNote("x.bpmn", "Activity_1", "hola");
    expect(await c.readNote("x.bpmn", "Activity_1")).toBe("hola");
  });

  it("returns null for a missing note", async () => {
    expect(await client().readNote("x.bpmn", "Nope")).toBeNull();
  });

  it("writes/reads the process note and the index", async () => {
    const c = client();
    await c.writeProcessNote("x.bpmn", "overview");
    await c.writeIndex("x.bpmn", "# idx");
    expect(await c.readProcessNote("x.bpmn")).toBe("overview");
  });

  it("lists documented element ids excluding _proceso/_index", async () => {
    const c = client();
    await c.writeNote("x.bpmn", "Activity_1", "a");
    await c.writeNote("x.bpmn", "Gateway_2", "b");
    await c.writeProcessNote("x.bpmn", "ov");
    await c.writeIndex("x.bpmn", "idx");
    expect((await c.listDocumentedIds("x.bpmn")).sort()).toEqual(["Activity_1", "Gateway_2"]);
  });

  it("deletes a note", async () => {
    const c = client();
    await c.writeNote("x.bpmn", "Activity_1", "a");
    await c.deleteNote("x.bpmn", "Activity_1");
    expect(await c.readNote("x.bpmn", "Activity_1")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/docsClient.test.ts`
Expected: FAIL — cannot find module `./docsClient`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/docsClient.ts
import { docsDir, notePath, processNotePath, indexPath } from "./docsPaths";

export interface DocsFsApi {
  readPath(rel: string): Promise<string | null>;
  writePath(rel: string, text: string): Promise<void>;
  deletePath(rel: string): Promise<void>;
  listDir(rel: string): Promise<{ name: string; kind: "file" | "directory" }[]>;
}

export function createDocsClient(api: DocsFsApi) {
  return {
    readNote(diagramId: string, elementId: string): Promise<string | null> {
      return api.readPath(notePath(diagramId, elementId));
    },
    writeNote(diagramId: string, elementId: string, text: string): Promise<void> {
      return api.writePath(notePath(diagramId, elementId), text);
    },
    deleteNote(diagramId: string, elementId: string): Promise<void> {
      return api.deletePath(notePath(diagramId, elementId));
    },
    readProcessNote(diagramId: string): Promise<string | null> {
      return api.readPath(processNotePath(diagramId));
    },
    writeProcessNote(diagramId: string, text: string): Promise<void> {
      return api.writePath(processNotePath(diagramId), text);
    },
    writeIndex(diagramId: string, text: string): Promise<void> {
      return api.writePath(indexPath(diagramId), text);
    },
    async listDocumentedIds(diagramId: string): Promise<string[]> {
      const entries = await api.listDir(docsDir(diagramId));
      return entries
        .filter((e) => e.kind === "file" && e.name.endsWith(".md") && !e.name.startsWith("_"))
        .map((e) => e.name.replace(/\.md$/, ""));
    },
  };
}

export type DocsClient = ReturnType<typeof createDocsClient>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/docsClient.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/docsClient.ts src/processDocs/docsClient.test.ts
git commit -m "feat(docs): docsClient over fsClient paths"
```

---

### Task 4: `docsIndex.ts` — generar `_index.md` derivado

**Files:**
- Create: `src/processDocs/docsIndex.ts`
- Test: `src/processDocs/docsIndex.test.ts`

**Interfaces:**
- Produces:
  - `interface IndexElement { id: string; name: string; type: string; hasNote: boolean }`
  - `function buildIndexMarkdown(diagramId: string, processName: string, elements: IndexElement[]): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildIndexMarkdown } from "./docsIndex";

describe("buildIndexMarkdown", () => {
  it("renders frontmatter, a heading and a row per element", () => {
    const md = buildIndexMarkdown("x.bpmn", "Validación de facturas", [
      { id: "Start_1", name: "Factura recibida", type: "bpmn:StartEvent", hasNote: false },
      { id: "Activity_1", name: "Validar factura", type: "bpmn:Task", hasNote: true },
    ]);
    expect(md).toContain("diagram: x.bpmn");
    expect(md).toContain("generated-by: BPMN compartida");
    expect(md).toContain("# Índice del proceso: Validación de facturas");
    expect(md).toContain("| Factura recibida | bpmn:StartEvent | _(sin nota)_ |");
    expect(md).toContain("| Validar factura | bpmn:Task | [Activity_1.md](Activity_1.md) |");
  });

  it("escapes pipe characters in element names", () => {
    const md = buildIndexMarkdown("x.bpmn", "P", [
      { id: "A", name: "a | b", type: "bpmn:Task", hasNote: false },
    ]);
    expect(md).toContain("a \\| b");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/docsIndex.test.ts`
Expected: FAIL — cannot find module `./docsIndex`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/docsIndex.ts
export interface IndexElement {
  id: string;
  name: string;
  type: string;
  hasNote: boolean;
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|");
}

export function buildIndexMarkdown(diagramId: string, processName: string, elements: IndexElement[]): string {
  const rows = elements.map((e) => {
    const note = e.hasNote ? `[${e.id}.md](${e.id}.md)` : "_(sin nota)_";
    return `| ${cell(e.name)} | ${cell(e.type)} | ${note} |`;
  });
  return [
    "---",
    `diagram: ${diagramId}`,
    "generated-by: BPMN compartida",
    "---",
    `# Índice del proceso: ${processName}`,
    "",
    "| Paso | Tipo | Nota |",
    "|------|------|------|",
    ...rows,
    "",
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/docsIndex.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/docsIndex.ts src/processDocs/docsIndex.test.ts
git commit -m "feat(docs): derive _index.md from diagram elements"
```

---

### Task 5: `markdownRender.ts` — render seguro (markdown-it + DOMPurify)

**Files:**
- Create: `src/processDocs/markdownRender.ts`
- Test: `src/processDocs/markdownRender.test.ts`
- Modify: `package.json` (deps)

**Interfaces:**
- Produces: `function renderMarkdown(md: string): string` (HTML saneado).

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install markdown-it dompurify
npm install -D @types/markdown-it
```
Expected: `package.json` lista `markdown-it`, `dompurify` en dependencies y `@types/markdown-it` en devDependencies.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./markdownRender";

describe("renderMarkdown", () => {
  it("renders headings and ordered lists", () => {
    const html = renderMarkdown("# Título\n\n1. uno\n2. dos");
    expect(html).toContain("<h1>Título</h1>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>uno</li>");
  });

  it("strips script tags (XSS)", () => {
    const html = renderMarkdown('texto <script>alert(1)</script> más');
    expect(html).not.toContain("<script");
  });

  it("turns a bare YouTube URL into a whitelisted iframe", () => {
    const html = renderMarkdown("https://www.youtube.com/watch?v=abc123XYZ_-");
    expect(html).toContain("<iframe");
    expect(html).toContain("https://www.youtube.com/embed/abc123XYZ_-");
  });

  it("removes an iframe pointing at a non-whitelisted host", () => {
    const html = renderMarkdown('<iframe src="https://evil.example.com/x"></iframe>');
    expect(html).not.toContain("evil.example.com");
  });

  it("renders task-list checkboxes from - [ ] / - [x]", () => {
    const html = renderMarkdown("- [ ] pendiente\n- [x] hecha");
    expect(html).toContain('type="checkbox"');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/processDocs/markdownRender.test.ts`
Expected: FAIL — cannot find module `./markdownRender`.

- [ ] **Step 4: Write minimal implementation**

```ts
// src/processDocs/markdownRender.ts
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

const ALLOWED_EMBED_HOSTS = ["www.youtube.com", "youtube.com", "player.vimeo.com", "vimeo.com", "www.loom.com", "loom.com"];

const md = new MarkdownIt({ html: true, linkify: true, breaks: true });

// Minimal task-list support: rewrite "[ ]"/"[x]" at the start of a list item.
function renderTaskLists(html: string): string {
  return html
    .replace(/<li>\s*\[ \]\s*/g, '<li class="task"><input type="checkbox" disabled> ')
    .replace(/<li>\s*\[[xX]\]\s*/g, '<li class="task"><input type="checkbox" disabled checked> ');
}

// Convert a standalone video URL line into an embeddable iframe before markdown parsing.
function embedVideos(src: string): string {
  return src
    .split("\n")
    .map((line) => {
      const yt = line.match(/^\s*https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([\w-]+)\s*$/);
      if (yt) return `<iframe src="https://www.youtube.com/embed/${yt[1]}" allowfullscreen frameborder="0"></iframe>`;
      const ytShort = line.match(/^\s*https?:\/\/youtu\.be\/([\w-]+)\s*$/);
      if (ytShort) return `<iframe src="https://www.youtube.com/embed/${ytShort[1]}" allowfullscreen frameborder="0"></iframe>`;
      const vimeo = line.match(/^\s*https?:\/\/(?:www\.)?vimeo\.com\/(\d+)\s*$/);
      if (vimeo) return `<iframe src="https://player.vimeo.com/video/${vimeo[1]}" allowfullscreen frameborder="0"></iframe>`;
      return line;
    })
    .join("\n");
}

DOMPurify.addHook("uponSanitizeElement", (node, data) => {
  if (data.tagName !== "iframe") return;
  const src = (node as Element).getAttribute("src") || "";
  let host = "";
  try {
    host = new URL(src).host;
  } catch {
    host = "";
  }
  if (!ALLOWED_EMBED_HOSTS.includes(host)) (node as Element).parentNode?.removeChild(node);
});

export function renderMarkdown(input: string): string {
  const html = renderTaskLists(md.render(embedVideos(input)));
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "src", "target"],
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/processDocs/markdownRender.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add package.json package-lock.json src/processDocs/markdownRender.ts src/processDocs/markdownRender.test.ts
git commit -m "feat(docs): safe markdown render with video embeds (markdown-it + DOMPurify)"
```

---

### Task 6: `notePanel.ts` — vista del panel (pestañas + modo)

**Files:**
- Create: `src/processDocs/notePanel.ts`
- Test: `src/processDocs/notePanel.test.ts`

**Interfaces:**
- Consumes: `renderMarkdown` (Task 5).
- Produces:
  - `type NoteTab = "step" | "process"`
  - `type NoteMode = "read" | "edit"`
  - `interface NotePanelState { tab: NoteTab; mode: NoteMode; stepLabel: string | null; body: string; hasNote: boolean }`
  - `interface NotePanelHandlers { onTabChange(tab: NoteTab): void; onModeChange(mode: NoteMode): void; onBodyInput(body: string): void; onSave(): void; onCreateNote(): void }`
  - `function renderNotePanel(container: HTMLElement, state: NotePanelState, handlers: NotePanelHandlers): void`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { renderNotePanel, type NotePanelHandlers } from "./notePanel";

function handlers(): NotePanelHandlers {
  return { onTabChange: vi.fn(), onModeChange: vi.fn(), onBodyInput: vi.fn(), onSave: vi.fn(), onCreateNote: vi.fn() };
}

describe("renderNotePanel", () => {
  it("in read mode renders the note body as markdown", () => {
    const c = document.createElement("div");
    renderNotePanel(c, { tab: "step", mode: "read", stepLabel: "Validar factura", body: "# Hola", hasNote: true }, handlers());
    expect(c.querySelector("[data-note-read] h1")?.textContent).toBe("Hola");
    expect(c.textContent).toContain("Validar factura");
  });

  it("in edit mode shows a textarea bound to onBodyInput and a Save button", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderNotePanel(c, { tab: "step", mode: "edit", stepLabel: "X", body: "abc", hasNote: true }, h);
    const ta = c.querySelector("textarea[data-note-edit]") as HTMLTextAreaElement;
    expect(ta.value).toBe("abc");
    ta.value = "nuevo";
    ta.dispatchEvent(new Event("input"));
    expect(h.onBodyInput).toHaveBeenCalledWith("nuevo");
    (c.querySelector("[data-note-save]") as HTMLButtonElement).click();
    expect(h.onSave).toHaveBeenCalled();
  });

  it("shows a 'Documentar este paso' button when there is no note", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderNotePanel(c, { tab: "step", mode: "read", stepLabel: "X", body: "", hasNote: false }, h);
    const btn = c.querySelector("[data-note-create]") as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();
    expect(h.onCreateNote).toHaveBeenCalled();
  });

  it("fires onTabChange and onModeChange from the controls", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderNotePanel(c, { tab: "step", mode: "read", stepLabel: "X", body: "", hasNote: true }, h);
    (c.querySelector('[data-tab="process"]') as HTMLElement).click();
    expect(h.onTabChange).toHaveBeenCalledWith("process");
    (c.querySelector('[data-mode="edit"]') as HTMLElement).click();
    expect(h.onModeChange).toHaveBeenCalledWith("edit");
  });

  it("prompts to select a step when none is selected on the step tab", () => {
    const c = document.createElement("div");
    renderNotePanel(c, { tab: "step", mode: "read", stepLabel: null, body: "", hasNote: false }, handlers());
    expect(c.textContent).toContain("Seleccioná un paso");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/notePanel.test.ts`
Expected: FAIL — cannot find module `./notePanel`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/notePanel.ts
import { renderMarkdown } from "./markdownRender";

export type NoteTab = "step" | "process";
export type NoteMode = "read" | "edit";

export interface NotePanelState {
  tab: NoteTab;
  mode: NoteMode;
  stepLabel: string | null;
  body: string;
  hasNote: boolean;
}

export interface NotePanelHandlers {
  onTabChange(tab: NoteTab): void;
  onModeChange(mode: NoteMode): void;
  onBodyInput(body: string): void;
  onSave(): void;
  onCreateNote(): void;
}

function tabButton(tab: NoteTab, active: NoteTab, label: string, on: (t: NoteTab) => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.dataset.tab = tab;
  b.textContent = label;
  b.className = tab === active ? "active" : "";
  b.addEventListener("click", () => on(tab));
  return b;
}

function modeButton(mode: NoteMode, active: NoteMode, label: string, on: (m: NoteMode) => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.dataset.mode = mode;
  b.textContent = label;
  b.className = mode === active ? "active" : "";
  b.addEventListener("click", () => on(mode));
  return b;
}

export function renderNotePanel(container: HTMLElement, state: NotePanelState, h: NotePanelHandlers): void {
  container.innerHTML = "";
  container.className = "note-panel";

  const tabs = document.createElement("div");
  tabs.className = "note-tabs";
  tabs.append(
    tabButton("step", state.tab, "Paso", h.onTabChange),
    tabButton("process", state.tab, "Proceso", h.onTabChange),
  );
  const modes = document.createElement("div");
  modes.className = "note-modes";
  modes.append(
    modeButton("read", state.mode, "Leer", h.onModeChange),
    modeButton("edit", state.mode, "Editar", h.onModeChange),
  );
  const header = document.createElement("div");
  header.className = "note-header";
  header.append(tabs, modes);
  container.append(header);

  if (state.tab === "step" && state.stepLabel === null) {
    const empty = document.createElement("p");
    empty.className = "note-empty";
    empty.textContent = "Seleccioná un paso en el diagrama para ver o escribir su documentación.";
    container.append(empty);
    return;
  }

  if (state.tab === "step" && state.stepLabel) {
    const title = document.createElement("h3");
    title.className = "note-step-title";
    title.textContent = state.stepLabel;
    container.append(title);
  }

  if (!state.hasNote && state.mode === "read") {
    const create = document.createElement("button");
    create.dataset.noteCreate = "true";
    create.textContent = state.tab === "process" ? "Crear página del proceso" : "Documentar este paso";
    create.addEventListener("click", h.onCreateNote);
    container.append(create);
    return;
  }

  if (state.mode === "read") {
    const view = document.createElement("div");
    view.dataset.noteRead = "true";
    view.className = "note-read markdown-body";
    view.innerHTML = renderMarkdown(state.body);
    container.append(view);
    return;
  }

  const ta = document.createElement("textarea");
  ta.dataset.noteEdit = "true";
  ta.className = "note-edit";
  ta.value = state.body;
  ta.addEventListener("input", () => h.onBodyInput(ta.value));
  const save = document.createElement("button");
  save.dataset.noteSave = "true";
  save.textContent = "Guardar";
  save.addEventListener("click", h.onSave);
  container.append(ta, save);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/notePanel.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/notePanel.ts src/processDocs/notePanel.test.ts
git commit -m "feat(docs): note panel view (tabs + read/edit modes)"
```

---

### Task 7: `notePanelController.ts` — estado + cableado testeable

**Files:**
- Create: `src/processDocs/notePanelController.ts`
- Test: `src/processDocs/notePanelController.test.ts`

**Interfaces:**
- Consumes: `DocsClient` (Task 3), `serializeFrontmatter`/`parseFrontmatter` (Task 1), `buildIndexMarkdown`/`IndexElement` (Task 4), `renderNotePanel`/`NotePanelState` (Task 6).
- Produces:
  - `interface DiagramElement { id: string; name: string; type: string }`
  - `interface NoteControllerApi { docs: DocsClient; mount: HTMLElement; diagramId(): string; processName(): string; listElements(): DiagramElement[]; getSelected(): DiagramElement | null; onSelectionChange(cb: () => void): void }`
  - `function createNotePanelController(api: NoteControllerApi)` returning `{ refresh(): Promise<void>; setSelected(): Promise<void> }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { createNotePanelController, type DiagramElement } from "./notePanelController";
import { createDocsClient } from "./docsClient";
import { createFsClient } from "../fsClient";
import { createFakeDir } from "../testHelpers/fakeDir";

function setup(elements: DiagramElement[], selected: DiagramElement | null) {
  const fs = createFsClient(createFakeDir());
  const docs = createDocsClient(fs);
  const mount = document.createElement("div");
  let sel = selected;
  const listeners: Array<() => void> = [];
  const api = {
    docs,
    mount,
    diagramId: () => "x.bpmn",
    processName: () => "Proc",
    listElements: () => elements,
    getSelected: () => sel,
    onSelectionChange: (cb: () => void) => listeners.push(cb),
    setSel: (e: DiagramElement | null) => { sel = e; listeners.forEach((l) => l()); },
  };
  const ctrl = createNotePanelController(api);
  return { docs, mount, api, ctrl };
}

const A: DiagramElement = { id: "Activity_1", name: "Validar", type: "bpmn:Task" };

describe("notePanelController", () => {
  it("loads a selected element's note into read mode", async () => {
    const { docs, mount, ctrl } = setup([A], A);
    await docs.writeNote("x.bpmn", "Activity_1", "---\nelement: Activity_1\n---\n# Cuerpo");
    await ctrl.refresh();
    expect(mount.querySelector("[data-note-read] h1")?.textContent).toBe("Cuerpo");
  });

  it("saving writes the note with frontmatter and regenerates the index", async () => {
    const { docs, mount, ctrl } = setup([A], A);
    await ctrl.refresh();
    (mount.querySelector('[data-mode="edit"]') as HTMLElement).click();
    const ta = mount.querySelector("textarea[data-note-edit]") as HTMLTextAreaElement;
    ta.value = "texto nuevo";
    ta.dispatchEvent(new Event("input"));
    (mount.querySelector("[data-note-save]") as HTMLButtonElement).click();
    await Promise.resolve(); await Promise.resolve();
    const saved = await docs.readNote("x.bpmn", "Activity_1");
    expect(saved).toContain("element: Activity_1");
    expect(saved).toContain("name: Validar");
    expect(saved).toContain("texto nuevo");
    const idx = await docs.readProcessNote("x.bpmn"); // index is separate; check via readPath
    expect(idx).toBeNull();
  });

  it("shows the empty prompt when nothing is selected on the step tab", async () => {
    const { mount, ctrl } = setup([A], null);
    await ctrl.refresh();
    expect(mount.textContent).toContain("Seleccioná un paso");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/notePanelController.test.ts`
Expected: FAIL — cannot find module `./notePanelController`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/notePanelController.ts
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter";
import { buildIndexMarkdown, type IndexElement } from "./docsIndex";
import { renderNotePanel, type NoteMode, type NoteTab, type NotePanelState } from "./notePanel";
import type { DocsClient } from "./docsClient";

export interface DiagramElement {
  id: string;
  name: string;
  type: string;
}

export interface NoteControllerApi {
  docs: DocsClient;
  mount: HTMLElement;
  diagramId(): string;
  processName(): string;
  listElements(): DiagramElement[];
  getSelected(): DiagramElement | null;
  onSelectionChange(cb: () => void): void;
}

const PROCESS_TEMPLATE = "# Proceso\n\n_Describí para qué sirve este proceso, quién es el dueño y su alcance._\n";

export function createNotePanelController(api: NoteControllerApi) {
  let tab: NoteTab = "step";
  let mode: NoteMode = "read";
  let body = "";
  let hasNote = false;

  async function regenerateIndex(): Promise<void> {
    const documented = new Set(await api.docs.listDocumentedIds(api.diagramId()));
    const elements: IndexElement[] = api.listElements().map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      hasNote: documented.has(e.id),
    }));
    await api.docs.writeIndex(api.diagramId(), buildIndexMarkdown(api.diagramId(), api.processName(), elements));
  }

  async function loadBody(): Promise<void> {
    if (tab === "process") {
      const raw = await api.docs.readProcessNote(api.diagramId());
      hasNote = raw !== null;
      body = raw === null ? "" : parseFrontmatter(raw).body;
      return;
    }
    const sel = api.getSelected();
    if (!sel) {
      hasNote = false;
      body = "";
      return;
    }
    const raw = await api.docs.readNote(api.diagramId(), sel.id);
    hasNote = raw !== null;
    body = raw === null ? "" : parseFrontmatter(raw).body;
  }

  function state(): NotePanelState {
    const sel = api.getSelected();
    return {
      tab,
      mode,
      stepLabel: tab === "process" ? "Proceso" : sel ? sel.name : null,
      body,
      hasNote,
    };
  }

  function render(): void {
    renderNotePanel(api.mount, state(), {
      onTabChange: async (t) => {
        tab = t;
        mode = "read";
        await loadBody();
        render();
      },
      onModeChange: (m) => {
        mode = m;
        render();
      },
      onBodyInput: (b) => {
        body = b;
      },
      onSave: async () => {
        await save();
        mode = "read";
        render();
      },
      onCreateNote: async () => {
        hasNote = true;
        mode = "edit";
        body = tab === "process" ? PROCESS_TEMPLATE : "";
        render();
      },
    });
  }

  async function save(): Promise<void> {
    if (tab === "process") {
      await api.docs.writeProcessNote(api.diagramId(), body);
      hasNote = true;
      return;
    }
    const sel = api.getSelected();
    if (!sel) return;
    const text = serializeFrontmatter(
      { element: sel.id, name: sel.name, type: sel.type, diagram: api.diagramId() },
      body,
    );
    await api.docs.writeNote(api.diagramId(), sel.id, text);
    hasNote = true;
    await regenerateIndex();
  }

  api.onSelectionChange(async () => {
    if (tab !== "step") return;
    mode = "read";
    await loadBody();
    render();
  });

  async function refresh(): Promise<void> {
    await loadBody();
    render();
  }

  return { refresh, setSelected: refresh };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/notePanelController.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/notePanelController.ts src/processDocs/notePanelController.test.ts
git commit -m "feat(docs): note panel controller (load/save + index regen)"
```

---

### Task 8: `fsClient` — el sidecar `.docs/` viaja con rename/move/copy/delete

**Files:**
- Modify: `src/fsClient.ts` (métodos `deleteFile`, `renameFile`, `moveFile`, `copyFile`)
- Test: `src/fsClientDocs.test.ts`

**Interfaces:**
- Consumes: helpers internos existentes de `fsClient` (`dirExists`, `copySubtree`, `removeDirAt`, `native`, `baseName`).
- Produces: el comportamiento observable (la carpeta `<base>.docs/` acompaña la operación).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { createFsClient } from "./fsClient";
import { createFakeDir } from "./testHelpers/fakeDir";

async function seedDoc(fs: ReturnType<typeof createFsClient>, base: string) {
  await fs.writePath(`${base}.docs/Activity_1.md`, "nota");
}

describe("fsClient carries the .docs sidecar", () => {
  it("rename moves the .docs folder", async () => {
    const fs = createFsClient(createFakeDir());
    await fs.createFile("x.bpmn", "<xml/>");
    await seedDoc(fs, "x");
    await fs.renameFile("x.bpmn", "y.bpmn");
    expect(await fs.readPath("y.docs/Activity_1.md")).toBe("nota");
    expect(await fs.readPath("x.docs/Activity_1.md")).toBeNull();
  });

  it("copy duplicates the .docs folder", async () => {
    const fs = createFsClient(createFakeDir());
    await fs.createFile("x.bpmn", "<xml/>");
    await seedDoc(fs, "x");
    const newId = await fs.copyFile("x.bpmn", "", "z");
    expect(await fs.readPath("z.docs/Activity_1.md")).toBe("nota");
    expect(await fs.readPath("x.docs/Activity_1.md")).toBe("nota");
    expect(newId).toBe("z.bpmn");
  });

  it("delete removes the .docs folder", async () => {
    const fs = createFsClient(createFakeDir());
    await fs.createFile("x.bpmn", "<xml/>");
    await seedDoc(fs, "x");
    await fs.deleteFile("x.bpmn");
    expect(await fs.readPath("x.docs/Activity_1.md")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/fsClientDocs.test.ts`
Expected: FAIL — rename/copy/delete no acarrean `.docs` (asserts de presencia/ausencia fallan).

- [ ] **Step 3: Add a `moveDocs`/`copyDocs` helper and wire it in**

In `src/fsClient.ts`, after the existing `moveHistory` function (around line 251), add:

```ts
  async function moveDocs(id: string, newId: string): Promise<void> {
    const src = `${baseName(id)}.docs`;
    const dst = `${baseName(newId)}.docs`;
    if (!(await dirExists(src))) return;
    if (native) {
      await native.rename(src, dst);
      return;
    }
    await copySubtree(src, dst, true);
    await removeDirAt(src);
  }
  async function copyDocs(id: string, newId: string): Promise<void> {
    const src = `${baseName(id)}.docs`;
    if (!(await dirExists(src))) return;
    await copySubtree(src, `${baseName(newId)}.docs`, true);
  }
```

Then, inside the returned object:

In `deleteFile` (after the `removeFileAt(`${baseName(id)}.layers.json`)` line ~374) add:
```ts
      await removeDirAt(`${baseName(id)}.docs`);
```

In `renameFile`, after the existing layers.json move line (~383) add:
```ts
      await moveDocs(id, newId);
```

In `moveFile`, after the existing layers.json move line (~393) add:
```ts
      await moveDocs(id, newId);
```

In `copyFile`, after the existing layers.json copy line (~403) add:
```ts
      await copyDocs(id, newId);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/fsClientDocs.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Full suite + typecheck + commit**

Run: `npm test && npm run typecheck`
Expected: all pass, no type errors.

```bash
git add src/fsClient.ts src/fsClientDocs.test.ts
git commit -m "feat(docs): .docs sidecar follows rename/move/copy/delete"
```

---

### Task 9: `agentsFile.ts` — sembrar `AGENTS.md` en la raíz

**Files:**
- Create: `src/processDocs/agentsFile.ts`
- Test: `src/processDocs/agentsFile.test.ts`

**Interfaces:**
- Produces:
  - `const AGENTS_MD: string`
  - `function ensureAgentsFile(api: { readPath(rel: string): Promise<string | null>; writePath(rel: string, text: string): Promise<void> }): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { ensureAgentsFile, AGENTS_MD } from "./agentsFile";
import { createFsClient } from "../fsClient";
import { createFakeDir } from "../testHelpers/fakeDir";

describe("ensureAgentsFile", () => {
  it("writes AGENTS.md at the root when absent", async () => {
    const fs = createFsClient(createFakeDir());
    await ensureAgentsFile(fs);
    expect(await fs.readPath("AGENTS.md")).toBe(AGENTS_MD);
  });

  it("does not overwrite an existing AGENTS.md", async () => {
    const fs = createFsClient(createFakeDir());
    await fs.writePath("AGENTS.md", "custom");
    await ensureAgentsFile(fs);
    expect(await fs.readPath("AGENTS.md")).toBe("custom");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/agentsFile.test.ts`
Expected: FAIL — cannot find module `./agentsFile`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/agentsFile.ts
export const AGENTS_MD = `# Convención de documentación de procesos (BPMN compartida)

Cada diagrama \`<nombre>.bpmn\` tiene una carpeta hermana \`<nombre>.docs/\` con:

- \`_proceso.md\` — overview del proceso (para qué sirve, dueño, alcance).
- \`_index.md\` — índice DERIVADO del diagrama (no editar a mano; lo regenera la app).
- \`<elementId>.md\` — nota de un paso. Empieza con frontmatter:
  \`\`\`
  ---
  element: Activity_0x9f2
  name: Validar factura
  type: bpmn:Task
  diagram: <nombre>.bpmn
  ---
  \`\`\`
- \`_ideas.md\` — bandeja de ideas sueltas (casillas \`- [ ]\` pendiente / \`- [x]\` procesada).
- \`assets/\` — imágenes referenciadas por las notas.

Para mejorar la documentación: leé \`_index.md\` para orientarte, editá las notas en
lenguaje natural (markdown), y respetá el frontmatter de cada nota.
`;

export async function ensureAgentsFile(api: {
  readPath(rel: string): Promise<string | null>;
  writePath(rel: string, text: string): Promise<void>;
}): Promise<void> {
  if ((await api.readPath("AGENTS.md")) !== null) return;
  await api.writePath("AGENTS.md", AGENTS_MD);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/agentsFile.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/agentsFile.ts src/processDocs/agentsFile.test.ts
git commit -m "feat(docs): seed AGENTS.md convention file at folder root"
```

---

### Task 10: Integración en `main.ts` (montaje + adaptador bpmn-js)

**Files:**
- Create: `src/processDocs/bpmnDocsAdapter.ts`
- Modify: `src/main.ts` (montar panel, crear adaptador y controlador, sembrar AGENTS.md), `src/app.css` (estilos mínimos del panel)
- Test: `src/processDocs/bpmnDocsAdapter.test.ts`

**Interfaces:**
- Consumes: `DiagramElement`/`NoteControllerApi` (Task 7), `ModelerLike` (`src/editor.ts`).
- Produces:
  - `const DOCUMENTABLE_TYPES: string[]` (prefijos de tipo BPMN documentables)
  - `function isDocumentable(type: string): boolean`
  - `function toDiagramElement(el: { id: string; businessObject?: { name?: string; $type?: string } }): DiagramElement`
  - `function listDocumentableElements(modeler: ModelerLike): DiagramElement[]`

- [ ] **Step 1: Write the failing test (pure mapping logic)**

```ts
import { describe, it, expect } from "vitest";
import { isDocumentable, toDiagramElement, listDocumentableElements } from "./bpmnDocsAdapter";

describe("bpmnDocsAdapter", () => {
  it("flags tasks, gateways, events, subprocess and call activity as documentable", () => {
    expect(isDocumentable("bpmn:Task")).toBe(true);
    expect(isDocumentable("bpmn:ExclusiveGateway")).toBe(true);
    expect(isDocumentable("bpmn:StartEvent")).toBe(true);
    expect(isDocumentable("bpmn:CallActivity")).toBe(true);
    expect(isDocumentable("bpmn:SequenceFlow")).toBe(false);
    expect(isDocumentable("bpmn:Process")).toBe(false);
  });

  it("maps a bpmn element to a DiagramElement, defaulting an empty name", () => {
    expect(toDiagramElement({ id: "A", businessObject: { name: "Validar", $type: "bpmn:Task" } }))
      .toEqual({ id: "A", name: "Validar", type: "bpmn:Task" });
    expect(toDiagramElement({ id: "B", businessObject: { $type: "bpmn:Task" } }))
      .toEqual({ id: "B", name: "(sin nombre)", type: "bpmn:Task" });
  });

  it("lists only documentable elements from the registry", () => {
    const registry = {
      getAll: () => [
        { id: "A", businessObject: { name: "T", $type: "bpmn:Task" } },
        { id: "F", businessObject: { $type: "bpmn:SequenceFlow" } },
      ],
    };
    const modeler = { get: (n: string) => (n === "elementRegistry" ? registry : null) } as any;
    expect(listDocumentableElements(modeler)).toEqual([{ id: "A", name: "T", type: "bpmn:Task" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/bpmnDocsAdapter.test.ts`
Expected: FAIL — cannot find module `./bpmnDocsAdapter`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/bpmnDocsAdapter.ts
import type { ModelerLike } from "../editor";
import type { DiagramElement } from "./notePanelController";

export const DOCUMENTABLE_TYPES = ["bpmn:Task", "bpmn:Gateway", "bpmn:Event", "bpmn:SubProcess", "bpmn:CallActivity"];

export function isDocumentable(type: string): boolean {
  if (type === "bpmn:Process" || type === "bpmn:SequenceFlow") return false;
  return DOCUMENTABLE_TYPES.some((t) =>
    t === "bpmn:Task" ? type === "bpmn:Task" || type.endsWith("Task") :
    t === "bpmn:Gateway" ? type.endsWith("Gateway") :
    t === "bpmn:Event" ? type.endsWith("Event") :
    type === t,
  );
}

export function toDiagramElement(el: { id: string; businessObject?: { name?: string; $type?: string } }): DiagramElement {
  const bo = el.businessObject ?? {};
  return { id: el.id, name: bo.name && bo.name.trim() ? bo.name : "(sin nombre)", type: bo.$type ?? "" };
}

export function listDocumentableElements(modeler: ModelerLike): DiagramElement[] {
  const registry = modeler.get("elementRegistry");
  const all: Array<{ id: string; businessObject?: { name?: string; $type?: string } }> = registry.getAll();
  return all.filter((el) => isDocumentable(el.businessObject?.$type ?? "")).map(toDiagramElement);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/bpmnDocsAdapter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire into `main.ts`**

The app's right sidebar is the **inspector** (`src/inspector.ts`) with tabs declared as an array (`src/main.ts:577`). Integration adds a "Documentación" tab + a toolbar button, and loads docs per file (mirroring `loadLayers`). The fsClient variable is named `api`. Apply these edits:

a) Add imports near the other `src/main.ts` imports:
```ts
import { createDocsClient, type DocsClient } from "./processDocs/docsClient";
import { createNotePanelController } from "./processDocs/notePanelController";
import { listDocumentableElements, toDiagramElement } from "./processDocs/bpmnDocsAdapter";
import { ensureAgentsFile } from "./processDocs/agentsFile";
```

b) Add module-level state near the other `let` declarations (e.g. by `layersClient`, ~line 85):
```ts
let docsClient: DocsClient;
let docsController: ReturnType<typeof createNotePanelController> | null = null;
let docsFileId = "";
const docsSelectionCbs: Array<() => void> = [];
```

c) Wherever `layersClient = createLayersClient(api)` appears (~lines 180 and 216), add right after it:
```ts
      docsClient = createDocsClient(api);
      void ensureAgentsFile(api);
```

d) In the inspector tabs array (`src/main.ts:577`), add the docs tab:
```ts
      { id: "documentacion", label: "Documentación" },
```

e) After `await mountModeler();` (~line 589), create the controller once:
```ts
    docsController = createNotePanelController({
      docs: docsClient,
      mount: inspector.paneEl("documentacion"),
      diagramId: () => docsFileId,
      processName: () => docsFileId.replace(/\.bpmn$/i, "").split("/").pop() ?? docsFileId,
      listElements: () => (modeler ? listDocumentableElements(modeler) : []),
      getSelected: () => {
        const sel = (modeler?.get("selection")?.get?.() ?? []) as Array<{ id: string; businessObject?: { name?: string; $type?: string } }>;
        return sel[0] ? toDiagramElement(sel[0]) : null;
      },
      onSelectionChange: (cb) => docsSelectionCbs.push(cb),
    });
```

f) In the `selection.changed` handler (`src/main.ts:274-277`), after `renderLayers();` add:
```ts
      docsSelectionCbs.forEach((cb) => cb());
```

g) Add a `loadDocs` function (near `loadLayers`, ~line 351) and call it from `openFile`:
```ts
  async function loadDocs(fileId: string): Promise<void> {
    docsFileId = fileId;
    await docsController?.refresh();
  }
```
In `openFile`, after `await loadLayers(fileId);` (~line 832) add:
```ts
    await loadDocs(fileId);
```

h) Add a toolbar button next to `tab-props` (`src/main.ts:550`):
```ts
          <button class="btn icon-only" id="tab-docs" type="button" title="Documentación">${icon("help")}</button>
```
Then wire it where `tab-capas`/`tab-props` clicks are handled (search for `"tab-props"`), mirroring that handler:
```ts
    $("tab-docs").addEventListener("click", () => { inspector.setTab("documentacion"); void docsController?.refresh(); });
```

Add minimal styles to `src/app.css`:

```css
.note-panel { display: flex; flex-direction: column; gap: 8px; padding: 8px; }
.note-header { display: flex; justify-content: space-between; gap: 8px; }
.note-tabs button.active, .note-modes button.active { font-weight: bold; text-decoration: underline; }
.note-edit { width: 100%; min-height: 200px; font-family: inherit; }
.note-read.markdown-body img { max-width: 100%; }
.note-read.markdown-body iframe { width: 100%; aspect-ratio: 16 / 9; border: 0; }
.note-empty { color: var(--muted, #888); }
```

- [ ] **Step 6: Typecheck, full suite, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: no type errors; all tests pass; build succeeds.

- [ ] **Step 7: Manual verification (browser)**

Run: `npm run dev`, abrir una carpeta, crear un diagrama con una tarea. Verificar:
1. Seleccionar la tarea → el panel "Documentación" muestra "Documentar este paso".
2. Crear nota → modo Editar → escribir markdown (`# Hola` + lista) → Guardar.
3. Cambiar a "Leer" → se ve el markdown renderizado.
4. En disco aparece `<diagrama>.docs/<elementId>.md` con frontmatter y `_index.md`.
5. Renombrar el diagrama desde el árbol → la carpeta `.docs/` viaja con él.
6. Existe `AGENTS.md` en la raíz de la carpeta de trabajo.

- [ ] **Step 8: Commit**

```bash
git add src/main.ts src/app.css src/processDocs/bpmnDocsAdapter.ts src/processDocs/bpmnDocsAdapter.test.ts
git commit -m "feat(docs): mount documentation panel and wire bpmn selection"
```

---

## Self-Review

**Spec coverage (Plan 1 scope = secciones A, B, D, y el motor markdown de E):**
- A (layout sidecar, frontmatter, nota solo al documentar) → Tasks 1, 2, 3, 7. ✓
- B (`_index.md` derivado, `AGENTS.md`) → Tasks 4, 9. ✓
- D (panel Documentación, pestañas Paso/Proceso, switch Editar/Leer) → Tasks 6, 7, 10. ✓ (pestaña Ideas → Plan 3.)
- E parcial (render markdown seguro, encabezados, listas numeradas, embeds de video, task lists) → Task 5. ✓ (paste de imágenes + wikilinks → Plan 2.)
- Sidecar sobrevive rename/move/copy/delete → Task 8. ✓
- Forward-compat backend → respetado: todo IO pasa por `fsClient`/`DocsFsApi`. ✓

**Diferido explícitamente a planes siguientes (no es gap):**
- Pegar/soltar imágenes a `assets/` + wikilinks `[[...]]` → Plan 2.
- Bandeja de ideas + capa Ideas (incl. auto-on/restore) → Plan 3.
- Manual lineal + export HTML → Plan 4.
- Navegación inter-proceso (Call Activity, Message/Signal/Link) → Plan 5.

**Placeholder scan:** sin "TBD"/"TODO"; todos los pasos con código real. La Task 10 ancla los edits a líneas reales de `src/main.ts` verificadas al planificar (tabs del inspector en :577, handler `selection.changed` en :274-277, `loadLayers`/`openFile` en :351/:832, fsClient = variable `api`, botones `tab-capas`/`tab-props` en :549-550). Incluye verificación manual en navegador para cerrar el lazo.

**Type consistency:** `DiagramElement` (id/name/type) consistente entre Tasks 7 y 10; `IndexElement` (Task 4) usado en Task 7; `DocsClient` (Task 3) consumido por Tasks 7 y 10; `NotePanelState`/handlers (Task 6) consumidos por Task 7. ✓

**Confirmado contra `src/main.ts` real:** el inspector (`src/inspector.ts`) expone `createInspector(el, tabs)`, `paneEl(id)`, `setTab(id)`; los servicios bpmn-js (`elementRegistry.getAll()`, `selection.get()`, `eventBus` evento `selection.changed` con `e.newSelection`) y el patrón por-archivo (`loadLayers`→`openFile`) existen tal como los usa la Task 10. La lógica testeada (adaptador, controlador) no depende de esos nombres.
