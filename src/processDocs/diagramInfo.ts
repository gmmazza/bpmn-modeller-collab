// bpmn-moddle ships without type declarations; shape verified at runtime:
// fromXML → { rootElement: bpmn:Definitions, elementsById, references, warnings }
// rootElement.rootElements: [bpmn:Message|bpmn:Signal|bpmn:Process...]
// process.flowElements: [...elements...]
// eventDefs[0].messageRef / .signalRef → resolved object with .id and .name (not a raw id string)
// @ts-expect-error no type declarations published
import { BpmnModdle } from "bpmn-moddle";
import { extractInterProcessRefs, type InterProcessRefs, type RawEl } from "./interProcessRefs";

function eventKindOf(defType: string): "message" | "signal" | "link" | null {
  if (defType.includes("MessageEventDefinition")) return "message";
  if (defType.includes("SignalEventDefinition")) return "signal";
  if (defType.includes("LinkEventDefinition")) return "link";
  return null;
}

function isThrowType(type: string): boolean {
  return type.includes("ThrowEvent") || type.includes("EndEvent");
}

export function normalizeModdleElements(defs: any): { processId: string; els: RawEl[] } {
  const rootElements: any[] = defs.rootElements ?? [];
  const process = rootElements.find((r) => (r.$type ?? "").endsWith("Process"));
  const els: RawEl[] = [];
  const flow: any[] = process?.flowElements ?? [];
  for (const fe of flow) {
    const type: string = fe.$type ?? "";
    const el: RawEl = { id: fe.id, name: fe.name ?? "", type };
    if (type.endsWith("CallActivity") && fe.calledElement) {
      el.calledElement = fe.calledElement;
    }
    const defsArr: any[] = fe.eventDefinitions ?? [];
    if (defsArr.length) {
      const kind = eventKindOf(defsArr[0].$type ?? "");
      if (kind) {
        el.eventKind = kind;
        el.isThrow = isThrowType(type);
        // messageRef/signalRef are resolved objects (not raw id strings) in bpmn-moddle v10
        const ref = defsArr[0].messageRef ?? defsArr[0].signalRef;
        if (ref?.name) {
          el.eventRefName = ref.name;
        } else if (kind === "link" && defsArr[0].name) {
          el.eventRefName = defsArr[0].name;
        }
      }
    }
    els.push(el);
  }
  return { processId: process?.id ?? "", els };
}

export async function parseDiagramInfo(
  xml: string
): Promise<{ processId: string; refs: InterProcessRefs }> {
  const moddle = new BpmnModdle();
  const { rootElement } = await (moddle as any).fromXML(xml);
  const { processId, els } = normalizeModdleElements(rootElement);
  return { processId, refs: extractInterProcessRefs(els) };
}

// Single-parse helper for consumers that only need the raw elements (e.g. to pull
// call-activity `calledElement` links) — avoids re-parsing the same XML that
// parseDiagramInfo already parsed internally.
export async function parseCallLinks(xml: string): Promise<RawEl[]> {
  const moddle = new BpmnModdle();
  const { rootElement } = await (moddle as any).fromXML(xml);
  return normalizeModdleElements(rootElement).els;
}
