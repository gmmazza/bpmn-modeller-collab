import { typeBadgeFor } from "./typeBadges";

describe("typeBadgeFor", () => {
  it("labels precise task types", () => {
    expect(typeBadgeFor({ type: "bpmn:UserTask" })).toEqual({ icon: "🙍", label: "Usuario" });
    expect(typeBadgeFor({ type: "bpmn:ManualTask" })).toEqual({ icon: "✋", label: "Manual" });
    expect(typeBadgeFor({ type: "bpmn:ServiceTask" })).toEqual({ icon: "⚙", label: "Servicio" });
  });
  it("labels curated event types by their event definition", () => {
    expect(typeBadgeFor({ type: "bpmn:EndEvent", eventDefinitions: [{ $type: "bpmn:EscalationEventDefinition" }] }))
      .toEqual({ icon: "↗", label: "Escalación" });
    expect(typeBadgeFor({ type: "bpmn:EndEvent", eventDefinitions: [{ $type: "bpmn:TerminateEventDefinition" }] }))
      .toEqual({ icon: "⛔", label: "Terminación" });
    expect(typeBadgeFor({ type: "bpmn:StartEvent", eventDefinitions: [{ $type: "bpmn:MessageEventDefinition" }] }))
      .toEqual({ icon: "✉", label: "Mensaje" });
  });
  it("labels a timer boundary event as a deadline (Plazo)", () => {
    expect(typeBadgeFor({ type: "bpmn:BoundaryEvent", attachedToRef: {}, eventDefinitions: [{ $type: "bpmn:TimerEventDefinition" }] }))
      .toEqual({ icon: "⏱", label: "Plazo" });
  });
  it("returns null for plain tasks, none events, gateways and flows", () => {
    expect(typeBadgeFor({ type: "bpmn:Task" })).toBeNull();
    expect(typeBadgeFor({ type: "bpmn:StartEvent" })).toBeNull();
    expect(typeBadgeFor({ type: "bpmn:ExclusiveGateway" })).toBeNull();
    expect(typeBadgeFor({ type: "bpmn:SequenceFlow" })).toBeNull();
  });
});
