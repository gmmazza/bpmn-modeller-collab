# UI overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin and reorganize the editor UI — header + grouped icon toolbar, a tabbed right inspector (Capas/Propiedades/Historial), light/dark theme toggle, and the missing edit actions (Undo/Redo, always-visible Save + dirty indicator, keyboard shortcuts) — without changing domain logic.

**Architecture:** Three new testable modules (`theme`, `icons`, `inspector`) + a design-token stylesheet (`app.css`), then `main.ts`'s shell is restructured to header/toolbar/inspector and the new actions wired in. Existing panel render code is reused by assigning the current element ids (`propspanel`, `layerspanel`, `history`) to the inspector's panes, so `mountModeler`/`renderLayers`/`loadHistory` keep working unchanged.

**Tech Stack:** existing Vanilla TS + Vite + Vitest + bpmn-js 18. No new deps.

## Global Constraints

- Reskin + reorg + new actions only. Do NOT change fsClient/capas/diff/watcher/sync/linting/electron logic.
- Theme: light default + dark toggle, persisted at `localStorage["bpmn-compartida.theme"]`; applied via `document.documentElement.dataset.theme`.
- New actions: Undo (`commandStack.undo()`), Redo (`commandStack.redo()`), Save (always visible, dot when dirty, disabled without own lock/changes), shortcuts Ctrl+Z / Ctrl+Shift+Z + Ctrl+Y / Ctrl+S (ignored in inputs). No zoom buttons.
- Right inspector: tabs Capas / Propiedades / Historial, one visible at a time; toolbar Capas/Propiedades buttons open the inspector to that tab. The Propiedades pane must exist before `mountModeler` (it hosts the bpmn-js properties panel).
- Preserve existing element ids by assigning them to inspector panes: Propiedades pane → `id="propspanel"`, Capas pane → `id="layerspanel"`, Historial pane → `id="history"`. Also preserve the `#canvas`, `#sync`, `#conflict`, `#appupdate`, `#vizsettings` containers and all current handler wiring.
- Icons: inline SVG (no dependency), `stroke="currentColor"` so they theme.
- Gates after each task: `npm test`, `npm run typecheck`, `npm run build` green (120 baseline).

## File Structure

```
src/theme.ts          # NEW: getTheme/setTheme/applyTheme/toggleTheme
src/theme.test.ts     # NEW
src/icons.ts          # NEW: icon(name) → inline <svg> string; ICON set
src/icons.test.ts     # NEW
src/inspector.ts      # NEW: createInspector(container, tabs) → {setTab,activeTab,paneEl,show,hide,isVisible}
src/inspector.test.ts # NEW
src/app.css           # NEW: design tokens (light/dark) + header/toolbar/inspector/list/button/popover styling
src/main.ts           # MODIFY: shell restructure (header/toolbar/inspector), theme toggle, identity menu, tab wiring (Task 5); undo/redo/save+dirty + shortcuts (Task 6)
README.md             # MODIFY: note theme toggle + shortcuts
```

---

## Task 1: Theme module (`theme.ts`)

**Files:** Create `src/theme.ts`, `src/theme.test.ts`

**Interfaces:**
- `type Theme = "light" | "dark"`
- `getTheme(): Theme` (default "light")
- `setTheme(t: Theme): void`
- `applyTheme(t: Theme): void` (sets `document.documentElement.dataset.theme`)
- `toggleTheme(): Theme`

- [ ] **Step 1: Write the failing test `src/theme.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getTheme, setTheme, applyTheme, toggleTheme } from "./theme";

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("defaults to light", () => {
    expect(getTheme()).toBe("light");
  });
  it("persists and reads dark", () => {
    setTheme("dark");
    expect(getTheme()).toBe("dark");
  });
  it("treats any non-dark stored value as light", () => {
    localStorage.setItem("bpmn-compartida.theme", "weird");
    expect(getTheme()).toBe("light");
  });
  it("applyTheme sets the data-theme attribute", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
  it("toggleTheme flips, persists, and applies", () => {
    setTheme("light");
    const next = toggleTheme();
    expect(next).toBe("dark");
    expect(getTheme()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`npx vitest run src/theme.test.ts` → module not found)

- [ ] **Step 3: Write `src/theme.ts`**

```ts
export type Theme = "light" | "dark";

