# Convención de documentación de procesos (BPMN compartida)

Cada diagrama `<nombre>.bpmn` tiene una carpeta hermana `<nombre>.docs/` con:

- `_proceso.md` — overview del proceso (para qué sirve, dueño, alcance).
- `_index.md` — índice DERIVADO del diagrama (no editar a mano; lo regenera la app).
- `<elementId>.md` — nota de un paso. Empieza con frontmatter:
  ```
  ---
  element: Activity_0x9f2
  name: Validar factura
  type: bpmn:Task
  diagram: <nombre>.bpmn
  ---
  ```
- `ideas/<id>.md` — una idea (anotación anclada con hilo). Frontmatter:
  ```
  ---
  id: idea-3
  estado: haciendo        # pendiente | haciendo | pausado | hecho | rechazado
  ancla: Activity_1       # elementId, o "general"
  ancla-nombre: Validar factura
  autor: Ana
  fecha: 2026-07-01
  motivo:                 # requerido si estado = pausado | rechazado
  mejora:                 # opcional: id de la mejora si se promovió
  ---
  <descripción>

  ## Comentarios
  - Beto, 2026-07-02: ¿y en el dashboard?
  ```
- `mejoras/<id>.md` — mejora derivada de una idea (`desde-idea: idea-3`).
- `_ideas.md` — índice DERIVADO de todas las ideas (no editar; lo regenera la app).
- `assets/` — imágenes referenciadas por las notas.

Para mejorar la documentación: leé `_index.md`/`_ideas.md` para orientarte, editá las
notas en lenguaje natural (markdown), y respetá el frontmatter de cada nota.

## Convención para agentes IA

Cuando un agente edita estos archivos, **firmá tus entradas como autor `IA`** (o el
nombre de agente configurado) para que la app las atribuya a la IA:

- **Comentario:** agregá una viñeta bajo `## Comentarios`:
  `- IA, YYYY-MM-DD: <texto>`
- **Cambio de estado:** actualizá `estado:` en el frontmatter **y** registrá el cambio
  como una viñeta de log en `## Comentarios`:
  `- IA, YYYY-MM-DD: [<estado>] <motivo si aplica>`
  (Si cambiás `estado:` sin registrar la viñeta, la app detecta la edición externa y
  la registra automáticamente como una entrada de la IA.)

La app muestra las entradas de autores IA con un marcador 🤖 e intercala los cambios
de estado con los comentarios por fecha (con un toggle para mostrar/ocultar).

## Edición de diagramas (.bpmn): borrador/publicar y reservas

La app usa un modelo **optimista**: cada persona edita un **borrador local privado** y
**Publica** cuando quiere. La edición nunca requiere un bloqueo. El `.lock` ya no es un
candado duro: es una **reserva** *advisory* (aviso "estoy trabajando en esto"), con
vencimiento opcional (`lockedUntil`). **Nunca te bloquea técnicamente.**

Tu flujo principal como agente es **proponer → que el humano revise y publique**:

- Preferí dejar tus aportes como **ideas/comentarios** (ver arriba) para que la persona
  los revise y publique. Es el camino recomendado.
- Podés **editar el `<nombre>.bpmn` directo** cuando corresponde: la app detecta el
  cambio externo y lo recarga (si la persona tiene trabajo sin publicar, le muestra un
  diff para resolver — no pierde nada).

Respetá las reservas de humanos:

- Si existe `<nombre>.bpmn.lock` (JSON con `lockedByName`) y su `lockedUntil` no venció,
  alguien lo reservó. No estás bloqueado, pero **evitá pisar**: preferí proponer.
- Para pedir el turno, escribí `<nombre>.bpmn.req` con
  `{ "by": "IA", "name": "IA", "at": "<fecha ISO>", "kind": "edit" }` (usá `"kind":
  "publish"` si querés que publique). La app le avisa a quien reservó. Cuando el `.lock`
  desaparezca o venza, editá y borrá tu `.req`.

Las **ideas** son siempre compartidas: editalas libremente, sin reservas.
