# Ideas y mejoras

## Ideas

`ideas/<id>.md` — una idea (anotación anclada con hilo). Frontmatter:
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

`_ideas.md` — índice DERIVADO de todas las ideas (no editar; lo regenera la app).

- `ancla: <elementId>` debe existir en el diagrama; si la idea es transversal, usá `ancla: general`.
- Mantené `ancla-nombre` sincronizado con el label del elemento anclado.

## Mejoras

`mejoras/<id>.md` — mejora derivada de una idea, con `desde-idea: <id>` en el frontmatter. Al
promover una idea a mejora, enlazá `mejora: <id>` en la idea y registralo en `## Comentarios`.

## Firma de agentes IA

Cuando un agente edita estos archivos, **firmá tus entradas como autor `IA`** (o el nombre de
agente configurado) para que la app las atribuya a la IA:

- **Comentario:** agregá una viñeta bajo `## Comentarios`:
  `- IA, YYYY-MM-DD: <texto>`
- **Cambio de estado:** actualizá `estado:` en el frontmatter **y** registrá el cambio como una
  viñeta de log en `## Comentarios`:
  `- IA, YYYY-MM-DD: [<estado>] <motivo si aplica>`
  (Si cambiás `estado:` sin registrar la viñeta, la app detecta la edición externa y la registra
  automáticamente como una entrada de la IA.)

La app muestra las entradas de autores IA con un marcador 🤖 e intercala los cambios de estado con
los comentarios por fecha (con un toggle para mostrar/ocultar).

Las **ideas** son siempre compartidas: editalas libremente, sin reservas.
