import { parseSubprocessBoundaries, parseMasterBoundaries } from "./boundaryLinks";

const SUB = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d1" targetNamespace="x">
  <bpmn:escalation id="Esc_dev" name="Devuelto" escalationCode="proc_rep_3__devuelto"/>
  <bpmn:process id="proc_rep_3" isExecutable="false">
    <bpmn:startEvent id="S1"/>
    <bpmn:endEvent id="E_ok" name="Presupuesto aprobado"/>
    <bpmn:endEvent id="E_dev" name="Devuelto sin reparar">
      <bpmn:escalationEventDefinition id="eed1" escalationRef="Esc_dev"/>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

const MASTER = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d2" targetNamespace="x">
  <bpmn:escalation id="Esc_dev" name="Devuelto" escalationCode="proc_rep_3__devuelto"/>
  <bpmn:process id="proc_mapa" isExecutable="false">
    <bpmn:callActivity id="s3" calledElement="proc_rep_3"/>
    <bpmn:boundaryEvent id="B1" attachedToRef="s3" cancelActivity="true">
      <bpmn:escalationEventDefinition id="eed2" escalationRef="Esc_dev"/>
      <bpmn:outgoing>f1</bpmn:outgoing>
    </bpmn:boundaryEvent>
    <bpmn:endEvent id="dest_dev"/>
    <bpmn:sequenceFlow id="f1" sourceRef="B1" targetRef="dest_dev"/>
  </bpmn:process>
</bpmn:definitions>`;

describe("parseSubprocessBoundaries", () => {
  it("classifies the none-end as normal and the escalation end by code", async () => {
    const info = await parseSubprocessBoundaries(SUB);
    expect(info.processId).toBe("proc_rep_3");
    expect(info.startEventIds).toEqual(["S1"]);
    expect(info.noneStartId).toBe("S1");
    expect(info.ends.normal).toEqual(["E_ok"]);
    expect(info.ends.escalations).toEqual([
      { endId: "E_dev", name: "Devuelto sin reparar", escalationCode: "proc_rep_3__devuelto" },
    ]);
  });

  it("returns noneStartId=null when there are multiple starts", async () => {
    const twoStarts = SUB.replace("<bpmn:startEvent id=\"S1\"/>", "<bpmn:startEvent id=\"S1\"/><bpmn:startEvent id=\"S2\"/>");
    const info = await parseSubprocessBoundaries(twoStarts);
    expect(info.startEventIds).toEqual(["S1", "S2"]);
    expect(info.noneStartId).toBeNull();
  });
});

describe("parseMasterBoundaries", () => {
  it("reads the interrupting escalation boundary, its call activity, code and outgoing target", async () => {
    const bs = await parseMasterBoundaries(MASTER);
    expect(bs).toEqual([
      { boundaryId: "B1", callActivityId: "s3", escalationCode: "proc_rep_3__devuelto", interrupting: true, outgoingTargetId: "dest_dev" },
    ]);
  });
});
