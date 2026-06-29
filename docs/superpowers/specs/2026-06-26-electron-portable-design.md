# BPMN compartida — App de escritorio portable (Electron, Windows) — Diseño

**Fecha:** 2026-06-26
**Estado:** Aprobado (pendiente plan de implementación)

## Objetivo

Empaquetar la SPA actual (modo carpeta local sincronizada) como una **app de
escritorio Electron portable para Windows**: un único `.exe` que se abre con
doble-click, **sin instalación, sin Node/npm, sin servidor local y sin
navegador**. El acceso a la carpeta es **nativo** (sin pop-ups de permiso; la
ruta se recuerda). La sincronización entre PCs la sigue haciendo cualquier
herramienta externa (Google Drive para Escritorio, OneDrive, Dropbox,
Syncthing): la app solo lee/escribe archivos locales.

## Principio rector

`fsClient` ya está escrito contra una interfaz mínima de "directorio" (el mismo
subconjunto de `FileSystemDirectoryHandle` que el fake `src/testHelpers/fakeDir.ts`
implementa). Por lo tanto Electron NO reescribe la lógica: aporta **otra
implementación de ese directorio** sobre el sistema de archivos nativo. Todo el
dominio (editor, locks `.lock`, historial `.history/`, retención por decaimiento,
`version = mtime`, watcher, diff, identidad por nombre) queda intacto.

## Arquitectura

```
┌─ Electron (un .exe portable, doble-click) ─────────────┐
│  Renderer = la SPA actual (Vite build)                 │
│      │  window.fsapi  (contextBridge, preload)         │
│  ────┼───────────────────────────────────────────────  │
│  Main process: diálogo de carpeta + ops de archivo     │
│      │  Node fs/promises (nativo), con guardia de ruta │
└──────┼─────────────────────────────────────────────────┘
       ▼
  Carpeta local elegida ◄─ sincroniza ─► Drive/OneDrive/… ◄─► otros PCs
```

- Patrón seguro de Electron: `contextIsolation: true`, `nodeIntegration: false`,
  un `preload` que expone una API acotada por `contextBridge`. El renderer nunca
  toca Node directamente.
- El proceso main valida que **toda ruta quede dentro de la carpeta elegida**
  (guardia anti-path-traversal).

## Componentes

### Nuevos

- **`electron/main.cjs`** — crea la `BrowserWindow` cargando el `dist/` empaquetado;
  registra los handlers IPC: `fsapi:chooseFolder` (diálogo nativo) y las ops de
  archivo (`listDir`, `readFile`, `writeFile`, `removeEntry`, `stat`, `mkdir`).
  Cada op recibe `(root, rel)` y resuelve contra `root` rechazando si escapa.
- **`electron/preload.cjs`** — `contextBridge.exposeInMainWorld("fsapi", {...})`
  con: `chooseFolder(): Promise<string|null>`, `listDir(root, rel)`,
  `readFile(root, rel)`, `writeFile(root, rel, data)`, `removeEntry(root, rel)`,
  `stat(root, rel)`, `mkdir(root, rel)`.
- **`electron/pathGuard.cjs`** — `resolveWithinRoot(root, rel): string` puro;
  normaliza y lanza si el resultado sale de `root`. Unit-testeable.
- **`src/ipcFs.ts`** — `makeIpcDir(root: string, fsapi: FsApi): FileSystemDirectoryHandle`
  (estructural): construye un objeto compatible con el subconjunto que `fsClient`
  usa, delegando en `fsapi`. `getFile()` devuelve `{ name, lastModified: stat.mtimeMs,
  size, text() }`; `createWritable()` acumula y al `close()` hace `writeFile` y
  relee mtime. Define la interfaz `FsApi` (forma de `window.fsapi`).
- **`src/folder.ts`** — selector de proveedor por *feature detection*:
  - Si `window.fsapi` existe (Electron): `pickDir()` → `chooseFolder()` (el **proceso
    main** fija y persiste la carpeta autorizada) → devuelve `makeIpcDir(path,
    window.fsapi)`; `loadSavedDir()` → `getRoot()` (la carpeta la **posee el main**,
    no el renderer ni `localStorage`), verifica con `stat(root, "")` que exista, y
    devuelve el dir (o null).
  - Si no (navegador): delega en el `folderAccess.ts` existente (File System Access
    API). Expone la misma interfaz `{ loadSavedDir(), pickDir() }` (cada una
    devuelve un dir-handle usable o null; sin `ensurePermission` separado —
    el proveedor web lo resuelve internamente y devuelve null si no se concede).

### Modificados

- **`src/main.ts`** — la entrada usa `folder.ts` en vez de `folderAccess`
  directamente. Flujo: `loadSavedDir()` → si hay, `createFsClient(dir)` + nombre +
  app; si no, pantalla "Elegir carpeta" → `pickDir()`. Se elimina el uso directo de
  `ensurePermission` (lo absorbe el proveedor). El resto de `main.ts` no cambia.
- **`vite.config.ts`** — `base: "./"` para que el `index.html` referencie assets con
  rutas relativas (necesario al cargar desde `file://` dentro del `.exe`).
