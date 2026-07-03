import type { IdeaNote } from "./ideaNote";
import { isActive, isClosed, type IdeaState } from "./ideaState";

export type EstadoFilter = IdeaState | "todas" | "activas" | "cerradas";
export type ScopeFilter = "todas" | "generales" | "ancladas";

function matchEstado(estado: IdeaState, f: EstadoFilter): boolean {
  if (f === "todas") return true;
  if (f === "activas") return isActive(estado);
  if (f === "cerradas") return isClosed(estado);
  return estado === f;
}
function matchScope(anchor: string | null, f: ScopeFilter): boolean {
  if (f === "todas") return true;
  if (f === "generales") return anchor === null;
  return anchor !== null;
}

export function filterIdeas(ideas: IdeaNote[], f: { estado: EstadoFilter; scope: ScopeFilter }): IdeaNote[] {
  return ideas.filter((i) => matchEstado(i.estado, f.estado) && matchScope(i.anchor, f.scope));
}

export function activeAnchoredCounts(ideas: IdeaNote[]): Array<{ elementId: string; count: number }> {
  const map = new Map<string, number>();
  for (const i of ideas) if (isActive(i.estado) && i.anchor) map.set(i.anchor, (map.get(i.anchor) ?? 0) + 1);
  return [...map.entries()].map(([elementId, count]) => ({ elementId, count }));
}
