# Plan 3 — Bandeja de ideas + overlays en el gráfico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Una pestaña **Ideas** en el panel de Documentación para capturar ideas sueltas (ancladas a un elemento o generales), guardadas en `<diagrama>.docs/_ideas.md` con casillas `- [ ]`/`- [x]` (triaje). Las ideas ancladas se ven como **post-its** (overlays con conteo) sobre el diagrama; se muestran cuando la pestaña Ideas está activa o cuando el toggle "mostrar en el diagrama" está encendido.

**Architecture:** `ideasModel.ts` (puro) parsea/serializa `_ideas.md` y aplica mutaciones; `docsClient` lee/escribe el archivo; `ideasPanel.ts` renderiza la pestaña (quick-add + lista + filtro); `ideasOverlays.ts` calcula `{elementId,count}` (puro) y un renderer usa el servicio `overlays` de bpmn-js. El controlador carga/guarda ideas y muestra/oculta los overlays según pestaña/toggle. Fuente de verdad legible por LLM: el markdown.

**Tech Stack:** TypeScript + Vite, Vitest (happy-dom), bpmn-js (`overlays`).

## Global Constraints

- **Formato `_ideas.md`** (agent-friendly): encabezado `# Ideas sueltas — <proceso>` y una línea por idea:
  `- [ ] (<ancla>) <texto> — <autor>, <fecha>` donde `<ancla>` es `general` o `<elementId> · <label>`, `[ ]`=pendiente / `[x]`=procesada, `<fecha>`=`YYYY-MM-DD`.
- **Overlays derivados:** el contenido de los post-its se deriva de `_ideas.md`; NO se guarda en `.layers.json`.
- **Toggle en la pestaña Ideas** (checkbox "Mostrar en el diagrama"), persistido en `localStorage`. Los overlays también se muestran mientras la pestaña Ideas está activa (auto-on), y se ocultan al salir si el toggle está apagado.
- **Acceso a disco solo vía `docsClient`.** Autor desde la identidad de la app; fecha con `new Date().toISOString().slice(0,10)`.
- **Tests:** Vitest happy-dom. Lógica pura (parse/serialize/mutaciones/overlay-data/render DOM) testeada; el renderer de overlays bpmn-js y el wiring en `main.ts` se cierran con build + manual.
- **Gate por tarea:** `npm test` + `npm run typecheck`; tareas de wiring agregan `npm run build`.
- **Rama:** `feat/plan3-ideas` (apilada sobre Plan 2c).

---

### Task 1: `docsPaths.ideasPath` + `ideasModel.ts` (puro)

**Files:**
- Modify: `src/processDocs/docsPaths.ts` (add `ideasPath`)
- Create: `src/processDocs/ideasModel.ts`
- Test: `src/processDocs/ideasModel.test.ts`, `src/processDocs/docsPaths.test.ts` (extend)

**Interfaces:**
- Produces:
  - `docsPaths.ideasPath(diagramId): string` → `<base>.docs/_ideas.md`
  - `interface Idea { done: boolean; anchor: string | null; anchorLabel: string; text: string; author: string; date: string }`
  - `parseIdeas(md: string): Idea[]`
  - `serializeIdeas(processName: string, ideas: Idea[]): string`
  - `addIdea(ideas: Idea[], idea: Idea): Idea[]`
  - `toggleIdea(ideas: Idea[], index: number): Idea[]`
  - `anchoredCounts(ideas: Idea[]): Array<{ elementId: string; count: number }>` (solo pendientes, agrupadas por `anchor`)

- [ ] **Step 1: Write the failing test**

`src/processDocs/ideasModel.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseIdeas, serializeIdeas, addIdea, toggleIdea, anchoredCounts } from "./ideasModel";

const SAMPLE = `# Ideas sueltas — Validación

