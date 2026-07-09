// Escalation-code scheme + in-memory resolution (A.3). Code = `<process-id>__<slug>`,
// process id (not filename) so it is rename-safe and consistent with A.2 resolve-by-id.
// Nothing is persisted here: codes are derived from live XML and matched in memory.
import type { EscalationEnd, MasterBoundary } from "./boundaryLinks";

export function outcomeSlug(name: string): string {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function escalationCodeFor(processId: string, outcomeName: string): string {
  return `${processId}__${outcomeSlug(outcomeName)}`;
}

export interface ResolvedOutcome {
  escalationCode: string;
  endId: string;
  outcomeName: string;
  boundaryId: string | null;
  outgoingTargetId: string | null;
}

export function resolveEscalations(
  sub: EscalationEnd[],
  masterBoundaries: MasterBoundary[],
): ResolvedOutcome[] {
  const byCode = new Map<string, MasterBoundary>();
  for (const b of masterBoundaries) if (!byCode.has(b.escalationCode)) byCode.set(b.escalationCode, b);
  return sub.map((e) => {
    const b = byCode.get(e.escalationCode) ?? null;
    return {
      escalationCode: e.escalationCode,
      endId: e.endId,
      outcomeName: e.name,
      boundaryId: b ? b.boundaryId : null,
      outgoingTargetId: b ? b.outgoingTargetId : null,
    };
  });
}
