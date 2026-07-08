import type { CallLink } from "./callActivityLinks";

export type LinkStatus =
  | { elementId: string; state: "resolved"; file: string; calledElement: string }
  | { elementId: string; state: "unresolved"; calledElement: string }
  | { elementId: string; state: "ambiguous"; calledElement: string };

export function classifyLinks(
  links: CallLink[],
  reg: { resolve(id: string): { file: string } | null; ambiguities(): string[] },
): LinkStatus[] {
  const ambiguous = new Set(reg.ambiguities());
  return links.map((l) => {
    if (ambiguous.has(l.calledElement)) return { elementId: l.elementId, state: "ambiguous", calledElement: l.calledElement };
    const hit = reg.resolve(l.calledElement);
    if (hit) return { elementId: l.elementId, state: "resolved", file: hit.file, calledElement: l.calledElement };
    return { elementId: l.elementId, state: "unresolved", calledElement: l.calledElement };
  });
}
