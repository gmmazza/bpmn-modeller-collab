# BPMN compartida — Modo carpeta local sincronizada (sin hosting) — Diseño

**Fecha:** 2026-06-26
**Estado:** Aprobado (pendiente plan de implementación)

## Objetivo

Correr la app **sin backend hosteado**, como una SPA estática autocontenida que cada
usuario abre en su navegador (Chrome/Edge) en `localhost`. La app edita archivos
`.bpmn` dentro de **una carpeta local** elegida por el usuario; la sincronización
entre ordenadores la hace **cualquier herramienta externa** (Google Drive para
Escritorio, OneDrive, Dropbox, Syncthing…). La app es **agnóstica al sincronizador**:
solo lee y escribe archivos locales.

Esto reemplaza el modelo "team-mode" actual (Netlify Functions + cuenta de servicio
de Google + API de Drive), que exige hosting.

## Principio rector

`apiClient` es hoy la **única** capa de I/O: `main.ts`, `watcher`, `lockManager`,
`history`, `ui`, `state`, `editor` están desacoplados de *cómo* llegan los bytes. El
cambio central es reemplazar `apiClient` (que habla con `/api/*`) por un **`fsClient`
con la misma forma** (que lee/escribe archivos), y borrar todo lo que ya no aplica
(backend, OAuth/JWT, gate de password).

## Arquitectura

```
┌─ Chrome/Edge (localhost) ─────────────────┐
│  SPA: editor bpmn-js + ui + state          │
│        │                                    │
│   fsClient  (nuevo, misma forma que apiClient)
│        │  File System Access API            │
└────────┼───────────────────────────────────┘
         ▼
   Carpeta local  ◄──sincroniza──►  Drive/OneDrive/Syncthing  ◄──► otros PCs
   proceso.bpmn
   proceso.bpmn.lock              (locks advisory)
   .history/proceso/<ts>.bpmn     (historial in-app)
```

- SPA estática servida en `localhost` (contexto seguro requerido por la File System
  Access API; `localhost` califica).
- El usuario elige **una carpeta** una vez; el `FileSystemDirectoryHandle` se persiste
  en **IndexedDB** y se re-pide permiso al volver (1 click).
- Sin variables de entorno, sin claves, sin cuenta de servicio, sin login.

## Módulos: reutilizar / cambiar / borrar

| Módulo | Acción |
|---|---|
| `editor`, `ui`, `state`, `history` (math de retención) | **Intacto** |
| `watcher.ts` (`classifyChange`, `isOwnWrite`) | **Intacto** — cambia solo el *loop* que lo alimenta |
| `lockManager.ts` | **Casi intacto** — `readLock` lee de `appProperties`; el `fsClient` arma un `DriveFile` sintético poniendo el `.lock` en `appProperties` |
| `identity.ts` | **Intacto** (nombre para mostrar, sin password) |
| `apiClient.ts` → **`fsClient.ts`** | **Reemplazo** — misma interfaz, sobre archivos |
| **`folderAccess.ts`** | **Nuevo** — picker de carpeta + persistencia del handle en IndexedDB + re-permiso |
| **`fsWatcher.ts`** | **Nuevo** — loop de polling del directorio (mtime) que emite `ChangeRecord` |
| **`bpmnDiff.ts`** (+ overlay/fast-switch en `ui`) | **Nuevo** — `bpmn-js-differ` + marcadores + toggle |
| `gate.ts`, `apiClient.ts`, `driveClient.ts`, `netlify/` | **Borrar** |
| `config.ts` | Simplificar (sin secretos Google) |
| `package.json` | Quitar `googleapis`, `jsonwebtoken`, `@netlify/functions`, `@types/jsonwebtoken`; agregar `bpmn-js-differ` |

## `fsClient` — interfaz (idéntica a `apiClient`)

Construido con el `FileSystemDirectoryHandle` elegido. Métodos:

- `listFiles(): Promise<DriveFile[]>` — lista `*.bpmn` de la raíz de la carpeta; por
  cada uno lee su `.lock` adyacente (si existe) y lo carga en `appProperties`.
- `getMeta(id): Promise<DriveFile>` — metadata de un archivo (mtime → `version`,
  lock → `appProperties`). `id` = nombre de archivo (la app ya trata `id` como opaco).
- `getXml(id): Promise<string>` — contenido del `.bpmn`.
- `putXml(id, xml, editorName): Promise<{ version, headRevisionId }>` — escribe el
  `.bpmn` (atómico vía `createWritable`), copia la versión a `.history/<nombre>/<ts>.bpmn`,
  corre la poda, re-lee el mtime resultante, lo registra en `lastWrites` y lo devuelve
  como `version`. `headRevisionId` = el `<ts>` del historial recién creado (o `null`).
- `createFile(name, xml): Promise<DriveFile>` — crea un `.bpmn` nuevo (asegura sufijo
  `.bpmn`).
- `setLock(id, props): Promise<void>` — props no vacíos ⇒ escribe `<id>.lock` (JSON
  `{ lockedBy, lockedByEmail, lockedByName, lockedAt }`); props vacíos (`clearProps`)
  ⇒ borra el `.lock`.
- `listRevisions(id): Promise<Revision[]>` — lista `.history/<nombre>/`; mapea mtime y
  tamaño; `keepForever` = el archivo lleva sufijo `.keep`.
