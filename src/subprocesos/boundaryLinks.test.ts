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

  it("returns noneStartId=null when the sole start is typed", async () => {
    const typedStart = SUB.replace(
      "<bpmn:startEvent id=\"S1\"/>",
      "<bpmn:startEvent id=\"S1\"><bpmn:timerEventDefinition id=\"ted1\"/></bpmn:startEvent>",
    );
    const info = await parseSubprocessBoundaries(typedStart);
    expect(info.startEventIds).toEqual(["S1"]);
    expect(info.noneStartId).toBeNull();
  });
});

const MASTER_TWO = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d3" targetNamespace="x">
  <bpmn:escalation id="Esc_dev" name="Devuelto" escalationCode="proc_rep_3__devuelto"/>
  <bpmn:escalation id="Esc_rech" name="Rechazado" escalationCode="proc_rep_3__rechazado"/>
  <bpmn:process id="proc_mapa" isExecutable="false">
    <bpmn:callActivity id="s3" calledElement="proc_rep_3"/>
    <bpmn:boundaryEvent id="B_ni" attachedToRef="s3" cancelActivity="false">
      <bpmn:escalationEventDefinition id="eed_ni" escalationRef="Esc_dev"/>
      <bpmn:outgoing>f_ni</bpmn:outgoing>
    </bpmn:boundaryEvent>
    <bpmn:boundaryEvent id="B_i" attachedToRef="s3">
      <bpmn:escalationEventDefinition id="eed_i" escalationRef="Esc_rech"/>
      <bpmn:outgoing>f_i</bpmn:outgoing>
    </bpmn:boundaryEvent>
    <bpmn:endEvent id="dest_ni"/>
    <bpmn:endEvent id="dest_i"/>
    <bpmn:sequenceFlow id="f_ni" sourceRef="B_ni" targetRef="dest_ni"/>
    <bpmn:sequenceFlow id="f_i" sourceRef="B_i" targetRef="dest_i"/>
  </bpmn:process>
</bpmn:definitions>`;

describe("parseMasterBoundaries", () => {
  it("reads the interrupting escalation boundary, its call activity, code and outgoing target", async () => {
    const bs = await parseMasterBoundaries(MASTER);
    expect(bs).toEqual([
      { boundaryId: "B1", callActivityId: "s3", escalationCode: "proc_rep_3__devuelto", interrupting: true, outgoingTargetId: "dest_dev" },
    ]);
  });

  it("marks cancelActivity=false as non-interrupting and absent cancelActivity as interrupting", async () => {
    const bs = await parseMasterBoundaries(MASTER_TWO);
    expect(bs).toEqual([
      { boundaryId: "B_ni", callActivityId: "s3", escalationCode: "proc_rep_3__devuelto", interrupting: false, outgoingTargetId: "dest_ni" },
      { boundaryId: "B_i", callActivityId: "s3", escalationCode: "proc_rep_3__rechazado", interrupting: true, outgoingTargetId: "dest_i" },
    ]);
  });
});
