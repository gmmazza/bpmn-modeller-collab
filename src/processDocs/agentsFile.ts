export const AGENTS_MD = `# Convención de documentación de procesos (BPMN compartida)

Cada diagrama \`<nombre>.bpmn\` tiene una carpeta hermana \`<nombre>.docs/\` con:

- \`_proceso.md\` — overview del proceso (para qué sirve, dueño, alcance).
- \`_index.md\` — índice DERIVADO del diagrama (no editar a mano; lo regenera la app).
- \`<elementId>.md\` — nota de un paso. Empieza con frontmatter:
  \`\`\`
  ---
  element: Activity_0x9f2
  name: Validar factura
  type: bpmn:Task
  diagram: <nombre>.bpmn
  ---
  \`\`\`
- \`ideas/<id>.md\` — una idea (anotación anclada con hilo). Frontmatter:
  \`\`\`
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
  \`\`\`
- \`mejoras/<id>.md\` — mejora derivada de una idea (\`desde-idea: idea-3\`).
- \`_ideas.md\` — índice DERIVADO de todas las ideas (no editar; lo regenera la app).
- \`assets/\` — imágenes referenciadas por las notas.

Para mejorar la documentación: leé \`_index.md\`/\`_ideas.md\` para orientarte, editá las
notas en lenguaje natural (markdown), y respetá el frontmatter de cada nota.

## Convención para agentes IA

Cuando un agente edita estos archivos, **firmá tus entradas como autor \`IA\`** (o el
nombre de agente configurado) para que la app las atribuya a la IA:

- **Comentario:** agregá una viñeta bajo \`## Comentarios\`:
  \`- IA, YYYY-MM-DD: <texto>\`
- **Cambio de estado:** actualizá \`estado:\` en el frontmatter **y** registrá el cambio
  como una viñeta de log en \`## Comentarios\`:
  \`- IA, YYYY-MM-DD: [<estado>] <motivo si aplica>\`
  (Si cambiás \`estado:\` sin registrar la viñeta, la app detecta la edición externa y
  la registra automáticamente como una entrada de la IA.)

La app muestra las entradas de autores IA con un marcador 🤖 e intercala los cambios
de estado con los comentarios por fecha (con un toggle para mostrar/ocultar).
`;

export async function ensureAgentsFile(api: {
  readPath(rel: string): Promise<string | null>;
  writePath(rel: string, text: string): Promise<void>;
}): Promise<void> {
  if ((await api.readPath("AGENTS.md")) !== null) return;
  await api.writePath("AGENTS.md", AGENTS_MD);
}
