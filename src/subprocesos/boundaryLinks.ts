// Parse the subprocess boundary contract (A.3) out of a .bpmn, backend-agnostic and
// pure. Mirrors processDocs/diagramInfo.ts's moddle usage. Global escalations live in
// rootElements; an escalation end/boundary carries eventDefinitions[0].escalationRef,
// a resolved bpmn:Escalation with .escalationCode. Boundary target is resolved via the
// sequence flow whose sourceRef is the boundary.
// @ts-expect-error no type declarations published
import { BpmnModdle } from "bpmn-moddle";

export interface EscalationEnd { endId: string; name: string; escalationCode: string }
export interface EndClassification { normal: string[]; escalations: EscalationEnd[] }
export interface SubprocessBoundaryInfo {
  processId: string;
  startEventIds: string[];
  noneStartId: string | null;
  ends: EndClassification;
}
export interface MasterBoundary {
  boundaryId: string;
  callActivityId: string;
  escalationCode: string;
  interrupting: boolean;
  outgoingTargetId: string | null;
}

function firstProcess(defs: any): any {
  return (defs.rootElements ?? []).find((r: any) => (r.$type ?? "").endsWith("Process"));
}

function escalationDef(fe: any): any | null {
  const ed = (fe.eventDefinitions ?? [])[0];
  return ed && (ed.$type ?? "").endsWith("EscalationEventDefinition") ? ed : null;
}

async function parse(xml: string): Promise<any> {
  const moddle = new BpmnModdle();
  const { rootElement } = await (moddle as any).fromXML(xml);
  return rootElement;
}

export async function parseSubprocessBoundaries(xml: string): Promise<SubprocessBoundaryInfo> {
  const defs = await parse(xml);
  const process = firstProcess(defs);
  const flow: any[] = process?.flowElements ?? [];
  const startEventIds: string[] = [];
  const normal: string[] = [];
  const escalations: EscalationEnd[] = [];
  for (const fe of flow) {
    const type: string = fe.$type ?? "";
    if (type.endsWith("StartEvent")) {
      startEventIds.push(fe.id);
    } else if (type.endsWith("EndEvent")) {
      const ed = escalationDef(fe);
      const code = ed?.escalationRef?.escalationCode;
      if (code) escalations.push({ endId: fe.id, name: fe.name ?? "", escalationCode: code });
      else normal.push(fe.id);
    }
  }
  // "none start" = exactly one start event that carries no event definition.
  const noneStarts = flow.filter(
    (fe) => (fe.$type ?? "").endsWith("StartEvent") && (fe.eventDefinitions ?? []).length === 0,
  );
  const noneStartId = startEventIds.length === 1 && noneStarts.length === 1 ? noneStarts[0].id : null;
  return { processId: process?.id ?? "", startEventIds, noneStartId, ends: { normal, escalations } };
}

export async function parseMasterBoundaries(xml: string): Promise<MasterBoundary[]> {
  const defs = await parse(xml);
  const process = firstProcess(defs);
  const flow: any[] = process?.flowElements ?? [];
  // boundaryId -> targetRef.id via sequence flows
  const targetOf = new Map<string, string>();
  for (const fe of flow) {
    if ((fe.$type ?? "").endsWith("SequenceFlow") && fe.sourceRef?.id) {
      if (!targetOf.has(fe.sourceRef.id)) targetOf.set(fe.sourceRef.id, fe.targetRef?.id ?? "");
    }
  }
  const out: MasterBoundary[] = [];
  for (const fe of flow) {
    if (!(fe.$type ?? "").endsWith("BoundaryEvent")) continue;
    const ed = escalationDef(fe);
    const code = ed?.escalationRef?.escalationCode;
    if (!code || !fe.attachedToRef?.id) continue;
    out.push({
      boundaryId: fe.id,
      callActivityId: fe.attachedToRef.id,
      escalationCode: code,
      interrupting: fe.cancelActivity !== false,
      outgoingTargetId: targetOf.get(fe.id) ?? null,
    });
  }
  return out;
}
