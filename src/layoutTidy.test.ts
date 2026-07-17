import { describe, it, expect } from "vitest";
import { tidyLayout, fitBox, wrapLines } from "./layoutTidy";

describe("wrapLines", () => {
  it("greedily wraps by words to the char budget", () => {
    expect(wrapLines("Tomar puesta a punto", 12)).toEqual(["Tomar puesta", "a punto"]);
  });
  it("never splits a single long word", () => {
    expect(wrapLines("supercalifragilistico", 8)).toEqual(["supercalifragilistico"]);
  });
});

describe("fitBox", () => {
  it("grows the height so many wrapped lines fit (no vertical clipping)", () => {
    const { height } = fitBox("reparacion diagnostico presupuesto aprobacion entrega garantia", 100, 80);
    expect(height).toBeGreaterThan(80);
  });
  it("widens for a word longer than the box, up to the cap", () => {
    const { width } = fitBox("responsabilidades", 100, 80);
    expect(width).toBeGreaterThan(100);
    expect(width).toBeLessThanOrEqual(140);
  });
  it("preserves a restored (larger) original box, clamped to the cap", () => {
    expect(fitBox("Desarmar completo", 100, 120)).toEqual({ width: 100, height: 120 });
    expect(fitBox("Desarmar completo", 200, 200).width).toBeLessThanOrEqual(140);
  });
  it("leaves a short label at the default size", () => {
    expect(fitBox("Fin", 100, 80)).toEqual({ width: 100, height: 80 });
  });
});

// A laid-out diagram (as bpmn-auto-layout would emit): a gateway with two named
// outgoing flows, and a task with a long name squeezed into a default 100x80 box.
const LAID = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="D" targetNamespace="x">
  <bpmn:process id="P" isExecutable="false">
    <bpmn:exclusiveGateway id="G"><bpmn:outgoing>fno</bpmn:outgoing><bpmn:outgoing>fsi</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:task id="T" name="Tomar puesta a punto (40-60 min)"><bpmn:incoming>fno</bpmn:incoming></bpmn:task>
    <bpmn:endEvent id="E"><bpmn:incoming>fsi</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="fno" name="No" sourceRef="G" targetRef="T"/>
    <bpmn:sequenceFlow id="fsi" name="Sí" sourceRef="G" targetRef="E"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="di"><bpmndi:BPMNPlane id="pl" bpmnElement="P">
    <bpmndi:BPMNShape id="G_di" bpmnElement="G"><dc:Bounds x="100" y="100" width="50" height="50"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="T_di" bpmnElement="T"><dc:Bounds x="250" y="90" width="100" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="E_di" bpmnElement="E"><dc:Bounds x="250" y="250" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="fno_di" bpmnElement="fno"><di:waypoint x="150" y="125"/><di:waypoint x="250" y="130"/><bpmndi:BPMNLabel><dc:Bounds x="380" y="200" width="18" height="14"/></bpmndi:BPMNLabel></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="fsi_di" bpmnElement="fsi"><di:waypoint x="125" y="150"/><di:waypoint x="268" y="250"/><bpmndi:BPMNLabel><dc:Bounds x="380" y="300" width="14" height="14"/></bpmndi:BPMNLabel></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

function shapeBounds(xml: string, id: string) {
  const re = new RegExp(`bpmnElement="${id}"[^>]*>\\s*<dc:Bounds x="([\\-\\d.]+)" y="([\\-\\d.]+)" width="([\\-\\d.]+)" height="([\\-\\d.]+)"`);
  const m = re.exec(xml)!;
  return { x: +m[1], y: +m[2], width: +m[3], height: +m[4] };
}
function labelBounds(xml: string, edgeId: string) {
  const re = new RegExp(`bpmnElement="${edgeId}"[\\s\\S]*?<bpmndi:BPMNLabel>\\s*<dc:Bounds x="([\\-\\d.]+)" y="([\\-\\d.]+)"`);
  const m = re.exec(xml)!;
  return { x: +m[1], y: +m[2] };
}

// The same diagram BEFORE the layouter flattened it: the task box was a roomy 100x120.
const ORIGINAL = LAID.replace(
  '<dc:Bounds x="250" y="90" width="100" height="80"/>',
  '<dc:Bounds x="900" y="900" width="100" height="120"/>',
);

describe("tidyLayout", () => {
  it("restores the task box toward its original (larger) size, keeping it centered", async () => {
    const laid = shapeBounds(LAID, "T"); // 100x80 after the layouter
    const out = await tidyLayout(LAID, ORIGINAL);
    const after = shapeBounds(out, "T");
    expect(after.height).toBeGreaterThan(laid.height); // restored toward the original 120
    // stays centered on the LAID position (no drift from where the layouter put it)
    const cx = laid.x + laid.width / 2;
    expect(Math.abs(after.x + after.width / 2 - cx)).toBeLessThan(0.6);
    expect(Math.abs(after.y + after.height / 2 - (laid.y + laid.height / 2))).toBeLessThan(0.6);
  });

  it("moves gateway-outgoing flow labels near the source gateway", async () => {
    const out = await tidyLayout(LAID);
    // "No" label started at x=380 (far right, near the target); it should move back
    // toward the gateway's first segment (starts at x=150).
    const lbl = labelBounds(out, "fno");
    expect(lbl.x).toBeLessThan(300);
  });

  it("leaves a diagram it cannot parse untouched (returns input)", async () => {
    const bad = "<not-bpmn/>";
    expect(await tidyLayout(bad)).toBe(bad);
  });
});
