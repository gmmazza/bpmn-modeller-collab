import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
// @ts-expect-error no type declarations published
import { BpmnModdle } from "bpmn-moddle";
import { layoutDiagramElk } from "./layoutElk";

// Real-world fixture (the user's Novotec matrix: 7 lanes x 6 phase groups, coloured). Unit
// tests on synthetic diagrams pass while the real output still has defects, so we assert
// invariants against the actual file — this is what catches the real bugs. Committed copy
// of qa-workspace/.../flujo_reparaciones_novotec.bak-2026-07-06 copia.bpmn (qa-workspace is
// gitignored, so the fixture lives here to stay available in CI/fresh clones).
const SRC = readFileSync("src/__fixtures__/novotec-matrix.bpmn", "utf8");
const NON_FLOW = new Set(["bpmn:Lane", "bpmn:Participant", "bpmn:Group"]);
const GW = new Set(["bpmn:ExclusiveGateway", "bpmn:InclusiveGateway", "bpmn:ParallelGateway"]);

async function parseDi(xml: string) {
  const { rootElement } = await new BpmnModdle().fromXML(xml);
  const shapes: any[] = [], edges: any[] = [];
  for (const d of rootElement.diagrams ?? []) for (const pe of d.plane?.planeElement ?? []) {
    if (pe.$type === "bpmndi:BPMNShape" && pe.bpmnElement) shapes.push(pe);
    else if (pe.$type === "bpmndi:BPMNEdge" && pe.bpmnElement) edges.push(pe);
  }
  return { shapes, edges };
}

describe("layoutDiagramElk on the real Novotec matrix fixture", () => {
  let shapes: any[], edges: any[], flowNodes: any[], flows: any[];
  beforeAll(async () => {
    const out = await layoutDiagramElk(SRC);
    ({ shapes, edges } = await parseDi(out));
    const { rootElement } = await new BpmnModdle().fromXML(SRC);
    const proc = rootElement.rootElements.find((e: any) => e.$type === "bpmn:Process" && (e.flowElements?.length ?? 0) > 0);
    const fe = proc.flowElements ?? [];
    flowNodes = fe.filter((f: any) => f.$type !== "bpmn:SequenceFlow" && f.$type !== "bpmn:Association");
    flows = fe.filter((f: any) => f.$type === "bpmn:SequenceFlow");
  });

  it("emits a shape per flow node, an edge per flow, and a label per named flow", () => {
    const shapeIds = new Set(shapes.map((s) => s.bpmnElement.id));
    const edgeByEl = new Map(edges.map((e) => [e.bpmnElement.id, e]));
    for (const n of flowNodes) expect(shapeIds.has(n.id), `missing shape ${n.id}`).toBe(true);
    for (const f of flows) expect(edgeByEl.has(f.id), `missing edge ${f.id}`).toBe(true);
    for (const f of flows) if (f.name) expect(!!edgeByEl.get(f.id)?.label?.bounds, `missing label for ${f.id}`).toBe(true);
  });

  it("places flow nodes without overlapping one another", () => {
    const b = shapes.filter((s) => !NON_FLOW.has(s.bpmnElement.$type)).map((s) => s.bounds);
    let overlaps = 0;
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
      const ox = Math.min(b[i].x + b[i].width, b[j].x + b[j].width) - Math.max(b[i].x, b[j].x);
      const oy = Math.min(b[i].y + b[i].height, b[j].y + b[j].height) - Math.max(b[i].y, b[j].y);
      if (ox > 4 && oy > 4) overlaps++;
    }
    expect(overlaps).toBe(0);
  });

  it("keeps lane bands and phase columns non-overlapping (clean matrix)", () => {
    const lanes = shapes.filter((s) => s.bpmnElement.$type === "bpmn:Lane").map((s) => s.bounds).sort((a, b) => a.y - b.y);
    for (let i = 0; i < lanes.length - 1; i++) expect(lanes[i].y + lanes[i].height, "lane Y overlap").toBeLessThanOrEqual(lanes[i + 1].y + 1);
    const groups = shapes.filter((s) => s.bpmnElement.$type === "bpmn:Group").map((s) => s.bounds).sort((a, b) => a.x - b.x);
    for (let i = 0; i < groups.length - 1; i++) expect(groups[i].x + groups[i].width, "group X overlap").toBeLessThanOrEqual(groups[i + 1].x + 1);
  });

  it("keeps edge-through-node crossings bounded (channel routing; not yet a full visibility router)", () => {
    // Ideal is 0. The channel router (verticals in widened column gutters as parallel tracks,
    // horizontals in per-lane strips) decompresses the diagram and spaces the connectors, but
    // still crosses a node when a source has a sibling in the same cell — that last mile needs
    // a real visibility-graph router (planned). This bound tracks the current honest state and
    // fails loudly on a gross routing regression; it is NOT the goal (0 is).
    const nodes = shapes.filter((s) => !NON_FLOW.has(s.bpmnElement.$type)).map((s) => ({ id: s.bpmnElement.id, ...s.bounds }));
    const hits = (a: any, b: any, r: any) => {
      const p = 3, rx0 = r.x + p, ry0 = r.y + p, rx1 = r.x + r.width - p, ry1 = r.y + r.height - p;
      if (Math.abs(a.y - b.y) < 1) return a.y > ry0 && a.y < ry1 && Math.min(a.x, b.x) < rx1 && Math.max(a.x, b.x) > rx0;
      if (Math.abs(a.x - b.x) < 1) return a.x > rx0 && a.x < rx1 && Math.min(a.y, b.y) < ry1 && Math.max(a.y, b.y) > ry0;
      return false;
    };
    let crossing = 0;
    for (const e of edges) {
      const wp = e.waypoint ?? [];
      const sid = e.bpmnElement.sourceRef?.id, tid = e.bpmnElement.targetRef?.id;
      let crosses = false;
      for (let i = 0; i < wp.length - 1 && !crosses; i++)
        for (const n of nodes) { if (n.id !== sid && n.id !== tid && hits(wp[i], wp[i + 1], n)) { crosses = true; break; } }
      if (crosses) crossing++;
    }
    expect(crossing).toBeLessThanOrEqual(16);
  });

  it("staggers gateway branch labels so they don't overprint each other", () => {
    const byGw = new Map<string, any[]>();
    for (const e of edges) {
      const f = e.bpmnElement;
      if (e.label?.bounds && f.name && GW.has(f.sourceRef?.$type)) {
        if (!byGw.has(f.sourceRef.id)) byGw.set(f.sourceRef.id, []);
        byGw.get(f.sourceRef.id)!.push(e.label.bounds);
      }
    }
    let overlaps = 0;
    for (const arr of byGw.values()) for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++)
      if (Math.abs(arr[i].x - arr[j].x) < 40 && Math.abs(arr[i].y - arr[j].y) < 14) overlaps++;
    expect(overlaps).toBe(0);
  });
});
