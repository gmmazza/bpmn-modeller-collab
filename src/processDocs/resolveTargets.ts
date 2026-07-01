import type { EventRef, InterProcessRefs } from "./interProcessRefs";

export interface DiagramInfo {
  file: string;
  processId: string;
  baseName: string;
  refs: InterProcessRefs;
}

export function resolveCalledProcess(calledElement: string, diagrams: DiagramInfo[]): string | null {
  const byId = diagrams.find((d) => d.processId === calledElement);
  if (byId) return byId.file;
  const byName = diagrams.find((d) => d.baseName === calledElement);
  return byName ? byName.file : null;
}

export function findEventCounterpart(source: EventRef, sourceFile: string, diagrams: DiagramInfo[]): string | null {
  const wanted = source.direction === "throw" ? "catch" : "throw";
  for (const d of diagrams) {
    if (d.file === sourceFile) continue;
    if (d.refs.events.some((e) => e.kind === source.kind && e.refName === source.refName && e.direction === wanted)) {
      return d.file;
    }
  }
  return null;
}
