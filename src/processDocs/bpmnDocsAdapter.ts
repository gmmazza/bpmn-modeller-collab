// src/processDocs/bpmnDocsAdapter.ts
import type { ModelerLike } from "../editor";
import type { DiagramElement } from "./notePanelController";

export const DOCUMENTABLE_TYPES = ["bpmn:Task", "bpmn:Gateway", "bpmn:Event", "bpmn:SubProcess", "bpmn:CallActivity"];

export function isDocumentable(type: string): boolean {
  if (type === "bpmn:Process" || type === "bpmn:SequenceFlow") return false;
  return DOCUMENTABLE_TYPES.some((t) =>
    t === "bpmn:Task" ? type === "bpmn:Task" || type.endsWith("Task") :
    t === "bpmn:Gateway" ? type.endsWith("Gateway") :
    t === "bpmn:Event" ? type.endsWith("Event") :
    type === t,
  );
}

export function toDiagramElement(el: { id: string; businessObject?: { name?: string; $type?: string } }): DiagramElement {
  const bo = el.businessObject ?? {};
  return { id: el.id, name: bo.name && bo.name.trim() ? bo.name : "(sin nombre)", type: bo.$type ?? "" };
}

export function listDocumentableElements(modeler: ModelerLike): DiagramElement[] {
  const registry = modeler.get("elementRegistry");
  const all: Array<{ id: string; businessObject?: { name?: string; $type?: string } }> = registry.getAll();
  return all.filter((el) => isDocumentable(el.businessObject?.$type ?? "")).map(toDiagramElement);
}
