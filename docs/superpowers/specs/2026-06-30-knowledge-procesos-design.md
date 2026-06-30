# Knowledge management de procesos sobre BPMN — Diseño

- **Fecha:** 2026-06-30
- **Estado:** Aprobado (brainstorming) → pendiente plan de implementación
- **Proyecto base:** BPMN compartida (editor BPMN file-based, TypeScript + Vite, Electron + web)

## Objetivo

Convertir el editor BPMN en un **sistema de gestión de conocimiento de procesos**:
cada diagrama es el índice navegable de su propia documentación. Una persona que
**no sabe BPMN** puede documentar, leer y mejorar procesos en lenguaje natural
(texto, imágenes, video), y un **agente LLM por CLI** (Claude Code, Cowork, etc.)
puede leer y editar esa documentación directamente sobre los archivos, **sin API
ni tokens de costo**.

La documentación se engancha a dos niveles: **página-proceso** (overview) y
**nota por elemento** (cada tarea, gateway o evento). Hay **modo edición** y
**modo lectura**, ambos de primera clase.

## Principios de diseño

1. **Archivos planos como contrato.** Toda la doc, las ideas y el índice son
   `.md` planos (+ `assets/`) accedidos **solo** vía la abstracción `fsClient`
   existente. El markdown + frontmatter es el contrato estable; el transporte
   (carpeta local, y mañana un backend remoto) es intercambiable.
2. **Agent-friendly, no chat embebido.** El LLM vive **fuera** de la app. La app
   produce archivos máximamente legibles para un agente CLI (frontmatter
   auto-descriptivo + `_index.md` + `AGENTS.md`). El *watcher* existente recarga
   ante cambios externos → el círculo persona↔agente se cierra solo.
3. **El diagrama es la verdad; lo derivado se regenera.** El `_index.md` y el
   orden del manual se proyectan desde el modelo bpmn-js; nunca se editan a mano.
4. **Reuso de patrones probados.** Sidecar hermano del `.bpmn` (como
   `.layers.json`), `fsClient` (escrituras atómicas, tolerancia a Drive/OneDrive),
   *watcher*, paneles laterales colapsables, capas con toggle.
5. **Forward-compatible con un backend.** Ver sección "Futuro backend".

## A — Layout en disco y modelo de datos

Cada diagrama gana una carpeta sidecar hermana:

```
mi-proceso.bpmn
mi-proceso.docs/
  _proceso.md            # página-proceso (overview): para qué sirve, dueño, alcance
  _index.md              # mapa elementId → nombre/tipo → archivo (regenerado por la app)
  _ideas.md              # bandeja de ideas sueltas del proceso
  Activity_0x9f2.md      # nota de la tarea "Validar factura"
  Gateway_1abc.md        # nota del gateway "¿Factura OK?"
  assets/
    captura-validacion.png
```

- Carpeta: `<base-del-bpmn>.docs/` (hermana del archivo).
- Una nota de elemento **se crea solo cuando se documenta** (no se generan
  archivos vacíos por cada caja del diagrama).
- Acceso exclusivamente vía `fsClient` (web FS Access API / IPC Electron).

### Frontmatter de nota de elemento

Hace la nota auto-descriptiva (clave para agentes y para el manual):

```markdown
---
element: Activity_0x9f2
name: Validar factura
type: bpmn:Task
diagram: mi-proceso.bpmn
---

Acá se explica qué hace este paso, con imágenes y video…
```

La app **rellena/actualiza** `name` y `type` desde el modelo bpmn-js (si el
usuario renombra el paso en el diagrama, la nota se re-sincroniza el frontmatter
en el próximo guardado; el cuerpo del usuario nunca se toca).

## B — Puente agent-friendly (`_index.md`, frontmatter, `AGENTS.md`)

`_index.md` es navegación para humanos, contrato para agentes y fuente de orden
del manual lineal — un artefacto, tres usos. Se **regenera** al cambiar el
diagrama o las notas:

```markdown
---
diagram: mi-proceso.bpmn
generated-by: BPMN compartida
---
# Índice del proceso: Validación de facturas

| Paso | Tipo | Nota |
|------|------|------|
| Inicio: factura recibida | startEvent | _(sin nota)_ |
| Validar factura | task | [Activity_0x9f2.md](Activity_0x9f2.md) |
| ¿Factura OK? | exclusiveGateway | [Gateway_1abc.md](Gateway_1abc.md) |
```

