import { describe, it, expect } from "vitest";
import { hasPools, layoutDiagram, UnsupportedLayoutError } from "./autoLayout";

// A single-process diagram whose DI intentionally stacks every shape at the same
// (500,500) — a messy overlap that only a re-layout can untangle.
const MESSY = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="Start_1" name="Inicio"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="Task_1" name="Hacer algo"><bpmn:incoming>F1</bpmn:incoming><bpmn:outgoing>F2</bpmn:outgoing></bpmn:task>
    <bpmn:endEvent id="End_1" name="Fin"><bpmn:incoming>F2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="Start_1" targetRef="Task_1"/>
    <bpmn:sequenceFlow id="F2" sourceRef="Task_1" targetRef="End_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Di_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Start_1_di" bpmnElement="Start_1"><dc:Bounds x="500" y="500" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1"><dc:Bounds x="500" y="500" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_1_di" bpmnElement="End_1"><dc:Bounds x="500" y="500" width="36" height="36"/></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

// Same process but with NO diagram interchange at all — layout must be built from scratch.
const NO_DI = MESSY.replace(/<bpmndi:BPMNDiagram[\s\S]*<\/bpmndi:BPMNDiagram>/, "");

const POOLS = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs_2" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant id="P1" name="Cliente" processRef="Proc_A"/>
    <bpmn:participant id="P2" name="Empresa" processRef="Proc_B"/>
  </bpmn:collaboration>
  <bpmn:process id="Proc_A"><bpmn:startEvent id="S_A"/></bpmn:process>
  <bpmn:process id="Proc_B"><bpmn:endEvent id="E_B"/></bpmn:process>
</bpmn:definitions>`;

// Bounds x for a given semantic element id, read out of the serialized DI.
function boundsX(xml: string, elementId: string): number | null {
  const re = new RegExp(`bpmnElement="${elementId}"[^>]*>\\s*<dc:Bounds x="([\\-\\d.]+)"`);
  const m = re.exec(xml);
  return m ? Number(m[1]) : null;
}

describe("hasPools", () => {
  it("is true for a collaboration with participants", () => {
    expect(hasPools(POOLS)).toBe(true);
  });
  it("detects participants regardless of namespace prefix", () => {
    expect(hasPools('<foo:participant id="x"/>')).toBe(true);
    expect(hasPools('<participant id="x"/>')).toBe(true);
  });
  it("is false for a plain single-process diagram", () => {
    expect(hasPools(MESSY)).toBe(false);
    // "Participant" appearing only inside a name/text must not trip the check.
    expect(hasPools('<bpmn:task name="Notify Participant"/>')).toBe(false);
  });
});

describe("layoutDiagram", () => {
  it("re-lays a messy diagram left-to-right (start → task → end)", async () => {
    const out = await layoutDiagram(MESSY);
    expect(out).toContain("BPMNDiagram");
    const [s, t, e] = [boundsX(out, "Start_1"), boundsX(out, "Task_1"), boundsX(out, "End_1")];
    expect(s).not.toBeNull();
    expect(t).not.toBeNull();
    expect(e).not.toBeNull();
    expect(s!).toBeLessThan(t!);
    expect(t!).toBeLessThan(e!);
  });

  it("builds a layout from scratch when the diagram has no DI", async () => {
    const out = await layoutDiagram(NO_DI);
    expect(boundsX(out, "Start_1")!).toBeLessThan(boundsX(out, "Task_1")!);
  });

  it("refuses pool/collaboration diagrams instead of destroying them", async () => {
    await expect(layoutDiagram(POOLS)).rejects.toBeInstanceOf(UnsupportedLayoutError);
  });
});
