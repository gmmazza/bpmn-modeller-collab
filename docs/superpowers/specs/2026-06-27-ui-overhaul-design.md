# Rediseño de UI — Diseño

**Fecha:** 2026-06-27
**Estado:** Aprobado

## Objetivo

Hacer la interfaz visualmente prolija e intencional (hoy son botones HTML crudos y
paneles que empujan el canvas): un **header** + **toolbar de íconos agrupada**, un
**panel inspector derecho con pestañas** (Capas / Propiedades / Historial), **tema
claro/oscuro con toggle**, y las acciones que faltaban (**Deshacer/Rehacer**, **Guardar
siempre visible + indicador de cambios**, **atajos de teclado**). Es reskin +
reorganización + acciones nuevas; **no toca la lógica de dominio**.

## Decisiones (aprobadas)

- Sumar: ↶/↷ Deshacer/Rehacer, 💾 Guardar siempre visible + indicador de "sin guardar",
  atajos Ctrl+Z / Ctrl+Shift+Z (o Ctrl+Y) / Ctrl+S. (Zoom con botones: fuera de alcance.)
- Tema **claro (default) + oscuro con toggle**, recordado en localStorage.
- Panel derecho con **pestañas**: Capas · Propiedades · Historial (una visible a la vez).

## Arquitectura / layout

```
┌ Header ───────────────────────────────────────────────────────────┐
│ ◈ BPMN compartida              📁 <carpeta>   👤 <nombre> ▾   ☀/☾ │
├ Toolbar ──────────────────────────────────────────────────────────┤
│ [Nuevo] │ ↶ ↷ 💾• │ 🎨Capas ☰Propiedades ⚙ │ ⬇SVG ⬇PNG │  <archivo> 🔒  Check in  Cerrar │
├───────────────────────────────────────────────┬───────────────────┤
│ aside #files            │     #canvas          │ Inspector (tabs)  │
│  (lista con chips lock) │                      │ [Capas|Prop|Hist] │
│                         │   …badge linting…    │  contenido tab    │
└─────────────────────────┴──────────────────────┴───────────────────┘
```

- **Header** (`#appheader`): marca; a la derecha carpeta, menú de usuario (▾: cambiar
  nombre / cambiar carpeta) y toggle de tema.
- **Toolbar** (`#toolbar`): grupos separados por divisores, botones-ícono con `title`
  (tooltip) y `aria-label`. Grupo edición (Nuevo, ↶, ↷, 💾 con dot de dirty); grupo
  vista (Capas, Propiedades, ⚙); grupo export (SVG, PNG). Con archivo abierto: chip de
  nombre + estado de lock, Check in, Cerrar.
- **Inspector derecho** (`#inspector`): barra de pestañas + un contenedor de contenido.
  Las pestañas Capas/Propiedades/Historial muestran una a la vez; los botones
  🎨Capas/☰Propiedades del toolbar abren el inspector en esa pestaña (toggle si ya está).
  El **parent del properties-panel de bpmn-js** vive en el pane "Propiedades"; `renderLayersPanel`
  en "Capas"; `renderHistoryPanel` en "Historial".
- ⚙ Ajustes → **popover** (no barra de ancho completo), con los toggles viz (sketchy/heatmap)
  y el chequeo de versión de bpmn-js ya existentes.
- La **paleta** de bpmn-js y el **badge de linting** quedan donde el motor los pone; solo
  se estilan para combinar con el tema.

## Componentes / archivos

```
src/theme.ts                # NEW: getTheme/setTheme/applyTheme (localStorage 'bpmn-compartida.theme')
src/theme.test.ts           # NEW
src/icons.ts                # NEW: mapa de íconos SVG inline (string) + helper icon(name)
src/icons.test.ts           # NEW (cada ícono devuelve <svg>)
src/inspector.ts            # NEW: createInspector(container) — tabs Capas/Prop/Historial; setTab/activeTab/paneEl
src/inspector.test.ts       # NEW (happy-dom: cambia de tab, expone los panes)
src/app.css                 # NEW: design tokens (claro/oscuro) + estilos de header/toolbar/inspector/lista/botones
src/main.ts                 # MODIFY: nuevo shell (header/toolbar/inspector), toggle tema, undo/redo/save+dirty, atajos, menú usuario, wiring de tabs
src/ui.ts                   # (sin cambios funcionales; sus render* se montan dentro de panes del inspector)
README.md                   # MODIFY: nota de atajos + tema
```

