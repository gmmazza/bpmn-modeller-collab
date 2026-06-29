# Sistema para mantener bpmn-js actualizado — Diseño

**Fecha:** 2026-06-27
**Estado:** Aprobado

## Objetivo

Crear un sistema que mantenga **bpmn-js (y su ecosistema bpmn-io)** en la última
versión, combinando: (1) un **comando local** que actualiza + verifica, (2) un
**chequeo de versión in-app** (port mejorado del plugin de Obsidian) y (3) una
**config de CI lista para activar** cuando el repo tenga remoto en GitHub. Su
primera corrida lleva la app a **bpmn-js 18** (lo que habilita el "Create element"
extendido y da paridad con el plugin).

## Evaluación del plugin (referencia)

El plugin (`src/version.ts` + `docs/.../in-plugin-bpmn-js-version-check-design.md`)
inyecta en build la versión resuelta de bpmn-js (`__BPMN_JS_VERSION__` vía esbuild
`define`) y ofrece un chequeo on-demand contra `registry.npmjs.org/bpmn-js/latest`
(con `requestUrl` de Obsidian porque el registry **no expone CORS**). Es
informativo (no actualiza, está bundleado). Tomamos ese patrón y le sumamos el
mecanismo que realmente actualiza + automatización CI.

## Investigación (resumen)

- **Renovate**: automerge integrado por tipo de update, gateado por tests, con
  `minimumReleaseAge` (cooldown anti-supply-chain). Multiplataforma.
- **Dependabot**: integrado a GitHub, simple; automerge vía Action aparte.
- **GitHub Action + `npm-check-updates` + `peter-evans/create-pull-request`**: DIY.
- **`update-notifier`**: patrón de "avisá si hay nueva" en background.
- **Buenas prácticas**: auto-mergear solo **patch/minor** tras tests verdes +
  **cooldown**; **major → PR** a revisar. **Registry npm sin CORS** → el chequeo
  runtime va por Node/Electron-main.

## Arquitectura (3 capas)

### Capa 1 — Comando local de actualización

- Dep de dev: `npm-check-updates`.
- `scripts/update-bpmn.mjs` (Node ESM):
  1. Lee `package.json`, calcula el set de paquetes del **ecosistema bpmn-io** con
     una función pura `bpmnEcosystemDeps(pkgJson): string[]` (matchea por nombre:
     `bpmn-js`, `bpmn-moddle`, `diagram-js`, prefijos `bpmn-js-`, `diagram-js-`,
     `@bpmn-io/`, y la lista explícita `heatmap-ts`, `bpmnlint`, `bpmn-js-bpmnlint`
     si están). 
  2. Corre `ncu -u <paquetes>` (vía `npx`/childprocess) para subirlos a la última.
  3. `npm install`.
  4. Compuerta: `npm test && npm run typecheck && npm run build`.
  5. Imprime un resumen (qué subió, de qué versión a cuál) y el resultado de la
     compuerta. Si la compuerta falla, deja los cambios en el working tree para
     revisar y termina con código ≠ 0 (no revierte ni commitea).
- Script npm: `"update:bpmn": "node scripts/update-bpmn.mjs"`.
- **Testeable**: `bpmnEcosystemDeps` es puro (unit test). El resto es orquestación
  (childprocess) validada por ejecución/manual.

### Capa 2 — Chequeo de versión in-app

- **Build-time inject**: en `vite.config.ts`, `define: { __BPMN_JS_VERSION__:
  JSON.stringify(<versión resuelta>) }`, leída de
  `node_modules/bpmn-js/package.json` al cargar la config. Declarar el global en
  `src/vendor.d.ts` (o un `globals.d.ts`): `declare const __BPMN_JS_VERSION__: string;`.
- **`src/version.ts`**:
  - `BUNDLED_BPMN_JS_VERSION: string = __BPMN_JS_VERSION__`.
  - `compareVersions(a, b): number` (numérico por partes; port del plugin).
  - `checkLatestBpmnJs(fetchLatest: () => Promise<string>): Promise<{ latest: string; isOutdated: boolean }>`
    — `fetchLatest` inyectado (devuelve la versión string desde npm). Lanza si la
    respuesta es inválida.
