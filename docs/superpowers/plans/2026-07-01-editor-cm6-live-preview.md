# Plan 2a — Editor CodeMirror 6 con live preview (Obsidian-like) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el `textarea` del modo Editar por un editor **CodeMirror 6** con **live preview inline** estilo Obsidian: el markup (`#`, `**`, `` ` ``, `>`, marcas de lista, enlaces) se oculta salvo en la línea del cursor, los elementos se estilizan en su lugar, y las imágenes/videos se muestran como widgets inline.

**Architecture:** La lógica de qué ocultar/estilizar/incrustar se calcula en una **función pura** sobre el árbol Lezer de `@lezer/markdown` (testeable sin vista). Un **ViewPlugin** de CM6 aplica esas decoraciones y revela el markup en la(s) línea(s) del cursor. `cmEditor.ts` envuelve el `EditorView` y se monta en el panel de notas en modo edición; el modo Leer sigue usando `renderMarkdown` (Plan 1).

**Tech Stack:** TypeScript + Vite, Vitest (happy-dom), CodeMirror 6 (`@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/language`, `@codemirror/lang-markdown`), `@lezer/markdown`.

## Global Constraints

- **TypeScript estricto** (`noUnusedLocals`, `noImplicitAny`), sin framework de UI. Módulos puros `computeX(...)` o factorías `createX(parent, opts)`.
- **Tests:** Vitest `environment: "happy-dom"`, `globals: true`. Lógica pura de decoración testeada contra `@lezer/markdown` SIN vista. El montaje de la vista CM6 se testea liviano y se cierra con verificación manual en el `.exe` (igual que la integración de `main.ts` del Plan 1).
- **Acceso a disco solo vía `fsClient`/`docsClient`** (no aplica en este plan; las notas las guarda el controlador del Plan 1 sin cambios).
- **Dos render paths:** CM6 inline para editar (este plan); `renderMarkdown` (markdown-it, Plan 1) para leer. No mezclar.
- **Seguridad de widgets:** el `src` de imagen es una ruta `assets/...`/relativa; el `src` de video se construye solo desde un id validado + host whitelisted (mismos hosts que `markdownRender`: youtube/youtu.be/vimeo). Nunca insertar HTML del usuario sin construirlo nosotros.
- **Gate por tarea:** `npm test` y `npm run typecheck` verdes antes de cada commit. Tareas que tocan `main.ts` agregan `npm run build`.
- **Rama:** `feat/knowledge-procesos-fundacion` (se apila sobre el Plan 1).

---

### Task 1: Dependencias CM6 + smoke test del parser Lezer

**Files:**
- Modify: `package.json` (deps)
- Test: `src/processDocs/cmDeps.test.ts`

**Interfaces:**
- Produces: confirma que `@lezer/markdown` exporta `parser` y parsea (base para Task 2).

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install @codemirror/state @codemirror/view @codemirror/commands @codemirror/language @codemirror/lang-markdown @lezer/markdown
```
Expected: `package.json` lista esos 6 paquetes en `dependencies`.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parser } from "@lezer/markdown";

describe("lezer markdown parser", () => {
  it("parses a heading and exposes node names with positions", () => {
    const tree = parser.parse("# Hola");
    const names: string[] = [];
    tree.iterate({ enter: (n) => { names.push(n.name); } });
    expect(names).toContain("ATXHeading1");
    expect(names).toContain("HeaderMark");
  });

  it("parses strong emphasis", () => {
    const tree = parser.parse("**bold**");
    const names: string[] = [];
    tree.iterate({ enter: (n) => { names.push(n.name); } });
    expect(names).toContain("StrongEmphasis");
    expect(names).toContain("EmphasisMark");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/processDocs/cmDeps.test.ts`
Expected: FAIL — cannot find module `@lezer/markdown` (until deps install) or red if not installed.

- [ ] **Step 4: Confirm deps make it pass**

