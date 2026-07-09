// Stage-view overlays (A.3): "◀ viene de" on the single none-start (derived from the
// master), and "▶ va a" on each end (normal → the Call Activity's normal successor;
// escalation → its boundary's outgoing target). Navigable. Pure model builder + a thin
// mount helper over a diagram-js overlays host (mirrors processDocs/ideasOverlays.ts).
// @ts-expect-error no type declarations published
import { BpmnModdle } from "bpmn-moddle";
import { parseSubprocessBoundaries, parseMasterBoundaries } from "./boundaryLinks";
import { resolveEscalations } from "./escalationCode";
import { deriveEntrySources, type EntrySource } from "./entrySources";

export interface StageExit {
  endId: string;
  label: string;
  targetMasterId: string | null;
  kind: "normal" | "escalation";
}
export interface StageOverlayModel {
  entry: { startId: string; sources: EntrySource[] } | null;
  exits: StageExit[];
}

// Find the Call Activity's normal (plain) outgoing target in the master: the sequence
// flow leaving the Call Activity box itself (boundary flows leave the boundary event).
async function normalSuccessorId(masterXml: string, callActivityId: string): Promise<string | null> {
  const moddle = new BpmnModdle();
  const { rootElement } = await (moddle as any).fromXML(masterXml);
  const process = (rootElement.rootElements ?? []).find((r: any) => (r.$type ?? "").endsWith("Process"));
  for (const fe of process?.flowElements ?? []) {
    if ((fe.$type ?? "").endsWith("SequenceFlow") && fe.sourceRef?.id === callActivityId) {
      return fe.targetRef?.id ?? null;
    }
  }
  return null;
}

export async function buildStageOverlayModel(args: {
  stageXml: string; masterXml: string; callActivityId: string;
  resolveName(masterElementId: string): string;
}): Promise<StageOverlayModel> {
  const sub = await parseSubprocessBoundaries(args.stageXml);
  const entry = sub.noneStartId
    ? { startId: sub.noneStartId, sources: await deriveEntrySources(args.masterXml, args.callActivityId) }
    : null;

  const exits: StageExit[] = [];
  const successorId = await normalSuccessorId(args.masterXml, args.callActivityId);
  for (const normalEndId of sub.ends.normal) {
    const name = successorId ? args.resolveName(successorId) : "";
    exits.push({
      endId: normalEndId,
      label: `▶ va a: ${name || "(fin del mapa)"}`,
      targetMasterId: successorId,
      kind: "normal",
    });
  }
  const boundaries = await parseMasterBoundaries(args.masterXml);
  const resolved = resolveEscalations(sub.ends.escalations, boundaries);
  for (const r of resolved) {
    const name = r.outgoingTargetId ? args.resolveName(r.outgoingTargetId) : "";
    exits.push({
      endId: r.endId,
      label: `▶ va a: ${name || "(sin destino)"}`,
      targetMasterId: r.outgoingTargetId,
      kind: "escalation",
    });
  }
  return { entry, exits };
}

export interface StageOverlayHost { add(elementId: string, html: HTMLElement): string; remove(id: string): void }

export function mountStageOverlays(
  host: StageOverlayHost,
  model: StageOverlayModel,
  nav: { goToSource(s: EntrySource): void; goToExit(masterId: string | null): void },
): { clear(): void } {
  const ids: string[] = [];
  function add(elementId: string, el: HTMLElement): void {
    try { ids.push(host.add(elementId, el)); } catch { /* not on canvas — skip */ }
  }
  if (model.entry) {
    const el = document.createElement("div");
    el.className = "stage-entry-badge subproc-badge-clickable";
    const names = model.entry.sources.map((s) => s.name || s.elementId).join(", ");
    el.textContent = `◀ viene de: ${names || "(inicio)"}`;
    el.title = "Ir al mapa y resaltar el origen";
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const first = model.entry!.sources[0];
      if (first) nav.goToSource(first);
    });
    add(model.entry.startId, el);
  }
  for (const exit of model.exits) {
    const el = document.createElement("div");
    el.className = `stage-exit-badge subproc-badge-clickable stage-exit-${exit.kind}`;
    el.textContent = exit.label;
    el.title = "Ir al destino en el mapa";
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      nav.goToExit(exit.targetMasterId);
    });
    add(exit.endId, el);
  }
  return {
    clear(): void { for (const id of ids) { try { host.remove(id); } catch { /* gone */ } } ids.length = 0; },
  };
}