const KEY = "bpmn-compartida.theme";

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function setTheme(t: Theme): void {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* storage unavailable */
  }
}

export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  applyTheme(next);
  return next;
}
```

- [ ] **Step 4: Run it — expect PASS** (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/theme.ts src/theme.test.ts
git commit -m "feat(ui): theme module (light/dark, persisted)"
```

---

## Task 2: Icon set (`icons.ts`)

**Files:** Create `src/icons.ts`, `src/icons.test.ts`

**Interfaces:**
- `type IconName` (keys of the ICONS map)
- `icon(name: IconName): string` — returns an inline `<svg>…</svg>` string.

- [ ] **Step 1: Write the failing test `src/icons.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { icon } from "./icons";

const names = [
  "new", "undo", "redo", "save", "layers", "properties", "settings",
  "download", "sun", "moon", "user", "folder", "check", "close", "chevron",
] as const;

describe("icon", () => {
  it("returns an inline svg for every name", () => {
    for (const n of names) {
      const svg = icon(n);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain("currentColor");
      expect(svg.length).toBeGreaterThan(20);
    }
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

- [ ] **Step 3: Write `src/icons.ts`**

```ts
const ICONS = {
  new: '<path d="M12 5v14M5 12h14"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  layers: '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  properties: '<path d="M4 6h16M4 12h16M4 18h12"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  sun: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}
```

- [ ] **Step 4: Run it — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/icons.ts src/icons.test.ts
git commit -m "feat(ui): inline SVG icon set"
```

---

## Task 3: Tabbed inspector (`inspector.ts`)

**Files:** Create `src/inspector.ts`, `src/inspector.test.ts`

**Interfaces:**
- `interface InspectorTab { id: string; label: string }`
- `createInspector(container: HTMLElement, tabs: InspectorTab[])` →
  `{ setTab(id), activeTab(): string|null, paneEl(id): HTMLElement, show(), hide(), isVisible(): boolean }`

- [ ] **Step 1: Write the failing test `src/inspector.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createInspector } from "./inspector";

const tabs = [
  { id: "capas", label: "Capas" },
  { id: "propiedades", label: "Propiedades" },
  { id: "historial", label: "Historial" },
];

describe("inspector", () => {
  it("renders tab buttons and starts on the first tab", () => {
    const el = document.createElement("div");
    const insp = createInspector(el, tabs);
    expect(el.querySelectorAll(".inspector-tab").length).toBe(3);
    expect(insp.activeTab()).toBe("capas");
    expect(insp.paneEl("capas").hidden).toBe(false);
    expect(insp.paneEl("propiedades").hidden).toBe(true);
  });
  it("setTab switches the visible pane", () => {
    const el = document.createElement("div");
    const insp = createInspector(el, tabs);
    insp.setTab("propiedades");
    expect(insp.activeTab()).toBe("propiedades");
    expect(insp.paneEl("capas").hidden).toBe(true);
    expect(insp.paneEl("propiedades").hidden).toBe(false);
  });
  it("paneEl returns a mountable element; show/hide toggle visibility", () => {
    const el = document.createElement("div");
    const insp = createInspector(el, tabs);
    insp.paneEl("historial").appendChild(document.createElement("span"));
    expect(insp.paneEl("historial").querySelector("span")).not.toBeNull();
    insp.hide();
    expect(insp.isVisible()).toBe(false);
    insp.show();
    expect(insp.isVisible()).toBe(true);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

- [ ] **Step 3: Write `src/inspector.ts`**

```ts
export interface InspectorTab {
  id: string;
  label: string;
}

export function createInspector(container: HTMLElement, tabs: InspectorTab[]) {
  container.innerHTML = "";
  container.classList.add("inspector");
  const tabbar = document.createElement("div");
  tabbar.className = "inspector-tabs";
  const panesWrap = document.createElement("div");
  panesWrap.className = "inspector-panes";

  const panes: Record<string, HTMLElement> = {};
  const buttons: Record<string, HTMLButtonElement> = {};
  let active: string | null = null;

  function setTab(id: string): void {
    if (!panes[id]) return;
    active = id;
    for (const t of tabs) {
      panes[t.id].hidden = t.id !== id;
      buttons[t.id].classList.toggle("active", t.id === id);
    }
    show();
  }
  function show(): void {
    container.hidden = false;
  }
  function hide(): void {
    container.hidden = true;
  }

  for (const t of tabs) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "inspector-tab";
    b.textContent = t.label;
    b.dataset.tab = t.id;
    b.addEventListener("click", () => setTab(t.id));
    tabbar.appendChild(b);
    buttons[t.id] = b;

    const p = document.createElement("div");
    p.className = "inspector-pane";
    p.dataset.pane = t.id;
    p.hidden = true;
    panesWrap.appendChild(p);
    panes[t.id] = p;
  }

  container.appendChild(tabbar);
  container.appendChild(panesWrap);
  if (tabs.length) setTab(tabs[0].id);

  return {
    setTab,
    activeTab: (): string | null => active,
    paneEl: (id: string): HTMLElement => panes[id],
    show,
    hide,
    isVisible: (): boolean => !container.hidden,
  };
}

