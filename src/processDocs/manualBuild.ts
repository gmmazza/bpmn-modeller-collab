export interface ManualStep { name: string; type: string; note: string | null }

export function friendlyType(type: string): string {
  if (type.endsWith("Task")) return "Tarea";
  if (type.endsWith("Gateway")) return "Compuerta";
  if (type.endsWith("Event")) return "Evento";
  if (type === "bpmn:SubProcess" || type === "bpmn:CallActivity") return "Subproceso";
  return type.replace(/^bpmn:/, "");
}

export function buildManualMarkdown(processName: string, processNote: string | null, steps: ManualStep[]): string {
  const parts: string[] = [`# Manual: ${processName}`, ""];
  if (processNote && processNote.trim()) parts.push(processNote.trim(), "");
  parts.push("---", "");
  steps.forEach((s, i) => {
    const name = s.name && s.name.trim() ? s.name : "(sin nombre)";
    parts.push(`## ${i + 1}. ${name}`, `*${friendlyType(s.type)}*`, "");
    parts.push(s.note && s.note.trim() ? s.note.trim() : "_Sin documentar._", "");
  });
  return parts.join("\n");
}