- **Acceso a npm sin CORS**:
  - Electron: handler IPC `version:latestBpmnJs` en `main.cjs` que hace el request
    a `https://registry.npmjs.org/bpmn-js/latest` (Node fetch, sin CORS) y devuelve
    `.version`; expuesto en preload como `window.versionApi.latestBpmnJs()`.
  - Web (dev/preview): fallback a `fetch` directo; si CORS lo bloquea, el chequeo
    informa "no se pudo verificar" (degrada elegante). La distribución principal es
    el `.exe`, donde funciona.
  - `main.ts` arma el `fetchLatest`: usa `window.versionApi` si existe, si no
    `fetch`.
- **UI**: en el popover de ⚙ Ajustes, una línea "bpmn-js `<bundled>`" + botón
  **"Buscar actualización"** → estado:
  - al día → "bpmn-js `<v>` es la última."
  - nueva → "bpmn-js `<latest>` disponible (instalada `<v>`). Corré
    `npm run update:bpmn` y regenerá el .exe."
  - error → "No se pudo verificar (offline o sin acceso)."

### Capa 3 — CI lista para activar (cuando haya remoto GitHub)

- `.github/workflows/ci.yml`: en `pull_request`/`push`, corre
  `npm ci && npm test && npm run typecheck && npm run build` (provee el check verde
  que el automerge necesita).
- `renovate.json` (preset):
  - Agrupa el ecosistema bpmn-io en un PR ("bpmn-io").
  - `minimumReleaseAge: "3 days"` (cooldown).
  - Automerge de **patch + minor** cuando el CI pasa; **major → PR sin automerge**.
  - Schedule semanal.
- Estos archivos no tienen efecto runtime; quedan dormidos hasta que exista el
  remoto y se instale la app de Renovate. Documentado en el README.

### Capa 4 — Actualización de la APP del usuario final (en fases)

Mantener el repo al día (Capas 1–3) es el lado upstream; esto es el downstream:
hacer llegar el build nuevo al usuario, "lo más simple y transparente posible".

**Fase A — aviso in-app + descarga 1-clic (se implementa ahora):**
- Versión de la app corriendo: `app.getVersion()` (Electron) — leída de
  `package.json`.
- **Feed de versión**: una URL configurable (`APP_UPDATE_FEED_URL`, constante en
  `electron/main.cjs`, vacía por defecto) que devuelve JSON
  `{ version: string, url: string, notes?: string }`. Puede apuntar a GitHub
  Releases (`.../releases/latest`) cuando exista el repo, o a un JSON estático.
- **Electron main**: handler IPC `app:checkUpdate` → si el feed está configurado,
  hace fetch (Node, sin CORS), y devuelve el JSON; preload expone
  `window.appUpdate.check()` y `window.appUpdate.openDownload(url)`
  (`shell.openExternal`).
- **`src/appUpdate.ts`** (puro, testeable): `evaluateUpdate(currentVersion, feed):
  { updateAvailable: boolean; latest: string; url: string }` usando
  `compareVersions` (de `version.ts`). Tolera feed nulo/ inválido → `updateAvailable:
  false`.
- **`main.ts`**: al iniciar (no bloqueante) llama al check; si `updateAvailable`,
  muestra un **banner discreto** "Versión `<latest>` disponible — [Descargar]
  [Después]". "Descargar" abre la URL (el usuario baja el .exe/zip nuevo y reemplaza).
  Sin feed o con error → silencioso (no molesta).
- Si no hay `window.appUpdate` (web) → no muestra banner.

**Fase B — auto-update silencioso (electron-updater), DORMIDA:**
- Dep `electron-updater`. En `main.cjs`, `autoUpdater` con provider GitHub,
  **gateado por env `ENABLE_AUTOUPDATE`** (OFF por defecto; sin feed publicado
  fallaría), envuelto en try/catch. No se activa en esta iteración.
- **Requisitos para activarla** (documentados en README): repo en GitHub +
  `electron-builder` con `publish: github` + target **NSIS** (instalador — el
  portable no soporta bien auto-update) + idealmente **firma de código**.
- Se deja la config `build.publish` (dormida) + un script `dist:win:installer`
  (NSIS) listos para cuando se decida activar.

## Primera corrida → bump a bpmn-js 18

