export function docsDir(diagramId: string): string {
  return diagramId.replace(/\.bpmn$/i, ".docs");
}

export function notePath(diagramId: string, elementId: string): string {
  return `${docsDir(diagramId)}/${elementId}.md`;
}

export function processNotePath(diagramId: string): string {
  return `${docsDir(diagramId)}/_proceso.md`;
}

export function indexPath(diagramId: string): string {
  return `${docsDir(diagramId)}/_index.md`;
}

export function assetsDir(diagramId: string): string {
  return `${docsDir(diagramId)}/assets`;
}

export function ideasPath(diagramId: string): string {
  return `${docsDir(diagramId)}/_ideas.md`;
}