- [ ] (Activity_1 · Validar factura) avisar por mail si tarda — Ana, 2026-06-30
- [x] (general) automatizar OCR — Beto, 2026-06-29
`;

describe("ideasModel", () => {
  it("parses anchored and general ideas with done flags", () => {
    const ideas = parseIdeas(SAMPLE);
    expect(ideas).toHaveLength(2);
    expect(ideas[0]).toEqual({ done: false, anchor: "Activity_1", anchorLabel: "Validar factura", text: "avisar por mail si tarda", author: "Ana", date: "2026-06-30" });
    expect(ideas[1]).toEqual({ done: true, anchor: null, anchorLabel: "", text: "automatizar OCR", author: "Beto", date: "2026-06-29" });
  });

  it("round-trips through serialize", () => {
    const ideas = parseIdeas(SAMPLE);
    const out = serializeIdeas("Validación", ideas);
    expect(parseIdeas(out)).toEqual(ideas);
    expect(out).toContain("# Ideas sueltas — Validación");
  });

  it("adds an idea and toggles done", () => {
    let ideas: Idea[] = [];
    ideas = addIdea(ideas, { done: false, anchor: "G_1", anchorLabel: "¿OK?", text: "falta caso duplicado", author: "Ana", date: "2026-07-01" });
    expect(ideas).toHaveLength(1);
    ideas = toggleIdea(ideas, 0);
    expect(ideas[0].done).toBe(true);
  });

  it("counts only pending ideas per anchored element", () => {
    const ideas = [
      { done: false, anchor: "A", anchorLabel: "x", text: "a", author: "u", date: "d" },
      { done: false, anchor: "A", anchorLabel: "x", text: "b", author: "u", date: "d" },
      { done: true, anchor: "A", anchorLabel: "x", text: "c", author: "u", date: "d" },
      { done: false, anchor: null, anchorLabel: "", text: "d", author: "u", date: "d" },
    ];
    expect(anchoredCounts(ideas)).toEqual([{ elementId: "A", count: 2 }]);
  });
});
import type { Idea } from "./ideasModel";
```

Add to `src/processDocs/docsPaths.test.ts`:
```ts
it("builds the ideas path", () => {
  // import ideasPath at the top with the others
  expect(ideasPath("x.bpmn")).toBe("x.docs/_ideas.md");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/processDocs/ideasModel.test.ts src/processDocs/docsPaths.test.ts`
Expected: FAIL — modules/functions missing.

- [ ] **Step 3: Implement**

Add to `src/processDocs/docsPaths.ts`:
```ts
export function ideasPath(diagramId: string): string {
  return `${docsDir(diagramId)}/_ideas.md`;
}
```

`src/processDocs/ideasModel.ts`:
```ts
export interface Idea {
  done: boolean;
  anchor: string | null;   // elementId or null for a general idea
  anchorLabel: string;     // element name (display only), "" for general
  text: string;
  author: string;
  date: string;            // YYYY-MM-DD
}

const LINE = /^- \[([ xX])\] \(([^)]*)\) (.*) — ([^,]+), (\d{4}-\d{2}-\d{2})\s*$/;

export function parseIdeas(md: string): Idea[] {
  const out: Idea[] = [];
  for (const raw of md.split("\n")) {
    const m = raw.match(LINE);
    if (!m) continue;
    const done = m[1].toLowerCase() === "x";
    const anchorRaw = m[2].trim();
    let anchor: string | null = null;
    let anchorLabel = "";
    if (anchorRaw !== "general") {
      const dot = anchorRaw.indexOf(" · ");
      if (dot >= 0) { anchor = anchorRaw.slice(0, dot).trim(); anchorLabel = anchorRaw.slice(dot + 3).trim(); }
      else { anchor = anchorRaw; }
    }
    out.push({ done, anchor, anchorLabel, text: m[3].trim(), author: m[4].trim(), date: m[5] });
  }
  return out;
}

function anchorText(i: Idea): string {
  if (!i.anchor) return "general";
  return i.anchorLabel ? `${i.anchor} · ${i.anchorLabel}` : i.anchor;
}

export function serializeIdeas(processName: string, ideas: Idea[]): string {
  const lines = ideas.map((i) => `- [${i.done ? "x" : " "}] (${anchorText(i)}) ${i.text} — ${i.author}, ${i.date}`);
  return `# Ideas sueltas — ${processName}\n\n${lines.join("\n")}\n`;
}

export function addIdea(ideas: Idea[], idea: Idea): Idea[] {
  return [...ideas, idea];
}

export function toggleIdea(ideas: Idea[], index: number): Idea[] {
  return ideas.map((i, n) => (n === index ? { ...i, done: !i.done } : i));
}