### `theme.ts`
- `type Theme = "light" | "dark"`.
- `getTheme(): Theme` (default `"light"`; lee `localStorage["bpmn-compartida.theme"]`).
- `setTheme(t: Theme): void` (persiste).
- `applyTheme(t: Theme): void` → `document.documentElement.dataset.theme = t`.
- `toggleTheme(): Theme` → invierte, persiste, aplica, devuelve el nuevo.

### `icons.ts`
- `icon(name: IconName): string` devuelve un `<svg ...>…</svg>` (24px, `stroke="currentColor"`,
  `fill="none"`), set: `new, undo, redo, save, layers, properties, settings, download,
  sun, moon, user, folder, check, close, chevron`. Sin dependencia externa.

### `inspector.ts`
- `createInspector(container, tabs: {id,label}[])` → `{ setTab(id), activeTab(): string|null,
  paneEl(id): HTMLElement, show()/hide(), isVisible() }`. Renderiza la barra de tabs y un
  pane por tab; al cambiar de tab muestra ese pane. Los consumidores montan su contenido en
  `paneEl(id)`.

### `main.ts` (reorganización)
- El shell `innerHTML` pasa a header + toolbar + main(aside files · canvas · inspector) +
  (el footer Guardar/Checkin/Cerrar se integra al toolbar; Guardar pasa al grupo edición).
- Botones nuevos con `icon(...)`: undo → `commandStack.undo()`, redo → `commandStack.redo()`,
  save → `save(fileId)` con el botón mostrando dot cuando `state.dirty`.
- `render()` actualiza el estado de los botones (habilitado/deshabilitado, dot de dirty)
  según `state`/lock.
- Toggle de tema en header → `toggleTheme()` + re-render del ícono.
- Menú de usuario (▾): cambiar nombre (re-pide con `promptText`), cambiar carpeta (`showFolderGate`).
- Atajos: un `keydown` global: Ctrl+Z → undo, Ctrl+Shift+Z/Ctrl+Y → redo, Ctrl+S → save
  (preventDefault), ignorando si el foco está en input/textarea/contenteditable y solo con
  archivo abierto/lock propio donde aplique.
- Inspector: `loadLayers`/`loadHistory` montan en `inspector.paneEl("capas")` /
  `paneEl("historial")`; el properties-panel usa `paneEl("propiedades")` como parent al crear
  el modeler. Capas/Propiedades del toolbar → `inspector.show()` + `setTab(...)`.
- `applyTheme(getTheme())` al iniciar (antes de render).

## Casos borde / errores
- **Tema no seteado** → "light". **localStorage corrupto** → default (try/catch).
- **Inspector con properties-panel**: el parent debe existir antes de crear el modeler
  (mountModeler crea el modeler → el pane "Propiedades" ya debe estar en el DOM). El shell se
  arma antes de `mountModeler`.
- **Atajos**: no disparan dentro de inputs; redo acepta ambas combinaciones; save no hace nada
  sin lock propio.
- **Sin archivo abierto**: undo/redo/save/export deshabilitados; tabs Propiedades/Historial vacías.
- **Recrear modeler** (ajustes viz): el pane "Propiedades" persiste (no se destruye el inspector);
  solo se recrea el modeler dentro de #canvas.

## Fuera de alcance (YAGNI)
- Zoom con botones. Rediseñar la paleta o el badge de linting (solo se estilan).
- Cambiar la lógica de fsClient/capas/diff/watcher/sync/linting/electron.
- Animaciones elaboradas.

## Testing
- **`theme.ts`** — default light, persist/read, corrupt→default, `applyTheme` setea
  `data-theme`, `toggleTheme` invierte+persiste.
- **`icons.ts`** — `icon(name)` devuelve string que empieza con `<svg`; cada nombre del set existe.
- **`inspector.ts`** — happy-dom: arranca con una tab activa; `setTab` cambia el pane visible;
  `paneEl(id)` devuelve el contenedor correcto; show/hide.
- **Glue** (`main.ts`: shell, toolbar, atajos, menú, wiring) — build + checklist visual
  (claro/oscuro, undo/redo/save+dot, tabs, export, ⚙ popover). `main.ts` no tiene unit test.
- **Regresión**: 120 tests verdes. **Gates**: `npm test`, `npm run typecheck`, `npm run build`.

## Empaquetado
No cambia el modelo; al terminar se regenera el `.exe` (junto con el de linting).
