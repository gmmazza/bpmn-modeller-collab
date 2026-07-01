# Ideas v2 — Plan 3: Modo idea + badge clickeable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un "modo idea" (toggle tipo Figma en la toolbar) que muestra badges 💡N sobre los elementos con ideas activas; clic en un elemento abre un popover de sus ideas + "nueva idea acá"; clic en el badge abre la pestaña Ideas en el hilo del elemento; OFF vuelve a edición normal.

**Architecture:** Un módulo `ideaMode.ts` (puro, deps inyectadas — sin importar bpmn-js ni tocar el canvas directamente) orquesta estado on/off (persistido en localStorage), dibujo de badges (vía `OverlayHost`), y el popover por elemento. `ideaBadges.ts` renderiza badges clickeables sobre el `OverlayHost`; `ideaElementPopover.ts` es el popover DOM (patrón `contextMenu`). El wiring en `notePanelController.ts` expone `openThread(id)`/`refreshIdeas()` y reenvía los conteos (`onAnchoredCounts` → `api.onIdeaCounts`), removiendo el cableado v1 de overlays/showIdeas ya muerto. `main.ts` añade el botón de la toolbar, la captura de `element.click` (sólo con modo ON), y provee los adaptadores bpmn (overlays, elementRegistry rect, labels).

**Tech Stack:** TypeScript, Vite, bpmn-js (`overlays` + `eventBus` + `elementRegistry` services), DOM plano (sin framework), Vitest + happy-dom.

## Global Constraints

- El LLM permanece FUERA de la app — sólo se leen/escriben notas markdown vía `ideasClient`. NO agregar llamadas a API de LLM.
- Mantener visible la marca "Powered by bpmn.io"; NO ocultar `.bjs-powered-by` por CSS.
- Todo texto provisto por el usuario que llegue al DOM debe ser XSS-safe: `textContent`/`.value`/`createTextNode`, nunca `innerHTML` de datos de usuario.
- 5 estados de idea (`pendiente`/`haciendo`/`pausado`/`hecho`/`rechazado`); activas = pendiente/haciendo/pausado (cuentan en el badge); cerradas = hecho/rechazado (no ensucian el canvas).
- Badges: los conteos vienen de `activeAnchoredCounts` (sólo ideas activas ancladas). Elementos con 0 ideas activas no llevan badge.
- Toggle persistido con la clave `"bpmn-compartida.ideaMode"` (convención de prefijo existente).
- Reusar el `OverlayHost` interface existente (`ideasOverlays.ts`), `STATE_GLYPH` (ya exportado en `ideasPanelView.ts`), y el patrón de dismissal de `contextMenu.ts` (mousedown+keydown en captura).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `src/processDocs/ideaBadges.ts` (nuevo) | Renderiza badges 💡N clickeables sobre un `OverlayHost`. Puro. |
| `src/processDocs/ideaElementPopover.ts` (nuevo) | Popover DOM de las ideas de un elemento (lista de hilos + "nueva idea acá"). Puro (fixed-position, dismiss outside/Escape). |
| `src/processDocs/ideaMode.ts` (nuevo) | Controlador del modo idea: on/off + persistencia, conteos→badges, click en elemento→popover, add idea anclada, abrir hilo. Deps inyectadas. |
| `src/processDocs/notePanelController.ts` (mod) | Exponer `openThread(id)` + `refreshIdeas()`; reenviar `onAnchoredCounts` a `api.onIdeaCounts`; remover cableado v1 de ideas/overlays muerto. |
| `src/main.ts` (mod) | Botón toolbar "Modo idea"; captura `element.click` (guard modo ON); crear `ideaMode` con adaptadores bpmn; `onIdeaCounts`→`ideaMode.setCounts`; refrescar badges al abrir archivo. |
| `src/app.css` (mod) | `.idea-badge-clickable` (cursor), `.idea-element-pop` + filas/estado-vacío. |

---

### Task 1: `ideaBadges.ts` — badges clickeables

**Files:**
- Create: `src/processDocs/ideaBadges.ts`
- Test: `src/processDocs/ideaBadges.test.ts`

