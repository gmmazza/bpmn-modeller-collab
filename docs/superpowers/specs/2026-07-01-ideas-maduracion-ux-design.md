# UX de registro y maduración de ideas — Diseño

- **Fecha:** 2026-07-01
- **Estado:** Aprobado (brainstorming) → pendiente planes de implementación
- **Base:** amplía la bandeja de ideas del Plan 3 (`2026-06-30-knowledge-procesos-design.md`, sección C)

## Objetivo

Convertir las "ideas sueltas" (hoy un checkbox binario en `_ideas.md`) en
**anotaciones ancladas con hilo**: cada idea tiene estado, comentarios de varias
personas, y un camino a "mejora". Arreglar los dos dolores de UX: agregar una idea
a un elemento es poco intuitivo, y el badge azul del diagrama no abre ni relaciona
la idea. Todo sigue siendo **markdown plano editable por agentes LLM**.

## Decisiones (del brainstorming)

- Idea = **anotación anclada con hilo** (no un checkbox).
- Almacenamiento = **una nota por idea**; `_ideas.md` pasa a ser **índice generado**.
- Promover a mejora = **nota de mejora aparte** (`mejoras/<id>.md`) con su ciclo.
- Interacción = **modo idea** (toggle tipo Figma): clic en elemento agrega/abre; clic en badge abre el hilo.
- Estados = **5** (pendiente/haciendo/pausado/hecho/rechazado); `pausado` y `rechazado` piden **motivo** → registro anti-patrón.
- El **índice lista TODAS las ideas** en cualquier estado (con motivo) para alimentar al LLM.

## A — Modelo de datos y almacenamiento

Cada diagrama gana dos carpetas dentro de su sidecar `.docs/`:

```
mi-proceso.docs/
  ideas/
    idea-1.md
    idea-3.md
  mejoras/
    mejora-2.md
  _ideas.md            # índice GENERADO (todas las ideas, todos los estados)
```

### Nota de idea — `ideas/<id>.md`

```markdown
---
id: idea-3
estado: haciendo          # pendiente | haciendo | pausado | hecho | rechazado
ancla: Activity_1         # elementId, o "general"
ancla-nombre: Validar factura
autor: Ana
fecha: 2026-07-01
motivo:                   # requerido si estado = pausado | rechazado; si no, vacío
mejora: mejora-2          # opcional: link a la mejora si se promovió
---
Deberíamos avisar por mail si la validación tarda +2 días.

## Comentarios
- Beto, 2026-07-02: ¿y si además lo marcamos en el dashboard?
- Ana, 2026-07-02: sí, con SLA configurable.
```

- `id` = `idea-<n>` único dentro de la carpeta `ideas/` del diagrama.
- Frontmatter con pares `clave: valor` (mismo parser que las notas de elemento).
- Cuerpo = descripción (texto libre) + sección `## Comentarios` (hilo).

### Comentarios (hilo)

- Viñetas bajo `## Comentarios`: `- <autor>, <fecha>: <texto>`.
- Agregar comentario = append de una viñeta (autor desde la identidad de la app).
- Multi-persona sin backend: cada quien (o un agente) edita el mismo archivo en la
  carpeta compartida.

### Nota de mejora — `mejoras/<id>.md`

```markdown
---
id: mejora-2
desde-idea: idea-3
estado: propuesta         # propuesta | aprobada | implementada
ancla: Activity_1
autor: Ana
fecha: 2026-07-02
---
Descripción concreta de la mejora…

## Comentarios
- …
```

Link bidireccional: la idea guarda `mejora: mejora-2`; la mejora guarda
`desde-idea: idea-3`.

### Índice — `_ideas.md` (generado, alimenta al LLM)

Tabla derivada que lista **todas las ideas en cualquier estado**, con su motivo si
está cerrada, para que una persona o un agente vea el registro completo (incl. las
rechazadas → no re-proponer):

