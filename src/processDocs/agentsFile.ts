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
- \`_ideas.md\` — bandeja de ideas sueltas (casillas \`- [ ]\` pendiente / \`- [x]\` procesada).
- \`assets/\` — imágenes referenciadas por las notas.

Para mejorar la documentación: leé \`_index.md\` para orientarte, editá las notas en
lenguaje natural (markdown), y respetá el frontmatter de cada nota.
`;

export async function ensureAgentsFile(api: {
  readPath(rel: string): Promise<string | null>;
  writePath(rel: string, text: string): Promise<void>;
}): Promise<void> {
  if ((await api.readPath("AGENTS.md")) !== null) return;
  await api.writePath("AGENTS.md", AGENTS_MD);
}