export function anchoredCounts(ideas: Idea[]): Array<{ elementId: string; count: number }> {
  const map = new Map<string, number>();
  for (const i of ideas) if (!i.done && i.anchor) map.set(i.anchor, (map.get(i.anchor) ?? 0) + 1);
  return [...map.entries()].map(([elementId, count]) => ({ elementId, count }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/processDocs/ideasModel.test.ts src/processDocs/docsPaths.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add src/processDocs/ideasModel.ts src/processDocs/ideasModel.test.ts src/processDocs/docsPaths.ts src/processDocs/docsPaths.test.ts
git commit -m "feat(docs): ideas model (parse/serialize/mutations) + ideas path"
```

---

### Task 2: `docsClient` ideas IO

**Files:**
- Modify: `src/processDocs/docsClient.ts`
- Test: `src/processDocs/docsClient.test.ts` (extend)

**Interfaces:**
- Consumes: `ideasPath` (Task 1).
- Produces on `DocsClient`:
  - `readIdeas(diagramId: string): Promise<string | null>`
  - `writeIdeas(diagramId: string, md: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

Add to `src/processDocs/docsClient.test.ts`:
```ts
it("writes and reads the ideas file", async () => {
  const c = client();
  await c.writeIdeas("x.bpmn", "# Ideas sueltas — x\n\n- [ ] (general) hola — Ana, 2026-07-01\n");
  const md = await c.readIdeas("x.bpmn");
  expect(md).toContain("hola");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/docsClient.test.ts`
Expected: FAIL — `writeIdeas` not a function.

- [ ] **Step 3: Implement**

Import `ideasPath` in `docsClient.ts`; add to the returned object:
```ts
    readIdeas(diagramId: string): Promise<string | null> {
      return api.readPath(ideasPath(diagramId));
    },
    writeIdeas(diagramId: string, md: string): Promise<void> {
      return api.writePath(ideasPath(diagramId), md);
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/docsClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add src/processDocs/docsClient.ts src/processDocs/docsClient.test.ts
git commit -m "feat(docs): docsClient read/write ideas file"
```

---

### Task 3: `ideasPanel.ts` — vista de la pestaña Ideas

**Files:**
- Create: `src/processDocs/ideasPanel.ts`
- Test: `src/processDocs/ideasPanel.test.ts`

**Interfaces:**
- Consumes: `Idea` (Task 1).
- Produces:
  - `interface IdeasPanelState { ideas: Idea[]; showOnDiagram: boolean; filterPending: boolean; selectedLabel: string | null }`
  - `interface IdeasPanelHandlers { onAdd(text: string, anchorToSelection: boolean): void; onToggle(index: number): void; onToggleShow(on: boolean): void; onToggleFilter(pending: boolean): void }`
  - `function renderIdeasPanel(container: HTMLElement, state: IdeasPanelState, h: IdeasPanelHandlers): void`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { renderIdeasPanel, type IdeasPanelHandlers } from "./ideasPanel";
import type { Idea } from "./ideasModel";

function handlers(): IdeasPanelHandlers {
  return { onAdd: vi.fn(), onToggle: vi.fn(), onToggleShow: vi.fn(), onToggleFilter: vi.fn() };
}
const ideas: Idea[] = [
  { done: false, anchor: "A", anchorLabel: "Validar", text: "idea uno", author: "Ana", date: "2026-07-01" },
  { done: true, anchor: null, anchorLabel: "", text: "idea dos", author: "Beto", date: "2026-06-30" },
];

describe("renderIdeasPanel", () => {
  it("lists ideas with checkboxes reflecting done", () => {
    const c = document.createElement("div");
    renderIdeasPanel(c, { ideas, showOnDiagram: true, filterPending: false, selectedLabel: "Validar" }, handlers());
    const boxes = c.querySelectorAll<HTMLInputElement>("[data-idea-check]");
    expect(boxes).toHaveLength(2);
    expect(boxes[1].checked).toBe(true);
    expect(c.textContent).toContain("idea uno");
  });

  it("quick-add fires onAdd with the text and anchor-to-selection flag", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderIdeasPanel(c, { ideas: [], showOnDiagram: false, filterPending: true, selectedLabel: "Validar" }, h);
    const input = c.querySelector<HTMLInputElement>("[data-idea-input]")!;
    input.value = "nueva idea";
    const anchor = c.querySelector<HTMLInputElement>("[data-idea-anchor]")!;
    anchor.checked = true;
    (c.querySelector("[data-idea-add]") as HTMLButtonElement).click();
    expect(h.onAdd).toHaveBeenCalledWith("nueva idea", true);
  });

  it("toggling a checkbox fires onToggle with the index", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderIdeasPanel(c, { ideas, showOnDiagram: true, filterPending: false, selectedLabel: null }, h);
    c.querySelectorAll<HTMLInputElement>("[data-idea-check]")[0].dispatchEvent(new Event("change"));
    expect(h.onToggle).toHaveBeenCalledWith(0);
  });

  it("the show-on-diagram switch reflects state and fires onToggleShow", () => {
    const c = document.createElement("div");
    const h = handlers();
    renderIdeasPanel(c, { ideas, showOnDiagram: false, filterPending: false, selectedLabel: null }, h);
    const sw = c.querySelector<HTMLInputElement>("[data-idea-show]")!;
    expect(sw.checked).toBe(false);
    sw.checked = true; sw.dispatchEvent(new Event("change"));
    expect(h.onToggleShow).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/ideasPanel.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

```ts
// src/processDocs/ideasPanel.ts
import type { Idea } from "./ideasModel";

export interface IdeasPanelState {
  ideas: Idea[];
  showOnDiagram: boolean;
  filterPending: boolean;
  selectedLabel: string | null;
}
export interface IdeasPanelHandlers {
  onAdd(text: string, anchorToSelection: boolean): void;
  onToggle(index: number): void;
  onToggleShow(on: boolean): void;
  onToggleFilter(pending: boolean): void;
}

export function renderIdeasPanel(container: HTMLElement, state: IdeasPanelState, h: IdeasPanelHandlers): void {
  container.innerHTML = "";
  container.className = "ideas-panel";

  // Quick-add
  const add = document.createElement("div");
  add.className = "ideas-add";
  const input = document.createElement("input");
  input.dataset.ideaInput = "true";
  input.placeholder = "Nueva idea…";
  const anchorLabel = document.createElement("label");
  anchorLabel.className = "ideas-anchor";
  const anchor = document.createElement("input");
  anchor.type = "checkbox";
  anchor.dataset.ideaAnchor = "true";
  anchor.disabled = !state.selectedLabel;
  if (state.selectedLabel) anchor.checked = true;
  anchorLabel.append(anchor, document.createTextNode(state.selectedLabel ? `Anclar a: ${state.selectedLabel}` : "Sin paso seleccionado"));
  const addBtn = document.createElement("button");
  addBtn.dataset.ideaAdd = "true";
  addBtn.textContent = "Agregar";
  addBtn.addEventListener("click", () => {
    const text = input.value.trim();
    if (text) h.onAdd(text, anchor.checked && !anchor.disabled);
  });
  add.append(input, anchorLabel, addBtn);

  // Controls
  const controls = document.createElement("div");
  controls.className = "ideas-controls";
  const show = document.createElement("input");
  show.type = "checkbox";
  show.dataset.ideaShow = "true";
  show.checked = state.showOnDiagram;
  show.addEventListener("change", () => h.onToggleShow(show.checked));
  const showL = document.createElement("label");
  showL.append(show, document.createTextNode("Mostrar en el diagrama"));
  const filter = document.createElement("input");
  filter.type = "checkbox";
  filter.dataset.ideaFilter = "true";
  filter.checked = state.filterPending;
  filter.addEventListener("change", () => h.onToggleFilter(filter.checked));
  const filterL = document.createElement("label");
  filterL.append(filter, document.createTextNode("Solo pendientes"));
  controls.append(showL, filterL);

  // List
  const list = document.createElement("ul");
  list.className = "ideas-list";
  state.ideas.forEach((idea, index) => {
    if (state.filterPending && idea.done) return;
    const li = document.createElement("li");
    li.className = idea.done ? "idea done" : "idea";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.dataset.ideaCheck = "true";
    check.checked = idea.done;
    check.addEventListener("change", () => h.onToggle(index));
    const body = document.createElement("span");
    body.className = "idea-body";
    const where = idea.anchor ? `${idea.anchorLabel || idea.anchor}` : "general";
    body.textContent = `${idea.text}  ·  ${where}  ·  ${idea.author}, ${idea.date}`;
    li.append(check, body);
    list.append(li);
  });

  container.append(add, controls, list);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/ideasPanel.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/ideasPanel.ts src/processDocs/ideasPanel.test.ts
git commit -m "feat(docs): ideas panel view (quick-add, list, filters)"
```

---

### Task 4: `ideasOverlays.ts` — post-its en el diagrama

**Files:**
- Create: `src/processDocs/ideasOverlays.ts`
- Test: `src/processDocs/ideasOverlays.test.ts`

**Interfaces:**
- Consumes: `anchoredCounts` (Task 1).
- Produces:
  - `interface OverlayHost { add(elementId: string, html: HTMLElement): string; remove(id: string): void }`
  - `function ideaBadge(count: number): HTMLElement` (pure DOM)
  - `function createIdeaOverlays(host: OverlayHost)` returning `{ render(ideas: Idea[]): void; clear(): void }` — adds a badge overlay per anchored element (pending count), clearing previous ones.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { ideaBadge, createIdeaOverlays } from "./ideasOverlays";
import type { Idea } from "./ideasModel";

describe("ideasOverlays", () => {
  it("builds a badge element with the count", () => {
    const el = ideaBadge(3);
    expect(el.textContent).toContain("3");
    expect(el.className).toContain("idea-badge");
  });

  it("adds one overlay per anchored element and clears previous on re-render", () => {
    const added: string[] = [];
    let n = 0;
    const host = {
      add: vi.fn((elementId: string) => { added.push(elementId); return `o${n++}`; }),
      remove: vi.fn(),
    };
    const ov = createIdeaOverlays(host);
    const ideas: Idea[] = [
      { done: false, anchor: "A", anchorLabel: "x", text: "a", author: "u", date: "d" },
      { done: false, anchor: "A", anchorLabel: "x", text: "b", author: "u", date: "d" },
      { done: false, anchor: "B", anchorLabel: "y", text: "c", author: "u", date: "d" },
    ];
    ov.render(ideas);
    expect(host.add).toHaveBeenCalledTimes(2); // A and B
    ov.render([]); // re-render clears the two previous overlays
    expect(host.remove).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/ideasOverlays.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

```ts
// src/processDocs/ideasOverlays.ts
import { anchoredCounts, type Idea } from "./ideasModel";

export interface OverlayHost {
  add(elementId: string, html: HTMLElement): string;
  remove(id: string): void;
}

export function ideaBadge(count: number): HTMLElement {
  const el = document.createElement("div");
  el.className = "idea-badge";
  el.title = `${count} idea(s) pendiente(s)`;
  el.textContent = `💡 ${count}`;
  return el;
}

export function createIdeaOverlays(host: OverlayHost) {
  let ids: string[] = [];
  function clear(): void {
    for (const id of ids) host.remove(id);
    ids = [];
  }
  return {
    clear,
    render(ideas: Idea[]): void {
      clear();
      for (const { elementId, count } of anchoredCounts(ideas)) {
        try {
          ids.push(host.add(elementId, ideaBadge(count)));
        } catch {
          /* element not on canvas (e.g. deleted) — skip */
        }
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/ideasOverlays.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/ideasOverlays.ts src/processDocs/ideasOverlays.test.ts
git commit -m "feat(docs): idea overlays (badge per anchored element)"
```

---

### Task 5: Integración (pestaña Ideas + controlador + main.ts + estilos + manual)

**Files:**
- Modify: `src/processDocs/notePanel.ts` (tab "ideas" + host)
- Modify: `src/processDocs/notePanelController.ts` (cargar/guardar ideas, quick-add, overlays por pestaña/toggle)
- Modify: `src/main.ts` (proveer `OverlayHost` desde bpmn-js `overlays`, identidad/fecha, navegar idea→pestaña)
- Modify: `src/app.css` (estilos ideas)
- Test: `src/processDocs/notePanel.test.ts` (extend: la tab ideas renderiza su host)

**Interfaces:**
- Consumes: `renderIdeasPanel` (T3), `createIdeaOverlays`/`OverlayHost` (T4), `parseIdeas`/`serializeIdeas`/`addIdea`/`toggleIdea` (T1), `docsClient.readIdeas`/`writeIdeas` (T2).

- [ ] **Step 1: `notePanel.ts` — add the "ideas" tab + host**

Extend `NoteTab` to `"step" | "process" | "ideas"`. Add a third tab button `tabButton("ideas", state.tab, "Ideas", h.onTabChange)`. When `state.tab === "ideas"`, render (instead of the note body): a mount host and call an optional handler:
```ts
  if (state.tab === "ideas") {
    const host = document.createElement("div");
    host.dataset.ideasHost = "true";
    container.append(host);
    h.onIdeasHostReady?.(host);
    return;
  }
```
Add `onIdeasHostReady?(host: HTMLElement): void` to `NotePanelHandlers`.

- [ ] **Step 2: `notePanelController.ts` — ideas state + wiring**

Add to `NoteControllerApi` (optional):
```ts
  ideasOverlays?: import("./ideasOverlays").OverlayHost;
  identity?(): string;          // author name
  today?(): string;             // YYYY-MM-DD
```
Add controller state: `let ideas: Idea[] = []; let showIdeas = false; let filterPending = false; let overlays: ReturnType<typeof createIdeaOverlays> | null = null;`
- On note load (`loadBody`/refresh) also load ideas: `const md = await api.docs.readIdeas(api.diagramId()); ideas = md ? parseIdeas(md) : []; refreshOverlays();`
- `refreshOverlays()`: if `api.ideasOverlays` and (`tab === "ideas" || showIdeas`) → `overlays ??= createIdeaOverlays(api.ideasOverlays); overlays.render(ideas)`; else `overlays?.clear()`.
- `showIdeas` initial value from `localStorage.getItem("ideasShow") === "1"`.
- When `tab === "ideas"`, in the render handlers add `onIdeasHostReady: (host) => renderIdeasPanel(host, { ideas, showOnDiagram: showIdeas, filterPending, selectedLabel: api.getSelected()?.name ?? null }, ideasHandlers)`.
- `ideasHandlers`:
  - `onAdd(text, anchorToSelection)`: build an `Idea` with `author = api.identity?.() ?? ""`, `date = api.today?.() ?? ""`, `anchor`/`anchorLabel` from the selected element when `anchorToSelection` (else general); `ideas = addIdea(ideas, idea)`; `await saveIdeas(); rerenderIdeas(); refreshOverlays();`
  - `onToggle(i)`: `ideas = toggleIdea(ideas, i); await saveIdeas(); rerenderIdeas(); refreshOverlays();`
  - `onToggleShow(on)`: `showIdeas = on; localStorage.setItem("ideasShow", on ? "1" : "0"); refreshOverlays();`
  - `onToggleFilter(p)`: `filterPending = p; rerenderIdeas();`
- `saveIdeas()`: `await api.docs.writeIdeas(api.diagramId(), serializeIdeas(api.processName(), ideas));`
- `rerenderIdeas()`: if the ideas host is mounted, re-render it (simplest: call `render()` which re-runs `renderNotePanel`, and `onIdeasHostReady` re-mounts the panel).
- On tab change TO "ideas": `refreshOverlays()` (auto-on). On tab change AWAY from "ideas": `refreshOverlays()` (which hides overlays unless `showIdeas`).
- In `destroy()`: `overlays?.clear()`.

- [ ] **Step 3: `main.ts` — provide the overlay host, identity, date, and idea navigation**

In the `createNotePanelController({...})` call, add:
```ts
      ideasOverlays: {
        add: (elementId: string, html: HTMLElement) =>
          modeler.get("overlays").add(elementId, "ideas", { position: { top: -12, right: 12 }, html }),
        remove: (id: string) => modeler.get("overlays").remove(id),
      },
      identity: () => me.name,
      today: () => new Date().toISOString().slice(0, 10),
```
And make `navigateWiki` (from Plan 2c) handle `kind: "idea"` by switching the docs panel to the Ideas tab — expose a controller method `openIdeasTab()` (add to the controller's returned object: sets `tab = "ideas"; render(); refreshOverlays()`), and call `docsController?.openIdeasTab?.()` in the idea branch. Ensure the inspector shows the Documentación pane (`inspector.setTab("documentacion")`).

- [ ] **Step 4: Styles in `src/app.css`**

```css
.ideas-panel { display: flex; flex-direction: column; gap: 8px; height: 100%; box-sizing: border-box; }
.ideas-add { display: flex; flex-direction: column; gap: 4px; }
.ideas-add input[data-idea-input] { width: 100%; box-sizing: border-box; }
.ideas-anchor { font-size: 12px; color: var(--muted); display: flex; gap: 6px; align-items: center; }
.ideas-controls { display: flex; gap: 12px; font-size: 12px; color: var(--muted); }
.ideas-controls label { display: flex; gap: 4px; align-items: center; }
.ideas-list { list-style: none; margin: 0; padding: 0; overflow: auto; flex: 1 1 auto; }
.ideas-list .idea { display: flex; gap: 6px; padding: 4px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.ideas-list .idea.done .idea-body { text-decoration: line-through; color: var(--muted); }
.idea-badge { background: var(--accent); color: var(--accent-contrast); border-radius: 10px; padding: 1px 6px; font-size: 11px; cursor: default; box-shadow: var(--shadow); }
```

- [ ] **Step 5: Extend `notePanel.test.ts`**

```ts
it("renders an ideas host when the ideas tab is active", () => {
  const c = document.createElement("div");
  const h = handlers(); // existing helper
  renderNotePanel(c, { tab: "ideas", mode: "read", stepLabel: null, body: "", hasNote: false }, h);
  expect(c.querySelector("[data-ideas-host]")).not.toBeNull();
});
```
(Update the existing `handlers()` helper to include `onIdeasHostReady: vi.fn()` and `onReadHostReady`/`onEditHostReady` if the shared helper needs it — keep all handlers optional so other tests pass.)

- [ ] **Step 6: Typecheck, full suite, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green.

- [ ] **Step 7: Manual verification (build/exe)**

1. Pestaña **Ideas** aparece en el panel de Documentación.
2. Seleccionar una tarea → escribir una idea con "Anclar a: <tarea>" → Agregar → aparece en la lista y como **post-it 💡1** sobre la tarea en el diagrama.
3. Marcar la casilla (procesada) → el conteo del post-it baja; "Solo pendientes" la oculta de la lista.
4. En disco: `<diagrama>.docs/_ideas.md` con la línea `- [ ] (Activity_x · …) … — <vos>, <fecha>`.
5. Apagar "Mostrar en el diagrama" y salir de la pestaña Ideas → los post-its desaparecen; volver a la pestaña Ideas → reaparecen (auto-on).
6. `[[idea:...]]` (Plan 2c) → abre la pestaña Ideas.

- [ ] **Step 8: Commit**

```bash
git add src/processDocs/notePanel.ts src/processDocs/notePanelController.ts src/main.ts src/app.css src/processDocs/notePanel.test.ts
git commit -m "feat(docs): ideas tab + on-canvas overlays wired into the panel"
```

---

## Self-Review

**Spec coverage (sección C del spec 2026-06-30):**
- Captura sin fricción (quick-add anclado o general, autor+fecha) → Tasks 3, 5. ✓
- Almacenamiento `_ideas.md` con `- [ ]`/`- [x]` → Tasks 1, 2. ✓
- Triaje pendiente/procesada → Tasks 1, 3. ✓
- Post-its en el gráfico por elemento anclado (derivados) → Task 4. ✓
- Capa Ideas con toggle + auto-on al entrar a la pestaña y restore al salir → Task 5 (toggle en la pestaña Ideas — decisión de diseño vs integrarlo en el panel de Capas). ✓
- `[[idea:…]]` abre la pestaña Ideas → Task 5. ✓

**Placeholder scan:** sin TBD/TODO; Task 5 (wiring) usa anclas concretas + verificación manual. El `overlays` de bpmn-js (`modeler.get("overlays")`) es API estándar; el renderer no se unit-testea (gate build+manual), el cálculo `anchoredCounts`/`createIdeaOverlays` sí.

**Type consistency:** `Idea` (T1) usado por T3/T4/T5; `OverlayHost`/`createIdeaOverlays` (T4) por T5; `readIdeas`/`writeIdeas` (T2) por T5; `NoteTab` extendido a incluir `"ideas"` (T5) — todos los consumidores del tab (notePanel, controller) actualizados.

**Nota de ejecución:** el formato de línea de `_ideas.md` es best-effort (regex `LINE`); texto con ` — ` o `)` puede romper el parse de esa línea (se ignora, no se pierde el archivo). Aceptable para v1; documentar. La fecha/identidad vienen de la app (no del workflow), por lo que `new Date()` es válido aquí.