Además, al elegir/crear una carpeta de trabajo, la app deja (si no existe) un
`AGENTS.md` corto en la **raíz de la carpeta de trabajo** explicando la
convención del repo (qué es `*.docs/`, el frontmatter, `_index.md`, `_ideas.md`,
las casillas `- [ ]`), para que cualquier agente CLI entienda el repo sin
instrucciones extra.

## C — Bandeja de ideas (capa "Ideas")

Captura sin fricción de ideas a medio cocinar, visibles sobre el gráfico para
procesarlas después (persona o agente).

**Captura.** Botón "💡 + Idea". Cada idea:
- se **ancla a un elemento** (clic en un paso → "agregar idea acá"), o
- es **general** del proceso (sin elemento).

Guarda autor y fecha automáticamente (la app ya conoce la identidad del usuario).

**Almacenamiento (markdown, fuente de verdad legible por LLM)** en
`mi-proceso.docs/_ideas.md`:

```markdown
# Ideas sueltas — Validación de facturas

- [ ] (Activity_0x9f2 · Validar factura) Avisar por mail si la validación tarda +2 días — Ana, 2026-06-30
- [ ] (general) ¿Y si automatizamos la lectura del PDF con OCR? — Beto, 2026-06-30
- [x] (Gateway_1abc · ¿Factura OK?) Falta el caso "factura duplicada" — Ana, 2026-06-29
```

Las casillas `- [ ]` / `- [x]` permiten **triar** (pendiente vs procesada). Un
agente lee este archivo, elige ideas y las convierte en notas de elemento o
cambios al diagrama; el *watcher* refleja el cambio al toque.

**Visualización en el gráfico.** Capa **"Ideas"** (toggle, como las demás):
- Ideas ancladas → **post-its pequeños** (badge con conteo) junto a su elemento;
  clic abre el texto.
- Ideas generales → se listan en el panel de Ideas (no se pinnean al canvas).
- Separamos **texto** (en `_ideas.md`) de **presentación** (post-its derivados
  del ancla a `elementId`). No se guardan posiciones arbitrarias del canvas.

El embudo del knowledge management: idea cruda → (persona/LLM procesa) → nota
estructurada. `- [ ]` → `- [x]` es el pipeline visible.

## D — UI: panel de Documentación + modos

Nuevo panel lateral derecho **"Documentación"**, colapsable e independiente
(mismo patrón que los paneles actuales). Contiene un **switch Editar / Leer** en
la cabecera y tres pestañas:

- **Paso:** clic en un elemento del canvas → su nota. Si no existe → botón
  *"Documentar este paso"* crea `<id>.md` con frontmatter ya rellenado.
- **Proceso:** edita/lee `_proceso.md`.
- **Ideas:** la bandeja (sección C) — quick-add, lista con casillas, filtro
  pendientes/procesadas.

**Comportamiento de la capa Ideas según pestaña (requisito explícito):** al
entrar a la pestaña **Ideas**, la capa "Ideas" se **fuerza visible** aunque esté
apagada. Se **recuerda el estado previo** (on/off) y se **restaura** al salir de
la pestaña o cambiar de sección. Es un override **temporal de presentación**: no
modifica el `.layers.json` guardado.

El panel convive con Propiedades y Capas; todos colapsables. La capa "Ideas" es
una **capa especial derivada** (built-in): su toggle aparece en el panel de Capas
junto a las demás, pero su contenido **no** se guarda en `.layers.json` — se
deriva de `_ideas.md` (los post-its se posicionan por el ancla a `elementId`).
Es la única capa cuyo contenido es derivado en vez de almacenado.

## E — Motor markdown, edición, media, wikilinks

- **Motor:** una dependencia nueva, `markdown-it`, + saneado con `DOMPurify`.
  Soporta encabezados, listas (con viñetas **y numeradas**), tablas, listas de
  tareas (`- [ ]`), imágenes y **embeds de video**: URLs de YouTube/Loom/Vimeo se
  detectan y renderizan como `iframe` (whitelist de dominios de embed en el
  sanitizador; nada fuera de esa lista).
- **Editor (apto no-técnicos):** textarea con **vista previa en vivo** y barra
  mínima: **encabezados (H1/H2/H3)**, negrita, **lista con viñetas**, **lista
  numerada**, enlace, imagen, video, wikilink. El usuario escribe en lenguaje
  natural; el markdown es opcional.
