# Documentación de procesos (.docs/)

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
- `mejoras/<id>.md` — mejora derivada de una idea (`desde-idea: idea-3`). Ver `ideas.md`.
- `assets/` — imágenes referenciadas por las notas.

Para mejorar la documentación: leé `_index.md` para orientarte, editá las notas en lenguaje
natural (markdown), y respetá el frontmatter de cada nota. El `name` de la nota debe coincidir
con el label del elemento en el diagrama.

**Índices derivados:** `_index.md` y `_ideas.md` los regenera la app a partir del diagrama y de
las ideas. **No los edites a mano.**
