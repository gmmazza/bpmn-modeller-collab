# Validación de flujo BPMN (bpmnlint) — Diseño

**Fecha:** 2026-06-27
**Estado:** Aprobado

## Objetivo

Agregar **validación/linting** del diagrama (como el demo de bpmn.io): marcar errores
y warnings sobre los elementos (ícono ⚠/✕ + tooltip, p. ej. "Sequence flow is missing
condition") y un **badge "X Errors, Y Warnings"** abajo-izquierda que actúa de toggle,
con el ruleset estándar `bpmnlint:recommended`. No-destructivo (solo overlays; no toca
el `.bpmn`).

## Crux técnico (resuelto)

bpmnlint normalmente compila su config con un loader de webpack (`bpmnlint-loader`). En
Vite se usa **`bpmnlint-pack-config`**, que empaqueta el `.bpmnlintrc` (con las reglas
inlineadas) en un módulo JS importable directo — bundler-agnóstico. Eso evita el loader.

## Arquitectura

`bpmn-js-bpmnlint` es un módulo de bpmn-js que ya provee toda la UI (marcadores sobre
elementos + el badge/toggle de conteo). Se enchufa al `Modeler` que ya creamos
parametrizado en `editor.ts`. Reusa todo; solo agrega un módulo + su config + CSS.

```
.bpmnlintrc  →  bpmnlint-pack-config  →  src/linting/bpmnlintConfig.js (packed, committed)
                                              │
createBpmnModeler(..)  additionalModules += lintModule
                       config.linting = { bpmnlint: <packed> }
main.ts: import CSS; activar linting al montar el modeler (activo por defecto)
```

## Componentes / archivos

```
package.json                  # MODIFY: deps bpmn-js-bpmnlint + bpmnlint; devDep bpmnlint-pack-config; script lint:pack
.bpmnlintrc                   # NEW: { "extends": "bpmnlint:recommended" }
src/linting/bpmnlintConfig.js # NEW (generado por lint:pack, committed): config empaquetada
src/linting/packedConfig.test.ts # NEW: test mínimo (exporta objeto con reglas/resolver)
src/editor.ts                 # MODIFY: selectedModuleKeys += "lint"; lint module + config.linting en createBpmnModeler
src/editor.test.ts            # MODIFY: selectedModuleKeys incluye "lint"
src/main.ts                   # MODIFY: import CSS bpmn-js-bpmnlint; activar linting en mountModeler
src/vendor.d.ts               # MODIFY: declare module "bpmn-js-bpmnlint", "bpmnlint", "./linting/bpmnlintConfig.js"
README.md                     # MODIFY: nota sobre lint:pack (regenerar config si cambian reglas)
```

### Detalle

- **`.bpmnlintrc`**: `{ "extends": "bpmnlint:recommended" }`.
- **`lint:pack` script**: `bpmnlint-pack-config -c .bpmnlintrc -o src/linting/bpmnlintConfig.js`.
  Se corre una vez y se **commitea el resultado** (así el build/packager no dependen de un
  prebuild). Se reejecuta solo si se cambian las reglas. Documentado en README.
- **`createBpmnModeler`** (editor.ts):
  - `selectedModuleKeys(settings)` suma `"lint"` al set siempre-on
    (`["colorPicker","minimap","grid","properties","tokenSim","lint"]`).
  - Dynamic import de `bpmn-js-bpmnlint` (default = lintModule); `byKey.lint = lintModule.default`.
  - Tras armar `additionalModules`, setea `config.linting = { bpmnlint: packedConfig }`
    (import del packed config).
- **main.ts**: importa `bpmn-js-bpmnlint/dist/assets/css/bpmn-js-bpmnlint.css`; en
  `mountModeler`, tras `editor.load`/creación, activa el linting:
  `modeler.get("linting")?.setActive?.(true)` (o `.toggle()` si no está activo) — para
  que los errores se muestren por defecto. Envuelto en try/catch (servicio opcional).
- **vendor.d.ts**: `declare module "bpmn-js-bpmnlint";`, `declare module "bpmnlint";`,
  `declare module "*/bpmnlintConfig.js";` (untyped).

## Comportamiento / casos borde

- **Activo por defecto**: al abrir un diagrama se ve el badge con el conteo y los
  marcadores; el badge togglea mostrar/ocultar.
- **Diagrama válido**: badge "0 Errors, 0 Warnings" (o el módulo lo oculta) — sin marcadores.
- **Recrear modeler** (cambio de ajustes viz / capas): el linting se recrea con el modeler
  y se re-activa en `mountModeler`.
- **Config empaquetada ausente/corrupta**: el build fallaría al importar → se detecta en
  el gate; en runtime el try/catch alrededor de `setActive` evita romper la app si el
  servicio no está.
- No-destructivo: el `.bpmn` no se modifica; el linting son overlays de diagram-js.

## Fuera de alcance (YAGNI)

- Reglas custom o plugins de bpmnlint (solo `recommended`; el `.bpmnlintrc` queda listo
  para extender a futuro).
- Auto-fix de issues.
- Un toggle propio en la ⚙ (el badge del módulo ya togglea).

## Testing

- **`selectedModuleKeys`** (editor.test) — ahora incluye `"lint"` en el set siempre-on
  (sketchy sigue condicional).
- **`src/linting/packedConfig.test.ts`** — importa la config empaquetada y verifica que
  expone la forma esperada (un objeto con `rules` y/o `resolver`/config no vacío).
- **Glue** (modeler config, CSS, activación) — build + checklist manual con un `.bpmn`
  inválido (ver marcadores + badge) y uno válido (0/0).
- **Regresión**: los 119 tests verdes. **Gates**: `npm test`, `npm run typecheck`,
  `npm run build`.

## Plan / orden

Es su propio plan; va **primero** en esta tanda. Después: el **rediseño de UI** (su
propio plan). Tras ambos, regenerar el `.exe`.