export type Inspector = ReturnType<typeof createInspector>;
```

- [ ] **Step 4: Run it — expect PASS** (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/inspector.ts src/inspector.test.ts
git commit -m "feat(ui): tabbed inspector panel"
```

---

## Task 4: Design tokens + chrome styles (`app.css`)

**Files:** Create `src/app.css`

**Interfaces:**
- Produces: CSS variables (light + `[data-theme="dark"]`) and styling for header/toolbar/inspector/file-list/buttons/popover. Imported by `main.ts` in Task 5.

- [ ] **Step 1: Write `src/app.css`**

```css
:root {
  --bg: #f3f4f6;
  --surface: #ffffff;
  --text: #1f2937;
  --muted: #6b7280;
  --border: #e5e7eb;
  --accent: #2563eb;
  --accent-contrast: #ffffff;
  --hover: #f1f5f9;
  --shadow: 0 1px 3px rgba(0,0,0,.12), 0 1px 2px rgba(0,0,0,.08);
  --radius: 7px;
}
:root[data-theme="dark"] {
  --bg: #0f172a;
  --surface: #1e293b;
  --text: #e5e7eb;
  --muted: #94a3b8;
  --border: #334155;
  --accent: #3b82f6;
  --accent-contrast: #ffffff;
  --hover: #334155;
  --shadow: 0 1px 3px rgba(0,0,0,.5);
}

body { margin: 0; background: var(--bg); color: var(--text); font-family: "Segoe UI", system-ui, sans-serif; }

#appheader {
  display: flex; align-items: center; gap: 12px;
  padding: 6px 12px; background: var(--surface); border-bottom: 1px solid var(--border);
}
#appheader .brand { font-weight: 600; font-size: 14px; }
#appheader .spacer { flex: 1; }
#appheader .hchip { color: var(--muted); font-size: 13px; display: inline-flex; align-items: center; gap: 4px; }

#toolbar {
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
  padding: 6px 10px; background: var(--surface); border-bottom: 1px solid var(--border);
}
#toolbar .tgroup { display: inline-flex; align-items: center; gap: 2px; }
#toolbar .divider { width: 1px; align-self: stretch; background: var(--border); margin: 2px 6px; }
#toolbar .spacer { flex: 1; }

.btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; color: var(--text); border: 1px solid transparent;
  border-radius: var(--radius); padding: 6px 8px; cursor: pointer; font-size: 13px;
}
.btn:hover { background: var(--hover); }
.btn:disabled { opacity: .4; cursor: default; }
.btn.icon-only { padding: 6px; }
.btn.primary { background: var(--accent); color: var(--accent-contrast); }
.btn.primary:hover { filter: brightness(1.05); }
.btn .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
.lock-chip { font-size: 12px; color: var(--muted); display: inline-flex; align-items: center; gap: 4px; }

main.app { display: flex; height: calc(100vh - 92px); }
#files { width: 240px; overflow: auto; border-right: 1px solid var(--border); background: var(--surface); }
#canvas { flex: 1; min-width: 0; }
.inspector { width: 300px; border-left: 1px solid var(--border); background: var(--surface); display: flex; flex-direction: column; }
.inspector-tabs { display: flex; border-bottom: 1px solid var(--border); }
.inspector-tab { flex: 1; background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--muted); padding: 8px 4px; cursor: pointer; font-size: 12px; }
.inspector-tab.active { color: var(--text); border-bottom-color: var(--accent); }
.inspector-panes { flex: 1; overflow: auto; }
.inspector-pane { padding: 10px; }

.menu { position: relative; }
.menu-pop, .popover {
  position: absolute; right: 0; top: 100%; z-index: 50;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  box-shadow: var(--shadow); padding: 6px; min-width: 200px;
}
.menu-pop button { display: block; width: 100%; text-align: left; background: transparent; border: none; color: var(--text); padding: 7px 10px; border-radius: 5px; cursor: pointer; }
.menu-pop button:hover { background: var(--hover); }

.file-row { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-bottom: 1px solid var(--border); }
.file-row button { background: transparent; border: none; color: var(--text); cursor: pointer; text-align: left; flex: 1; }
.file-row:hover { background: var(--hover); }
```

