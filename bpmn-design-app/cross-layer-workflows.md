# Trabajar entre capas (diagrama + documentación + ideas)

Estos procedimientos cruzan las tres capas. **Todos** respetan el protocolo proponer→publicar y la
firma IA (ver `AGENTS.md` y `ideas.md`).

## 1. Diseñar / editar integrado
Al agregar un elemento significativo (task / subproceso / gateway relevante) al diagrama →
creá o actualizá su nota `<elementId>.md` en `<nombre>.docs/` con el frontmatter correcto
(`element`, `name`, `type`, `diagram`). El `name` de la nota concuerda con el label del elemento.
Nunca edites `_index.md` / `_ideas.md` (derivados).

## 2. Revisar integrado (proponer, no pisar)
Un hallazgo de revisión → por defecto una **idea** anclada al elemento (`estado: pendiente`, firma
`IA`), **no** una edición silenciosa del `.bpmn`. Editá el `.bpmn` directo solo cuando corresponde y
respetando la reserva `.lock`/`.req` (ver `AGENTS.md`).

## 3. Idea → mejora
Cuando una idea madura, promovela: creá `mejoras/<id>.md` con `desde-idea: <id>`, enlazá
`mejora: <id>` en la idea, y registrá el cambio en `## Comentarios`.

## 4. Anclaje coherente
`ancla: <elementId>` debe existir en el diagrama (o `general` si es transversal). Mantené
`ancla-nombre` sincronizado con el label del elemento.

## 5. Orden de operaciones multi-capa
- Renombrás un elemento → actualizá su nota (`name`) **y** el `ancla-nombre` de las ideas que lo
  referencian.
- Borrás un elemento → resolvé/marcá sus ideas y su nota; no dejes referencias colgando.

## 6. Vos vs. la app
Los índices derivados (`_index.md`, `_ideas.md`) los regenera la app — no los toques.

## 7. Validación integrada
- Diagrama: `python _bpmn-design/scripts/validate_bpmn.py <archivo.bpmn>` chequea el invariante de
  render (semantic↔DI 1:1), *si tenés Python*. Ver `_bpmn-design/SKILL.md`.
- Coherencia diagrama↔notas: toda nota de elemento apunta a un elemento que existe en el diagrama.