**Interfaces:**
- Consumes: `OverlayHost` (`./ideasOverlays`).
- Produces:
  - `interface BadgeCount { elementId: string; count: number }`
  - `function createIdeaBadges(host: OverlayHost, onBadgeClick: (elementId: string) => void): { render(counts: BadgeCount[]): void; clear(): void }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { createIdeaBadges, type BadgeCount } from "./ideaBadges";
import type { OverlayHost } from "./ideasOverlays";

function fakeHost() {
  const added: Array<{ id: string; elementId: string; html: HTMLElement }> = [];
  const removed: string[] = [];
  let n = 0;
  const host: OverlayHost = {
    add(elementId, html) { const id = `ov-${n++}`; added.push({ id, elementId, html }); return id; },
    remove(id) { removed.push(id); },
  };
  return { host, added, removed };
}

describe("ideaBadges", () => {
  it("draws one badge per element with count > 0 and skips zero", () => {
    const { host, added } = fakeHost();
    const badges = createIdeaBadges(host, vi.fn());
    badges.render([{ elementId: "A", count: 2 }, { elementId: "B", count: 0 }] as BadgeCount[]);
    expect(added).toHaveLength(1);
    expect(added[0].elementId).toBe("A");
    expect(added[0].html.textContent).toContain("2");
  });

  it("fires onBadgeClick with the elementId and stops propagation", () => {
    const { host, added } = fakeHost();
    const onClick = vi.fn();
    const badges = createIdeaBadges(host, onClick);
    badges.render([{ elementId: "A", count: 1 }]);
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    const stop = vi.spyOn(ev, "stopPropagation");
    added[0].html.dispatchEvent(ev);
    expect(onClick).toHaveBeenCalledWith("A");
    expect(stop).toHaveBeenCalled();
  });

  it("clears previous overlays on re-render", () => {
    const { host, added, removed } = fakeHost();
    const badges = createIdeaBadges(host, vi.fn());
    badges.render([{ elementId: "A", count: 1 }]);
    badges.render([{ elementId: "B", count: 3 }]);
    expect(removed).toContain(added[0].id);
    expect(added[1].elementId).toBe("B");
  });

  it("clear() removes all badges", () => {
    const { host, added, removed } = fakeHost();
    const badges = createIdeaBadges(host, vi.fn());
    badges.render([{ elementId: "A", count: 1 }, { elementId: "B", count: 2 }]);
    badges.clear();
    expect(removed).toEqual(added.map((a) => a.id));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/ideaBadges.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/ideaBadges.ts
import type { OverlayHost } from "./ideasOverlays";

export interface BadgeCount {
  elementId: string;
  count: number;
}

export function createIdeaBadges(host: OverlayHost, onBadgeClick: (elementId: string) => void) {
  let ids: string[] = [];

  function clear(): void {
    for (const id of ids) host.remove(id);
    ids = [];
  }

  function render(counts: BadgeCount[]): void {
    clear();
    for (const { elementId, count } of counts) {
      if (count <= 0) continue;
      const el = badgeEl(count);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onBadgeClick(elementId);
      });
      ids.push(host.add(elementId, el));
    }
  }

  return { render, clear };
}

function badgeEl(count: number): HTMLElement {
  const b = document.createElement("div");
  b.className = "idea-badge idea-badge-clickable";
  b.title = `${count} idea(s) activa(s) — abrir`;
  b.textContent = `💡 ${count}`;
  return b;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/ideaBadges.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add src/processDocs/ideaBadges.ts src/processDocs/ideaBadges.test.ts
git commit -m "feat(ideas): clickable idea badges over overlay host"
```

---

### Task 2: `ideaElementPopover.ts` — popover por elemento

**Files:**
- Create: `src/processDocs/ideaElementPopover.ts`
- Test: `src/processDocs/ideaElementPopover.test.ts`

**Interfaces:**
- Consumes: `IdeaNote` (`./ideaNote`), `STATE_GLYPH` (`./ideasPanelView`, ya exportado).
- Produces:
  - `interface ElementPopoverHandlers { onOpenThread(ideaId: string): void; onAddIdea(text: string): void; onClose(): void }`
  - `function openIdeaElementPopover(anchor: { left: number; top: number }, elementLabel: string, ideas: IdeaNote[], h: ElementPopoverHandlers): { close(): void }`

**Notas de diseño:**
- Se auto-agrega a `document.body` como `.menu-pop.idea-element-pop` con `position: fixed` en las coords `anchor` (patrón `contextMenu.ts`, evita el requisito del wrapper `.menu`).
- Dismissal: `mousedown` fuera + `Escape`, ambos en fase de captura, adjuntados en un `setTimeout(…, 0)` para que el click de apertura no lo cierre de inmediato. `close()` remueve listeners + el elemento; el dismissal por outside/Escape llama `close()` y luego `h.onClose()`.
- `onOpenThread`/`onAddIdea` NO cierran por sí mismos el popover salvo lo que indique el test (la fila llama `onOpenThread` y cierra; el add llama `onAddIdea` y limpia el input, sin cerrar, para permitir agregar varias).
- Datos de usuario (`elementLabel`, `idea.description`) sólo por `textContent`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { openIdeaElementPopover, type ElementPopoverHandlers } from "./ideaElementPopover";
import type { IdeaNote } from "./ideaNote";

function handlers(): ElementPopoverHandlers {
  return { onOpenThread: vi.fn(), onAddIdea: vi.fn(), onClose: vi.fn() };
}
function idea(id: string, description: string): IdeaNote {
  return { id, estado: "pendiente", anchor: "A", anchorLabel: "Val", autor: "Ana", fecha: "2026-07-01", motivo: "", mejora: "", description, comments: [] };
}
afterEach(() => { document.body.innerHTML = ""; });

