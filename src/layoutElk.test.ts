import { describe, it, expect } from "vitest";
import { layoutDiagramElk } from "./layoutElk";
import { UnsupportedLayoutError } from "./autoLayout";

// Start → Task → Gateway → (Task2 | End), no DI: elk must build a clean layout from scratch.
const PROC = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="x">
  <bpmn:process id="P" isExecutable="false">
    <bpmn:startEvent id="S" name="Inicio"><bpmn:outgoing>f1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="T1" name="Revisar"><bpmn:incoming>f1</bpmn:incoming><bpmn:outgoing>f2</bpmn:outgoing></bpmn:task>
    <bpmn:exclusiveGateway id="G" name="¿OK?"><bpmn:incoming>f2</bpmn:incoming><bpmn:outgoing>f3</bpmn:outgoing><bpmn:outgoing>f4</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:task id="T2" name="Rehacer"><bpmn:incoming>f3</bpmn:incoming></bpmn:task>
    <bpmn:endEvent id="E" name="Fin"><bpmn:incoming>f4</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="f1" sourceRef="S" targetRef="T1"/>
    <bpmn:sequenceFlow id="f2" sourceRef="T1" targetRef="G"/>
    <bpmn:sequenceFlow id="f3" name="No" sourceRef="G" targetRef="T2"/>
    <bpmn:sequenceFlow id="f4" name="Sí" sourceRef="G" targetRef="E"/>
  </bpmn:process>
</bpmn:definitions>`;

const POOLS = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D2" targetNamespace="x">
  <bpmn:collaboration id="C"><bpmn:participant id="P1" processRef="PA"/><bpmn:participant id="P2" processRef="PB"/></bpmn:collaboration>
  <bpmn:process id="PA"><bpmn:startEvent id="a"/></bpmn:process>
  <bpmn:process id="PB"><bpmn:endEvent id="b"/></bpmn:process>
</bpmn:definitions>`;

function shapeX(xml: string, id: string): number | null {
  const m = new RegExp(`bpmnElement="${id}"[^>]*>\\s*<dc:Bounds x="([\\-\\d.]+)"`).exec(xml);
  return m ? Number(m[1]) : null;
}

describe("layoutDiagramElk", () => {
  it("regenerates DI with a left-to-right flow (start < task < gateway < end)", async () => {
    const out = await layoutDiagramElk(PROC);
    expect(out).toContain("BPMNDiagram");
    expect(out).toContain("di:waypoint"); // edges got routed waypoints
    const [s, t1, g, e] = ["S", "T1", "G", "E"].map((id) => shapeX(out, id));
    expect(s).not.toBeNull();
    expect(s!).toBeLessThan(t1!);
    expect(t1!).toBeLessThan(g!);
    expect(g!).toBeLessThan(e!);
  });

  it("gives events and gateways an external label below the shape", async () => {
    const out = await layoutDiagramElk(PROC);
    // The start event ("Inicio") shape carries a nested BPMNLabel with bounds.
    expect(/bpmnElement="S"[\s\S]*?<bpmndi:BPMNLabel>\s*<dc:Bounds/.test(out)).toBe(true);
  });

  it("places gateway-branch flow labels via elk (near the routed edge)", async () => {
    const out = await layoutDiagramElk(PROC);
    // The "No"/"Sí" flows out of G carry edge labels.
    expect(/bpmnElement="f3"[\s\S]*?<bpmndi:BPMNLabel>/.test(out)).toBe(true);
  });

  it("refuses collaborations (pools) in beta scope", async () => {
    await expect(layoutDiagramElk(POOLS)).rejects.toBeInstanceOf(UnsupportedLayoutError);
  });
});
