import { deriveEntrySources } from "./entrySources";

// s2 (Diagnóstico) is reached from a join gateway fed by s1 (Recepción) and s2b (Motor donante).
const MASTER = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="x">
  <bpmn:process id="proc_mapa" isExecutable="false">
    <bpmn:startEvent id="se_map"><bpmn:outgoing>f0</bpmn:outgoing></bpmn:startEvent>
    <bpmn:callActivity id="s1" name="Recepción" calledElement="proc_rep_1"><bpmn:incoming>f0</bpmn:incoming><bpmn:outgoing>f1</bpmn:outgoing></bpmn:callActivity>
    <bpmn:callActivity id="s2b" name="Motor donante" calledElement="proc_rep_2b"><bpmn:outgoing>f6</bpmn:outgoing></bpmn:callActivity>
    <bpmn:exclusiveGateway id="gw_join"><bpmn:incoming>f1</bpmn:incoming><bpmn:incoming>f6</bpmn:incoming><bpmn:outgoing>f2</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:callActivity id="s2" name="Diagnóstico" calledElement="proc_rep_2"><bpmn:incoming>f2</bpmn:incoming></bpmn:callActivity>
    <bpmn:sequenceFlow id="f0" sourceRef="se_map" targetRef="s1"/>
    <bpmn:sequenceFlow id="f1" sourceRef="s1" targetRef="gw_join"/>
    <bpmn:sequenceFlow id="f6" sourceRef="s2b" targetRef="gw_join"/>
    <bpmn:sequenceFlow id="f2" sourceRef="gw_join" targetRef="s2"/>
  </bpmn:process>
</bpmn:definitions>`;

describe("deriveEntrySources", () => {
  it("walks through the join gateway to both predecessor stages", async () => {
    const srcs = await deriveEntrySources(MASTER, "s2");
    expect(srcs).toEqual([
      { kind: "callActivity", elementId: "s1", name: "Recepción", processId: "proc_rep_1" },
      { kind: "callActivity", elementId: "s2b", name: "Motor donante", processId: "proc_rep_2b" },
    ]);
  });

  it("reports the master start as the predecessor of the first stage", async () => {
    const srcs = await deriveEntrySources(MASTER, "s1");
    expect(srcs).toEqual([{ kind: "start", elementId: "se_map", name: "", processId: null }]);
  });
});