- [ ] **Step 2: Verify it parses (build picks it up once imported in Task 5)**

Run: `npm test && npm run typecheck`
Expected: green (CSS not yet imported; no effect). This task has no runtime change on its own — it's the token foundation consumed next.

- [ ] **Step 3: Commit**

```bash
git add src/app.css
git commit -m "feat(ui): design tokens (light/dark) + chrome styles"
```

---

## Task 5: Shell restructure + theme + inspector wiring (`main.ts`)

**Files:** Modify `src/main.ts`

**Interfaces:**
- Consumes: `applyTheme`/`getTheme`/`toggleTheme` (`./theme`), `icon` (`./icons`), `createInspector` (`./inspector`), `./app.css`.
- Produces: the new header/toolbar/inspector shell with theme toggle + identity menu; Capas/Propiedades/Historial render into inspector panes (ids preserved). Validated by typecheck + build + manual.

> **Read `src/main.ts` first.** It has `bootstrap()` with `showFolderGate`, `ensureNameThenApp`, `mountModeler`, `startApp` (the shell + button wiring), `renderVizSettings`, `renderLayers`, `loadHistory`, conflict/diff/poll, plus containers `#sync #conflict #appupdate #vizsettings` and the viz/version features. Integrate the edits below at the real anchors, preserving ALL existing wiring and container ids.

- [ ] **Step 1: Add imports**

```ts
import "./app.css";
import { applyTheme, getTheme, toggleTheme } from "./theme";
import { icon } from "./icons";
import { createInspector, type Inspector } from "./inspector";
```

- [ ] **Step 2: Apply the theme at startup**

In `bootstrap`, before the entry flow runs (top of `bootstrap`), add:

```ts
  applyTheme(getTheme());
```

- [ ] **Step 3: Add an outer `let inspector` near the other outer `let`s**

```ts
  let inspector: Inspector;
```

- [ ] **Step 4: Replace the `startApp` shell `innerHTML`** with the header/toolbar/inspector structure. Use this exact markup (it keeps every existing container id + adds the header/toolbar):

