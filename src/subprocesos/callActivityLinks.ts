export interface CallLink { elementId: string; name: string; calledElement: string }

export function callLinksFromEls(
  els: { id: string; name: string; type: string; calledElement?: string }[],
): CallLink[] {
  return els
    .filter((e) => e.type.endsWith("CallActivity") && e.calledElement)
    .map((e) => ({ elementId: e.id, name: e.name ?? "", calledElement: e.calledElement! }));
}

function slug(name: string): string {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // strip accents
    .replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function freshProcessId(baseName: string, taken: Set<string>): string {
  const base = `Process_${slug(baseName) || "sub"}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) { const c = `${base}_${n}`; if (!taken.has(c)) return c; }
}

export function newSubprocessSkeleton(name: string, taken: Set<string>): { xml: string; processId: string } {
  const processId = freshProcessId(name, taken);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_${processId}" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="${processId}" name="${name.replace(/"/g, "&quot;")}" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${processId}">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="160" y="100" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
  return { xml, processId };
}

// --- Modeler-touching helpers (standard bpmn-js services). Thin by design. ---

// Convert `element` to a bpmn:CallActivity if needed, then set calledElement. Returns the
// (possibly replaced) element. Uses bpmnReplace (keeps position/label) + modeling.
export function linkBox(modeler: { get(s: string): any }, element: any, processId: string): any {
  let el = element;
  if (!el.type.endsWith("CallActivity")) {
    el = modeler.get("bpmnReplace").replaceElement(el, { type: "bpmn:CallActivity" });
  }
  modeler.get("modeling").updateProperties(el, { calledElement: processId });
  return el;
}

export function unlinkBox(modeler: { get(s: string): any }, element: any): void {
  modeler.get("modeling").updateProperties(element, { calledElement: undefined });
}
