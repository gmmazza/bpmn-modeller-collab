# Plan 2c — Wikilinks (`[[…]]`) + render de links markdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** En el editor CM6, `[[destino]]` se renderiza como link estilizado (markup oculto salvo en la línea del cursor), con **autocompletado** al tipear `[[` (procesos, elementos del diagrama, ideas) y **navegación al clic** (abrir proceso / seleccionar elemento / abrir idea). Además, los **links markdown** `[texto](url)` ahora ocultan la URL y estilizan el texto (pendiente del Plan 2a).

**Architecture:** La detección de `[[…]]` es un pase por regex dentro de `computeMarkdownDecorations` (lezer no parsea wikilinks); se filtran los specs del árbol que caigan dentro de un wikilink para no solapar `replace`s. El link markdown se completa en el walk del árbol (ocultar `URL`, marcar `Link` como `cm-link`). Un parser puro `parseWikilinkTarget` y un localizador `wikilinkAt(text,pos)` alimentan la navegación; `cmEditor` recibe `opts.wiki` (candidatos + navegar) y suma la extensión de autocompletado y un handler de clic sobre `.cm-wikilink`.

**Tech Stack:** TypeScript + Vite, Vitest (happy-dom), CodeMirror 6, `@codemirror/autocomplete`, `@lezer/markdown`.

## Global Constraints

- **TypeScript estricto**, sin framework de UI. Módulos puros `computeX`/`parseX` o factorías.
- **Sin solapamiento de `replace` en CM6:** los specs `hide`/`widget` (replace) nunca se solapan. Los specs del árbol que intersecten un rango `[[…]]` se descartan (el pase wikilink manda ahí).
- **Navegación:** clic en un `.cm-wikilink` → `parseWikilinkTarget` → callback: proceso (abrir `.bpmn`), elemento (seleccionar en el canvas), idea (no-op hasta Plan 3). El clic hace `preventDefault` para no reposicionar el cursor.
- **Reuso:** `_index.md`/`listDocumentableElements` para candidatos de elementos; lista de `.bpmn` de la carpeta para procesos; los tipos `DecoSpec` del Plan 2a.
- **Tests:** Vitest happy-dom, globals. Lógica pura (parse, decoraciones, candidatos, localizador) testeada; el wiring CM6 (autocompletado real, clic) se cierra con build + verificación manual.
- **Gate por tarea:** `npm test` + `npm run typecheck`; tareas de wiring agregan `npm run build`.
- **Rama:** `feat/plan2c-wikilinks` (apilada sobre Plan 2b).

---

### Task 1: deps + `wikilinks.ts` (`parseWikilinkTarget`, puro)

**Files:**
- Modify: `package.json` (dep `@codemirror/autocomplete`)
- Create: `src/processDocs/wikilinks.ts`
- Test: `src/processDocs/wikilinks.test.ts`

**Interfaces:**
- Produces:
  - `type WikiTarget = { kind: "idea"; ref: string } | { kind: "element"; process: string; element: string } | { kind: "bare"; text: string }`
  - `function parseWikilinkTarget(raw: string): WikiTarget`

- [ ] **Step 1: Install dependency**

Run: `npm install @codemirror/autocomplete`
Expected: `package.json` lists `@codemirror/autocomplete` in dependencies.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseWikilinkTarget } from "./wikilinks";