```ts
    root.innerHTML = `
      <header id="appheader">
        <span class="brand">◈ BPMN compartida</span>
        <span class="spacer"></span>
        <span class="hchip" id="folderchip"></span>
        <div class="menu" id="usermenu">
          <button class="btn" id="userbtn" type="button"></button>
        </div>
        <button class="btn icon-only" id="themebtn" type="button" title="Tema"></button>
      </header>
      <div id="toolbar">
        <div class="tgroup">
          <button class="btn icon-only" id="newfile" type="button" title="Nuevo diagrama">${icon("new")}</button>
          <button class="btn icon-only" id="undo" type="button" title="Deshacer (Ctrl+Z)">${icon("undo")}</button>
          <button class="btn icon-only" id="redo" type="button" title="Rehacer (Ctrl+Y)">${icon("redo")}</button>
          <button class="btn" id="save" type="button" title="Guardar (Ctrl+S)">${icon("save")}<span class="dot" id="savedot" hidden></span></button>
        </div>
        <span class="divider"></span>
        <div class="tgroup">
          <button class="btn icon-only" id="tab-capas" type="button" title="Capas">${icon("layers")}</button>
          <button class="btn icon-only" id="tab-props" type="button" title="Propiedades">${icon("properties")}</button>
          <button class="btn icon-only" id="settings" type="button" title="Ajustes">${icon("settings")}</button>
        </div>
        <span class="divider"></span>
        <div class="tgroup">
          <button class="btn icon-only" id="exportSvg" type="button" title="Exportar SVG">${icon("download")}<span style="font-size:11px">SVG</span></button>
          <button class="btn icon-only" id="exportPng" type="button" title="Exportar PNG">${icon("download")}<span style="font-size:11px">PNG</span></button>
        </div>
        <span class="spacer"></span>
        <span class="lock-chip" id="filechip"></span>
        <button class="btn" id="checkin" type="button" hidden>Check in</button>
        <button class="btn" id="close" type="button" hidden>Cerrar</button>
      </div>
      <div id="vizsettings" class="popover" hidden></div>
      <div id="sync"></div>
      <div id="conflict"></div>
      <div id="appupdate"></div>
      <main class="app">
        <aside id="files"></aside>
        <section id="canvas"></section>
        <div id="inspector" hidden></div>
      </main>`;
```

- [ ] **Step 5: Create the inspector and preserve the legacy pane ids**

Right after setting `root.innerHTML` in `startApp`, before `mountModeler()`:

```ts
    inspector = createInspector(document.getElementById("inspector")!, [
      { id: "capas", label: "Capas" },
      { id: "propiedades", label: "Propiedades" },
      { id: "historial", label: "Historial" },
    ]);
    // Reuse existing render targets so mountModeler/renderLayers/loadHistory are unchanged.
    inspector.paneEl("propiedades").id = "propspanel";
    inspector.paneEl("capas").id = "layerspanel";
    inspector.paneEl("historial").id = "history";
    inspector.hide();
```

(`mountModeler` reads `#propspanel` as the properties parent — it now resolves to the Propiedades pane. `renderLayers` writes to `#layerspanel`; `loadHistory` to `#history`.)

- [ ] **Step 6: Header — folder chip, user menu, theme toggle**

After the shell is built (in `startApp`, where buttons are wired):

```ts
    const $ = (id: string) => document.getElementById(id)!;
    $("folderchip").innerHTML = `${icon("folder")} <span>carpeta</span>`;
    const renderUserBtn = () => { $("userbtn").innerHTML = `${icon("user")} ${me.name} ${icon("chevron")}`; };
    renderUserBtn();
    const renderThemeBtn = () => { $("themebtn").innerHTML = icon(getTheme() === "dark" ? "sun" : "moon"); };
    renderThemeBtn();
    $("themebtn").addEventListener("click", () => { toggleTheme(); renderThemeBtn(); });

    $("userbtn").addEventListener("click", () => {
      const menu = $("usermenu");
      let pop = menu.querySelector(".menu-pop");
      if (pop) { pop.remove(); return; }
      pop = document.createElement("div");
      pop.className = "menu-pop";
      pop.innerHTML = `<button id="um-name" type="button">Cambiar nombre</button><button id="um-folder" type="button">Cambiar carpeta</button>`;
      menu.appendChild(pop);
      document.getElementById("um-name")!.addEventListener("click", () => {
        pop!.remove();
        void (async () => {
          const n = await promptText("¿Tu nombre?", { initial: me.name });
          if (n) { setName(n); me = { name: n, email: n }; renderUserBtn(); }
        })().catch(onError);
      });
      document.getElementById("um-folder")!.addEventListener("click", () => { pop!.remove(); showFolderGate(); });
    });
```