describe("openIdeaElementPopover", () => {
  it("lists one row per idea with its description", () => {
    const pop = openIdeaElementPopover({ left: 10, top: 20 }, "Validar", [idea("idea-1", "avisar por mail"), idea("idea-2", "otra")], handlers());
    const rows = document.querySelectorAll("[data-pop-idea]");
    expect(rows).toHaveLength(2);
    expect(document.body.textContent).toContain("avisar por mail");
    pop.close();
  });

  it("shows an empty state when there are no ideas", () => {
    const pop = openIdeaElementPopover({ left: 0, top: 0 }, "Validar", [], handlers());
    expect(document.querySelector(".idea-pop-empty")).not.toBeNull();
    pop.close();
  });

  it("clicking a row fires onOpenThread and closes", () => {
    const h = handlers();
    openIdeaElementPopover({ left: 0, top: 0 }, "Validar", [idea("idea-1", "x")], h);
    (document.querySelector("[data-pop-idea]") as HTMLButtonElement).click();
    expect(h.onOpenThread).toHaveBeenCalledWith("idea-1");
    expect(document.querySelector(".idea-element-pop")).toBeNull();
  });

  it("adds a new idea from the input", () => {
    const h = handlers();
    const pop = openIdeaElementPopover({ left: 0, top: 0 }, "Validar", [], h);
    (document.querySelector<HTMLInputElement>("[data-pop-input]")!).value = "idea nueva";
    (document.querySelector("[data-pop-add]") as HTMLButtonElement).click();
    expect(h.onAddIdea).toHaveBeenCalledWith("idea nueva");
    pop.close();
  });

  it("does nothing on empty add", () => {
    const h = handlers();
    const pop = openIdeaElementPopover({ left: 0, top: 0 }, "Validar", [], h);
    (document.querySelector<HTMLInputElement>("[data-pop-input]")!).value = "   ";
    (document.querySelector("[data-pop-add]") as HTMLButtonElement).click();
    expect(h.onAddIdea).not.toHaveBeenCalled();
    pop.close();
  });

  it("Escape closes and fires onClose", async () => {
    const h = handlers();
    openIdeaElementPopover({ left: 0, top: 0 }, "Validar", [], h);
    await new Promise((r) => setTimeout(r, 0)); // let dismissal listeners attach
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".idea-element-pop")).toBeNull();
    expect(h.onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/ideaElementPopover.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/ideaElementPopover.ts
import type { IdeaNote } from "./ideaNote";
import { STATE_GLYPH } from "./ideasPanelView";

export interface ElementPopoverHandlers {
  onOpenThread(ideaId: string): void;
  onAddIdea(text: string): void;
  onClose(): void;
}

export function openIdeaElementPopover(
  anchor: { left: number; top: number },
  elementLabel: string,
  ideas: IdeaNote[],
  h: ElementPopoverHandlers,
): { close(): void } {
  const pop = document.createElement("div");
  pop.className = "menu-pop idea-element-pop";
  pop.style.position = "fixed";
  pop.style.left = `${anchor.left}px`;
  pop.style.top = `${anchor.top}px`;

  const title = document.createElement("div");
  title.className = "idea-pop-title";
  title.textContent = elementLabel;
  pop.append(title);

  if (ideas.length === 0) {
    const empty = document.createElement("div");
    empty.className = "idea-pop-empty";
    empty.textContent = "Sin ideas todavía.";
    pop.append(empty);
  } else {
    for (const idea of ideas) {
      const row = document.createElement("button");
      row.dataset.popIdea = "true";
      row.className = "idea-pop-row";
      row.textContent = `${STATE_GLYPH[idea.estado]} ${idea.description.split("\n")[0]}`;
      row.addEventListener("click", () => { close(); h.onOpenThread(idea.id); });
      pop.append(row);
    }
  }

  const addRow = document.createElement("div");
  addRow.className = "idea-pop-add";
  const input = document.createElement("input");
  input.dataset.popInput = "true";
  input.placeholder = "Nueva idea acá…";
  const addBtn = document.createElement("button");
  addBtn.dataset.popAdd = "true";
  addBtn.textContent = "Agregar";
  addBtn.addEventListener("click", () => {
    const t = input.value.trim();
    if (!t) return;
    input.value = "";
    h.onAddIdea(t);
  });
  addRow.append(input, addBtn);
  pop.append(addRow);

  document.body.append(pop);

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
    pop.remove();
  }
  function onOutside(e: MouseEvent): void {
    if (!pop.contains(e.target as Node)) { close(); h.onClose(); }
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") { close(); h.onClose(); }
  }
  // Defer so the opening click doesn't immediately dismiss it.
  setTimeout(() => {
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);

  return { close };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/ideaElementPopover.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add src/processDocs/ideaElementPopover.ts src/processDocs/ideaElementPopover.test.ts
git commit -m "feat(ideas): per-element ideas popover (threads + new idea)"
```

---

### Task 3: `ideaMode.ts` — controlador del modo idea

**Files:**
- Create: `src/processDocs/ideaMode.ts`
- Test: `src/processDocs/ideaMode.test.ts`

**Interfaces:**
- Consumes: `IdeasClient` (`./ideasClient`), `activeAnchoredCounts` (`./ideaFilters`), `createIdeaBadges`/`BadgeCount` (`./ideaBadges`), `openIdeaElementPopover` (`./ideaElementPopover`), `OverlayHost` (`./ideasOverlays`), `IdeaNote` (`./ideaNote`).
- Produces:
  - `interface IdeaModeDeps { overlayHost: OverlayHost; ideasClient: IdeasClient; diagramId(): string; processName(): string; identity(): string; today(): string; elementLabel(elementId: string): string; clientRectFor(elementId: string): { left: number; top: number }; openThreadInPanel(ideaId: string): void; onPanelShouldRefresh(): void; persistGet(): boolean; persistSet(on: boolean): void; onModeChange(on: boolean): void }`
  - `function createIdeaMode(deps: IdeaModeDeps): { isOn(): boolean; toggle(): Promise<void>; setEnabled(on: boolean): Promise<void>; setCounts(counts: BadgeCount[]): void; refresh(): Promise<void>; onElementClick(elementId: string): Promise<void>; closePopover(): void }`

**Notas de diseño / decisiones (autónomas):**
- **Escrituras de ideas ancladas** (add desde el popover) van DIRECTO por `ideasClient` (writeIdea + writeIndex) porque el índice se regenera idempotentemente desde `listIdeas`; no hay drift con el controlador del panel. Tras escribir, `onPanelShouldRefresh()` refresca el panel si está abierto y se recargan los conteos para redibujar badges.
- **Clic en badge** (vía `createIdeaBadges` onBadgeClick) → abre en el panel el hilo de la idea activa más reciente de ese elemento (`openThreadInPanel(id)`). Es la aproximación pragmática a "pestaña filtrada al elemento" sin agregar filtro de ancla al controlador v2 (evita scope creep). Si no hay activas, abre la primera idea del elemento; si no hay ninguna, no hace nada.
- **Clic en elemento** (canvas) → popover del elemento.
- `setCounts` es el camino "push" (el controlador v2 emite `onAnchoredCounts` en cada mutación del panel → `main.ts` → `setCounts`), mantiene badges vivos mientras se edita en el panel. `refresh()`/`loadCounts` es el camino "pull" (al encender el modo o abrir archivo).
- Badges sólo se dibujan con modo ON; al apagar se limpian y se cierra cualquier popover.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { createIdeaMode, type IdeaModeDeps } from "./ideaMode";
import { createIdeasClient } from "./ideasClient";
import { createFsClient } from "../fsClient";
import { createFakeDir } from "../testHelpers/fakeDir";
import type { OverlayHost } from "./ideasOverlays";

function fakeHost() {
  const live = new Map<string, { elementId: string; html: HTMLElement }>();
  let n = 0;
  const host: OverlayHost = {
    add(elementId, html) { const id = `ov-${n++}`; live.set(id, { elementId, html }); return id; },
    remove(id) { live.delete(id); },
  };
  return { host, live };
}
function setup(persisted = false) {
  const { host, live } = fakeHost();
  const ideasClient = createIdeasClient(createFsClient(createFakeDir()));
  let stored = persisted;
  const deps: IdeaModeDeps = {
    overlayHost: host, ideasClient,
    diagramId: () => "x.bpmn", processName: () => "Proc",
    identity: () => "Ana", today: () => "2026-07-05",
    elementLabel: () => "Validar", clientRectFor: () => ({ left: 5, top: 5 }),
    openThreadInPanel: vi.fn(), onPanelShouldRefresh: vi.fn(),
    persistGet: () => stored, persistSet: (on) => { stored = on; },
    onModeChange: vi.fn(),
  };
  return { deps, host, live, ideasClient, mode: createIdeaMode(deps) };
}
const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
afterEach(() => { document.body.innerHTML = ""; });

describe("ideaMode", () => {
  it("starts from persisted state", () => {
    expect(setup(false).mode.isOn()).toBe(false);
    expect(setup(true).mode.isOn()).toBe(true);
  });

  it("toggling on persists, notifies, and draws badges for active anchored ideas", async () => {
    const { mode, ideasClient, live, deps } = setup(false);
    await ideasClient.writeIdea("x.bpmn", { id: "idea-1", estado: "pendiente", anchor: "A", anchorLabel: "Val", autor: "Ana", fecha: "2026-07-01", motivo: "", mejora: "", description: "d", comments: [] });
    await mode.toggle();
    await flush();
    expect(mode.isOn()).toBe(true);
    expect(deps.onModeChange).toHaveBeenCalledWith(true);
    expect([...live.values()].some((o) => o.elementId === "A")).toBe(true);
  });

  it("toggling off clears badges", async () => {
    const { mode, ideasClient, live } = setup(false);
    await ideasClient.writeIdea("x.bpmn", { id: "idea-1", estado: "haciendo", anchor: "A", anchorLabel: "Val", autor: "Ana", fecha: "2026-07-01", motivo: "", mejora: "", description: "d", comments: [] });
    await mode.toggle(); await flush();
    await mode.toggle(); await flush();
    expect(live.size).toBe(0);
  });

  it("clicking an element opens a popover listing its ideas", async () => {
    const { mode, ideasClient } = setup(true);
    await ideasClient.writeIdea("x.bpmn", { id: "idea-1", estado: "pendiente", anchor: "A", anchorLabel: "Val", autor: "Ana", fecha: "2026-07-01", motivo: "", mejora: "", description: "idea de A", comments: [] });
    await mode.onElementClick("A");
    await flush();
    expect(document.querySelector(".idea-element-pop")).not.toBeNull();
    expect(document.body.textContent).toContain("idea de A");
  });

  it("adding an idea from the popover persists it anchored to the element", async () => {
    const { mode, ideasClient, deps } = setup(true);
    await mode.onElementClick("A");
    await flush();
    (document.querySelector<HTMLInputElement>("[data-pop-input]")!).value = "nueva acá";
    (document.querySelector("[data-pop-add]") as HTMLButtonElement).click();
    await flush();
    const all = await ideasClient.listIdeas("x.bpmn");
    expect(all).toHaveLength(1);
    expect(all[0].anchor).toBe("A");
    expect(all[0].description).toBe("nueva acá");
    expect(deps.onPanelShouldRefresh).toHaveBeenCalled();
  });

  it("does not open a popover when mode is off", async () => {
    const { mode } = setup(false);
    await mode.onElementClick("A");
    await flush();
    expect(document.querySelector(".idea-element-pop")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/ideaMode.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/ideaMode.ts
import type { IdeasClient } from "./ideasClient";
import type { IdeaNote } from "./ideaNote";
import { activeAnchoredCounts } from "./ideaFilters";
import { createIdeaBadges, type BadgeCount } from "./ideaBadges";
import { openIdeaElementPopover } from "./ideaElementPopover";
import { isActive } from "./ideaState";
import type { OverlayHost } from "./ideasOverlays";

export interface IdeaModeDeps {
  overlayHost: OverlayHost;
  ideasClient: IdeasClient;
  diagramId(): string;
  processName(): string;
  identity(): string;
  today(): string;
  elementLabel(elementId: string): string;
  clientRectFor(elementId: string): { left: number; top: number };
  openThreadInPanel(ideaId: string): void;
  onPanelShouldRefresh(): void;
  persistGet(): boolean;
  persistSet(on: boolean): void;
  onModeChange(on: boolean): void;
}

export function createIdeaMode(deps: IdeaModeDeps) {
  let on = deps.persistGet();
  let counts: BadgeCount[] = [];
  let popover: { close(): void } | null = null;
  const badges = createIdeaBadges(deps.overlayHost, (elementId) => void onBadgeClick(elementId));

  function draw(): void {
    if (on) badges.render(counts);
    else badges.clear();
  }

  function setCounts(next: BadgeCount[]): void {
    counts = next;
    draw();
  }

  async function loadCounts(): Promise<void> {
    const ideas = await deps.ideasClient.listIdeas(deps.diagramId());
    counts = activeAnchoredCounts(ideas);
    draw();
  }

  function closePopover(): void {
    popover?.close();
    popover = null;
  }

  async function setEnabled(next: boolean): Promise<void> {
    if (on === next) return;
    on = next;
    deps.persistSet(on);
    deps.onModeChange(on);
    closePopover();
    if (on) await loadCounts();
    else badges.clear();
  }

  async function toggle(): Promise<void> {
    await setEnabled(!on);
  }

  async function onElementClick(elementId: string): Promise<void> {
    if (!on) return;
    closePopover();
    const all = await deps.ideasClient.listIdeas(deps.diagramId());
    const forEl = all.filter((i) => i.anchor === elementId);
    popover = openIdeaElementPopover(deps.clientRectFor(elementId), deps.elementLabel(elementId), forEl, {
      onOpenThread: (id) => { closePopover(); deps.openThreadInPanel(id); },
      onAddIdea: (text) => void addIdea(elementId, text),
      onClose: () => { popover = null; },
    });
  }

  async function onBadgeClick(elementId: string): Promise<void> {
    if (!on) return;
    const all = await deps.ideasClient.listIdeas(deps.diagramId());
    const forEl = all.filter((i) => i.anchor === elementId);
    const actives = forEl.filter((i) => isActive(i.estado));
    const target = actives[actives.length - 1] ?? forEl[0];
    if (target) deps.openThreadInPanel(target.id);
  }

  async function addIdea(elementId: string, text: string): Promise<void> {
    const id = await deps.ideasClient.nextIdeaId(deps.diagramId());
    const note: IdeaNote = {
      id, estado: "pendiente", anchor: elementId, anchorLabel: deps.elementLabel(elementId),
      autor: deps.identity(), fecha: deps.today(), motivo: "", mejora: "", description: text, comments: [],
    };
    await deps.ideasClient.writeIdea(deps.diagramId(), note);
    await deps.ideasClient.writeIndex(deps.diagramId(), deps.processName());
    closePopover();
    deps.onPanelShouldRefresh();
    await loadCounts();
  }

  return {
    isOn: () => on,
    toggle,
    setEnabled,
    setCounts,
    refresh: loadCounts,
    onElementClick,
    closePopover,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/ideaMode.test.ts`
Expected: PASS (6 tests). If a write needs more microtasks, raise the `flush` iteration count; do not weaken persistence assertions.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add src/processDocs/ideaMode.ts src/processDocs/ideaMode.test.ts
git commit -m "feat(ideas): idea mode controller (badges + element popover + add)"
```

---

### Task 4: `notePanelController.ts` — exponer control + reenviar conteos + limpiar v1

**Files:**
- Modify: `src/processDocs/notePanelController.ts`
- Test: `src/processDocs/notePanelController.test.ts` (extender)

**Interfaces:**
- Produces (nuevos en el objeto retornado): `openThread(ideaId: string): void; refreshIdeas(): void`.
- Produces (nuevo en `NoteControllerApi`): `onIdeaCounts?(counts: Array<{ elementId: string; count: number }>): void`.

**Guía de implementación (LEER el archivo real y adaptar — estas son direcciones, no pegado literal):**

1. **Reenviar conteos.** En `onIdeasHostReady` (≈línea 232), reemplazar el stub `onAnchoredCounts: (_counts) => { /* overlays wired in Plan 3 */ }` por:
   ```ts
   onAnchoredCounts: (counts) => api.onIdeaCounts?.(counts),
   ```
   y agregar a `NoteControllerApi` el campo opcional `onIdeaCounts?(counts: Array<{ elementId: string; count: number }>): void;`.

2. **Exponer `openThread(ideaId)`.** Añadir una función que abra la pestaña Ideas y abra el hilo (mismo cuerpo que `openIdeasTab` pero llamando `openThread` del controlador v2):
   ```ts
   function openThread(ideaId: string): void {
     destroyEditor();
     tab = "ideas";
     mode = "read";
     render();                 // dispara onIdeasHostReady → (re)crea ideasCtl
     void ideasCtl?.openThread(ideaId);
   }
   ```
   Si en el archivo real `openIdeasTab` llama `refreshOverlays()` y ese código v1 se remueve (paso 4), quitar esa llamada aquí también.

3. **Exponer `refreshIdeas()`.** 
   ```ts
   function refreshIdeas(): void {
     if (tab === "ideas") void ideasCtl?.refresh();
   }
   ```
   Añadir `openThread` y `refreshIdeas` al objeto retornado (junto a `openIdeasTab`).

4. **Remover el cableado v1 de ideas/overlays MUERTO.** Como `main.ts` siempre provee `ideasClient` (Plan 2 Task 6) y ahora los badges los dibuja `ideaMode` en `main.ts`, este controlador ya no usa overlays ni el panel v1. Remover con cuidado, verificando que la suite quede verde:
   - el import `createIdeaOverlays, OverlayHost` (línea 11) y `renderIdeasPanel` si sólo lo usa el fallback;
   - las vars `let overlays…` y `refreshOverlays()` y TODAS sus llamadas;
   - la rama fallback `renderIdeasPanel(host, …)` en `onIdeasHostReady` (el `if (api.ideasClient)` deja de necesitar `else`; si `ideasClient` faltara, dejar el host vacío en vez del panel v1);
   - las vars v1 `ideas`, `ideasRaw`, `showIdeas`, `filterPending`, el objeto `ideasHandlers`, `saveIdeas()`, `onToggleShow`, y cualquier `parseIdeas/mergeIdeas/addIdea/toggleIdea` sólo usados por ese camino;
   - el campo `ideasOverlays?: OverlayHost` de `NoteControllerApi` (ya no se consume aquí) — y su provisión en `main.ts` se elimina en Task 5.
   
   **Regla:** remover SÓLO lo que quede sin referencias tras los pasos anteriores. Si algo v1 aún lo usa otro camino vivo (p.ej. wikilinks a ideas), NO lo remuevas; anótalo en el reporte. Tras remover, `npm run typecheck` debe estar limpio (sin imports/vars sin usar) y la suite verde.

- [ ] **Step 1: Write the failing test (extender `notePanelController.test.ts`)**

Añadir un test que verifique el reenvío de conteos y la nueva API. Adaptar el helper/factory existente del archivo (usar el mismo `makeApi()`/mocks que ya usan los tests de ese archivo). Esqueleto:

```ts
it("forwards anchored counts to api.onIdeaCounts", async () => {
  const onIdeaCounts = vi.fn();
  // build the controller with a fake ideasClient that returns one active anchored idea,
  // using the SAME api-construction helper the other tests in this file use, plus onIdeaCounts.
  const ctrl = makeController({ onIdeaCounts, ideasClient: fakeIdeasClientWithAnchoredIdea() });
  ctrl.openIdeasTab();
  await flushMicrotasks();
  expect(onIdeaCounts).toHaveBeenCalled();
  const counts = onIdeaCounts.mock.calls.at(-1)![0];
  expect(counts).toEqual(expect.arrayContaining([expect.objectContaining({ elementId: "A" })]));
});

it("exposes openThread and refreshIdeas", () => {
  const ctrl = makeController({});
  expect(typeof ctrl.openThread).toBe("function");
  expect(typeof ctrl.refreshIdeas).toBe("function");
});
```

Si el archivo de test no tiene un `makeController` reutilizable, crear uno mínimo siguiendo el patrón de los tests existentes (mock `api.mount`, `diagramId`, `getSelected`, `docs`, `ideasClient`). No debilitar tests existentes.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/notePanelController.test.ts`
Expected: FAIL — `onIdeaCounts` not called / `openThread` undefined.

- [ ] **Step 3: Implement** los cambios 1–4 de arriba.

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/processDocs/notePanelController.test.ts && npm run typecheck && npm test`
Expected: PASS; typecheck limpio; suite completa verde. Si algún test v1 fallaba por código removido, verificar que era realmente muerto (no un camino vivo); si era vivo, restaurar y anotar.

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/notePanelController.ts src/processDocs/notePanelController.test.ts
git commit -m "feat(ideas): expose openThread/refreshIdeas + forward counts; drop v1 overlay wiring"
```

---

### Task 5: `main.ts` + `app.css` — toggle toolbar, captura de clics, wiring de ideaMode

**Files:**
- Modify: `src/main.ts`
- Modify: `src/app.css`
- Test: manual (build)

**Interfaces:**
- Consumes: `createIdeaMode` (Task 3), `docsController.openThread`/`refreshIdeas` (Task 4), `ideasClientV2` (Plan 2), servicios bpmn `overlays`/`eventBus`/`elementRegistry`.

**Guía de implementación (LEER `main.ts` real y adaptar — reusar expresiones existentes):**

1. **Botón toolbar.** En el HTML de `#toolbar` (≈líneas 654–693), dentro de un `<div class="tgroup">` existente, agregar:
   ```html
   <button class="btn icon-only" id="toggle-idea-mode" type="button" title="Modo idea">💡</button>
   ```
   (Si hay un `icon("…")` adecuado, úsalo; si no, el emoji 💡 es aceptable y consistente con los badges.)

2. **Crear `ideaMode`** después de que existan `modeler`, `ideasClientV2` y `docsController` (usar EXACTAMENTE las mismas expresiones que ya alimentan al controlador v2 para `diagramId`/`processName`/`identity`/`today` — ver `main.ts:721,722,758,759` → `docsFileId`, la derivación de nombre, `me.name`, la fecha ISO):
   ```ts
   const ideaOverlayHost = {
     add: (elementId: string, html: HTMLElement) =>
       modeler.get("overlays").add(elementId, "ideas", { position: { top: -12, right: 12 }, html }),
     remove: (id: string) => modeler.get("overlays").remove(id),
   };
   const ideaMode = createIdeaMode({
     overlayHost: ideaOverlayHost,
     ideasClient: ideasClientV2,
     diagramId: () => docsFileId,
     processName: () => docsFileId.replace(/\.bpmn$/i, "").split("/").pop() ?? docsFileId,
     identity: () => me.name,
     today: () => new Date().toISOString().slice(0, 10),
     elementLabel: (id) => {
       const el = modeler.get("elementRegistry").get(id);
       return (el && el.businessObject && el.businessObject.name) || id;
     },
     clientRectFor: (id) => {
       const gfx = modeler.get("elementRegistry").getGraphics(id) as SVGElement | undefined;
       const r = gfx?.getBoundingClientRect();
       return r ? { left: r.right, top: r.top } : { left: 100, top: 100 };
     },
     openThreadInPanel: (ideaId) => docsController?.openThread(ideaId),
     onPanelShouldRefresh: () => docsController?.refreshIdeas(),
     persistGet: () => localStorage.getItem("bpmn-compartida.ideaMode") === "1",
     persistSet: (on) => localStorage.setItem("bpmn-compartida.ideaMode", on ? "1" : "0"),
     onModeChange: (on) => { document.getElementById("toggle-idea-mode")?.classList.toggle("active", on); },
   });
   ```

3. **Estado inicial del botón** (reflejar el toggle persistido al arrancar):
   ```ts
   document.getElementById("toggle-idea-mode")?.classList.toggle("active", ideaMode.isOn());
   ```

4. **Click del botón:**
   ```ts
   document.getElementById("toggle-idea-mode")?.addEventListener("click", () => void ideaMode.toggle());
   ```

5. **Captura de `element.click`** (sólo con modo ON; alta prioridad + `return false` para bloquear la selección normal de bpmn-js):
   ```ts
   modeler.get("eventBus").on("element.click", 2000, (e: { element: { id: string } }) => {
     if (!ideaMode.isOn()) return;
     void ideaMode.onElementClick(e.element.id);
     return false; // impedir selección/edición normal mientras el modo está activo
   });
   ```
   (Verificar la firma real del `eventBus.on` con prioridad en el proyecto; el patrón diagram-js es `on(event, priority, callback)`.)

6. **Reenvío de conteos → badges.** En el objeto pasado a `createNotePanelController` (≈línea 718), agregar:
   ```ts
   onIdeaCounts: (counts) => ideaMode.setCounts(counts),
   ```
   y REMOVER el campo `ideasOverlays: { … }` (líneas 753–757) — los overlays ahora los maneja `ideaMode` (Task 4 quitó su consumo en el controlador).

7. **Refrescar badges al abrir archivo.** Tras la carga en `openFile` (después de `migrateIfNeeded`/`writeIndex` que agregó Plan 2 Task 6), si el modo está encendido, recargar conteos:
   ```ts
   if (ideaMode.isOn()) void ideaMode.refresh();
   ```

8. **`app.css`:**
   ```css
   .idea-badge-clickable { cursor: pointer; }
   .idea-element-pop { min-width: 240px; max-width: 340px; max-height: 60vh; overflow: auto; }
   .idea-pop-title { font-weight: 600; font-size: 12px; margin-bottom: 4px; color: var(--muted); }
   .idea-pop-empty { font-size: 12px; color: var(--muted); padding: 4px 0; }
   .idea-pop-row { display: block; width: 100%; text-align: left; background: transparent; border: none; color: var(--text); cursor: pointer; font-size: 13px; padding: 4px 6px; border-radius: var(--radius); }
   .idea-pop-row:hover { background: var(--hover, rgba(127,127,127,0.12)); }
   .idea-pop-add { display: flex; gap: 6px; margin-top: 6px; }
   .idea-pop-add input { flex: 1; }
   ```
   (Usar los nombres de variables CSS reales del proyecto; si `--hover` no existe, usar el color de hover que ya usa el proyecto.)

- [ ] **Step 1: Implement** los cambios 1–8 leyendo el `main.ts` real.

- [ ] **Step 2: Typecheck + suite + build**

Run: `npm run typecheck && npm test && npm run build`
Expected: todo verde; build ok.

- [ ] **Step 3: Manual verification (build)**

Abrir un diagrama con ideas ancladas. Activar "Modo idea": aparecen badges 💡N sobre los elementos con ideas activas; el botón queda `.active`. Clic en un elemento → popover con sus ideas + "nueva idea acá" (agregar crea la nota anclada y el badge se actualiza). Clic en un badge → se abre la pestaña Ideas en el hilo del elemento. Apagar el modo → desaparecen badges y los clics vuelven a la edición normal. Recargar la app → el estado del toggle persiste.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts src/app.css
git commit -m "feat(ideas): idea-mode toolbar toggle, canvas click capture, badge wiring"
```

---

## Self-Review

**Spec coverage (sección C):**
- Toggle "modo idea" en toolbar, persistido en localStorage → Task 5 (+ `persistGet/Set` en Task 3). ✓
- Badges 💡N (conteo activas) sobre anclados → Tasks 1, 3, 5 (via `activeAnchoredCounts` + `OverlayHost`). ✓
- Clic en elemento → popover de ideas + "nueva idea acá" (ancla en 1 paso) → Tasks 2, 3, 5. ✓
- Clic en badge → abre pestaña Ideas + hilo del elemento → Tasks 1 (onBadgeClick), 3, 4 (`openThread`), 5. ✓
- OFF → sin badges ni captura de clics → Task 3 (`setEnabled(false)` limpia badges) + Task 5 (guard `isOn()` en `element.click`). ✓
- Remover código v1 de overlays/showIdeas → Task 4. ✓
- `onAnchoredCounts` alimenta badges → Task 4 (reenvío) + Task 5 (`setCounts`). ✓

**Simplificación consciente (anotada):** "pestaña filtrada al elemento" en el clic de badge se aproxima abriendo el hilo de la idea activa más reciente del elemento, en vez de agregar un filtro de ancla público al controlador v2 (YAGNI; evita expandir el estado del controlador). Si se quisiera el filtro real, sería un follow-up chico.

**Placeholder scan:** sin TBD/TODO. Task 4 y 5 son modificaciones sobre archivos reales con guía "leer y adaptar" + verificación por suite/build; Tasks 1–3 traen código y tests completos.

**Type consistency:** `OverlayHost` (ideasOverlays) reusado por `ideaBadges`/`ideaMode`; `BadgeCount` definido en `ideaBadges`, consumido por `ideaMode`; `STATE_GLYPH` (ideasPanelView, exportado) por `ideaElementPopover`; `IdeaNote`/`IdeasClient`/`activeAnchoredCounts`/`isActive` reusados de Plan 1/2. `openThread`/`refreshIdeas`/`onIdeaCounts` nuevos en `notePanelController`, consumidos por `main.ts`.

**Riesgo principal:** la remoción v1 en Task 4 — mitigado exigiendo suite completa verde + typecheck sin unused y la regla "remover sólo lo sin referencias; si un camino vivo lo usa, no remover y anotar".
