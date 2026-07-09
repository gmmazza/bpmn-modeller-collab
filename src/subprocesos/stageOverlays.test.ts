import { buildStageOverlayModel, mountStageOverlays } from "./stageOverlays";

const STAGE = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="x">
  <bpmn:escalation id="Esc_dev" name="Devuelto" escalationCode="proc_rep_3__devuelto"/>
  <bpmn:process id="proc_rep_3" isExecutable="false">
    <bpmn:startEvent id="S1"/>
    <bpmn:endEvent id="E_ok"/>
    <bpmn:endEvent id="E_dev"><bpmn:escalationEventDefinition escalationRef="Esc_dev"/></bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

const MASTER = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d2" targetNamespace="x">
  <bpmn:escalation id="Esc_dev" name="Devuelto" escalationCode="proc_rep_3__devuelto"/>
  <bpmn:process id="proc_mapa" isExecutable="false">
    <bpmn:callActivity id="s3" name="Presupuesto" calledElement="proc_rep_3"><bpmn:incoming>f0</bpmn:incoming><bpmn:outgoing>f_ok</bpmn:outgoing></bpmn:callActivity>
    <bpmn:startEvent id="se_map"><bpmn:outgoing>f0</bpmn:outgoing></bpmn:startEvent>
    <bpmn:callActivity id="s4" name="Reparación" calledElement="proc_rep_4"><bpmn:incoming>f_ok</bpmn:incoming></bpmn:callActivity>
    <bpmn:boundaryEvent id="B1" attachedToRef="s3"><bpmn:escalationEventDefinition escalationRef="Esc_dev"/><bpmn:outgoing>f_dev</bpmn:outgoing></bpmn:boundaryEvent>
    <bpmn:endEvent id="end_norep" name="Devuelto sin reparar"><bpmn:incoming>f_dev</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="f0" sourceRef="se_map" targetRef="s3"/>
    <bpmn:sequenceFlow id="f_ok" sourceRef="s3" targetRef="s4"/>
    <bpmn:sequenceFlow id="f_dev" sourceRef="B1" targetRef="end_norep"/>
  </bpmn:process>
</bpmn:definitions>`;

const names: Record<string, string> = { s4: "Reparación", end_norep: "Devuelto sin reparar", se_map: "" };

describe("buildStageOverlayModel", () => {
  it("computes the entry source and both exits with destination labels", async () => {
    const model = await buildStageOverlayModel({
      stageXml: STAGE, masterXml: MASTER, callActivityId: "s3",
      resolveName: (id) => names[id] ?? "",
    });
    expect(model.entry).toEqual({
      startId: "S1",
      sources: [{ kind: "start", elementId: "se_map", name: "", processId: null }],
    });
    expect(model.exits).toEqual([
      { endId: "E_ok", label: "▶ va a: Reparación", targetMasterId: "s4", kind: "normal" },
      { endId: "E_dev", label: "▶ va a: Devuelto sin reparar", targetMasterId: "end_norep", kind: "escalation" },
    ]);
  });
});

describe("mountStageOverlays", () => {
  it("adds one overlay per entry + exit and clears them", () => {
    const added: string[] = [];
    const removed: string[] = [];
    let n = 0;
    const host = {
      add: (elId: string) => { const id = `o${n++}`; added.push(`${elId}:${id}`); return id; },
      remove: (id: string) => { removed.push(id); },
    };
    const model = {
      entry: { startId: "S1", sources: [] },
      exits: [{ endId: "E_ok", label: "▶ va a: X", targetMasterId: "s4", kind: "normal" as const }],
    };
    const h = mountStageOverlays(host, model, { goToSource: () => {}, goToExit: () => {} });
    expect(added).toEqual(["S1:o0", "E_ok:o1"]);
    h.clear();
    expect(removed).toEqual(["o0", "o1"]);
  });
});