- **`package.json`** — devDeps `electron`, `electron-builder`; scripts
  `electron:dev`, `dist:win`; bloque `build` de electron-builder con
  `win.target: "portable"`, `files` incluyendo `dist/` y `electron/`, `main`
  apuntando a `electron/main.cjs`.

### Sin cambios

`editor`, `ui`, `state`, `watcher`, `lockManager`, `history`, `bpmnDiff`,
`diffView`, `syncConflict`, `identity`, `fsClient`, `types`, `folderAccess`
(se conserva como proveedor web).

## Flujo de inicio (Electron)

1. Al abrir, `folder.ts.loadSavedDir()` lee la ruta de `localStorage` y la valida
   con `stat`. Si existe → `createFsClient(makeIpcDir(path))` → si hay nombre,
   arranca; si no, lo pide.
2. Si no hay ruta válida → pantalla "Elegir carpeta" → diálogo nativo de Windows →
   guarda la ruta → nombre → app.
3. Cero pop-ups de permiso (a diferencia de la versión web).

El resto del flujo (lista, abrir/lock, guardar, conflicto + diff con tecla `d`,
historial, robar lock, detección de cambios externos) es idéntico al actual.

## Modelo de datos en disco

Igual que la versión web: `proceso.bpmn`, `proceso.bpmn.lock`,
`.history/<base>/<rid>~<autor>[.keep].bpmn`. `version = headRevisionId =
String(mtimeMs)`. La sincronización la hace una herramienta externa.

## Manejo de errores y casos borde

- **Carpeta guardada ya no existe** (movida/desmontada): `stat` falla →
  `loadSavedDir` devuelve null → pantalla "Elegir carpeta".
- **Path traversal**: `resolveWithinRoot` rechaza cualquier `rel` que escape de
  `root`; el main nunca opera fuera de la carpeta elegida.
- **Diálogo cancelado**: `chooseFolder()` devuelve null → se queda en la pantalla
  de selección.
- **Archivos en conflicto de sync** (`proceso (1).bpmn`, etc.): igual que hoy,
  `isSyncConflict` + `renderSyncWarning`.
- **Latencia de sync / locks best-effort**: igual que hoy.

## Empaquetado y distribución

- `npm run build` (Vite) → `dist/` con `base: "./"`.
- `npm run dist:win` (electron-builder, target `portable`) → un único `.exe`
  portable (sin instalador) en `release/` (o el `directories.output` configurado).
- Distribución: copiar el `.exe`. Sin firma de código (Windows SmartScreen puede
  advertir la primera vez; el usuario elige "Ejecutar de todos modos"). Firmar
  queda fuera de alcance.

## Testing

- **Unitario (Vitest)**:
  - `electron/pathGuard.cjs` (`resolveWithinRoot`): acepta rutas internas, rechaza
    `..`/absolutas que escapan.
  - `src/ipcFs.ts`: contra un **fake `FsApi` en memoria**, probar que
    `createFsClient(makeIpcDir(root, fakeApi))` cumple las conductas clave
    (list/getXml/putXml/lock/historia) — es decir, que el adaptador es un backend
    válido de `fsClient`.
  - La lógica reusada conserva sus 59 tests.
- **Gates**: `npm test`, `npm run typecheck`, `npm run build` en verde.
- **Manual (no automatizable aquí)**: generar el `.exe`, doble-click, elegir
  carpeta, crear/editar/guardar y verificar que los archivos aparecen en la
  carpeta; abrir dos instancias sobre la misma carpeta para ejercitar
  lock/cambio externo/diff.
- **Caveat:** el `.exe` con GUI no se puede ejecutar en el entorno de desarrollo
  del agente (sin display). Se entrega compilando + tests verdes + (si el toolchain
  lo permite) el `.exe` generado; la verificación del doble-click la hace el
  usuario, con el paso documentado en el README.

## Seguridad

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox` por defecto del
  preload; sólo se expone la API mínima `window.fsapi`.
- La app no carga contenido remoto (todo el renderer es local empaquetado).
- **La carpeta autorizada la posee el proceso main** (se fija sólo vía el diálogo
  nativo, se persiste en `userData/folder.json`). Los handlers IGNORAN el `root` que
  manda el renderer y operan siempre contra la carpeta autorizada — así un renderer
  comprometido (p. ej. vía un `.bpmn` malicioso que logre ejecución de script) no
  puede leer/escribir rutas arbitrarias.
- Toda op de archivo pasa por dos guardias: el **léxico** (`resolveWithinRoot`, sin
  `..`/absolutos) y uno de **realpath** sobre el ancestro existente más profundo, que
  impide escapar vía symlinks dentro de la carpeta sincronizada (p. ej. con Syncthing).

## Fuera de alcance (YAGNI)

- macOS / Linux (solo Windows por ahora).
- Instalador (NSIS), auto-update, firma de código.
- Cambiar el modelo de sincronización (sigue siendo carpeta + herramienta externa).
- Eliminar el proveedor web: se conserva para poder `npm run dev` en navegador.
