import { describe, it, expect } from "vitest";
import { layoutDiagramElk, layoutSubgraphElk } from "./layoutElk";

describe("layoutSubgraphElk", () => {
  it("lays a selected subgraph left-to-right, returning positions per node", async () => {
    const pos = await layoutSubgraphElk(
      [{ id: "a", width: 100, height: 80 }, { id: "b", width: 100, height: 80 }, { id: "c", width: 100, height: 80 }],
      [{ id: "e1", source: "a", target: "b" }, { id: "e2", source: "b", target: "c" }],
    );
    expect(pos.get("a")!.x).toBeLessThan(pos.get("b")!.x);
    expect(pos.get("b")!.x).toBeLessThan(pos.get("c")!.x);
  });
});

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

  it("lays out a lane+group matrix with non-overlapping phase columns and lane bands", async () => {
    // Participant with 2 lanes and 2 phase groups (old DI puts phase A left, phase B right).
    const MATRIX = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Dm" targetNamespace="x">
  <bpmn:collaboration id="C"><bpmn:participant id="Part" processRef="P"/></bpmn:collaboration>
  <bpmn:process id="P" isExecutable="false">
    <bpmn:laneSet id="ls">
      <bpmn:lane id="L1"><bpmn:flowNodeRef>n1</bpmn:flowNodeRef><bpmn:flowNodeRef>n3</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="L2"><bpmn:flowNodeRef>n2</bpmn:flowNodeRef><bpmn:flowNodeRef>n4</bpmn:flowNodeRef></bpmn:lane>
    </bpmn:laneSet>
    <bpmn:task id="n1" name="A1"><bpmn:outgoing>f1</bpmn:outgoing></bpmn:task>
    <bpmn:task id="n2" name="A2"><bpmn:incoming>f1</bpmn:incoming><bpmn:outgoing>f2</bpmn:outgoing></bpmn:task>
    <bpmn:task id="n3" name="B1"><bpmn:incoming>f2</bpmn:incoming><bpmn:outgoing>f3</bpmn:outgoing></bpmn:task>
    <bpmn:task id="n4" name="B2"><bpmn:incoming>f3</bpmn:incoming></bpmn:task>
    <bpmn:sequenceFlow id="f1" sourceRef="n1" targetRef="n2"/>
    <bpmn:sequenceFlow id="f2" sourceRef="n2" targetRef="n3"/>
    <bpmn:sequenceFlow id="f3" sourceRef="n3" targetRef="n4"/>
    <bpmn:group id="gA" categoryValueRef="cvA"/>
    <bpmn:group id="gB" categoryValueRef="cvB"/>
  </bpmn:process>
  <bpmn:category id="cat"><bpmn:categoryValue id="cvA" value="Fase A"/><bpmn:categoryValue id="cvB" value="Fase B"/></bpmn:category>
  <bpmndi:BPMNDiagram id="di"><bpmndi:BPMNPlane id="pl" bpmnElement="C">
    <bpmndi:BPMNShape id="Part_di" bpmnElement="Part" isHorizontal="true"><dc:Bounds x="0" y="0" width="700" height="300"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="L1_di" bpmnElement="L1" isHorizontal="true"><dc:Bounds x="30" y="0" width="670" height="150"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="L2_di" bpmnElement="L2" isHorizontal="true"><dc:Bounds x="30" y="150" width="670" height="150"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="n1_di" bpmnElement="n1"><dc:Bounds x="120" y="40" width="100" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="n2_di" bpmnElement="n2"><dc:Bounds x="120" y="190" width="100" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="n3_di" bpmnElement="n3"><dc:Bounds x="420" y="40" width="100" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="n4_di" bpmnElement="n4"><dc:Bounds x="420" y="190" width="100" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="gA_di" bpmnElement="gA"><dc:Bounds x="90" y="10" width="260" height="280"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="gB_di" bpmnElement="gB"><dc:Bounds x="390" y="10" width="260" height="280"/></bpmndi:BPMNShape>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;
    const out = await layoutDiagramElk(MATRIX);
    const box = (id: string) => {
      const m = new RegExp(`bpmnElement="${id}"[^>]*>\\s*<dc:Bounds x="([\\-\\d.]+)" y="([\\-\\d.]+)" width="([\\d.]+)" height="([\\d.]+)"`).exec(out)!;
      return { x: +m[1], y: +m[2], w: +m[3], h: +m[4] };
    };
    // Phase columns don't overlap in X (gA entirely left of gB).
    const gA = box("gA"), gB = box("gB");
    expect(gA.x + gA.w).toBeLessThanOrEqual(gB.x + 1);
    // Lane bands don't overlap in Y (L1 entirely above L2).
    const l1 = box("L1"), l2 = box("L2");
    expect(l1.y + l1.h).toBeLessThanOrEqual(l2.y + 1);
    // A same-lane node stayed in its lane band (n1 within L1's y-range).
    const n1 = box("n1");
    expect(n1.y).toBeGreaterThanOrEqual(l1.y - 1);
    expect(n1.y + n1.h).toBeLessThanOrEqual(l1.y + l1.h + 1);
  });

  it("lays out collaborations as swimlanes (a shape per participant, stacked)", async () => {
    const out = await layoutDiagramElk(POOLS);
    // Both pools get a shape...
    expect(/bpmnElement="P1"[^>]*>\s*<dc:Bounds/.test(out)).toBe(true);
    expect(/bpmnElement="P2"[^>]*>\s*<dc:Bounds/.test(out)).toBe(true);
    // ...and P2 is stacked below P1.
    const y = (id: string) => Number(new RegExp(`bpmnElement="${id}"[^>]*>\\s*<dc:Bounds x="[\\-\\d.]+" y="([\\-\\d.]+)"`).exec(out)![1]);
    expect(y("P2")).toBeGreaterThan(y("P1"));
  });

  it("applies the selected variant (vertical stacks the flow top-to-bottom)", async () => {
    const outH = await layoutDiagramElk(PROC, "horizontal");
    const outV = await layoutDiagramElk(PROC, "vertical");
    const span = (xml: string) => {
      const ys = [...xml.matchAll(/<dc:Bounds x="[\-\d.]+" y="([\-\d.]+)"/g)].map((m) => Number(m[1]));
      return Math.max(...ys) - Math.min(...ys);
    };
    // Vertical flow spreads further on the Y axis than horizontal flow does.
    expect(span(outV)).toBeGreaterThan(span(outH));
  });

  // Regression: elk regenerates the DI, which used to drop DI-only styling (colors) and
  // artifacts (group/phase boxes). Colors are reused off the old shape; groups are rebuilt.
  it("preserves shape colors and rebuilds group boxes through the re-layout", async () => {
    const colored = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0" xmlns:color="http://www.omg.org/spec/BPMN/non-normative/color/1.0" id="Dc" targetNamespace="x">
  <bpmn:process id="P" isExecutable="false">
    <bpmn:startEvent id="S"><bpmn:outgoing>f</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="T" name="Coloreada"><bpmn:incoming>f</bpmn:incoming></bpmn:task>
    <bpmn:sequenceFlow id="f" sourceRef="S" targetRef="T"/>
    <bpmn:group id="G" categoryValueRef="cv"/>
  </bpmn:process>
  <bpmn:category id="cat"><bpmn:categoryValue id="cv" value="Fase 1"/></bpmn:category>
  <bpmndi:BPMNDiagram id="di"><bpmndi:BPMNPlane id="pl" bpmnElement="P">
    <bpmndi:BPMNShape id="S_di" bpmnElement="S"><dc:Bounds x="10" y="100" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="T_di" bpmnElement="T" bioc:stroke="#7B241C" bioc:fill="#C0392B" color:background-color="#C0392B"><dc:Bounds x="120" y="90" width="100" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="G_di" bpmnElement="G"><dc:Bounds x="100" y="60" width="150" height="140"/></bpmndi:BPMNShape>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;
    const out = await layoutDiagramElk(colored);
    expect(out).toContain('bioc:fill="#C0392B"');   // task color survived
    expect(/bpmnElement="G"[^>]*>\s*<dc:Bounds/.test(out)).toBe(true); // group box rebuilt
  });

  // Regression: a flow OUT of a boundary event used to crash elk ("Referenced shape does
  // not exist") because the boundary node was excluded from the graph but its edge wasn't.
  it("lays out boundary events and their flows without crashing", async () => {
    const withBoundary = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D3" targetNamespace="x">
  <bpmn:process id="P" isExecutable="false">
    <bpmn:startEvent id="S"><bpmn:outgoing>f0</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="T" name="Hacer"><bpmn:incoming>f0</bpmn:incoming><bpmn:outgoing>f1</bpmn:outgoing></bpmn:task>
    <bpmn:boundaryEvent id="B" name="Error" attachedToRef="T"><bpmn:outgoing>f2</bpmn:outgoing><bpmn:errorEventDefinition id="ed"/></bpmn:boundaryEvent>
    <bpmn:endEvent id="E1"><bpmn:incoming>f1</bpmn:incoming></bpmn:endEvent>
    <bpmn:endEvent id="E2"><bpmn:incoming>f2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="f0" sourceRef="S" targetRef="T"/>
    <bpmn:sequenceFlow id="f1" sourceRef="T" targetRef="E1"/>
    <bpmn:sequenceFlow id="f2" sourceRef="B" targetRef="E2"/>
  </bpmn:process>
</bpmn:definitions>`;
    const out = await layoutDiagramElk(withBoundary);
    expect(/bpmnElement="B"[^>]*>\s*<dc:Bounds/.test(out)).toBe(true); // boundary got a shape
    expect(/bpmnElement="f2"/.test(out)).toBe(true); // its outgoing flow got routed
  });
});