- **Pegar/soltar imágenes:** captura `paste`/`drop` → escribe el archivo en
  `<diagrama>.docs/assets/` (vía `fsClient`) e inserta `![](assets/archivo.png)`.
  Sin markdown a mano.
- **Wikilinks `[[...]]`** con **tres tipos de destino** y autocompletado:
  - `[[mi-proceso]]` → otro diagrama/proceso.
  - `[[mi-proceso#Activity_0x9f2]]` o `[[Validar factura]]` → un **elemento
    BPMN** (abre su nota / lo resalta en el canvas).
  - `[[idea:...]]` → una **idea** del inbox.
  El autocompletado ofrece procesos, elementos del diagrama actual e ideas,
  apoyándose en `_index.md` (mapa `elementId → nombre`).

## F — Manual lineal + exportar

- **Generador (lógica pura, testeable sin DOM):** recorre el modelo bpmn-js desde
  el/los evento(s) de inicio siguiendo `sequenceFlow`, con set de visitados para
  no colgarse en loops; las ramas de un gateway se listan en orden. Entra el
  modelo → sale una lista ordenada de `elementId`. Por cada paso renderiza su nota
  (o marca *"sin documentar"*). Antepone `_proceso.md` como introducción.
- **Vista "Manual"** en la app: documento de corrido con tabla de contenidos.
- **Exportar a HTML autocontenido** (imágenes incrustadas/copiadas) para
  compartir o imprimir. El **PDF** sale del navegador (Imprimir → Guardar como
  PDF) — sin librería pesada de PDF. El orden lo comparte con `_index.md`.

## G — Navegación inter-proceso (BPMN estándar, clic incluido)

El modelado es 100% estándar BPMN 2.0 (sin customizar el lenguaje); lo soporta
`bpmn-js` nativamente. Lo "custom" es solo la **navegación** en la app:

- **Call Activity** (descomposición / reutilización): clic en un Call Activity →
  la app resuelve su atributo `calledElement` y **abre el `.bpmn` referenciado**.
  Es el mecanismo recomendado para que procesos complejos no sean extensos: cada
  sub-proceso es su propio diagrama con su start/end, y el padre lo "llama".
- **Message / Signal events** (encadenado desacoplado fin→inicio): eventos
  throw/catch con el **mismo nombre** entre diagramas se reconocen como enlazados;
  la app ofrece "ir al proceso que cataliza/recibe". (`End Message` de A →
  `Start Message` de B; Signal para difusión 1→N.)
- **Link events** (ir-a dentro de un mismo diagrama): throw/catch del mismo
  nombre saltan entre tramos.

Estos enlaces inter-proceso se registran también en `_index.md` y son
referenciables por wikilinks → **embrión del "grafo de procesos"** (sub-proyecto
futuro). Restricción del estándar que esto respeta: un `sequenceFlow` no puede
cruzar de un proceso/pool a otro ni apuntar a un start event; por eso se usan
estos eventos tipados, no una línea directa.

## Futuro backend (forward-compatibility)

Como la doc, las ideas y el índice son artefactos de archivo accedidos **solo**
vía `fsClient`, un futuro backend (servidor + DB, sync multi-tenant, API REST) se
agrega implementando esa misma interfaz, **sin tocar** el modelo de doc ni la UI.
El esquema markdown + frontmatter es el contrato estable; el transporte es
intercambiable. Este diseño es deliberadamente esa base reutilizable.

## Módulos y archivos (propuesta)

Nuevo folder `src/processDocs/` (sigue el patrón de `src/layers/`):

