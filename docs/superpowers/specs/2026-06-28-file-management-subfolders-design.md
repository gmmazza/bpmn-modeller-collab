# Gestión de archivos + subcarpetas — Diseño

**Fecha:** 2026-06-28
**Estado:** Aprobado (diseño); pendiente de plan de implementación

## Objetivo

Permitir **gestionar** los diagramas dentro de la carpeta de trabajo —borrar,
duplicar, mover, copiar, renombrar— y soportar **subcarpetas** (navegarlas y
crearlas). Hoy la barra lateral lista solo los `.bpmn` de la raíz, de forma plana,
sin operaciones. "Configurar la carpeta de archivos" = **cambiar la carpeta raíz
de trabajo**, que ya existe (👤 → "Cambiar carpeta"); en esta iteración solo se
verifica/mantiene (ver Anexo).

## Decisiones aprobadas

- **Navegación:** árbol expandible en la barra lateral (estilo explorador), con
  carpetas que se expanden/colapsan, carpetas primero, chips de lock/✏️.
- **Disparador de operaciones:** botón `⋯` por fila (visible al pasar el mouse) y
  también clic derecho, que abre un menú: Abrir, Renombrar, Duplicar, Mover a…,
  Copiar a…, Borrar. "Mover a…/Copiar a…" abren un selector de carpeta destino.
- **Datos asociados = "paquete":** cada `.bpmn` viaja con su sidecar de capas
  (`<base>.layers.json`) y su historial (`.history/<ruta>/`):
  - **Mover/Renombrar:** lleva colores + historial juntos.
  - **Copiar/Duplicar:** lleva colores; el historial **arranca de cero** (archivo
    nuevo).
  - **Borrar:** borra también colores + historial.
  - El **bloqueo** (`.lock`) **nunca** se copia; al mover/borrar se libera.
- **Seguridad (colaborativo con locks):** si el archivo está tomado (check-out) por
  **otra** persona, la operación de mover/renombrar/borrar se **bloquea** con aviso.
  Si es tuyo o está libre, se permite. Borrar una carpeta: solo si **ningún** archivo
  adentro está tomado por otros. Si operás sobre el **archivo abierto**, se
  cierra/re-apunta automáticamente.

## Enfoque técnico

- **IDs = rutas relativas POSIX** desde la raíz (`Ventas/B2B.bpmn`), en lugar del
  nombre plano actual. Se agrega un **resolvedor de rutas** en `fsClient` que camina
  segmento a segmento (`getDirectoryHandle` por carpeta + `getFileHandle` la hoja).
  Funciona igual en web (File System Access) y en Electron (IPC), evitando depender
  de que el backend acepte `/` en un nombre.
- **Listado recursivo** del árbol (`fsClient.listTree()`), ignorando `.history`,
  archivos de conflicto de sync y sidecars (`.lock`, `.layers.json`). El watcher de
  7 s compara ese árbol. *Trade-off:* O(todo) por poll, pero trivial para decenas de
  procesos y mucho más simple que la carga perezosa. Si crece, se cambia a perezoso
  sin tocar la UI.
- **Mover/renombrar = `fs.rename` nativo en Electron** (atómico, instantáneo, no
  recopia el historial ni duplica el churn de Google Drive — clave por los bloqueos
  de Drive). En web cae a copiar+borrar. **Copiar/duplicar** copian contenido en
  ambos backends. Todas las escrituras aprovechan la escritura resiliente
  (reintentos + fallback) ya existente en `electron/main.cjs`.

## Arquitectura / componentes

