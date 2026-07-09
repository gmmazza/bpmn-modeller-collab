// Derive "viene de" predecessors of a master Call Activity: walk upstream through
// gateways/joins to the nearest meaningful predecessors (other Call Activities or the
// master start). Pure + backend-agnostic; the "viene de X" relation is NOT modeled in
// the subprocess, it is derived here from the master flow.
// @ts-expect-error no type declarations published
import { BpmnModdle } from "bpmn-moddle";

export interface EntrySource {
  kind: "callActivity" | "start";
  elementId: string;
  name: string;
  processId: string | null;
}

export async function deriveEntrySources(masterXml: string, callActivityId: string): Promise<EntrySource[]> {
  const moddle = new BpmnModdle();
  const { rootElement } = await (moddle as any).fromXML(masterXml);
  const process = (rootElement.rootElements ?? []).find((r: any) => (r.$type ?? "").endsWith("Process"));
  const flow: any[] = process?.flowElements ?? [];

  const byId = new Map<string, any>();
  for (const fe of flow) byId.set(fe.id, fe);
  // targetId -> [sourceId...] via sequence flows
  const sourcesOf = new Map<string, string[]>();
  for (const fe of flow) {
    if ((fe.$type ?? "").endsWith("SequenceFlow") && fe.targetRef?.id && fe.sourceRef?.id) {
      const arr = sourcesOf.get(fe.targetRef.id) ?? [];
      arr.push(fe.sourceRef.id);
      sourcesOf.set(fe.targetRef.id, arr);
    }
  }

  const out: EntrySource[] = [];
  const seenOut = new Set<string>();
  const visited = new Set<string>();

  function walk(targetId: string): void {
    for (const srcId of sourcesOf.get(targetId) ?? []) {
      if (visited.has(srcId)) continue;
      visited.add(srcId);
      const el = byId.get(srcId);
      const type: string = el?.$type ?? "";
      if (type.endsWith("Gateway")) {
        walk(srcId); // gateways are transparent
      } else if (type.endsWith("CallActivity")) {
        if (!seenOut.has(srcId)) {
          seenOut.add(srcId);
          out.push({ kind: "callActivity", elementId: srcId, name: el.name ?? "", processId: el.calledElement ?? null });
        }
      } else if (type.endsWith("StartEvent")) {
        if (!seenOut.has(srcId)) {
          seenOut.add(srcId);
          out.push({ kind: "start", elementId: srcId, name: el.name ?? "", processId: null });
        }
      } else {
        // any other node (task/event): treat as opaque predecessor boundary
        if (!seenOut.has(srcId)) {
          seenOut.add(srcId);
          out.push({ kind: "callActivity", elementId: srcId, name: el?.name ?? "", processId: el?.calledElement ?? null });
        }
      }
    }
  }

  walk(callActivityId);
  return out;
}