```markdown
---
diagram: mi-proceso.bpmn
generated-by: BPMN compartida
---
# Ideas — Validación de facturas

| Idea | Estado | Ancla | Autor | Motivo / Mejora |
|------|--------|-------|-------|-----------------|
| Avisar por mail si tarda +2 días | haciendo | Validar factura | Ana | [idea-3](ideas/idea-3.md) |
| Automatizar OCR del PDF | pendiente | general | Beto | [idea-1](ideas/idea-1.md) |
| Migrar todo a otro motor | rechazado | general | Ana | fuera de alcance · [idea-4](ideas/idea-4.md) |
| Falta caso "factura duplicada" | hecho | ¿Factura OK? | Ana | → [mejora-2](mejoras/mejora-2.md) |
```

Se regenera al crear/editar/cambiar de estado una idea.

## B — Estados y ciclo de vida

| Estado | Glifo | Grupo | Motivo |
|---|---|---|---|
| pendiente | ○ | activa | — |
| haciendo | ◑ | activa | — |
| pausado | ⏸ | activa | **requerido** |
| hecho | ● | cerrada | — |
| rechazado | ✕ | cerrada | **requerido** |

- **Activas** (pendiente/haciendo/pausado) cuentan en el badge del diagrama.
- **Cerradas** (hecho/rechazado) no ensucian el canvas pero quedan en el panel
  (filtro) y en el índice (registro/anti-patrón).
- Cambiar a `pausado` o `rechazado` **exige un motivo** (se guarda en `motivo:` y
  se registra como comentario del sistema en el hilo).
- Promover a mejora es una **acción** (no un estado): crea `mejoras/<id>.md`,
  enlaza en ambos sentidos, y navega a la mejora.

## C — Interacción: modo idea + badge

**Modo idea** = toggle en la toolbar (reemplaza el "mostrar en el diagrama" del
Plan 3). Cuando está **ON**:
- Se muestran los badges 💡N (conteo de ideas **activas**) sobre los elementos
  anclados.
- **Clic en un elemento** del canvas → popover de ideas de ese elemento: lista de
  hilos + campo "nueva idea acá" (ancla en 1 paso = el elemento clickeado).
- **Clic en el badge** → abre la pestaña Ideas filtrada a ese elemento y abre su
  hilo.
- **OFF** → edición normal del diagrama, sin badges ni captura de clics (evita
  chocar con la edición, como el comment-mode de Figma).

El estado del toggle se persiste en `localStorage`.

## D — Panel de ideas + vista de hilo

**Panel (pestaña Ideas):**
- **Quick-add general** arriba (idea sin ancla).
- **Filtros**: estado (todas / pendiente / haciendo / pausado / hecho / rechazado /
  activas / cerradas) + alcance (todas / generales / ancladas).
- **Lista**: una fila por idea con:
  - **chip de estado con menú** (5 opciones) en la celda — el "cuadrito"
    tri/multi-estado. Cambiar a pausado/rechazado abre un mini-prompt de motivo.
  - texto (primera línea), chip del ancla (nombre del elemento o "general"),
    autor, contador de comentarios (💬N), y `→ mejora-N` si fue promovida.
  - **clic en la fila** → vista de hilo.

**Vista de hilo:**
- Descripción completa (editable).
- Comentarios (autor · fecha), en orden.
- Campo **"Comentar"** (append al hilo).
- Control de estado (con motivo si corresponde).
- Botón **"Promover a mejora"** → crea la nota de mejora, enlaza, navega a ella.

## E — Migración desde `_ideas.md` v1

El Plan 3 guarda ideas como una línea por idea
(`- [ ] (ancla) texto — autor, fecha`). Al abrir un diagrama que tiene `_ideas.md`
con líneas v1 y **no** tiene carpeta `ideas/`:
- Convertir cada línea a `ideas/idea-<n>.md` (`[x]`→`hecho`, `[ ]`→`pendiente`;
  ancla/autor/fecha del parseo; sin comentarios).
- Regenerar `_ideas.md` como índice.
- **Idempotente**: si ya existe `ideas/`, no migra. Nada se pierde (las líneas no
  parseables quedan en el archivo, que pasa a ser índice regenerado — la migración
  se hace desde el modelo parseado del Plan 3, `parseIdeas`).

## Módulos / archivos (propuesta)

Nuevos en `src/processDocs/` (siguen el patrón existente):