Run: `npx vitest run src/processDocs/cmDeps.test.ts`
Expected: PASS (2 tests). If node names differ, adjust the test to the real names emitted by the installed `@lezer/markdown` version (they are the spec for Task 2 — record the exact names you observed).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add package.json package-lock.json src/processDocs/cmDeps.test.ts
git commit -m "build(docs): add CodeMirror 6 + lezer markdown deps"
```

---

### Task 2: `cmDecorations.ts` — cálculo puro de decoraciones

**Files:**
- Create: `src/processDocs/cmDecorations.ts`
- Test: `src/processDocs/cmDecorations.test.ts`

**Interfaces:**
- Consumes: `@lezer/markdown` `parser` (Task 1).
- Produces:
  - `type DecoKind = "hide" | "mark" | "widget"`
  - `interface ImageWidget { type: "image"; src: string; alt: string }`
  - `interface VideoWidget { type: "video"; src: string }`
  - `interface DecoSpec { kind: DecoKind; from: number; to: number; cls?: string; widget?: ImageWidget | VideoWidget }`
  - `function computeMarkdownDecorations(text: string): DecoSpec[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { computeMarkdownDecorations } from "./cmDecorations";

const hides = (t: string) => computeMarkdownDecorations(t).filter((d) => d.kind === "hide");
const marks = (t: string) => computeMarkdownDecorations(t).filter((d) => d.kind === "mark");

describe("computeMarkdownDecorations", () => {
  it("hides the heading mark and styles the heading", () => {
    const d = computeMarkdownDecorations("# Hola");
    expect(hides("# Hola").some((h) => h.from === 0 && h.to === 2)).toBe(true); // "# "
    expect(marks("# Hola").some((m) => m.cls === "cm-heading-1")).toBe(true);
  });

  it("hides both ** marks and styles strong", () => {
    const d = computeMarkdownDecorations("**bold**");
    const h = hides("**bold**");
    expect(h.some((x) => x.from === 0 && x.to === 2)).toBe(true);
    expect(h.some((x) => x.from === 6 && x.to === 8)).toBe(true);
    expect(marks("**bold**").some((m) => m.cls === "cm-strong")).toBe(true);
  });

  it("styles emphasis and inline code", () => {
    expect(marks("*it*").some((m) => m.cls === "cm-em")).toBe(true);
    expect(marks("`code`").some((m) => m.cls === "cm-inline-code")).toBe(true);
  });

  it("emits an image widget with src and alt", () => {
    const w = computeMarkdownDecorations("![diagrama](assets/x.png)").find((d) => d.kind === "widget");
    expect(w?.widget).toEqual({ type: "image", src: "assets/x.png", alt: "diagrama" });
  });

  it("emits a video widget for a bare YouTube URL line", () => {
    const w = computeMarkdownDecorations("https://www.youtube.com/watch?v=abc123XYZ_-").find((d) => d.kind === "widget");
    expect(w?.widget).toEqual({ type: "video", src: "https://www.youtube.com/embed/abc123XYZ_-" });
  });

  it("hides the quote mark and the bullet list mark", () => {
    expect(hides("> cita").length).toBeGreaterThan(0);
    expect(hides("- item").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/cmDecorations.test.ts`
Expected: FAIL — cannot find module `./cmDecorations`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/cmDecorations.ts
import { parser } from "@lezer/markdown";

export type DecoKind = "hide" | "mark" | "widget";
export interface ImageWidget { type: "image"; src: string; alt: string }
export interface VideoWidget { type: "video"; src: string }
export interface DecoSpec {
  kind: DecoKind;
  from: number;
  to: number;
  cls?: string;
  widget?: ImageWidget | VideoWidget;
}

const HEADING_CLASS: Record<string, string> = {
  ATXHeading1: "cm-heading-1", ATXHeading2: "cm-heading-2", ATXHeading3: "cm-heading-3",
  ATXHeading4: "cm-heading-4", ATXHeading5: "cm-heading-5", ATXHeading6: "cm-heading-6",
};

// Build a safe video embed src from a bare provider URL, or null if not a video URL.
function videoEmbed(line: string): string | null {
  const yt = line.match(/^\s*https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([\w-]+)\s*$/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const ytShort = line.match(/^\s*https?:\/\/youtu\.be\/([\w-]+)\s*$/);
  if (ytShort) return `https://www.youtube.com/embed/${ytShort[1]}`;
  const vimeo = line.match(/^\s*https?:\/\/(?:www\.)?vimeo\.com\/(\d+)\s*$/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

export function computeMarkdownDecorations(text: string): DecoSpec[] {
  const specs: DecoSpec[] = [];
  const tree = parser.parse(text);

  tree.iterate({
    enter: (node) => {
      const name = node.name;
      const from = node.from;
      const to = node.to;

      if (HEADING_CLASS[name]) {
        specs.push({ kind: "mark", from, to, cls: HEADING_CLASS[name] });
        return;
      }
      if (name === "StrongEmphasis") { specs.push({ kind: "mark", from, to, cls: "cm-strong" }); return; }
      if (name === "Emphasis") { specs.push({ kind: "mark", from, to, cls: "cm-em" }); return; }
      if (name === "InlineCode") { specs.push({ kind: "mark", from, to, cls: "cm-inline-code" }); return; }
      if (name === "Blockquote") { specs.push({ kind: "mark", from, to, cls: "cm-quote" }); return; }

      // Markup punctuation to hide.
      if (name === "HeaderMark" || name === "EmphasisMark" || name === "CodeMark" ||
          name === "QuoteMark" || name === "ListMark" || name === "LinkMark") {
        // For HeaderMark/QuoteMark/ListMark, also swallow the trailing space so the
        // rendered line starts flush.
        let end = to;
        if ((name === "HeaderMark" || name === "QuoteMark" || name === "ListMark") && text[to] === " ") end = to + 1;
        specs.push({ kind: "hide", from, to: end });
        return;
      }

      if (name === "Image") {
        const raw = text.slice(from, to);
        const m = raw.match(/^!\[([^\]]*)\]\(([^)]*)\)$/);
        if (m) specs.push({ kind: "widget", from, to, widget: { type: "image", src: m[2], alt: m[1] } });
        return;
      }
    },
  });

  // Bare video URL line → video widget (one per matching line).
  let offset = 0;
  for (const line of text.split("\n")) {
    const src = videoEmbed(line);
    if (src) specs.push({ kind: "widget", from: offset, to: offset + line.length, widget: { type: "video", src } });
    offset += line.length + 1;
  }

  return specs.sort((a, b) => a.from - b.from || a.to - b.to);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/cmDecorations.test.ts`
Expected: PASS (6 tests). If a node name or offset differs from the installed `@lezer/markdown`, adjust the implementation (not the asserted behavior) so the tests pass honestly.

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/cmDecorations.ts src/processDocs/cmDecorations.test.ts
git commit -m "feat(docs): pure markdown decoration computation over lezer tree"
```

---

### Task 3: `mdWidgets.ts` — widgets CM6 de imagen y video

**Files:**
- Create: `src/processDocs/mdWidgets.ts`
- Test: `src/processDocs/mdWidgets.test.ts`

**Interfaces:**
- Consumes: `ImageWidget`/`VideoWidget` (Task 2), CM6 `WidgetType` (`@codemirror/view`).
- Produces:
  - `class ImageWidgetType extends WidgetType` (constructor `(src: string, alt: string)`)
  - `class VideoWidgetType extends WidgetType` (constructor `(src: string)`)
  - `function buildWidgetDom(w: ImageWidget | VideoWidget): HTMLElement` (pure DOM, used by both — testable without CM6)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildWidgetDom } from "./mdWidgets";

describe("buildWidgetDom", () => {
  it("builds an <img> for an image widget with the asset src and alt", () => {
    const el = buildWidgetDom({ type: "image", src: "assets/x.png", alt: "diagrama" });
    const img = el.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("assets/x.png");
    expect(img.getAttribute("alt")).toBe("diagrama");
  });

  it("builds an <iframe> for a whitelisted video host", () => {
    const el = buildWidgetDom({ type: "video", src: "https://www.youtube.com/embed/abc" });
    const f = el.querySelector("iframe")!;
    expect(f.getAttribute("src")).toBe("https://www.youtube.com/embed/abc");
  });

  it("does not build an iframe for a non-whitelisted host", () => {
    const el = buildWidgetDom({ type: "video", src: "https://evil.example.com/x" });
    expect(el.querySelector("iframe")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/mdWidgets.test.ts`
Expected: FAIL — cannot find module `./mdWidgets`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/mdWidgets.ts
import { WidgetType } from "@codemirror/view";
import type { ImageWidget, VideoWidget } from "./cmDecorations";

const ALLOWED_EMBED_HOSTS = ["www.youtube.com", "youtube.com", "player.vimeo.com", "vimeo.com", "www.loom.com", "loom.com"];

function isAllowedEmbed(src: string): boolean {
  try { return ALLOWED_EMBED_HOSTS.includes(new URL(src).host); } catch { return false; }
}

export function buildWidgetDom(w: ImageWidget | VideoWidget): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "cm-md-widget";
  if (w.type === "image") {
    const img = document.createElement("img");
    img.setAttribute("src", w.src);
    img.setAttribute("alt", w.alt);
    img.className = "cm-md-image";
    wrap.appendChild(img);
  } else if (w.type === "video" && isAllowedEmbed(w.src)) {
    const f = document.createElement("iframe");
    f.setAttribute("src", w.src);
    f.setAttribute("allowfullscreen", "");
    f.setAttribute("frameborder", "0");
    f.className = "cm-md-video";
    wrap.appendChild(f);
  }
  return wrap;
}

export class ImageWidgetType extends WidgetType {
  constructor(readonly src: string, readonly alt: string) { super(); }
  eq(other: ImageWidgetType): boolean { return other.src === this.src && other.alt === this.alt; }
  toDOM(): HTMLElement { return buildWidgetDom({ type: "image", src: this.src, alt: this.alt }); }
}

export class VideoWidgetType extends WidgetType {
  constructor(readonly src: string) { super(); }
  eq(other: VideoWidgetType): boolean { return other.src === this.src; }
  toDOM(): HTMLElement { return buildWidgetDom({ type: "video", src: this.src }); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/mdWidgets.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/mdWidgets.ts src/processDocs/mdWidgets.test.ts
git commit -m "feat(docs): CM6 image/video widgets (safe DOM, host whitelist)"
```

---

### Task 4: `livePreview.ts` — reveal por línea activa + ViewPlugin

**Files:**
- Create: `src/processDocs/livePreview.ts`
- Test: `src/processDocs/livePreview.test.ts`

**Interfaces:**
- Consumes: `computeMarkdownDecorations`/`DecoSpec` (Task 2), `ImageWidgetType`/`VideoWidgetType` (Task 3), CM6 `Decoration`/`ViewPlugin`/`EditorView` (`@codemirror/view`).
- Produces:
  - `function visibleSpecs(specs: DecoSpec[], activeRanges: Array<{ from: number; to: number }>): DecoSpec[]` (pure — drops `hide` specs that intersect an active range so the cursor line shows its markup; keeps `mark`/`widget`)
  - `function livePreview(): Extension` (the CM6 ViewPlugin)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { visibleSpecs } from "./livePreview";
import type { DecoSpec } from "./cmDecorations";

const specs: DecoSpec[] = [
  { kind: "hide", from: 0, to: 2 },                 // "# " on line at 0..5
  { kind: "mark", from: 0, to: 5, cls: "cm-heading-1" },
  { kind: "hide", from: 10, to: 12 },               // "# " on a different line
];

describe("visibleSpecs", () => {
  it("drops hide specs intersecting an active range (reveal markup on the cursor line)", () => {
    const out = visibleSpecs(specs, [{ from: 0, to: 5 }]);
    expect(out.find((s) => s.kind === "hide" && s.from === 0)).toBeUndefined(); // revealed
    expect(out.find((s) => s.kind === "hide" && s.from === 10)).toBeDefined();  // still hidden
    expect(out.find((s) => s.kind === "mark")).toBeDefined();                   // marks always kept
  });

  it("keeps all hides when no range is active", () => {
    expect(visibleSpecs(specs, []).filter((s) => s.kind === "hide").length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/livePreview.test.ts`
Expected: FAIL — cannot find module `./livePreview`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/livePreview.ts
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { computeMarkdownDecorations, type DecoSpec } from "./cmDecorations";
import { ImageWidgetType, VideoWidgetType } from "./mdWidgets";

function intersects(a: { from: number; to: number }, b: { from: number; to: number }): boolean {
  return a.from <= b.to && b.from <= a.to;
}

export function visibleSpecs(specs: DecoSpec[], activeRanges: Array<{ from: number; to: number }>): DecoSpec[] {
  return specs.filter((s) => {
    if (s.kind !== "hide") return true;
    return !activeRanges.some((r) => intersects(s, r));
  });
}

function activeLineRanges(view: EditorView): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  for (const r of view.state.selection.ranges) {
    const lineFrom = view.state.doc.lineAt(r.from);
    const lineTo = view.state.doc.lineAt(r.to);
    ranges.push({ from: lineFrom.from, to: lineTo.to });
  }
  return ranges;
}

function buildDecorations(view: EditorView): DecorationSet {
  const text = view.state.doc.toString();
  const specs = visibleSpecs(computeMarkdownDecorations(text), activeLineRanges(view));
  const builder = new RangeSetBuilder<Decoration>();
  for (const s of specs) {
    if (s.kind === "hide") {
      if (s.to > s.from) builder.add(s.from, s.to, Decoration.replace({}));
    } else if (s.kind === "mark" && s.cls) {
      if (s.to > s.from) builder.add(s.from, s.to, Decoration.mark({ class: s.cls }));
    } else if (s.kind === "widget" && s.widget) {
      const w = s.widget.type === "image"
        ? new ImageWidgetType(s.widget.src, s.widget.alt)
        : new VideoWidgetType(s.widget.src);
      // Replace the markup range with the rendered widget (block-ish, inline span).
      builder.add(s.from, s.to, Decoration.replace({ widget: w }));
    }
  }
  return builder.finish();
}

export function livePreview(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) { this.decorations = buildDecorations(view); }
      update(u: ViewUpdate): void {
        if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = buildDecorations(u.view);
      }
    },
    { decorations: (v) => v.decorations },
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/livePreview.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add src/processDocs/livePreview.ts src/processDocs/livePreview.test.ts
git commit -m "feat(docs): live-preview ViewPlugin with active-line markup reveal"
```

---

### Task 5: `cmEditor.ts` — envoltura del EditorView

**Files:**
- Create: `src/processDocs/cmEditor.ts`
- Test: `src/processDocs/cmEditor.test.ts`

**Interfaces:**
- Consumes: `livePreview` (Task 4), CM6 `EditorState`/`EditorView`, `markdown()` (`@codemirror/lang-markdown`), `history`/`defaultKeymap`/`historyKeymap` (`@codemirror/commands`), `keymap` (`@codemirror/view`).
- Produces:
  - `interface MarkdownEditor { getDoc(): string; setDoc(s: string): void; focus(): void; destroy(): void }`
  - `function createMarkdownEditor(parent: HTMLElement, opts: { doc: string; onChange: (doc: string) => void }): MarkdownEditor`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { createMarkdownEditor } from "./cmEditor";

describe("createMarkdownEditor", () => {
  it("initializes with the given doc and returns it via getDoc", () => {
    const parent = document.createElement("div");
    const ed = createMarkdownEditor(parent, { doc: "# Hola", onChange: vi.fn() });
    expect(ed.getDoc()).toBe("# Hola");
    ed.destroy();
  });

  it("setDoc replaces the document content", () => {
    const parent = document.createElement("div");
    const ed = createMarkdownEditor(parent, { doc: "a", onChange: vi.fn() });
    ed.setDoc("b");
    expect(ed.getDoc()).toBe("b");
    ed.destroy();
  });

  it("mounts the CM editor into the parent element", () => {
    const parent = document.createElement("div");
    const ed = createMarkdownEditor(parent, { doc: "x", onChange: vi.fn() });
    expect(parent.querySelector(".cm-editor")).not.toBeNull();
    ed.destroy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/cmEditor.test.ts`
Expected: FAIL — cannot find module `./cmEditor`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/cmEditor.ts
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { livePreview } from "./livePreview";

export interface MarkdownEditor {
  getDoc(): string;
  setDoc(s: string): void;
  focus(): void;
  destroy(): void;
}

export function createMarkdownEditor(
  parent: HTMLElement,
  opts: { doc: string; onChange: (doc: string) => void },
): MarkdownEditor {
  const updateListener = EditorView.updateListener.of((u) => {
    if (u.docChanged) opts.onChange(u.state.doc.toString());
  });

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: opts.doc,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        EditorView.lineWrapping,
        livePreview(),
        updateListener,
      ],
    }),
  });

  return {
    getDoc: () => view.state.doc.toString(),
    setDoc: (s: string) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: s } }),
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/cmEditor.test.ts`
Expected: PASS (3 tests). If happy-dom cannot construct an `EditorView` (layout APIs), reduce the third test to assert on `ed.getDoc()` only and verify mounting manually in Task 7; keep the doc-level assertions. Record any happy-dom limitation in your report.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add src/processDocs/cmEditor.ts src/processDocs/cmEditor.test.ts
git commit -m "feat(docs): CodeMirror 6 markdown editor wrapper"
```

---

### Task 6: Montar el editor CM6 en el panel (modo Editar)

**Files:**
- Modify: `src/processDocs/notePanel.ts` (modo edición delega el área de texto a un hook de montaje)
- Modify: `src/processDocs/notePanelController.ts` (crear/destruir el `MarkdownEditor` al entrar/salir de edición; `onChange` → `body`)
- Test: `src/processDocs/notePanelController.test.ts` (extender)

**Interfaces:**
- Consumes: `createMarkdownEditor`/`MarkdownEditor` (Task 5).
- Produces: el modo Editar usa CM6; el modo Leer queda igual (`renderMarkdown`).

**Background — current shape (Plan 1):** `renderNotePanel(container, state, h)` renders a `<textarea data-note-edit>` whose `input` calls `h.onBodyInput`, plus a Save button (`data-note-save` → `h.onSave`). The controller holds `body` and `mode`, and re-renders on every change. With CM6 we must NOT re-render the editor on each keystroke (CM6 owns its DOM). The cleanest seam: the panel renders an empty mount node `<div data-note-edit-host>` in edit mode and exposes a hook so the controller mounts/destroys the CM6 editor into it once per edit-session.

- [ ] **Step 1: Write the failing test (controller mounts CM6 and saves its doc)**

Add to `src/processDocs/notePanelController.test.ts`:

```ts
it("edits through the CM6 editor and saves the editor's document", async () => {
  const { docs, mount, ctrl } = setup([A], A); // existing helper
  await ctrl.refresh();
  (mount.querySelector('[data-mode="edit"]') as HTMLElement).click();
  // CM6 mounts into the edit host
  const host = mount.querySelector("[data-note-edit-host] .cm-editor");
  expect(host).not.toBeNull();
  // simulate typing by setting the editor doc through the controller's test seam
  ctrl._setEditorDocForTest("texto via cm6");
  (mount.querySelector("[data-note-save]") as HTMLButtonElement).click();
  await Promise.resolve(); await Promise.resolve();
  const saved = await docs.readNote("x.bpmn", "Activity_1");
  expect(saved).toContain("texto via cm6");
});
```

(If happy-dom cannot mount `.cm-editor`, assert instead that `_setEditorDocForTest` + save persists the text, and verify the `.cm-editor` mount manually in Task 7. Keep the persistence assertion.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/notePanelController.test.ts`
Expected: FAIL — `data-note-edit-host` not rendered / `_setEditorDocForTest` undefined.

- [ ] **Step 3: Update `notePanel.ts` edit branch**

Replace the edit-mode block (the `<textarea>` branch) so it renders a mount host instead of a textarea, keeping the Save button:

```ts
  // edit mode
  const host = document.createElement("div");
  host.dataset.noteEditHost = "true";
  host.className = "note-edit-host";
  const save = document.createElement("button");
  save.dataset.noteSave = "true";
  save.textContent = "Guardar";
  save.addEventListener("click", h.onSave);
  container.append(host, save);
  // Let the controller mount the CM6 editor into the host after render.
  h.onEditHostReady?.(host);
```

Add `onEditHostReady?(host: HTMLElement): void` to `NotePanelHandlers`. (Optional handler — keep existing tests valid by making it optional.)

- [ ] **Step 4: Update `notePanelController.ts`**

In the controller, hold an editor handle and mount/destroy it:

```ts
import { createMarkdownEditor, type MarkdownEditor } from "./cmEditor";
// ...
let editor: MarkdownEditor | null = null;

function destroyEditor(): void { editor?.destroy(); editor = null; }
```

Wire into the render handlers passed to `renderNotePanel`:
- add `onEditHostReady: (host) => { destroyEditor(); editor = createMarkdownEditor(host, { doc: body, onChange: (d) => { body = d; } }); editor.focus(); }`
- in `onModeChange`/`onTabChange`/after `onSave`: when leaving edit mode, call `destroyEditor()` before re-render.
- in `save()` (step tab): read from the live editor if present — `const text = editor ? editor.getDoc() : body;` then use `text` for `serializeFrontmatter(...)`. (Keep `body` in sync via onChange, but reading the editor on save is authoritative.)
- expose a test seam: `_setEditorDocForTest(s: string) { if (editor) editor.setDoc(s); else body = s; }` on the returned object.

Make sure `destroyEditor()` is also called when the selection changes while editing (the existing `onSelectionChange` resets mode to read).

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/processDocs/notePanelController.test.ts src/processDocs/notePanel.test.ts`
Expected: PASS (existing tests still green; new test green). Fix the `notePanel.test.ts` edit-mode test if it asserted on `<textarea>` — update it to assert the `[data-note-edit-host]` host is rendered and the Save button still fires `onSave` (do not weaken the save assertion).

Run: `npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add src/processDocs/notePanel.ts src/processDocs/notePanelController.ts src/processDocs/notePanel.test.ts src/processDocs/notePanelController.test.ts
git commit -m "feat(docs): mount CodeMirror 6 editor in note edit mode"
```

---

### Task 7: Estilos del live preview + verificación manual

**Files:**
- Modify: `src/app.css` (clases del live preview y del editor CM6)
- Manual: verificación en el `.exe`

**Interfaces:**
- Consumes: las clases emitidas por las decoraciones (`cm-heading-1..6`, `cm-strong`, `cm-em`, `cm-inline-code`, `cm-quote`) y los widgets (`cm-md-image`, `cm-md-video`), más el host `note-edit-host`.

- [ ] **Step 1: Add styles to `src/app.css`**

```css
/* CodeMirror live-preview editor */
.note-edit-host { flex: 1 1 auto; min-height: 120px; overflow: auto; }
.note-edit-host .cm-editor { height: 100%; background: transparent; color: inherit; }
.note-edit-host .cm-editor.cm-focused { outline: none; }
.note-edit-host .cm-scroller { font: inherit; line-height: 1.5; }
.cm-heading-1 { font-size: 1.5em; font-weight: 700; }
.cm-heading-2 { font-size: 1.3em; font-weight: 700; }
.cm-heading-3 { font-size: 1.15em; font-weight: 700; }
.cm-heading-4, .cm-heading-5, .cm-heading-6 { font-weight: 700; }
.cm-strong { font-weight: 700; }
.cm-em { font-style: italic; }
.cm-inline-code { font-family: monospace; background: var(--surface-2, rgba(127,127,127,.15)); padding: 0 3px; border-radius: 3px; }
.cm-quote { color: var(--muted, #888); border-left: 3px solid var(--border); padding-left: 8px; }
.cm-md-widget { display: block; margin: 4px 0; }
.cm-md-image { max-width: 100%; }
.cm-md-video { width: 100%; aspect-ratio: 16 / 9; border: 0; }
```

- [ ] **Step 2: Typecheck, full suite, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; all tests pass; build succeeds.

- [ ] **Step 3: Manual verification (`.exe` or `npm run dev`)**

Documentar un paso → modo Editar (ahora CM6). Verificar:
1. `# Título` → al salir de la línea, el `# ` se oculta y el texto se ve como encabezado; al volver el cursor a esa línea, reaparece `# ` para editar.
2. `**negrita**` / `*itálica*` / `` `código` `` → se estilizan; el markup se revela solo en la línea del cursor.
3. `> cita` y listas (`-`, `1.`) → marca oculta, contenido estilizado.
4. `![x](assets/foo.png)` (si hay una imagen en assets) → se ve la imagen inline.
5. Una URL de YouTube sola en una línea → iframe de video inline.
6. Guardar → en disco la nota tiene el markdown crudo (sin el render) con su frontmatter; el modo Leer (markdown-it) sigue funcionando.

- [ ] **Step 4: Commit**

```bash
git add src/app.css
git commit -m "feat(docs): live-preview editor styles (headings, emphasis, widgets)"
```

---

## Self-Review

**Spec coverage (Plan 2a = sección A + B del spec, parte de E):**
- A (editor CM6 reemplaza textarea) → Tasks 5, 6. ✓
- B (decoraciones live preview, reveal en línea del cursor, widgets imagen/video) → Tasks 2, 3, 4. ✓
- Integración con el panel (modo Editar CM6, modo Leer markdown-it sin cambios) → Task 6. ✓
- Estilos → Task 7. ✓
- Dependencias CM6 → Task 1. ✓

**Diferido a planes siguientes (no es gap):**
- Pegar/soltar imágenes + storage binario (sección C) → Plan 2b.
- Wikilinks: parser, autocompletado, navegación (sección D) → Plan 2c.

**Placeholder scan:** sin "TBD"/"TODO"; código real en cada paso. Tasks 5 y 6 incluyen una contingencia explícita por si happy-dom no puede montar el `EditorView` (degradar a aserciones de doc-level + verificación manual), porque CM6 mide layout y happy-dom no lo emula del todo — es una característica del entorno, no un placeholder.

**Type consistency:** `DecoSpec`/`ImageWidget`/`VideoWidget` (Task 2) consumidos por Tasks 3 y 4; `ImageWidgetType`/`VideoWidgetType` (Task 3) por Task 4; `livePreview` (Task 4) por Task 5; `MarkdownEditor`/`createMarkdownEditor` (Task 5) por Task 6. Clases CSS emitidas en Task 2 (`cm-heading-1`, `cm-strong`, `cm-em`, `cm-inline-code`, `cm-quote`) y widgets (`cm-md-image`, `cm-md-video`) estilizadas en Task 7. ✓

**Nota de ejecución:** los nombres de nodo de `@lezer/markdown` (`ATXHeading1`, `HeaderMark`, `StrongEmphasis`, `EmphasisMark`, `InlineCode`, `CodeMark`, `Blockquote`, `QuoteMark`, `ListMark`, `LinkMark`, `Image`) deben confirmarse contra la versión instalada en Task 1; si difieren, ajustar Task 2 (la conducta testeada no cambia). CM6 en happy-dom puede requerir degradar algunas aserciones de vista a verificación manual (Tasks 5-6), igual que la integración de `main.ts` en el Plan 1.
