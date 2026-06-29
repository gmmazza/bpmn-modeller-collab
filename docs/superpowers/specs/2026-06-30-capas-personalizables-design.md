# Capas personalizables y plantillas — Design

**Estado:** aprobado (brainstorming) — 2026-06-30

## Objetivo

Permitir crear y editar **dimensiones de capas** y sus **categorías** desde la
app (hoy solo se editan a mano en el `.layers.json`), tanto **por documento**
como guardándolas/aplicándolas en forma de **plantillas** compartidas por el
equipo.

## Contexto

El sistema de capas ya es genérico y data-driven (`src/layers/`):

- `LayerFile = { version: 1, dimensions: Dimension[] }`, persistido en el sidecar
  `<diagrama>.layers.json` (`layersClient.ts`). Ya es **por documento**.
- `Dimension` es `ColorDimension` (con `categories[]` de `{id,label,fill,stroke}`
  + `assignments`) o `AnnotationDimension` (texto por elemento, sin categorías).
- El panel (`layersPanel.ts`), la leyenda, el dropdown de asignar, el CSS de
  color (`cssForDimension`) y los markers del canvas (`layerView.ts`) ya iteran
  sobre cualquier conjunto de dimensiones/categorías.

Lo único que falta es **UI de edición** y **plantillas**. Esta entrega es
puramente aditiva: no se refactoriza el render ni la aplicación de colores.

## Decisiones (del brainstorming)

1. **Alcance:** CRUD por documento **+** plantillas, juntos.
2. **Tipos editables:** color **y** anotación.
3. **Color:** el usuario elige solo el **relleno**; el **borde se deriva**
   automáticamente (versión más oscura del relleno).
4. **Dónde viven las plantillas:** en la **carpeta de trabajo** (compartidas vía
   sync), un **archivo por plantilla** en `.layer-templates/<slug>.json`.
5. **UI:** el panel Capas sigue igual + botón **"Gestionar capas…"** que abre un
   **modal** con el CRUD y las plantillas.
6. **Aplicar plantilla:** **fusionar agregando lo que falta** (por `id`); nunca
   pisa dimensiones existentes ni toca asignaciones.
7. **Fuera de alcance (YAGNI):** reordenar dimensiones/categorías (drag/flechas).

## Arquitectura

Mantener la arquitectura actual y agregar tres piezas: funciones puras de
mutación en el modelo, un cliente de plantillas, y un modal de UI. El *wiring*
en `main.ts` reusa el camino existente de re-aplicación de colores.

### 1. Modelo y mutaciones — `src/layers/layerModel.ts` (extender)

Funciones **puras** (sin disco ni DOM), cada una devuelve un `LayerFile` nuevo:

- `slugId(label: string, existingIds: string[]): string` — id estable y único
  (slug del label; si colisiona, sufijo `-2`, `-3`, …).
- `deriveStroke(fill: string): string` — borde automático: multiplica cada canal
  RGB por `0.62` (oscurece ~38%). Entrada hex `#RRGGBB`; salida hex.
- `addColorDimension(lf, label): { lf: LayerFile; id: string }` — crea la
  dimensión **con una categoría semilla** (`label: "Categoría 1"`, color por
  defecto p. ej. `#AED6F1`) para no dejar un color-dim sin categorías (que
  `normalizeLayerFile` descarta).
- `addAnnotationDimension(lf, label): { lf; id }`.
- `renameDimension(lf, id, label): LayerFile` — cambia solo el `label` (el `id`
  no cambia → las asignaciones sobreviven).
- `deleteDimension(lf, id): LayerFile`.
- `addCategory(lf, dimId, label, fill): { lf; id }` — calcula `stroke` con
  `deriveStroke(fill)`.
- `updateCategory(lf, dimId, catId, { label?, fill? }): LayerFile` — si cambia
  `fill`, recalcula `stroke`.
- `deleteCategory(lf, dimId, catId): LayerFile` — **cascada**: elimina del
  `assignments` de esa dimensión toda entrada cuyo valor sea `catId`.
- `mergeTemplate(lf, templateDims: Dimension[]): LayerFile` — agrega las
  dimensiones cuyo `id` no exista en `lf`; deja intactas las existentes y todas
  las asignaciones.

**Regla de IDs:** el `id` se genera una sola vez al crear; renombrar el label no
lo cambia. Las `assignments` referencian `id`s de categoría, por eso renombrar es
seguro y borrar requiere cascada.

### 2. Plantillas — `src/layers/layerTemplates.ts` (nuevo)

- Tipo: `Template = { name: string; dimensions: Dimension[] }` (definiciones
  **sin asignaciones**).
- Almacenamiento: **un archivo por plantilla** en `.layer-templates/<slug>.json`
  (mismo patrón de subcarpeta que `.history/`). Un archivo por plantilla evita
  que dos personas se pisen al crear plantillas distintas.