| Archivo | Responsabilidad |
|---|---|
| `docsClient.ts` | Leer/escribir `.md` del sidecar y `assets/` vía `fsClient`. |
| `docsModel.ts` | Modelo en memoria: `elementId → meta de nota`, nota de proceso. |
| `frontmatter.ts` | Parse/serialize del frontmatter; re-sync de `name`/`type`. |
| `docsIndex.ts` | Generar `_index.md` desde el modelo bpmn-js. |
| `flowOrder.ts` | Recorrido de flujo (start → `sequenceFlow`) → orden de `elementId` (puro). |
| `markdownRender.ts` | Config `markdown-it` + `DOMPurify` (embeds de video, task lists). |
| `wikilinks.ts` | Parse/resolver `[[...]]` (proceso / elemento / idea) + autocompletado. |
| `notePanel.ts` | Panel "Documentación": pestañas (Paso/Proceso/Ideas) + switch modo. |
| `noteEditor.ts` | Textarea + toolbar + paste/drop de imágenes + preview. |
| `ideasInbox.ts` | Modelo de ideas + read/write `_ideas.md`. |
| `ideasLayer.ts` | Post-its overlay en canvas + auto-on/restore por pestaña. |
| `manualView.ts` | Vista "Manual" (render lineal + TOC). |
| `manualExport.ts` | Exportar a HTML autocontenido. |
| `interProcessNav.ts` | Abrir Call Activity referenciado; enlazar Message/Signal/Link. |
| `agentsFile.ts` | Crear/actualizar `AGENTS.md` en la raíz de la carpeta de trabajo. |

**Puntos de integración con código existente:**
- `editor.ts` — wiring del clic en elemento → abrir nota/idea; click en Call
  Activity → navegación.
- `watcher.ts` — recargar el panel/manual cuando un `.md` del sidecar cambia
  externamente (agente CLI).
- panel de Capas — registrar la capa "Ideas" y su toggle.
- `main.ts` / layout — montar el panel "Documentación".
- (Opcional) árbol de archivos — badge "tiene doc" en diagramas con sidecar.

## Flujo de datos

1. Se abre `mi-proceso.bpmn` → `docsClient` lee `mi-proceso.docs/` (si existe) →
   `docsModel` indexa notas por `elementId`; `ideasInbox` carga `_ideas.md`.
2. La app regenera `_index.md` desde el modelo bpmn-js (derivado).
3. Clic en elemento → `notePanel` muestra la nota (modo Leer renderiza markdown;
   modo Editar abre `noteEditor`).
4. Guardar nota / pegar imagen / agregar idea → `docsClient` escribe vía
   `fsClient` (atómico) → se actualiza `_index.md`.
5. Cambio externo (agente CLI edita un `.md`) → `watcher` → recarga del panel.

## Manejo de errores

- Sidecar ausente → estados "sin documentar" / "sin ideas" (no es error).
- Frontmatter corrupto/inválido → se muestra el cuerpo crudo y un aviso no
  bloqueante; nunca se pierde texto del usuario.
- Conflicto de escritura / lock (reuso del sistema existente) → se respeta el
  flujo de bloqueos/historial ya implementado por archivo.
- `calledElement` que no resuelve a ningún `.bpmn` en la carpeta → aviso "proceso
  referenciado no encontrado", sin romper.
- Render markdown: `DOMPurify` con whitelist; URLs de embed fuera de la lista se
  muestran como enlace plano, no como `iframe`.

## Testing (Vitest + happy-dom, igual que el resto)

- `flowOrder.ts`: orden correcto con secuencias, ramas de gateway, loops.
- `frontmatter.ts`: parse/serialize, re-sync de `name`/`type`, frontmatter roto.
- `docsClient.ts`: read/write contra `fakeDir`, creación de `assets/`.
- `docsIndex.ts`: `_index.md` derivado correcto desde un modelo dado.
- `markdownRender.ts`: saneado (XSS), embeds permitidos vs bloqueados, task lists.
- `wikilinks.ts`: resolución de los tres tipos de destino + autocompletado.
- `ideasInbox.ts`: parse/serialize de `_ideas.md`, triaje `[ ]`/`[x]`, anclaje.
- `ideasLayer.ts`: auto-on al entrar a la pestaña y restore al salir.
- `interProcessNav.ts`: resolución de `calledElement` y matching Message/Signal.

## Fuera de alcance (sub-proyectos futuros)

- **Chat LLM embebido / API** — explícitamente fuera; la asistencia la dan
  agentes CLI sobre los `.md`. (En alcance: que los archivos sean agent-friendly
  + `AGENTS.md`.)
- **Vista de grafo tipo Obsidian** (backlinks, mapa de procesos) — los wikilinks
  y `_index.md` la habilitan, pero la vista se diseña aparte.
- **La app como manual de sí misma** (onboarding/tutoriales internos) — separado.
- **Backend remoto / multi-tenant** — habilitado por el diseño, no construido acá.

## Dependencias nuevas

- `markdown-it` (render markdown).
- `dompurify` (saneado del HTML resultante).
