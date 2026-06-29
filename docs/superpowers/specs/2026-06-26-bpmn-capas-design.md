# BPMN — Visualización por capas (port del POC) — Diseño

**Fecha:** 2026-06-26
**Estado:** Aprobado (pendiente plan de implementación)

## Objetivo

Incorporar al editor la **visualización por capas** del POC
`C:\remotelySaveLocalBACKUPEAR!\...\POC visor BPMN por capas.html`: mantener fijo el
diagrama y **repintarlo por una "capa"** elegida (ej. madurez/automatización, actores),
más una capa de **anotación** (badges de documentos/apps), con **leyenda**. Los datos de
las capas viven **separados del diagrama** (el `.bpmn` es la "geometría maestra").

A diferencia del POC (un viewer read-only con mapas hardcodeados), nuestra app **edita**
y **sincroniza por carpeta**, así que: los mapas se guardan en un **sidecar
`<nombre>.layers.json`** que se sincroniza junto al `.bpmn`, y se puede **asignar** la
categoría de cada elemento desde la app.

Subsistema independiente del de "features del plugin"
(`2026-06-26-bpmn-viz-integrations-design.md`); plan propio.

## Principio rector (no destructivo)

Las capas NO modifican el `.bpmn`. El coloreo se hace con `canvas.addMarker(id, clase)` +
CSS generado, y las anotaciones con `overlays.add` — exactamente el enfoque del POC
("el mismo render, repintado"). Reusa el `fsClient` actual para el sidecar; no toca el
modelo de sincronización, diff, locks ni historial.

## Modelo de datos — sidecar `<nombre>.layers.json`

```json
{
  "version": 1,
  "dimensions": [
    {
      "id": "madurez",
      "label": "Automatización (madurez)",
      "type": "color",
      "categories": [
        { "id": "manual",   "label": "Manual",        "fill": "#F1948A", "stroke": "#C0392B" },
        { "id": "asistido", "label": "Asistido",      "fill": "#F7DC6F", "stroke": "#B7950B" },
        { "id": "auto",     "label": "Automatizado",  "fill": "#82E0AA", "stroke": "#1E8449" }
      ],
      "assignments": { "t_cli_form": "manual", "t_presup": "asistido" }
    },
    {
      "id": "actores", "label": "Actores", "type": "color",
      "categories": [
        { "id": "cliente",  "label": "Cliente",        "fill": "#AED6F1", "stroke": "#2471A3" },
        { "id": "transp",   "label": "Transporte",     "fill": "#D2B4DE", "stroke": "#6C3483" },
        { "id": "deposito", "label": "Depósito",       "fill": "#A3E4D7", "stroke": "#148F77" },
        { "id": "lab",      "label": "Laboratorio",    "fill": "#A9CCE3", "stroke": "#1F618D" },
        { "id": "taller",   "label": "Taller",         "fill": "#F5CBA7", "stroke": "#CA6F1E" },
        { "id": "terceros", "label": "Terceros",       "fill": "#D7DBDD", "stroke": "#717D7E" },
        { "id": "admin",    "label": "Administración", "fill": "#F9E79F", "stroke": "#B7950B" }
      ],
      "assignments": {}
    },
    {
      "id": "docs", "label": "Documentos / Apps", "type": "annotation",
      "assignments": { "t_cli_form": "📋 Planilla / Remito" }
    }
  ]
}
```

- **Dimensión `color`**: `categories` (id/label/fill/stroke) + `assignments` (elementId →
  categoryId). Colorea el relleno/borde del elemento.
- **Dimensión `annotation`**: `assignments` (elementId → texto libre) → badge HTML.
- Si el sidecar no existe, se usa `defaultLayerFile()` (Madurez + Actores + Docs con los
  defaults del POC, `assignments` vacíos). Se persiste al primer guardado/asignación.

## Componentes

### Nuevos (módulos chicos, testeables)