```
src/fsClient.ts        # MODIFY: rutas relativas (resolvedor), listTree(), y
                       #   operaciones conscientes del paquete (abajo)
src/ipcFs.ts           # MODIFY: agrega rename(from,to) y copyFile(from,to) a FsApi
electron/main.cjs      # MODIFY: handlers IPC fsapi:rename y fsapi:copyFile
electron/preload.cjs   # MODIFY: expone rename/copyFile
src/fileTree.ts        # NEW: modelo de árbol (rutas → árbol anidado) + render
src/fileTree.test.ts   # NEW
src/contextMenu.ts     # NEW: menú ⋯/clic-derecho reutilizable (estilo .menu-pop)
src/contextMenu.test.ts# NEW
src/folderPicker.ts    # NEW: modal "elegir carpeta destino" (árbol solo-carpetas)
src/folderPicker.test.ts # NEW
src/watcher.ts         # MODIFY: diff de árbol (alta/baja/cambio de versión/estructura)
src/watcher.test.ts    # MODIFY
src/main.ts            # MODIFY: usar fileTree en #files; cablear operaciones, crear
                       #   archivo/carpeta contextual, regla de seguridad, header
                       #   📁 carpeta clickeable para cambiar raíz
src/app.css            # MODIFY: estilos de árbol, fila con ⋯, menú, modal picker
```

### `fsClient` (API nueva/cambiada)

Operaciones de alto nivel, conscientes del paquete (orquestan `.bpmn` + sidecar +
historial + lock):

- `listTree(): Promise<TreeEntry[]>` — entradas con `{ path, kind: "file"|"dir",
  ...metadata }`, recursivo, excluyendo `.history`, conflictos y sidecars.
- `createFolder(parentPath, name)` — `mkdir`.
- `renameFile(id, newName)` — renombra dentro de la misma carpeta (bpmn + sidecar +
  dir de historial).
- `moveFile(id, destFolder)` — mueve bpmn + sidecar + historial; libera el lock.
- `copyFile(id, destFolder, newName?)` — copia bpmn + sidecar (sin historial, sin
  lock).
- `duplicateFile(id)` — copia en la misma carpeta con sufijo " copia" (colores sí,
  historial no, lock no), resolviendo colisiones de nombre.
- `deleteFile(id)` — borra bpmn + sidecar + `.history/<ruta>/` + lock.
- `moveFolder(path, destParent)` / `copyFolder(path, destParent)` /
  `deleteFolder(path)` — recursivos; `deleteFolder` aplica la regla de seguridad.

Notas de implementación:
- `baseName(id)` ahora preserva la ruta (`Ventas/B2B`). El historial se anida:
  `.history/Ventas/B2B/` (el resolvedor crea los directorios intermedios). Mover un
  archivo reubica también su dir de historial.
- Mover/renombrar usan `rename` nativo si el handle lo expone (Electron); si no,
  copiar+borrar genérico (web).

### `fileTree.ts`

- `buildTree(entries: TreeEntry[]): TreeNode` — arma el árbol anidado a partir de
  las rutas planas; ordena carpetas primero, luego archivos, alfabético.
- `renderFileTree(el, tree, { expanded, selectedId, me }, handlers)` — render con
  expandir/colapsar (estado de expansión persistido en memoria por sesión), chips de
  lock/✏️, botón `⋯` por fila, y botones `+ archivo` / `+ carpeta` por carpeta.
  `handlers`: `onOpen, onMenu(id, kind, anchorRect), onToggleExpand, onNewFile(parent),
  onNewFolder(parent)`.

### `contextMenu.ts`

- `openContextMenu(anchorRect, items: {label, danger?, onClick}[])` — popup
  posicionado junto al ancla, cierra al click afuera/Escape; estilo `.menu-pop`.

### `folderPicker.ts`

- `pickFolder(tree, { title, disabledPath? }): Promise<string|null>` — modal con el
  árbol de **solo carpetas** (incluida la raíz) para elegir destino de Mover/Copiar;
  deshabilita la carpeta origen y sus descendientes para Mover.

### `main.ts` (cableado)

- `refreshFileList()` → `refreshTree()`: `await api.listTree()`, filtra conflictos,
  `renderFileTree(...)`.