- API (sobre el `fsClient`/`api` existente):
  - `listTemplates(api): Promise<{ slug: string; name: string }[]>` — lista
    `.layer-templates/`, lee el `name` de cada archivo (tolera carpeta ausente →
    `[]`).
  - `loadTemplate(api, slug): Promise<Template | null>`.
  - `saveTemplate(api, name, dimensions): Promise<void>` — escribe
    `.layer-templates/<slug(name)>.json` con las dimensiones **stripeadas** de
    `assignments` (cada `assignments` → `{}`).
  - `deleteTemplate(api, slug): Promise<void>`.

### 3. UI del modal — `src/layers/layersModal.ts` (nuevo)

- Builder de DOM con callbacks (estilo de los otros módulos de UI), usando
  `.modal-overlay` ya existente. Datos de usuario via `textContent` (XSS-safe).
- Contenido:
  - **Barra de plantillas:** `[Aplicar ▾]` (select poblado con `listTemplates`) y
    `[Guardar como…]` (pide un nombre y llama `saveTemplate` con las dimensiones
    del diagrama actual).
  - **Lista de dimensiones:** cada una con su `label` editable (✎) y 🗑 borrar.
    Las de color expanden sus categorías: por categoría un `<input type="color">`
    (relleno), `label` editable y 🗑. Acciones "+ categoría".
  - Acciones globales: "+ capa de color", "+ anotación".
- Handlers (interfaz `LayersModalHandlers`): `onAddColorDim`, `onAddAnnotationDim`,
  `onRenameDim`, `onDeleteDim`, `onAddCategory`, `onUpdateCategory`,
  `onDeleteCategory`, `onApplyTemplate(slug)`, `onSaveTemplate(name)`. Cierre por
  ×/click afuera/Escape (como `help.ts`).

### 4. Panel — `src/layers/layersPanel.ts` (extender)

- Agregar el botón **"Gestionar capas…"** y un handler `onManage()` a
  `LayersPanelHandlers`. El resto del panel no cambia.

### 5. Wiring — `src/main.ts`

- `onManage()` abre el modal con la `LayerFile` actual y la lista de plantillas.
- Cada handler del modal: aplica la mutación pura → **persiste** el sidecar con
  el cliente de capas → re-renderiza el modal y el panel → **re-aplica colores**
  reusando el camino actual (el de re-aplicación tras import que ya existe).
- Si se borra la dimensión que era la capa de color activa, el estado activo
  vuelve a `null` ("Original").

### 6. Estilos — `src/app.css`

- Reusar `.modal-overlay`. Agregar clases del editor (`.lm-*`): filas de
  dimensión/categoría, swatch de color, barra de plantillas.

## Flujo de datos

```
Modal (callback) → mutación pura (layerModel) → LayerFile nuevo
   → layersClient.save(sidecar .layers.json)
   → re-render panel + modal
   → re-aplicar markers/CSS de color (camino existente)
```

Plantillas:
```
Guardar como… → strip assignments → layerTemplates.saveTemplate → .layer-templates/<slug>.json
Aplicar ▾    → loadTemplate → mergeTemplate(lf, dims) → persistir sidecar → re-aplicar
```

## Manejo de errores y bordes

- **Color-dim sin categorías:** evitado sembrando 1 categoría al crear.
- **Borrar categoría asignada:** cascada limpia `assignments`; el re-aplicado
  quita los markers huérfanos.
- **Borrar la dimensión activa:** capa activa vuelve a "Original".
- **IDs inmutables:** renombrar label nunca rompe asignaciones.
- **Carpeta `.layer-templates/` ausente:** `listTemplates` devuelve `[]`; al
  guardar se crea (la abstracción ya crea carpetas intermedias).
- **Colaboración:** sidecar y archivos de plantilla son *last-write-wins*; el
  archivo-por-plantilla minimiza choques (coherente con colores/locks actuales).
- **Escrituras en la nube:** reusa el `writeFile` tolerante a bloqueos ya
  existente (EPERM/EBUSY con reintentos).

## Testing (Vitest)

- `layerModel.test.ts` (extender): `slugId` colisiones; `deriveStroke`;
  add/rename/delete dimensión; add/update/delete categoría con **cascada** de
  asignaciones; `mergeTemplate` (agrega faltantes, no pisa existentes, conserva
  asignaciones); semilla de categoría al crear color-dim.
- `layerTemplates.test.ts` (nuevo, con `fakeDir`): save (strip assignments) →
  list → load → delete; carpeta ausente → `[]`; colisión de slug.
- `layersModal.test.ts` (nuevo): render de dimensiones/categorías; los controles
  disparan los handlers correctos; `textContent` (no `innerHTML`) para datos de
  usuario.

## Restricciones globales

- Datos de usuario siempre via `textContent`, nunca `innerHTML`.
- No bloquear la UI en escrituras de disco sincronizadas en la nube.
- Mantener visible la marca de agua "Powered by bpmn.io" (no afectada aquí).
- Funciones de mutación **puras** y testeadas antes del wiring.
