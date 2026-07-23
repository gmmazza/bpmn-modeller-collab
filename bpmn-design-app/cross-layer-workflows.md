# Trabajar entre capas (diagrama + documentación + ideas)

Estos procedimientos cruzan las tres capas. **Todos** respetan el protocolo proponer→publicar y la
firma IA (ver `AGENTS.md` y `ideas.md`).

## 1. Diseñar / editar integrado
**Antes de diseñar**, leé la capa existente como input: `<nombre>.docs/_proceso.md`, `_index.md`
y las ideas del proceso (lo que no exista, saltealo). **Después de diseñar**, documentá lo que
tocaste: creá/actualizá `_proceso.md` + la nota `<elementId>.md` de cada elemento significativo
— criterio de cobertura y plantillas en `documentation.md` — con el frontmatter correcto
(`element`, `name`, `type`, `diagram`); el `name` concuerda con el label del elemento.
Nunca edites `_index.md` / `_ideas.md` (derivados).

## 2. Revisar integrado (proponer, no pisar)
Un hallazgo de revisión → por defecto una **idea** anclada al elemento (`estado: pendiente`, firma
`IA`), **no** una edición silenciosa del `.bpmn`. Editá el `.bpmn` directo solo cuando corresponde y
respetando la reserva `.lock`/`.req` (ver `AGENTS.md`).

Si tu cambio de diseño **resuelve o afecta una idea existente**, dejá una viñeta firmada en su
`## Comentarios` (`- IA, YYYY-MM-DD: <qué hiciste>`). No cambies su `estado:` — eso lo decide
un humano.

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