- Handlers de operaciones que aplican la **regla de seguridad** (consultando el lock
  vía la metadata del árbol) antes de actuar; confirmación para borrar; al operar
  sobre el archivo abierto, `dispatch closedFile` / re-apuntar.
- `newDiagram` y `+ archivo`/`+ carpeta` crean en la **carpeta de contexto** (la del
  botón) — raíz si es a nivel raíz.
- Header `📁 carpeta` clickeable → `showFolderGate()` (atajo a "Cambiar carpeta"),
  con `title` = ruta real (vía `api`/IPC `getRoot`).

### Watcher

- `pollChanges` usa `listTree()`. Clasifica por ruta+versión: el archivo abierto con
  versión distinta → recarga/conflicto (lógica actual); altas/bajas o cambios de
  estructura → `refreshTree()`. Se mantiene `lastWrites` por ruta.

## Casos borde / errores

- **Validación de nombres:** no vacíos, sin `/` `\` ni caracteres inválidos; agrega
  `.bpmn` si falta; colisión → sufijo " copia"/" (2)".
- **Operación sobre archivo abierto:** mover/renombrar/borrar el abierto → cerrarlo
  (o re-apuntar a la nueva ruta en mover/renombrar si es nuestro) para no dejar el
  editor en un id inexistente.
- **Lock de otros:** bloquear con toast claro; carpeta con algún archivo tomado por
  otros → no se borra/mueve, se informa cuál.
- **Drive locks:** las escrituras ya reintentan; `rename` nativo evita el problema en
  mover. Si una operación falla, se informa y no se deja estado a medias (orden:
  copiar destino → verificar → borrar origen).
- **`.history`/sidecars/conflictos** nunca aparecen como entradas del árbol.
- **Web vs Electron:** mismo `fsClient`; `rename`/`copyFile` nativos solo si el
  handle los expone, con fallback genérico.

## Fuera de alcance (YAGNI)

- Arrastrar y soltar (se eligió `⋯`/menú + selector).
- Carga perezosa por carpeta (listado recursivo por ahora).
- Recordar última subcarpeta / carpeta predeterminada para nuevos (el usuario los
  descartó).
- Multi-selección de archivos para operaciones en lote.
- Papelera/undo de borrado (borrado directo con confirmación).

## Testing

- `fsClient`: cada operación (crear carpeta, renombrar, mover, copiar, duplicar,
  borrar, ops de carpeta) y el **comportamiento de paquete** (qué arrastra cada una:
  sidecar sí/no, historial sí/no, lock liberado) usando el fake dir handle; rutas
  anidadas; resolvedor de rutas.
- `fileTree`: `buildTree` (anidado, orden carpetas-primero, exclusiones).
- `contextMenu`: render de ítems + disparo de handlers (happy-dom).
- `folderPicker`: arma el árbol solo-carpetas, deshabilita origen, devuelve destino.
- `watcher`: diff de árbol (alta/baja/cambio de versión/estructura).
- **Verificación E2E** contra el `.exe` real (vía CDP) de un flujo: crear subcarpeta
  → mover un proceso adentro (con sus colores) → duplicar → borrar.
- **Gates:** `npm test` (todo verde), `npm run typecheck`, `npm run build`.

## Empaquetado

No cambia el modelo de sync/lock/historial; al terminar se regenera el `.exe`
(empaquetado limpio: `release/` y `node_modules` excluidos del asar).

## Anexo — "Cambiar carpeta" (verificado 2026-06-28)

La lógica de cambio de carpeta raíz funciona end-to-end (verificado en el `.exe`
real vía CDP, incluso con un archivo abierto). El defecto real era que el diálogo
nativo se abría sin ventana padre (podía quedar detrás de la app en Windows); se
corrigió adjuntándolo a su ventana padre (commit `aba4807`). Esta iteración solo
mantiene esa funcionalidad y agrega el atajo desde el chip 📁 del header.