Tras construir la Capa 1, ejecutar `npm run update:bpmn` sube bpmn-js 17→18 + los
módulos del ecosistema. La compuerta corre los 109 tests + typecheck + build; se
resuelve cualquier ruptura del major (editor, **diff**, **capas**, properties-panel,
color-picker, token-sim, minimapa, grilla, sketchy, differ/moddle). Resultado:
paridad con el plugin + "Create element" extendido por defecto.

## Componentes / archivos

```
package.json            # MODIFY: devDep npm-check-updates; script update:bpmn
scripts/update-bpmn.mjs # NEW: comando local (usa bpmnEcosystemDeps + ncu + gates)
scripts/ecosystem.mjs   # NEW (puro): bpmnEcosystemDeps(pkgJson) — testeable
scripts/ecosystem.test.ts (o .mjs test) # NEW
vite.config.ts          # MODIFY: define __BPMN_JS_VERSION__ (leído de node_modules)
src/version.ts          # NEW: BUNDLED_BPMN_JS_VERSION, compareVersions, checkLatestBpmnJs
src/version.test.ts     # NEW
src/vendor.d.ts         # MODIFY: declare const __BPMN_JS_VERSION__
electron/main.cjs       # MODIFY: ipc version:latestBpmnJs (npm) + app:checkUpdate + (dormant) autoUpdater
electron/preload.cjs    # MODIFY: window.versionApi.latestBpmnJs() + window.appUpdate.check()/openDownload()
src/appUpdate.ts        # NEW (puro): evaluateUpdate(current, feed) — testeable
src/appUpdate.test.ts   # NEW
src/version.ts (decl)   # window.versionApi / window.appUpdate tipados (en version.ts o vendor.d.ts)
src/main.ts             # MODIFY: línea de versión + "Buscar actualización" en ⚙; banner de update al iniciar
.github/workflows/ci.yml# NEW (dormant): gates en PR/push
renovate.json           # NEW (dormant): automerge patch/minor + cooldown, major→PR
package.json            # MODIFY: electron-updater devDep (dormant) + script dist:win:installer (dormant)
README.md               # MODIFY: documentar update:bpmn, activación de Renovate, y activación de auto-update (Fase B)
```

## Casos borde / errores

- **Sin red / npm caído**: `checkLatestBpmnJs` propaga error → UI "no se pudo
  verificar". El comando local falla en `ncu`/`npm install` con mensaje claro.
- **CORS en web**: el chequeo runtime degrada a "no se pudo verificar" fuera de
  Electron; no rompe.
- **Compuerta falla tras update**: el comando deja los cambios sin commitear y sale
  ≠ 0; el usuario revisa/revierte con git. No auto-commit.
- **Respuesta npm inesperada**: se valida que `.version` sea string antes de comparar.
- **Major disponible**: el comando local lo sube igual (con la compuerta como red);
  en CI, Renovate lo manda como PR (no automerge).

## Fuera de alcance (YAGNI)

- Auto-aplicar el update sin intervención dentro de la app (es bundleada; requiere
  rebuild del `.exe`).
- Chequeo en background al iniciar / persistir el resultado (el chequeo es on-demand
  como en el plugin).
- Actualizar dependencias fuera del ecosistema bpmn-io (el comando se enfoca en bpmn-js
  y hermanos; `npm update` general queda al usuario / Renovate).

## Testing

- **`scripts/ecosystem` `bpmnEcosystemDeps`** — puro: dado un package.json de
  ejemplo, devuelve exactamente los paquetes del ecosistema (incluye prefijos,
  excluye no-bpmn). Unit test.
- **`src/version.ts`** — `compareVersions` (varios casos incl. longitudes distintas);
  `checkLatestBpmnJs` con `fetchLatest` fake (al día / nueva / respuesta inválida).
- **`src/appUpdate.ts`** — `evaluateUpdate(current, feed)`: nueva disponible, al día,
  feed nulo/ inválido → `updateAvailable:false`.
- **Glue** (script childprocess, IPC, vite define, UI) — validado por
  build + checklist manual.
- **Regresión**: los 109 tests verdes. **Gates**: `npm test`, `npm run typecheck`,
  `npm run build`.
- **Dogfood**: tras construir, `npm run update:bpmn` debe pasar la compuerta (con la
  app ya en bpmn-js 18).

## Planes / orden

Este sistema es su **propio plan** y va **primero**. Después: **linting (bpmnlint)** y
el **rediseño de UI** (cada uno su plan). El bump a 18 lo entrega la primera corrida
de este sistema.
