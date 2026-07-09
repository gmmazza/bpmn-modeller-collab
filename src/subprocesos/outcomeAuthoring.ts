// Assisted-authoring transforms for the subprocess exit contract (A.3). No hand-modeling
// of symbols: the UI calls these to convert a plain none-end into an escalation end (and
// back), and to attach/detach the matching interrupting escalation boundary on the master
// Call Activity. All mutations go through bpmn-js modeling / moddle so the command stack
// (and the app's coarse-undo layer) captures them.
import { escalationCodeFor } from "./escalationCode";

function definitionsOf(modeler: { get(s: string): any }): any {
  // Deliberately NOT `modeler.get("canvas").getRootElement().businessObject.$parent`:
  // in happy-dom, calling canvas.getRootElement() lazily triggers Canvas._setRoot,
  // which fires an event that Overlays handles by calling canvas.viewbox() — and
  // tiny-svg's transform() calls `transformList.consolidate()`, a method happy-dom's
  // SVGTransformList doesn't implement, so it throws before $parent is ever reached.
  // BaseViewer.getDefinitions() is the public accessor for the same parsed
  // bpmn:Definitions (set directly by importXML) and never touches the canvas.
  const anyModeler = modeler as any;
  if (typeof anyModeler.getDefinitions === "function") return anyModeler.getDefinitions();
  // bpmn-js internal fallback (v18): _definitions is what importXML populates.
  return anyModeler._definitions;
}

export function markEndAsEscalation(
  modeler: { get(s: string): any },
  endElement: any,
  args: { processId: string; outcomeName: string },
): string {
  const bpmnFactory = modeler.get("bpmnFactory");
  const modeling = modeler.get("modeling");
  const code = escalationCodeFor(args.processId, args.outcomeName);
  const defs = definitionsOf(modeler);

  // Reuse an existing escalation with this code, or declare a new root element.
  let escalation = (defs.rootElements ?? []).find(
    (r: any) => (r.$type ?? "").endsWith("Escalation") && r.escalationCode === code,
  );
  if (!escalation) {
    escalation = bpmnFactory.create("bpmn:Escalation", {
      id: `Escalation_${code}`, name: args.outcomeName, escalationCode: code,
    });
    defs.rootElements.push(escalation);
  }
  const def = bpmnFactory.create("bpmn:EscalationEventDefinition", { escalationRef: escalation });
  def.$parent = endElement.businessObject;
  modeling.updateProperties(endElement, { eventDefinitions: [def] });
  return code;
}

export function revertEscalationToNormal(modeler: { get(s: string): any }, endElement: any): void {
  const modeling = modeler.get("modeling");
  modeling.updateProperties(endElement, { eventDefinitions: [] });
  // Leave the (now possibly unreferenced) bpmn:Escalation root element; the
  // no-orphan-category / global rules do not cover escalations, and re-marking reuses it.
}

export function addEscalationBoundary(
  modeler: { get(s: string): any },
  args: { callActivityId: string; escalationCode: string; outcomeName: string; destinationId: string },
): string {
  const elementRegistry = modeler.get("elementRegistry");
  const modeling = modeler.get("modeling");
  const bpmnFactory = modeler.get("bpmnFactory");
  const elementFactory = modeler.get("elementFactory");
  const defs = definitionsOf(modeler);

  const callActivity = elementRegistry.get(args.callActivityId);
  const destination = elementRegistry.get(args.destinationId);

  let escalation = (defs.rootElements ?? []).find(
    (r: any) => (r.$type ?? "").endsWith("Escalation") && r.escalationCode === args.escalationCode,
  );
  if (!escalation) {
    escalation = bpmnFactory.create("bpmn:Escalation", {
      id: `Escalation_${args.escalationCode}`, name: args.outcomeName, escalationCode: args.escalationCode,
    });
    defs.rootElements.push(escalation);
  }
  const eventDef = bpmnFactory.create("bpmn:EscalationEventDefinition", { escalationRef: escalation });
  const boundaryBo = bpmnFactory.create("bpmn:BoundaryEvent", {
    cancelActivity: true, attachedToRef: callActivity.businessObject, eventDefinitions: [eventDef],
  });
  eventDef.$parent = boundaryBo;
  const boundaryShape = elementFactory.createShape({ type: "bpmn:BoundaryEvent", businessObject: boundaryBo });
  // Attach at the bottom edge of the Call Activity box.
  const attachPos = { x: callActivity.x + callActivity.width / 2, y: callActivity.y + callActivity.height };
  modeling.createShape(boundaryShape, attachPos, callActivity, { attach: true });
  modeling.connect(boundaryShape, destination);
  return boundaryShape.id;
}

export function removeEscalationBoundary(modeler: { get(s: string): any }, escalationCode: string): void {
  const elementRegistry = modeler.get("elementRegistry");
  const modeling = modeler.get("modeling");
  const boundary = elementRegistry.filter((el: any) => {
    if (!(el.type ?? "").endsWith("BoundaryEvent")) return false;
    const ed = (el.businessObject?.eventDefinitions ?? [])[0];
    return ed && (ed.$type ?? "").endsWith("EscalationEventDefinition") && ed.escalationRef?.escalationCode === escalationCode;
  })[0];
  if (boundary) modeling.removeShape(boundary);
}
