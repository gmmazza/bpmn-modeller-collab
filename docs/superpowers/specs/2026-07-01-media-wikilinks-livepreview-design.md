# Plan 2 — Editor con live preview (CodeMirror 6), media y wikilinks — Diseño

- **Fecha:** 2026-07-01
- **Estado:** Aprobado (brainstorming) → pendiente plan de implementación
- **Rama:** se apila sobre `feat/knowledge-procesos-fundacion` (Plan 1 ya implementado)
- **Spec madre:** [2026-06-30-knowledge-procesos-design.md](2026-06-30-knowledge-procesos-design.md) (sección E)

## Objetivo

Reemplazar el editor de notas (hoy un `textarea`) por un **editor inline tipo
Obsidian "Live Preview"**: mientras escribís, el markdown se renderiza **en el
mismo lugar** (el markup se oculta salvo en la línea del cursor; imágenes y video
se ven como widgets inline). Sumar **pegar/soltar imágenes** (a `assets/`) y
**wikilinks `[[…]]`** con autocompletado y navegación a procesos, elementos BPMN
e ideas.

## Alcance

**Incluye** (primera pasada): encabezados, negrita/itálica, código inline,
bloque de código, citas, listas (viñeta / numerada / tareas `- [ ]`), enlaces
markdown y **wikilinks**, **widgets de imagen y video** inline; "revelar markup
en la línea del cursor". Pegar/soltar imágenes a `assets/`. Autocompletado y
navegación de wikilinks.

**Fuera** (se puede sumar luego): tablas, callouts, footnotes, math. El **modo
lectura** y el **manual** siguen usando el render `markdown-it` del Plan 1 (sin
cambios). No es idéntico a Obsidian al byte — es *Obsidian-like*.

## Principios

1. **Dos caminos de render, como Obsidian.** CM6 inline para *editar* (este
   plan); `markdown-it` seguro del Plan 1 para *leer*/exportar. No se mezclan.
2. **Lógica de decoración pura y testeable.** El cálculo de qué ocultar/estilizar
   se hace sobre el **árbol Lezer** de `@lezer/markdown` en funciones puras,
   separado de la vista CM6 (que solo aplica decoraciones y maneja el cursor).
3. **Reuso del Plan 1.** `docsClient`, `notePanelController`, el `_index.md`
   (fuente del autocompletado de wikilinks), y la whitelist de hosts de video de
   `markdownRender`.
4. **Seguridad.** Los widgets de imagen/video se construyen con `src` validado
   (host en whitelist para video; ruta `assets/...` para imagen); nunca se inyecta
   HTML del usuario sin sanear.

## A — Editor CodeMirror 6 (`cmEditor.ts`)

- Envuelve un `EditorView` de CM6. Reemplaza el `textarea` en el **modo Editar**
  del panel (sección E).
- Extensiones base: `@codemirror/lang-markdown` (parser Lezer), historial/undo,
  keymap por defecto, line wrapping, tema que hereda colores de la app
  (claro/oscuro vía variables CSS).
- API mínima (para el controlador):
  ```ts
  createMarkdownEditor(parent: HTMLElement, opts: {
    doc: string;
    onChange: (doc: string) => void;
    deps: EditorDeps;          // para wikilinks/media (ver C y D)
  }): { getDoc(): string; setDoc(s: string): void; focus(): void; destroy(): void }
  ```
- El controlador conecta `onChange` → su `onBodyInput`/estado `body`, y guarda
  igual que hoy (frontmatter + `writeNote` + regen índice).

## B — Live preview por decoraciones (`livePreview.ts`)

Dos piezas:

1. **`computeDecorations(tree, doc, cursorLines): DecoSpec[]` (pura, testeable).**
   Recorre el árbol Lezer de markdown y devuelve specs:
   - **Hide**: rangos de markup a ocultar (`#`/`##`, `**`, `*`, `` ` ``, `>`,
     `- `, `[`, `]`, `(`, `)`, `[[`, `]]`, `![`) — **excepto** si caen en una
     línea presente en `cursorLines` (revelar para editar).
   - **Mark**: rangos a estilizar (heading h1..h6, strong, em, inline-code,
     blockquote, list-item, link-text, wikilink).
   - **Widget**: posición/rango donde va un widget de bloque (imagen, video).
   El tipo `DecoSpec = { kind: "hide"|"mark"|"widget"; from: number; to: number; data?: ... }`.

2. **`livePreviewExtension(deps)` (ViewPlugin CM6).** Toma `computeDecorations`,
   mapea cada spec a `Decoration.replace`/`Decoration.mark`/`Decoration.widget`,
   recalcula en `update` cuando cambia el doc o la selección (para revelar la
   línea activa). Widgets de imagen/video: construyen un `<img src="assets/…">` o
   `<iframe>` (host whitelisted, igual que `markdownRender`).

**Comportamiento clave (Obsidian-like):** el markup se ve solo en la línea donde
está el cursor/selección; el resto se muestra renderizado. Clic en una línea la
"abre" para editar.

## C — Pegar/soltar imágenes (`mediaPaste.ts` + storage binario)

- Handler de `paste`/`drop` en CM6: si hay imagen, la escribe en
  `<diagrama>.docs/assets/<nombre-único>.png` y inserta `![](assets/<nombre>.png)`
  en el doc.
- **Extensión de storage (binaria).** Hoy `fsClient` escribe texto. Se agrega:
  - `fsClient.writeBinary(rel: string, data: Uint8Array): Promise<void>` y
    `readBinary(rel): Promise<Uint8Array|null>`.
  - Backend **web**: `writable.write(blob)` (FS Access soporta binario directo).
  - Backend **Electron**: IPC nuevo que pasa los bytes (base64) → el main escribe
    `Buffer`. Se extiende `electron/main.cjs` + `preload` + `ipcFs.ts`.
  - `docsClient.writeAsset(diagramId, name, bytes)` / `assetPath` (reusa
    `assetsDir` del Plan 1).
- Nombre único: `imagen-<n>.png` evitando colisiones (chequea `listDir(assets)`).

## D — Wikilinks (`wikilinksCm.ts`)

- **Autocompletado** (`@codemirror/autocomplete`): al tipear `[[`, ofrece:
  - procesos (otros `.bpmn` de la carpeta, vía `listTree`/`fileTree`),
  - elementos del diagrama actual (de `listDocumentableElements` / `_index`),
  - ideas (`_ideas.md` — disponible recién con el Plan 3; si no existe, se omite).
- **Render inline:** `[[destino]]` se muestra como link estilizado (clase
  `cm-wikilink`), con el `[[`/`]]` ocultos salvo en la línea del cursor.
- **Navegación (clic):** un parser de destino (nuevo en este plan, función pura
  `parseWikilinkTarget(raw)`) distingue proceso / `proceso#elementId` /
  `Nombre de elemento` / `idea:` y resuelve:
  - proceso → abre ese `.bpmn` (usa `openFile`),
  - elemento → selecciona/resalta el elemento en el canvas,
  - idea → abre la pestaña Ideas (Plan 3; no-op si aún no existe).

## E — Integración con el panel (Plan 1)

- `notePanel` modo **Editar**: en vez de `<textarea>`, monta el editor CM6 (vía
  el controlador, que crea/destruye el `EditorView` al entrar/salir de edición).
- El **switch Editar/Leer** se mantiene; **Leer** usa `renderMarkdown` (Plan 1).
- El controlador pasa `EditorDeps` (diagramId, listas para autocompletar,
  `docsClient` para media, callbacks de navegación).
- Guardado: igual que Plan 1 (frontmatter + `writeNote` + regen `_index`).

## Módulos / archivos

Nuevos en `src/processDocs/`:

| Archivo | Responsabilidad |
|---|---|
| `cmEditor.ts` | Envuelve `EditorView` CM6; API create/get/set/destroy; tema. |
| `livePreview.ts` | `computeDecorations` (pura) + `livePreviewExtension` (ViewPlugin). |
| `mdWidgets.ts` | Widgets CM6 de imagen y video (construcción segura del DOM). |
| `mediaPaste.ts` | Handler paste/drop → `writeAsset` + inserción del `![]()`. |
| `wikilinksCm.ts` | Fuente de autocompletado + decoración + navegación de `[[…]]`. |

Modificados:
- `fsClient.ts` (+`writeBinary`/`readBinary`), `ipcFs.ts`, `electron/main.cjs`,
  `electron/preload` (IPC binario).
- `docsClient.ts` (+`writeAsset`/`listAssets`).
- `notePanelController.ts` / `notePanel.ts` (montar CM6 en modo edición).
- `package.json` (deps CM6).

## Flujo de datos

1. Editar nota → controlador crea `EditorView` (CM6) con el body actual.
2. Tecleo → `lang-markdown` parsea (Lezer) → `computeDecorations` → la vista
   oculta markup / estiliza / inserta widgets; `onChange` actualiza `body`.
3. Pegar imagen → `mediaPaste` escribe en `assets/` (binario) → inserta `![]()`
   → el widget la muestra inline.
4. `[[` → autocompletar desde índice/árbol; clic en wikilink → navegar.
5. Guardar → `serializeFrontmatter` + `writeNote` + regen `_index` (Plan 1).

## Estrategia de testing (Vitest, happy-dom)

- **`computeDecorations`**: parsea texto con el parser markdown de Lezer y afirma
  los specs (hide/mark/widget) para casos: heading, bold, link, wikilink, imagen,
  línea con cursor (markup revelado) vs sin cursor (oculto). **Pura, sin vista.**
- **`wikilinksCm` (resolución/targets)** y reuso del parser del Plan 1.
- **storage binario**: `writeBinary`/`readBinary` round-trip contra `fakeDir`
  (extender el fake para binario) + `docsClient.writeAsset`.
- **`mediaPaste`**: dado un `ClipboardEvent`/`File` falso, escribe el asset y
  produce el texto `![](assets/…)` (lógica pura de inserción).
- **Vista CM6 / paste real / navegación**: CM6 mide layout y happy-dom no lo
  emula del todo → cobertura **liviana** + **verificación manual** en el `.exe`
  (igual que la integración de `main.ts` del Plan 1).

## Dependencias nuevas

`codemirror` (meta) o los paquetes `@codemirror/state`, `@codemirror/view`,
`@codemirror/commands`, `@codemirror/language`, `@codemirror/lang-markdown`,
`@codemirror/autocomplete`, y `@lezer/markdown` (árbol para las decoraciones
puras).

## Fuera de alcance / futuro

- Tablas, callouts, footnotes, math en el live preview.
- Render inline de embeds de procesos (transclusión tipo `![[proceso]]`).
- Ideas como destino de wikilink quedan operativas recién con el Plan 3.