- [ ] **Step 7: Re-point the Capas/Propiedades/Settings/Export buttons to the new ids**

The shell renamed some buttons. Wire (preserving the existing handler bodies):
- `#tab-capas` → `inspector.setTab("capas"); renderLayers();`
- `#tab-props` → `inspector.setTab("propiedades");`
- `#settings` → `renderVizSettings();` (unchanged handler)
- `#exportSvg` / `#exportPng` → existing export handlers.
- `#newfile`, `#checkin`, `#close` → existing handlers (ids unchanged).
- Remove any now-defunct `#props`/`#layers`/`#changedir`/`#who`/`#logout` wiring that referenced removed elements (folder change now lives in the user menu).

```ts
    $("tab-capas").addEventListener("click", () => { inspector.setTab("capas"); renderLayers(); });
    $("tab-props").addEventListener("click", () => { inspector.setTab("propiedades"); });
    $("settings").addEventListener("click", () => renderVizSettings());
```

(Keep the existing `exportSvg`/`exportPng`/`newfile`/`checkin`/`close` listeners; just ensure they bind to these ids.)

- [ ] **Step 8: `render()` — update the file chip + Check in/Cerrar visibility**

Adapt the existing `render()` so editing state shows the open file chip and Check in/Cerrar; keep its other logic. Add inside `render()`:

```ts
    const editing = state.kind === "editing";
    const chip = document.getElementById("filechip");
    if (chip) chip.textContent = editing ? state.fileId : "";
    const ci = document.getElementById("checkin");
    const cl = document.getElementById("close");
    if (ci) (ci as HTMLElement).hidden = !editing || state.lock !== "mine";
    if (cl) (cl as HTMLElement).hidden = !editing;
```

(Remove old references to the removed `#save`/`#checkin`/`#close` footer if `render()` toggled them by the old layout; Save lives in the toolbar now and is handled in Task 6.)

- [ ] **Step 9: Verify gates**

Run: `npm run typecheck && npm test && npm run build`
Expected: clean; 120 tests pass; build succeeds. Fix any dangling reference to removed element ids.

- [ ] **Step 10: Commit**

```bash
git add src/main.ts
git commit -m "feat(ui): header + icon toolbar + tabbed inspector + theme toggle + user menu"
```

---

## Task 6: Edit actions — Undo/Redo, Save+dirty, shortcuts (`main.ts`)

**Files:** Modify `src/main.ts`, `README.md`

**Interfaces:**
- Consumes: the toolbar buttons `#undo`/`#redo`/`#save`/`#savedot` (Task 5).
- Produces: working undo/redo/save with a dirty dot + keyboard shortcuts. Validated by typecheck + build + manual.

- [ ] **Step 1: Wire Undo/Redo/Save buttons** (in `startApp`, with the other listeners)

```ts
    $("undo").addEventListener("click", () => { try { modeler.get("commandStack").undo(); } catch { /* nothing to undo */ } });
    $("redo").addEventListener("click", () => { try { modeler.get("commandStack").redo(); } catch { /* nothing to redo */ } });
    $("save").addEventListener("click", guard(async () => { if (state.kind === "editing" && state.lock === "mine") await save(state.fileId); }));
```

(`guard` and `save(fileId)` already exist in `main.ts`.)

- [ ] **Step 2: Reflect dirty + lock in `render()`** (extend the `render()` additions from Task 5)