| Archivo | Responsabilidad |
|---|---|
| `ideaNote.ts` | Parse/serialize de una nota de idea (frontmatter + descripción + comentarios). Puro. |
| `ideaComments.ts` | Parse/serialize del hilo `## Comentarios`; `addComment`. Puro. |
| `mejoraNote.ts` | Parse/serialize de una nota de mejora. Puro. |
| `ideasIndex.ts` | Genera `_ideas.md` (todas las ideas, todos los estados). Puro. |
| `ideasMigrate.ts` | v1 (`parseIdeas`) → notas `ideas/<id>.md`. Puro. |
| `ideaState.ts` | Estados, grupos (activa/cerrada), validación de motivo, transiciones. Puro. |
| `ideasClient.ts` | IO vía `docsClient`/`fsClient`: listar/leer/escribir notas de idea y mejora, ids únicos, listar mejoras. |
| `ideasPanel.ts` | Reescrito: filtros + lista con chip de estado + abrir hilo. DOM. |
| `ideaThreadPanel.ts` | Vista de hilo: descripción, comentarios, comentar, estado, promover. DOM. |
| `ideaMode.ts` | Modo idea: toggle, clic en elemento del canvas, clic en badge. Integración. |

Modificados: `ideasOverlays.ts` (badge clickeable con `onClick`), `docsClient.ts`
(rutas `ideas/`/`mejoras/`), `notePanelController.ts` / `main.ts` (wiring del modo
idea, filtros, hilo, migración al abrir).

## Flujo de datos

1. Abrir diagrama → `ideasClient` lista `ideas/*.md`; si falta y hay `_ideas.md`
   v1 → `ideasMigrate`. Regenerar `_ideas.md` índice.
2. Modo idea ON → badges (activas) vía `ideasOverlays`. Clic en elemento/badge →
   popover/panel con el hilo.
3. Comentar / cambiar estado / promover → `ideasClient` escribe la nota (y la
   mejora) vía `fsClient`; regenerar índice.
4. Cambio externo (agente CLI edita una nota) → `watcher` recarga.

## Manejo de errores

- Nota con frontmatter inválido → se muestra el cuerpo crudo + aviso; no se pierde
  texto.
- `pausado`/`rechazado` sin motivo → la UI exige el motivo antes de guardar.
- Elemento anclado que ya no existe en el diagrama → la idea sigue en el panel como
  "ancla huérfana" (sin badge en el canvas); no se borra.
- Migración: si una línea v1 no parsea, se deja en el archivo y se sigue.

## Testing (Vitest + happy-dom)

- Puro: `ideaNote` (round-trip, motivo, mejora link), `ideaComments` (parse/append),
  `mejoraNote`, `ideasIndex2` (todas las ideas + escape), `ideasMigrate`
  (v1→notas, idempotencia), `ideaState` (grupos, motivo requerido, transiciones).
- DOM: `ideasPanel` (filtros por estado/alcance, chip de estado, abrir hilo),
  `ideaThreadPanel` (comentar, cambiar estado con motivo, promover).
- Integración: modo idea + clic en canvas/badge → build + verificación manual.

## Agent-friendliness

- Todo `.md` con frontmatter; `_ideas.md` índice completo (todos los estados +
  motivos) es lo que el agente lee para: proponer sin duplicar (ve las rechazadas),
  redactar comentarios, o convertir una idea madura en mejora.
- Actualizar `AGENTS.md` (raíz) con la convención de `ideas/`/`mejoras/`, los 5
  estados y el registro anti-patrón.

## Descomposición en planes

Spec grande → ~3 planes de implementación, cada uno usable:
1. **Modelo + migración + índice** (secciones A, B, E): notas de idea/mejora,
   estados, migración v1, índice generado. Sin UI nueva más allá de leer/escribir.
2. **Panel + hilo + estados/filtros** (sección D): reescribir el panel, vista de
   hilo, chip de estado con motivo, filtros, promover a mejora.
3. **Modo idea + badge** (sección C): toggle, clic en canvas/badge, overlays
   clickeables.

## Fuera de alcance

- Votos/ranking de ideas, tablero Kanban, asignados formales (era la ambición
  "mini-gestor", no elegida).
- Tiempo real / merge de conflictos de comentarios (se resuelve por la carpeta
  sincronizada + locks existentes, como el resto de la app).
