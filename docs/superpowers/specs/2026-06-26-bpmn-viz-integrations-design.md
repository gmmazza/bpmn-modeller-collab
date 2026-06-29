# BPMN — Integraciones y visualizaciones (port del plugin de Obsidian) — Diseño

**Fecha:** 2026-06-26
**Estado:** Aprobado (pendiente plan de implementación)

## Objetivo

Integrar al editor de la app las features de visualización/edición del plugin de
Obsidian `C:\Claude\obsdian\bpmn plugin copy` — todas son módulos del ecosistema
bpmn-js, así que se enchufan al `Modeler` que ya usamos. Lo único "de Obsidian" del
plugin (la cáscara de vista que guarda al vault) no se porta.

Features a integrar:
1. **Color picker** (`bpmn-js-color-picker`) — colorear elementos a mano.
2. **Panel de propiedades** (`bpmn-js-properties-panel` + provider) — editar atributos.
3. **Minimapa** (`diagram-js-minimap`).
4. **Grilla** de fondo (`diagram-js-grid`).
5. **Simulación de tokens** (`bpmn-js-token-simulation` + `simulation-support`).
6. **Heatmap** de actividad sobre la simulación (`heatmap-ts`, beta).
7. **Renderer "sketchy"** (`bpmn-js-sketchy`) + textRenderer Comic Sans.
8. **Exportar SVG** y **PNG** (PNG funcionando de verdad, a diferencia del plugin).

**Fuera de alcance:** colorear por madurez/estado o capas semánticas (no existe en el
plugin; sería feature nueva, se decidió posponer).

## Decisiones de UX (aprobadas)

- **Siempre activos:** color picker, minimapa, grilla, panel de propiedades (con botón
  **Propiedades** que muestra/oculta el panel) y simulación de tokens (su propio botón
  ▶ aparece en el canvas; no molesta apagada).
- **Detrás de ⚙ Ajustes (persistidos en `localStorage`):** `sketchy` y `heatmap`.
  Cambian el modo de render / agregan polling, así que se deciden al crear el modeler.
- **Exportar SVG/PNG:** descarga del navegador/SO (no se escriben en la carpeta).

## Arquitectura

`editor.ts` hoy hace `new BpmnModeler({ container })`. Se parametriza la creación
para inyectar `additionalModules`, `propertiesPanel.parent` y `textRenderer` según los
ajustes. El resto de la app (state, fsClient, watcher, diff, etc.) no cambia.

```
mountModeler(canvasEl, propsEl, settings)         // (re)crea el Modeler
   ├─ buildModules(settings)  → lista de additionalModules        [PURO, testeable]
   │     siempre: colorPicker, minimap, grid, propertiesPanel(+provider),
   │              tokenSimulation(+simulationSupport)
   │     + sketchy (si settings.sketchy)
   ├─ textRenderer = Comic Sans  (si settings.sketchy)
   ├─ propertiesPanel: { parent: propsEl }
   └─ si settings.heatmap → createHeatmapController(modeler, canvasEl).start()
```

## Componentes

### Nuevos

- **`src/vizSettings.ts`** — persistencia de ajustes en `localStorage`
  (clave `bpmn-compartida.viz`):
  - `interface VizSettings { sketchy: boolean; heatmap: boolean }`
  - `getVizSettings(): VizSettings` (default `{ sketchy: false, heatmap: false }`)
  - `setVizSettings(s: VizSettings): void`
- **`src/exporters.ts`** — exportación:
  - `exportSvg(modeler): Promise<void>` — `modeler.saveSVG()` → dispara descarga `.svg`.
  - `exportPng(modeler): Promise<void>` — toma el SVG, lo dibuja en un `<canvas>`,
    `canvas.toBlob("image/png")` → descarga `.png`. (Helper interno
    `svgToPngBlob(svg, width, height): Promise<Blob>`.)
  - `triggerDownload(blobOrText, filename, mime)` helper.
- **`src/heatmap.ts`** — `createHeatmapController(modeler, container)` con `start()` y
  `stop()`. Porta la lógica del plugin: durante la simulación, cada 1s lee
  `simulationSupport.getHistory()`, acumula visitas por elemento (ignora `Flow*`),
  y pinta un `HeatMap` (heatmap-ts) posicionado por el `canvas.viewbox()`. Limpia el
  `setInterval` en `stop()`. Resetea al evento `tokenSimulation.toggleMode`.
  (Mantiene el TODO de zoom del plugin; es beta.)

### Modificados

- **`src/editor.ts`**:
  - `buildModules(settings: VizSettings): unknown[]` — función PURA que arma la lista
    de `additionalModules` (testeable sin DOM).
  - `createBpmnModeler(container, opts?: { propertiesParent?, settings? })` — usa
    `buildModules` + `textRenderer` (Comic Sans si `settings.sketchy`) +
    `propertiesPanel.parent`. Mantiene la firma vieja usable (todo opcional).
  - `ModelerLike` ya expone `get(name)`; se reutiliza para `commandStack`, `canvas`,
    `simulationSupport`, etc.
