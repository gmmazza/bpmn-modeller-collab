# Documentación de procesos (.docs/)

Cada diagrama `<nombre>.bpmn` tiene una carpeta hermana `<nombre>.docs/` con:

- `_proceso.md` — overview del proceso (para qué sirve, dueño, alcance). Es también la
  **introducción del manual** (ver abajo).
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
- `mejoras/<id>.md` — mejora derivada de una idea (`desde-idea: idea-3`). Ver `ideas.md`.
- `assets/` — imágenes referenciadas por las notas con links relativos
  (`![captura](assets/pantalla.png)`). No generes imágenes; preservá las referencias existentes.

## Qué documentar (cobertura)

- Todo proceso lleva `_proceso.md`.
- **Elemento significativo** → nota `<elementId>.md`: tasks (manual / user / service), call
  activities / subprocesos, y gateways de decisión relevantes.
- Eventos triviales, flujos y end events **no** llevan nota.

## Plantilla: `_proceso.md`

Funciona como apertura del manual — escribilo para un lector que no vio el diagrama:

```markdown
# <Nombre del proceso>

**Propósito:** <para qué existe, en una frase>
**Alcance:** una instancia = <qué dispara una ejecución y dónde termina>
**Actores:** <lanes / roles involucrados>
**Resultados:** <estados finales posibles>

<1–2 párrafos de contexto: cuándo aplica, qué NO cubre, relación con otros procesos —
usá wikilinks, ej. [[facturacion#Task_emitir]].>
```

## Plantilla: nota de paso

3–6 líneas de prosa autocontenida — qué hace el paso, quién lo hace, entradas/salidas,
casos borde. **No repitas el título del paso como encabezado** (el manual ya lo agrega).

```markdown
---
element: Task_validar
name: Validar factura
type: bpmn:UserTask
diagram: compras.bpmn
---
El responsable de compras revisa la factura contra la orden de compra: importes, CUIT y
condición de IVA. Si algo no coincide, el caso sigue por [[compras#Gateway_ok]] hacia el
rechazo. Cambio motivado por [[idea:idea-3]].
```

## Wikilinks

Las notas soportan tres tipos de link navegable (la app los resuelve y autocompleta):

- `[[proceso#elementId]]` — a un elemento, del mismo proceso o de otro (ej. `[[compras#Task_validar]]`).
- `[[idea:idea-3]]` — a una idea.
- `[[nota]]` — a otra nota por nombre.

Usalos para conectar pasos relacionados y las ideas que motivaron un cambio — texto plano
sin links pierde la navegación que la app ofrece.

## El manual

La app ensambla `_proceso.md` + las notas de paso **en orden de flujo** en un manual
exportable (`## 1. <Paso>`, `## 2. …`). Por eso cada nota debe ser autocontenida, leerse
bien en secuencia y no llevar encabezados que dupliquen el título del paso.

## Proceso nuevo

Si `<nombre>.docs/` no existe, creala con `_proceso.md` y las notas de los elementos
significativos. **Nunca** crees `_index.md` ni `_ideas.md` — son derivados y los genera la app.

## Mejorar documentación existente

Leé `_index.md` para orientarte, editá las notas en lenguaje natural (markdown), y respetá
el frontmatter de cada nota. El `name` de la nota debe coincidir con el label del elemento
en el diagrama.

**Índices derivados:** `_index.md` y `_ideas.md` los regenera la app a partir del diagrama y de
las ideas. **No los edites a mano.**
