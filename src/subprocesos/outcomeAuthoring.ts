// Assisted-authoring transforms for the subprocess exit contract (A.3). No hand-modeling
// of symbols: the UI calls these to convert a plain none-end into an escalation end (and
// back), and to attach/detach the matching interrupting escalation boundary on the master
// Call Activity. All mutations go through bpmn-js modeling / moddle so the command stack
// (and the app's coarse-undo layer) captures them.
import { escalationCodeFor } from "./escalationCode";
import { distributeBoundaries } from "./boundaryLayout";

// Find an existing bpmn:Escalation root element with this code, or declare a new one
// (id convention `Escalation_<code>` so re-marking / re-attaching reuses the same
// declaration). Shared by the subprocess side (markEndAsEscalation) and the master side
// (addEscalationBoundary).
function findOrCreateEscalation(defs: any, bpmnFactory: any, code: string, name: string): any {
  let escalation = (defs.rootElements ?? []).find(
    (r: any) => (r.$type ?? "").endsWith("Escalation") && r.escalationCode === code,
  );
  if (!escalation) {
    escalation = bpmnFactory.create("bpmn:Escalation", { id: `Escalation_${code}`, name, escalationCode: code });
    defs.rootElements.push(escalation);
  }
  return escalation;
}

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

  const escalation = findOrCreateEscalation(defs, bpmnFactory, code, args.outcomeName);
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
  // Both endpoints must resolve to live shapes; otherwise modeling.createShape/connect would
  // dereference undefined and throw mid-mutation, leaving the command stack half-applied.
  if (!callActivity) throw new Error(`addEscalationBoundary: call activity not found: ${args.callActivityId}`);
  if (!destination) throw new Error(`addEscalationBoundary: destination not found: ${args.destinationId}`);

  const escalation = findOrCreateEscalation(defs, bpmnFactory, args.escalationCode, args.outcomeName);
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
  // Every boundary is dropped at the host's centre; from the 2nd on they'd stack on that point
  // and their labels would overprint. Re-space all of the host's boundaries along the bottom
  // edge and cascade their labels after each add (matches the auto-layout stagger; undoable).
  redistributeHostBoundaries(modeler, callActivity);
  return boundaryShape.id;
}

// Spread a host's escalation boundaries evenly along its bottom edge and cascade their labels,
// so N alternative outcomes read cleanly instead of piling on the single attach point. Pure
// geometry in distributeBoundaries; the moves go through modeling so the command stack (and the
// app's coarse-undo) captures them. A lone boundary keeps its centred attach point.
export function redistributeHostBoundaries(modeler: { get(s: string): any }, host: any): void {
  const elementRegistry = modeler.get("elementRegistry");
  const modeling = modeler.get("modeling");
  const boundaries = elementRegistry
    .filter((el: any) => (el.type ?? "").endsWith("BoundaryEvent") && el.businessObject?.attachedToRef === host.businessObject)
    .sort((a: any, b: any) => a.x - b.x);
  if (boundaries.length < 2) return;
  const slots = distributeBoundaries(host, boundaries.length);
  // Pass 1: slide each circle to its slot (moving a shape carries its own label along).
  boundaries.forEach((b: any, i: number) => {
    const dx = Math.round(slots[i].cx - (b.x + b.width / 2));
    const dy = Math.round(slots[i].cy - (b.y + b.height / 2));
    if (dx || dy) modeling.moveElements([b], { x: dx, y: dy });
  });
  // Pass 2: cascade the (now-moved) labels so several outcome names don't overprint.
  boundaries.forEach((b: any, i: number) => {
    if (!b.label) return;
    const dx = Math.round(slots[i].labelX - b.label.x);
    const dy = Math.round(slots[i].labelY - b.label.y);
    if (dx || dy) modeling.moveElements([b.label], { x: dx, y: dy });
  });
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