- `getRevisionXml(id, rid): Promise<string>` — lee `.history/<nombre>/<rid>.bpmn`.
- `setKeepForever(id, rid, keep): Promise<void>` — renombra el archivo de historial
  para añadir/quitar el sufijo `.keep`.
- `lastWrites: Map<string,string>`, `lastWriteVersion(id)`.

## Modelo en disco y "version" sin Drive

- **`version` = `String(file.lastModified)`** (ms epoch del handle). `watcher` compara
  strings, así que `classifyChange`/`isOwnWrite` no cambian.
- **Suprimir la propia escritura**: tras `putXml`, re-leer el handle para el mtime
  resultante y guardarlo en `lastWrites` → el polling lo verá y `isOwnWrite` ⇒ `ignore`.
- **Escritura atómica**: `createWritable()` (escribe a swap y renombra al `close()`)
  reduce que el sincronizador suba archivos a medio escribir.

**Layout en la carpeta elegida:**
```
proceso.bpmn
proceso.bpmn.lock                 (existe solo si está tomado)
.history/
  proceso/
    2026-06-26T14-03-12Z.bpmn
    2026-06-26T15-20-49Z.keep.bpmn  (keepForever = sufijo .keep)
```

- **Locks**: advisory, igual que hoy. El `.lock` también se sincroniza, así otros ven
  "lo edita Ana" y pueden robarlo. `lockManager` reutilizado sin cambios.
- **Historial**: `putXml` copia la versión saliente; `listRevisions` lista la
  subcarpeta; poda por decaimiento exponencial (ya en `history.ts`); `.keep` exime de
  la poda.

## Flujo de uso

1. Abrir la app (localhost). Sin carpeta elegida ⇒ CTA **"Elegir carpeta"**. Con handle
   en IndexedDB ⇒ re-pedir permiso (1 click).
2. Teclear el **nombre** una vez (`identity.ts`).
3. **Lista** de `.bpmn` con estado de lock (libre / tuyo / "lo edita Ana").
4. **Abrir** ⇒ check-out (escribe `.lock`) ⇒ editar ⇒ **guardar** (`putXml`: escribe
   `.bpmn`, copia a `.history`, poda) ⇒ check-in (borra `.lock`). Robar lock disponible.
5. **fsWatcher** hace polling cada **3–5 s**: archivo abierto cambiado por fuera ⇒
   `reload-open` (limpio) o **barra de conflicto** (con cambios locales) que da acceso
   al **diff visual**. Otros archivos cambiados ⇒ refresca la lista.

## Diff visual (overlay + fast-switch)

Cuando llega una versión externa del archivo abierto:

- **`bpmnDiff.ts`** envuelve `bpmn-js-differ`: compara tu XML vs el externo y devuelve
  por element-id `{ added, removed, changed, layoutChanged }`.
- **Overlay**: marcadores de color sobre el canvas — 🟢 agregado / 🔴 eliminado /
  🟡 modificado o movido — más un panel con la lista de cambios (clic ⇒ centra el
  elemento).
- **Fast-switch**: toggle (botón + atajo de teclado) que alterna el canvas entre **tu
  versión** y **la externa**, re-renderizando, para captar el cambio "parpadeando".
- Enganche en la barra de conflicto: *Recargar* / *Descartar* / **Ver diferencias**
  (abre overlay + habilita el switch).

## Manejo de errores y casos borde

- **Permiso revocado / handle perdido** (`NotAllowedError`): re-pedir carpeta sin perder
  estado.
- **Archivos "en conflicto" del sincronizador** (`proceso (1).bpmn`, patrón de OneDrive,
  etc.): el `fsWatcher` los detecta y los muestra en la lista marcados como
  "⚠ conflicto de sync"; se resuelven a mano (no hay auto-merge).
- **Lock huérfano**: `isStale` (2 h) habilita "robar" como hoy.
- **Carpeta sin permiso al iniciar**: estado vacío con CTA, sin pantallas en blanco.
- **Latencia de sync**: la UI deja claro que el lock es *best-effort* (la sincronización
  no es instantánea ni atómica).

## Testing

- **Unitario (Vitest)**:
  - `fsClient` contra un **fake en memoria** de `FileSystemDirectoryHandle` /
    `FileSystemFileHandle` (las pruebas de `apiClient` traducidas a archivos).
  - `bpmnDiff` con dos XML fixtures (agregado/eliminado/movido).
  - `folderAccess` / `fsWatcher` con fakes de handle e IndexedDB (happy-dom).
  - La lógica pura reutilizada (`watcher`, `lockManager`, `history`, `state`) conserva
    sus tests.
- **Manual (checklist)**: dos navegadores apuntando a la misma carpeta sincronizada
  (o dos carpetas con Syncthing) ⇒ editar / lock / conflicto / diff / historial.
- **Gates**: `npm test`, `npm run typecheck`, `npm run build` en verde.

## Cómo correr (autocontenido)

- `npm run build` ⇒ `dist/` estático.
- `npm run preview` (vite, sirve en `localhost`). Se agrega `start.bat` / `start.sh`
  (`npx vite preview --open`) para doble-click sin terminal.
- Sin variables de entorno, claves ni cuenta de servicio.

## Fuera de alcance (YAGNI)

- Auto-merge de conflictos (se delega al usuario).
- App de escritorio empaquetada (Electron/Tauri) — se evaluará si hace falta soporte
  fuera de Chromium.
- Cualquier dependencia de la API de Google Drive / OAuth.
