import { describe, it, expect } from "vitest";
import { isDocumentable, toDiagramElement, listDocumentableElements } from "./bpmnDocsAdapter";

describe("bpmnDocsAdapter", () => {
  it("flags tasks, gateways, events, subprocess and call activity as documentable", () => {
    expect(isDocumentable("bpmn:Task")).toBe(true);
    expect(isDocumentable("bpmn:ExclusiveGateway")).toBe(true);
    expect(isDocumentable("bpmn:StartEvent")).toBe(true);
    expect(isDocumentable("bpmn:CallActivity")).toBe(true);
    expect(isDocumentable("bpmn:SequenceFlow")).toBe(false);
    expect(isDocumentable("bpmn:Process")).toBe(false);
  });

  it("maps a bpmn element to a DiagramElement, defaulting an empty name", () => {
    expect(toDiagramElement({ id: "A", businessObject: { name: "Validar", $type: "bpmn:Task" } }))
      .toEqual({ id: "A", name: "Validar", type: "bpmn:Task" });
    expect(toDiagramElement({ id: "B", businessObject: { $type: "bpmn:Task" } }))
      .toEqual({ id: "B", name: "(sin nombre)", type: "bpmn:Task" });
  });

  it("lists only documentable elements from the registry", () => {
    const registry = {
      getAll: () => [
        { id: "A", businessObject: { name: "T", $type: "bpmn:Task" } },
        { id: "F", businessObject: { $type: "bpmn:SequenceFlow" } },
      ],
    };
    const modeler = { get: (n: string) => (n === "elementRegistry" ? registry : null) } as any;
    expect(listDocumentableElements(modeler)).toEqual([{ id: "A", name: "T", type: "bpmn:Task" }]);
  });
});
