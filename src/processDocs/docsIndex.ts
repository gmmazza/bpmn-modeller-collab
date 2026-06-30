export interface IndexElement {
  id: string;
  name: string;
  type: string;
  hasNote: boolean;
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|");
}

export function buildIndexMarkdown(diagramId: string, processName: string, elements: IndexElement[]): string {
  const rows = elements.map((e) => {
    const note = e.hasNote ? `[${e.id}.md](${e.id}.md)` : "_(sin nota)_";
    return `| ${cell(e.name)} | ${cell(e.type)} | ${note} |`;
  });
  return [
    "---",
    `diagram: ${diagramId}`,
    "generated-by: BPMN compartida",
    "---",
    `# Índice del proceso: ${processName}`,
    "",
    "| Paso | Tipo | Nota |",
    "|------|------|------|",
    ...rows,
    "",
  ].join("\n");
}