```ts
    const canEdit = editing && state.lock === "mine";
    const save = document.getElementById("save") as HTMLButtonElement | null;
    if (save) save.disabled = !canEdit || !state.dirty;
    const dot = document.getElementById("savedot");
    if (dot) (dot as HTMLElement).hidden = !(editing && state.dirty);
    const undo = document.getElementById("undo") as HTMLButtonElement | null;
    const redo = document.getElementById("redo") as HTMLButtonElement | null;
    if (undo) undo.disabled = !canEdit;
    if (redo) redo.disabled = !canEdit;
```

- [ ] **Step 3: Add keyboard shortcuts** (in `startApp`, after the modeler exists; a single global handler)

```ts
    window.addEventListener("keydown", (ev) => {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (!(ev.ctrlKey || ev.metaKey)) return;
      const k = ev.key.toLowerCase();
      if (k === "s") {
        ev.preventDefault();
        if (state.kind === "editing" && state.lock === "mine") void save(state.fileId).catch(onError);
      } else if (k === "z" && !ev.shiftKey) {
        ev.preventDefault();
        try { modeler.get("commandStack").undo(); } catch { /* */ }
      } else if ((k === "z" && ev.shiftKey) || k === "y") {
        ev.preventDefault();
        try { modeler.get("commandStack").redo(); } catch { /* */ }
      }
    });
```

- [ ] **Step 4: Document in `README.md`** (append)

````markdown
## Interfaz

- Tema claro/oscuro: botón ☀/☾ en el header (se recuerda).
- Atajos: Ctrl+Z deshacer · Ctrl+Y (o Ctrl+Shift+Z) rehacer · Ctrl+S guardar.
- Panel derecho con pestañas: Capas · Propiedades · Historial.
````

- [ ] **Step 5: Verify gates**

Run: `npm test && npm run typecheck && npm run build`
Expected: 120 tests pass, typecheck clean, build succeeds.

- [ ] **Step 6: Manual smoke (best-effort; note if headless)**

`npm run dev`: open a folder + a `.bpmn`. Verify — header with theme toggle (light↔dark persists on reload); toolbar icons with tooltips; Undo/Redo work and disable when not editing; Save shows a dot when dirty and disables when clean/not-locked; Ctrl+Z/Y/S work outside inputs; Capas/Propiedades/Historial tabs switch in the right inspector; properties panel renders in its tab; export still works; ⚙ popover shows.

- [ ] **Step 7: Commit**

```bash
git add src/main.ts README.md
git commit -m "feat(ui): undo/redo + save with dirty indicator + keyboard shortcuts"
```

---

## Self-Review notes (resolved)

- **Spec coverage:** theme (T1), icons (T2), tabbed inspector (T3), tokens/chrome CSS (T4), shell+header+toolbar+inspector wiring+theme toggle+user menu (T5), undo/redo+save+dirty+shortcuts (T6). Right-panel tabs + preserved ids (T5 step 5). Zoom buttons excluded (YAGNI).
- **Reuse via id preservation:** the inspector panes are re-id'd to `propspanel`/`layerspanel`/`history`, so `mountModeler` (properties parent), `renderLayers`, and `loadHistory` need NO changes — the riskiest integration point is handled by keeping ids stable.
- **Type/naming consistency:** `Theme`/`getTheme`/`toggleTheme` (T1) used in T5; `icon(IconName)` (T2) used in T5/T6; `createInspector`/`Inspector`/`setTab`/`paneEl`/`show`/`hide` (T3) used in T5. Toolbar button ids in T5 (`undo`/`redo`/`save`/`savedot`/`tab-capas`/`tab-props`/`settings`/`exportSvg`/`exportPng`/`checkin`/`close`/`newfile`) match the wiring in T5/T6.
- **Preserved containers:** `#sync`/`#conflict`/`#appupdate`/`#vizsettings`/`#canvas`/`#files` kept so conflict bar, sync warning, app-update banner, viz/version popover, and existing handlers keep working.
- **Empirical/manual:** `main.ts` has no unit test; T5/T6 are validated by typecheck + build + the manual checklist (T6 step 6). The implementer must read the real `main.ts` and integrate at anchors, removing only the genuinely-replaced old toolbar/footer wiring.
```