- **`src/layers/layerModel.ts`** (PURO):
  - Tipos: `LayerFile`, `Dimension` (`ColorDimension | AnnotationDimension`), `Category`.
  - `defaultLayerFile(): LayerFile` — siembra Madurez/Actores/Docs.
  - `normalizeLayerFile(raw: unknown): LayerFile` — valida/sanea JSON cargado (descarta
    dimensiones inválidas; garantiza estructura). Tolerante a archivos a mano.
  - `markerClass(dimId, catId): string` → `l-<dimId>-<catId>`.
  - `cssForDimension(dim: ColorDimension): string` — genera las reglas
    `.djs-element.l-<dim>-<cat> .djs-visual > :first-child { fill:…!important; stroke:…!important }`
    para cada categoría.
- **`src/layers/layersClient.ts`**:
  - `createLayersClient(api: FsClient)` con:
    - `load(fileId): Promise<LayerFile>` — lee `<fileId>.layers.json` (vía `api.getXml`
      sobre el nombre del sidecar — ver nota), o `defaultLayerFile()` si no existe/JSON
      inválido (pasa por `normalizeLayerFile`).
    - `save(fileId, layers: LayerFile): Promise<void>` — escribe el sidecar.
  - Nota de implementación: el `fsClient` lee/escribe `.bpmn` por nombre; para el sidecar
    se agrega al `fsClient` un par genérico `readSidecar(id, suffix)` / `writeSidecar(id,
    suffix, text)` (o se reutiliza la capa de archivos) que opere sobre `<id>.layers.json`.
    El `<id>.layers.json` NO aparece en `listFiles` (filtra solo `.bpmn`), así que no
    contamina la lista ni el watcher.
- **`src/layers/layerView.ts`**:
  - `createLayerView(modeler)` con:
    - `applyColor(dim: ColorDimension | null)` — limpia markers previos, inyecta/reemplaza
      un `<style id="bpmn-layer-styles">` con `cssForDimension(dim)`, y hace
      `canvas.addMarker(id, markerClass(dim.id, cat))` por cada assignment. `null` =
      "Original" (sin markers).
    - `setAnnotation(dim: AnnotationDimension, on: boolean)` — `overlays.add/remove`
      badges (`type` = `layer-annot-<dimId>`).
    - `legend(dim): Array<{ color, label }>` — para render de la leyenda.
    - `clear()` — quita markers y overlays (al recrear el modeler / cerrar archivo).
  - Targetea `.djs-visual > :first-child` (sirve para tareas/eventos/gateways), como el
    `diff.css` actual.

### Modificados

- **`src/fsClient.ts`** — agrega `readSidecar(id, suffix): Promise<string | null>` y
  `writeSidecar(id, suffix, text): Promise<void>` (genéricos, confinados a la carpeta),
  usados por `layersClient`. No cambia la interfaz existente que consume `main.ts`.
  (En el backend Electron pasa por el mismo `ipcFs`/guardia de rutas; no requiere nuevos
  handlers porque son operaciones de archivo ya soportadas.)
- **`src/main.ts`** — integra el **panel "Capas"**:
  - Selector de **dimensión de color** (radios: *Original* + cada `color` dimension) →
    `layerView.applyColor` + leyenda.
  - **Toggles de anotación** (cada `annotation` dimension) → `layerView.setAnnotation`.
  - **Asignar**: con un elemento seleccionado (selección normal de bpmn-js vía
    `selection`/`eventBus 'selection.changed'`), el panel muestra su categoría actual en
    la dimensión activa y un desplegable (color) o input de texto (annotation) para
    cambiarla → actualiza el `LayerFile` en memoria, `layersClient.save`, y repinta.
  - Carga el sidecar en `openFile` (tras cargar el XML) y lo limpia al cerrar/recrear.
- **`src/ui.ts`** (o `src/layers/layersPanel.ts`) — `renderLayersPanel(container, …)` que
  dibuja el panel (radios, toggles, leyenda, asignación). Testeable con happy-dom.