- **`src/main.ts`**:
  - El shell agrega un contenedor para el panel de propiedades (oculto por defecto) y
    botones en la barra: **Propiedades** (toggle panel), **Exportar SVG**,
    **Exportar PNG**, **⚙ Ajustes**.
  - `mountModeler()` encapsula crear el modeler (con ajustes actuales), `createEditor`,
    `createDiffView`, el handler de dirty y, si corresponde, el heatmap controller.
    Se llama en `startApp` y al aplicar ajustes.
  - `applyVizSettings(next)` — persiste, y si hay un archivo abierto: si está sucio lo
    **guarda** primero, luego recrea el modeler (`mountModeler`) y recarga el XML
    actual; si no hay archivo abierto, solo recrea. Limpia el heatmap viejo antes.
  - Panel ⚙: dos toggles (sketchy, heatmap) → `applyVizSettings`.
  - Wire de los botones export a `exportSvg`/`exportPng`.
- **`package.json`** — nuevas deps (ver abajo) + sus CSS importados en `main.ts`.
- **`src/diff.css`** (o un nuevo `viz.css`) — estilos del panel de propiedades,
  botones, panel de ajustes; los CSS de los módulos se importan desde sus paquetes.

### Sin cambios

`state`, `fsClient`, `folder`, `ipcFs`, `watcher`, `lockManager`, `history`,
`bpmnDiff`, `diffView`, `syncConflict`, `identity`, electron/*.

## Dependencias

```
bpmn-js-color-picker
bpmn-js-properties-panel  + @bpmn-io/properties-panel  (peer)
diagram-js-minimap
diagram-js-grid
bpmn-js-token-simulation
bpmn-js-sketchy
heatmap-ts
```
CSS a importar en `main.ts` (además de los actuales de bpmn-js):
`bpmn-js-color-picker/colors/color-picker.css`,
`bpmn-js-token-simulation/assets/css/bpmn-js-token-simulation.css`,
`diagram-js-minimap/assets/diagram-js-minimap.css`,
`@bpmn-io/properties-panel/dist/assets/properties-panel.css`,
`bpmn-js-properties-panel/dist/assets/properties-panel.css` (según el paquete).

## Riesgo principal: compatibilidad de versiones

La app usa **bpmn-js 17.11**; el plugin un fork **18**. Estos módulos deben matchear la
versión de bpmn-js/diagram-js. Plan: instalar versiones compatibles con bpmn-js 17;
si el typecheck/build/runtime falla por incompatibilidad, **subir a bpmn-js ^18** (el
plugin demuestra que 18 funciona con todos estos módulos) y ajustar `bpmn-moddle` si
hiciera falta. Gate de verificación: el editor actual y el **diff** (que usa
`bpmn-moddle` + `bpmn-js-differ`) deben seguir pasando sus tests tras cualquier bump.
Es la parte con más fricción posible y se valida con `npm test` + `npm run build`.

## Manejo de errores y casos borde

- **Aplicar ajustes con cambios sin guardar:** `applyVizSettings` guarda primero si
  está sucio (reusa `save`), luego recrea — no se pierden cambios.
- **Heatmap sin simulación corriendo:** el controller solo pinta datos cuando hay
  historial; si no, queda vacío. `stop()` limpia el intervalo (en recreate y al cerrar).
- **Export sin archivo abierto:** los botones export solo actúan si hay un modeler con
  diagrama; si no, no hacen nada (o muestran toast).
- **PNG:** si `toBlob` devuelve null (raro), se avisa por toast; no rompe.
- **Recrear el modeler:** se destruye el anterior (`modeler.destroy()`) y se limpia el
  contenedor para no duplicar el canvas; se vuelve a cablear `diffView` y dirty.

## Testing

- **`vizSettings.ts`** — get/set/default en `localStorage` (happy-dom), como `identity`.
- **`editor.buildModules(settings)`** — función pura: con `sketchy` on/off, heatmap no
  afecta la lista de módulos; verifica que incluye los siempre-on y agrega sketchy solo
  cuando corresponde. (Se compara por identidad de módulo o por longitud/known set.)
- **`exporters.ts`** — `triggerDownload` y la rama de filename son testeables; la
  conversión SVG→PNG (canvas/Image) se valida por build + manual (DOM-dependiente).
- **Lo visual** (paneles, simulación, heatmap, sketchy, minimapa, grilla) se valida por
  `npm run build` + checklist manual, igual que el editor hoy.
- **Regresión:** los 80 tests actuales (incluido el diff y el editor) deben seguir verdes.
- **Gates:** `npm test`, `npm run typecheck`, `npm run build`.

## Empaquetado

No cambia el modelo: la app sigue siendo SPA (web) y Electron portable. Estas features
son módulos del renderer, ya incluidos en el bundle de Vite. El `.exe` se regenera con
`@electron/packager` como hasta ahora.