describe("parseWikilinkTarget", () => {
  it("parses an idea ref", () => {
    expect(parseWikilinkTarget("idea:abc")).toEqual({ kind: "idea", ref: "abc" });
  });
  it("parses process#element into an element target", () => {
    expect(parseWikilinkTarget("mi-proceso#Activity_1")).toEqual({ kind: "element", process: "mi-proceso", element: "Activity_1" });
  });
  it("treats a plain token as bare (resolved later against processes/elements)", () => {
    expect(parseWikilinkTarget("Validar factura")).toEqual({ kind: "bare", text: "Validar factura" });
  });
  it("trims surrounding whitespace", () => {
    expect(parseWikilinkTarget("  idea:x  ")).toEqual({ kind: "idea", ref: "x" });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/processDocs/wikilinks.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 4: Write minimal implementation**

```ts
// src/processDocs/wikilinks.ts
export type WikiTarget =
  | { kind: "idea"; ref: string }
  | { kind: "element"; process: string; element: string }
  | { kind: "bare"; text: string };

export function parseWikilinkTarget(raw: string): WikiTarget {
  const t = raw.trim();
  if (t.toLowerCase().startsWith("idea:")) return { kind: "idea", ref: t.slice(5).trim() };
  const hash = t.indexOf("#");
  if (hash > 0) return { kind: "element", process: t.slice(0, hash).trim(), element: t.slice(hash + 1).trim() };
  return { kind: "bare", text: t };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/processDocs/wikilinks.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add package.json package-lock.json src/processDocs/wikilinks.ts src/processDocs/wikilinks.test.ts
git commit -m "feat(docs): wikilink target parser + autocomplete dep"
```

---

### Task 2: decoraciones de wikilink + link markdown

**Files:**
- Modify: `src/processDocs/cmDecorations.ts`
- Test: `src/processDocs/cmDecorations.test.ts` (extend)

**Interfaces:**
- Consumes/Produces: mismo `DecoSpec[]` de `computeMarkdownDecorations`; nuevas clases `cm-wikilink` y `cm-link`.

- [ ] **Step 1: Write the failing test**

Add to `src/processDocs/cmDecorations.test.ts`:

```ts
describe("wikilinks and markdown links", () => {
  it("hides [[ ]] and marks the inner text as cm-wikilink", () => {
    const specs = computeMarkdownDecorations("ver [[mi-proceso]]");
    // "[[" at 4..6, "]]" at 17..19, inner "mi-proceso" 6..16 marked
    expect(specs.some((s) => s.kind === "hide" && s.from === 4 && s.to === 6)).toBe(true);
    expect(specs.some((s) => s.kind === "hide" && s.from === 17 && s.to === 19)).toBe(true);
    expect(specs.some((s) => s.kind === "mark" && s.cls === "cm-wikilink" && s.from === 6 && s.to === 16)).toBe(true);
  });

  it("does not emit overlapping hides inside a wikilink (tree specs filtered)", () => {
    const specs = computeMarkdownDecorations("[[a#b]]");
    const hides = specs.filter((s) => s.kind === "hide");
    // only the [[ and ]] hides — no LinkMark hides from the tree inside the wikilink
    expect(hides).toHaveLength(2);
  });

  it("marks a markdown link as cm-link and hides its URL", () => {
    const specs = computeMarkdownDecorations("[docs](http://a.b)");
    expect(specs.some((s) => s.kind === "mark" && s.cls === "cm-link")).toBe(true);
    // the URL "http://a.b" (7..17) is hidden
    expect(specs.some((s) => s.kind === "hide" && s.from === 7 && s.to === 17)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/cmDecorations.test.ts`
Expected: FAIL — cm-wikilink/cm-link specs missing.

- [ ] **Step 3: Update `cmDecorations.ts`**

Two changes.

(a) In the tree walk, add handling for markdown links (place BEFORE the generic hide block so `Link`/`URL` are handled; note `LinkMark` stays in the hide block):

```ts
      if (name === "Link") { specs.push({ kind: "mark", from, to, cls: "cm-link" }); return; }
      if (name === "URL") { specs.push({ kind: "hide", from, to }); return; }
```

(b) At the START of `computeMarkdownDecorations`, before walking the tree, compute wikilink ranges and emit their specs; then, after the tree walk, filter out any tree spec whose range falls inside a wikilink. Concretely:

```ts
export function computeMarkdownDecorations(text: string): DecoSpec[] {
  const specs: DecoSpec[] = [];

  // Wikilinks: [[target]] — lezer doesn't parse these, so scan by regex.
  const wikiRanges: Array<{ from: number; to: number }> = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let wm: RegExpExecArray | null;
  while ((wm = re.exec(text)) !== null) {
    const from = wm.index;
    const to = from + wm[0].length;
    wikiRanges.push({ from, to });
    specs.push({ kind: "hide", from, to: from + 2 });                 // "[["
    specs.push({ kind: "hide", from: to - 2, to });                   // "]]"
    specs.push({ kind: "mark", from: from + 2, to: to - 2, cls: "cm-wikilink" });
  }
  const insideWiki = (a: number, b: number) => wikiRanges.some((r) => a >= r.from && b <= r.to);

  const tree = parser.parse(text);
  const treeSpecs: DecoSpec[] = [];
  tree.iterate({
    enter: (node) => {
      // ... existing branches, but push into `treeSpecs` instead of `specs`
    },
  });
  for (const s of treeSpecs) if (!insideWiki(s.from, s.to)) specs.push(s);

  // ... existing bare-video-URL line pass (push into specs) ...
  return specs.sort((a, b) => a.from - b.from || a.to - b.to);
}
```
(Refactor the existing walk to push into `treeSpecs`; the video-URL pass and the final sort stay. Keep the image `return false` atomic behavior. The markdown-link `URL` hide will not fire inside images because Image does `return false`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/cmDecorations.test.ts`
Expected: PASS (existing + 3 new). Adjust byte offsets only if the real parser disagrees (the behaviors — wikilink hides/mark, no overlap, link URL hidden — must hold).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add src/processDocs/cmDecorations.ts src/processDocs/cmDecorations.test.ts
git commit -m "feat(docs): wikilink + markdown-link live-preview decorations"
```

---

### Task 3: `wikiComplete.ts` — candidatos de autocompletado (puro)

**Files:**
- Create: `src/processDocs/wikiComplete.ts`
- Test: `src/processDocs/wikiComplete.test.ts`

**Interfaces:**
- Produces:
  - `interface WikiCandidatesDeps { processes: string[]; elements: Array<{ id: string; name: string }>; ideas?: string[] }`
  - `function wikiCandidates(query: string, deps: WikiCandidatesDeps): Array<{ label: string; insert: string }>` — case-insensitive prefix/substring match over processes, element names, `id`, and ideas; `insert` is the text to place between `[[` `]]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { wikiCandidates } from "./wikiComplete";

const deps = {
  processes: ["ventas", "compras"],
  elements: [{ id: "Activity_1", name: "Validar factura" }, { id: "Gateway_2", name: "¿OK?" }],
  ideas: ["ocr-facturas"],
};

describe("wikiCandidates", () => {
  it("matches processes by substring (case-insensitive)", () => {
    expect(wikiCandidates("vent", deps).some((c) => c.insert === "ventas")).toBe(true);
  });
  it("matches element by name and inserts process#id form", () => {
    const c = wikiCandidates("valid", deps).find((x) => x.label.includes("Validar factura"));
    expect(c?.insert).toBe("Validar factura");
  });
  it("matches ideas with the idea: prefix", () => {
    expect(wikiCandidates("ocr", deps).some((c) => c.insert === "idea:ocr-facturas")).toBe(true);
  });
  it("returns all candidates for an empty query", () => {
    expect(wikiCandidates("", deps).length).toBe(5); // 2 processes + 2 elements + 1 idea
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/wikiComplete.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/wikiComplete.ts
export interface WikiCandidatesDeps {
  processes: string[];
  elements: Array<{ id: string; name: string }>;
  ideas?: string[];
}

export function wikiCandidates(query: string, deps: WikiCandidatesDeps): Array<{ label: string; insert: string }> {
  const q = query.trim().toLowerCase();
  const hit = (s: string) => q === "" || s.toLowerCase().includes(q);
  const out: Array<{ label: string; insert: string }> = [];
  for (const p of deps.processes) if (hit(p)) out.push({ label: `📄 ${p}`, insert: p });
  for (const e of deps.elements) if (hit(e.name) || hit(e.id)) out.push({ label: `▢ ${e.name} (${e.id})`, insert: e.name });
  for (const i of deps.ideas ?? []) if (hit(i)) out.push({ label: `💡 ${i}`, insert: `idea:${i}` });
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/wikiComplete.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/wikiComplete.ts src/processDocs/wikiComplete.test.ts
git commit -m "feat(docs): wikilink autocomplete candidates (pure)"
```

---

### Task 4: `wikilinkAt` — localizar el wikilink bajo una posición (puro)

**Files:**
- Create: `src/processDocs/wikilinkAt.ts`
- Test: `src/processDocs/wikilinkAt.test.ts`

**Interfaces:**
- Produces: `function wikilinkAt(text: string, pos: number): string | null` — si `pos` cae dentro de un `[[…]]`, devuelve el contenido interno; si no, `null`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { wikilinkAt } from "./wikilinkAt";

describe("wikilinkAt", () => {
  const t = "ver [[mi-proceso]] y [[a#b]]";
  it("returns the inner target when pos is inside a wikilink", () => {
    expect(wikilinkAt(t, 8)).toBe("mi-proceso");   // inside [[mi-proceso]]
    expect(wikilinkAt(t, 24)).toBe("a#b");          // inside [[a#b]]
  });
  it("returns null outside any wikilink", () => {
    expect(wikilinkAt(t, 0)).toBeNull();
    expect(wikilinkAt(t, 19)).toBeNull();           // between the two
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/wikilinkAt.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/wikilinkAt.ts
export function wikilinkAt(text: string, pos: number): string | null {
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const from = m.index;
    const to = from + m[0].length;
    if (pos >= from && pos <= to) return m[1];
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/wikilinkAt.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/wikilinkAt.ts src/processDocs/wikilinkAt.test.ts
git commit -m "feat(docs): locate wikilink under a document position (pure)"
```

---

### Task 5: integrar autocompletado + navegación + estilos + manual

**Files:**
- Modify: `src/processDocs/cmEditor.ts` (autocompletion + click nav)
- Modify: `src/processDocs/notePanelController.ts` (proveer candidatos + callbacks de navegación)
- Modify: `src/main.ts` (lista de procesos + abrir proceso / seleccionar elemento)
- Modify: `src/app.css` (`.cm-wikilink`, `.cm-link`)
- Test: `src/processDocs/cmEditor.test.ts` (extend — smoke que el editor acepta `opts.wiki` sin romper)

**Interfaces:**
- Consumes: `wikiCandidates` (T3), `wikilinkAt` (T4), `parseWikilinkTarget` (T1).
- Produces: `createMarkdownEditor` acepta `opts.wiki?: { candidates(query: string): Array<{label:string;insert:string}>; navigate(raw: string): void }`.

- [ ] **Step 1: Extend `cmEditor.ts`**

Add imports:
```ts
import { autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { wikilinkAt } from "./wikilinkAt";
```
Add `opts.wiki?` to the signature. When present, add these extensions to the `EditorState`:

```ts
    const wikiExt = opts.wiki
      ? [
          autocompletion({
            override: [(ctx: CompletionContext): CompletionResult | null => {
              // Trigger when the text right before the cursor contains an unclosed "[["
              const line = ctx.state.doc.lineAt(ctx.pos);
              const before = line.text.slice(0, ctx.pos - line.from);
              const open = before.lastIndexOf("[[");
              if (open < 0 || before.indexOf("]]", open) !== -1) return null;
              const query = before.slice(open + 2);
              const from = line.from + open + 2;
              const options = opts.wiki!.candidates(query).map((c) => ({ label: c.label, apply: c.insert }));
              return { from, options, filter: false };
            }],
          }),
          EditorView.domEventHandlers({
            mousedown: (event, view) => {
              const target = event.target as HTMLElement;
              if (!target.closest(".cm-wikilink")) return false;
              const pos = view.posAtDOM(target);
              const raw = wikilinkAt(view.state.doc.toString(), pos);
              if (!raw) return false;
              event.preventDefault();
              opts.wiki!.navigate(raw);
              return true;
            },
          }),
        ]
      : [];
```
and include `...wikiExt` in the extensions array (after `livePreview(...)`).

- [ ] **Step 2: Wire the controller (`notePanelController.ts`)**

The controller already receives `NoteControllerApi`. Add optional fields to it:
```ts
  wikiProcesses?(): string[];
  navigateWiki?(target: import("./wikilinks").WikiTarget, raw: string): void;
```
When creating the editor (`onEditHostReady`), pass:
```ts
      wiki: api.navigateWiki
        ? {
            candidates: (q: string) => wikiCandidates(q, {
              processes: api.wikiProcesses ? api.wikiProcesses() : [],
              elements: api.listElements().map((e) => ({ id: e.id, name: e.name })),
            }),
            navigate: (raw: string) => api.navigateWiki!(parseWikilinkTarget(raw), raw),
          }
        : undefined,
```
(Import `wikiCandidates` and `parseWikilinkTarget`.)

- [ ] **Step 3: Wire `main.ts`**

Where `createNotePanelController({...})` is built, add:
```ts
      wikiProcesses: () =>
        // diagram base names (minus .bpmn) of every .bpmn currently in the tree
        (currentTree ?? []).filter((e) => e.kind === "file" && e.path.endsWith(".bpmn")).map((e) => e.path.replace(/\.bpmn$/i, "")),
      navigateWiki: (target) => {
        if (target.kind === "bare") {
          // process match first, else element by name in the current diagram
          const asFile = `${target.text}.bpmn`;
          if ((currentTree ?? []).some((e) => e.path === asFile)) { void openFile(asFile).catch(onError); return; }
          const el = listDocumentableElements(modeler).find((e) => e.name === target.text);
          if (el) selectElementById(el.id);
        } else if (target.kind === "element") {
          selectElementById(target.element);
        }
        // idea: no-op until Plan 3
      },
```
Add a helper `selectElementById(id)` near the modeler wiring:
```ts
  function selectElementById(id: string): void {
    const reg = modeler.get("elementRegistry");
    const el = reg.get(id);
    if (el) modeler.get("selection").select(el);
  }
```
`currentTree` is the last file tree; if the code uses a different variable for the tree, use it. If no tree var exists, call `await api.listTree()` and cache it; keep it simple — reuse whatever the file panel already holds.

- [ ] **Step 4: Styles in `src/app.css`**

```css
.cm-wikilink { color: var(--accent); cursor: pointer; text-decoration: underline; }
.cm-link { color: var(--accent); cursor: pointer; }
```

- [ ] **Step 5: Extend `cmEditor.test.ts`**

```ts
it("accepts wiki options and still round-trips the doc", () => {
  const parent = document.createElement("div");
  const ed = createMarkdownEditor(parent, {
    doc: "[[x]]",
    onChange: () => {},
    wiki: { candidates: () => [{ label: "x", insert: "x" }], navigate: () => {} },
  });
  expect(ed.getDoc()).toBe("[[x]]");
  ed.destroy();
});
```

- [ ] **Step 6: Typecheck, full suite, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green.

- [ ] **Step 7: Manual verification (build/exe)**

En una nota: escribir `[[` → aparece el autocompletado con procesos/elementos; elegir uno inserta el nombre; `]]` cierra. En modo edición, un `[[proceso]]` fuera de la línea del cursor se ve estilizado; clic → abre ese `.bpmn`. `[[Nombre de elemento]]` → selecciona el elemento en el canvas. Un `[texto](url)` muestra solo "texto" estilizado (URL oculta) salvo en la línea del cursor.

- [ ] **Step 8: Commit**

```bash
git add src/processDocs/cmEditor.ts src/processDocs/notePanelController.ts src/main.ts src/app.css src/processDocs/cmEditor.test.ts
git commit -m "feat(docs): wikilink autocomplete + click navigation + styles"
```

---

## Self-Review

**Spec coverage (sección D del spec + finding diferido del 2a):**
- Autocompletado `[[` sobre procesos/elementos/ideas → Tasks 3, 5. ✓
- Render inline del wikilink (markup oculto salvo línea del cursor) → Task 2. ✓
- Navegación con clic (proceso/elemento/idea) → Tasks 1, 4, 5. ✓
- Fix de link markdown (ocultar URL, marcar texto) — finding diferido del Plan 2a → Task 2. ✓

**Diferido / fuera de alcance:** ideas como destino operan recién con el Plan 3 (hoy `navigate` idea = no-op); transclusión `![[proceso]]` fuera de alcance.

**Placeholder scan:** sin TBD/TODO. Task 5 (wiring CM6/main.ts) usa anclas concretas y una verificación manual; el `currentTree` debe mapearse a la variable real del árbol de archivos en `main.ts` (el implementador la localiza; si no existe, cachear `listTree()`).

**Type consistency:** `WikiTarget`/`parseWikilinkTarget` (T1) → controller/main (T5); `wikiCandidates`/`WikiCandidatesDeps` (T3) → controller (T5); `wikilinkAt` (T4) → cmEditor (T5). Clases `cm-wikilink`/`cm-link` emitidas en T2, estilizadas en T5.

**Nota de ejecución:** los nombres de nodo `Link`/`URL` de `@lezer/markdown` se confirmaron en el Plan 2a (Image→LinkMark/URL). El autocompletado y la navegación CM6 (T5) no tienen unit test más allá del smoke; gate = typecheck+build+manual.