- **`src/layers.css`** (importado en `main.ts`) — estilos del panel, badges (`.doc-badge`
  del POC), leyenda. Las reglas de color por categoría se generan en runtime
  (`cssForDimension`), no acá.

### Sin cambios

`state`, `folder`, `ipcFs` (salvo que pase los sidecar ops si fuese necesario; en
principio no), `watcher`, `lockManager`, `history`, `bpmnDiff`, `diffView`,
`syncConflict`, `identity`, electron `main.cjs`/`preload.cjs`/`pathGuard.cjs`.

## Flujo

1. Abrir un `.bpmn` → además de cargar el XML, `layersClient.load(fileId)` trae el
   sidecar (o defaults). El panel "Capas" se llena con sus dimensiones.
2. Elegir una dimensión de color → repinta + leyenda. *Original* vuelve al render del
   archivo.
3. Activar "Documentos/Apps" → badges sobre los elementos anotados.
4. Seleccionar un elemento + elegir su categoría en el panel → se guarda el sidecar y
   repinta. (El `.bpmn` no se toca.)
5. El sidecar se sincroniza con la carpeta → otros PCs ven las mismas capas.

## Casos borde / errores

- **Assignments a IDs inexistentes** (elemento borrado del diagrama): `addMarker` se
  envuelve en try/catch (como el POC); la asignación huérfana se ignora al pintar (se
  puede podar al guardar). No rompe.
- **Sidecar inválido / a mano**: `normalizeLayerFile` lo sanea; si es irrecuperable, cae
  a defaults sin perder el `.bpmn`.
- **Conflicto de sync del sidecar**: como cualquier archivo de la carpeta; la app usa la
  versión local. (No se mergea.) El `.layers.json` queda fuera de `listFiles`/watcher.
- **Recrear modeler** (p. ej. al cambiar ajustes del otro spec): `layerView.clear()` y
  re-aplicar la capa activa tras recargar.
- **Dimensión de anotación con texto vacío**: no agrega badge.

## Alcance v1 / fuera de alcance

- **v1**: ver capas (color + anotación), leyenda, **asignar** elementos a categorías
  (persistido en el sidecar), defaults sembrados.
- **Configurable**: las dimensiones/categorías se pueden editar a mano en el
  `.layers.json` (y vienen sembradas). Un **formulario in-app** para crear/editar
  dimensiones y categorías nuevas se incluye si entra holgado en el plan; si no, queda
  como follow-up (el modelo ya lo soporta).
- **Fuera**: capas de visibilidad (mostrar/ocultar grupos), heatmap (eso está en el otro
  spec), y colorear por madurez como *export* al `.bpmn` (sigue siendo overlay).

## Testing

- **`layerModel.ts`** — `defaultLayerFile`, `normalizeLayerFile` (acepta válido, descarta
  basura), `markerClass`, `cssForDimension` (genera reglas por categoría). Puro.
- **`layersClient.ts`** — `load` (existe → parsea; ausente/ inválido → defaults), `save`
  (escribe el sidecar), contra un fake `FsClient` (reusa el patrón de `fsClient.test`).
- **`layerView.ts`** — con un fake modeler (canvas.addMarker/removeMarker, overlays.add/
  remove, una util para `<style>`): `applyColor` agrega los markers correctos y limpia al
  cambiar; `setAnnotation` agrega/quita overlays; `legend` arma filas correctas.
- **`renderLayersPanel`** — happy-dom: radios/toggles disparan callbacks; asignación
  refleja el elemento seleccionado.
- **Visual** (coloreo real, badges, leyenda en vivo) — `npm run build` + checklist manual,
  con el `.bpmn` del POC como fixture.
- **Regresión**: tests actuales verdes. **Gates**: `npm test`, `npm run typecheck`,
  `npm run build`.

## Empaquetado

No cambia: es código del renderer, ya entra en el bundle de Vite y en el `.exe` de
Electron. El sidecar `.layers.json` se sincroniza como cualquier archivo de la carpeta.
