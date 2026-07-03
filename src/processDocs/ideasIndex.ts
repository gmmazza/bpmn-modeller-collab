// src/processDocs/ideasIndex.ts
import type { IdeaNote } from "./ideaNote";

function cell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
function firstLine(s: string): string {
  return s.split("\n")[0] ?? "";
}
function outcome(i: IdeaNote): string {
  if (i.mejora) return `[${i.mejora}](mejoras/${i.mejora}.md)`;
  const link = `[${i.id}](ideas/${i.id}.md)`;
  return i.motivo ? `${cell(i.motivo)} · ${link}` : link;
}

export function buildIdeasIndex(diagramId: string, processName: string, ideas: IdeaNote[]): string {
  const rows = ideas.map((i) =>
    `| ${cell(firstLine(i.description))} | ${i.estado} | ${cell(i.anchor ? (i.anchorLabel || i.anchor) : "general")} | ${cell(i.autor)} | ${outcome(i)} |`,
  );
  return [
    "---",
    `diagram: ${diagramId}`,
    "generated-by: BPMN compartida",
    "---",
    `# Ideas — ${processName}`,
    "",
    "| Idea | Estado | Ancla | Autor | Motivo / Mejora |",
    "|------|--------|-------|-------|-----------------|",
    ...rows,
    "",
  ].join("\n");
}
