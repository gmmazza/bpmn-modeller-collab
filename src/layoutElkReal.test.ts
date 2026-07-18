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

  it("keeps every flow node inside a phase column (hybrid X stays banded per phase)", () => {
    // Hybrid layout: nodes step right by flow WITHIN their phase, but each phase stays a clean
    // contiguous X band. So every flow node must sit inside some phase (Group) box — if X were
    // driven by global flow instead (round-11 regression), members of different phases would
    // interleave and escape their box. Guards that the fine-column X stays bounded per phase.
    const groups = shapes.filter((s) => s.bpmnElement.$type === "bpmn:Group").map((s) => s.bounds);
    const nodes = shapes.filter((s) => !NON_FLOW.has(s.bpmnElement.$type)).map((s) => ({ id: s.bpmnElement.id, ...s.bounds }));
    let escaped = 0;
    for (const n of nodes) {
      const cx = n.x + n.width / 2;
      if (!groups.some((g) => cx >= g.x - 2 && cx <= g.x + g.width + 2)) escaped++;
    }
    expect(escaped, "a node's centre fell outside every phase column").toBe(0);
  });

  it("keeps lane bands compact — inter-lane channels stay thin, no fat per-lane strips", () => {
    // The matrix must preserve the AUTHORED compact proportions. A band hugs its tallest node +
    // PAD, plus at most a THIN inter-lane routing channel (only the few skip/back edges use one).
    // What must NOT come back is the old per-lane top strip that routed EVERY cross-lane edge and
    // doubled every band (150→330) / the whole diagram (890→1946). So: (a) no single band blows
    // past its tallest node by a large margin, and (b) the total height stays close to authored.
    const lanes = shapes.filter((s) => s.bpmnElement.$type === "bpmn:Lane").map((s) => s.bounds).sort((a, b) => a.y - b.y);
    const nodes = shapes.filter((s) => !NON_FLOW.has(s.bpmnElement.$type)).map((s) => s.bounds);
    for (const lane of lanes) {
      const inBand = nodes.filter((n) => { const cy = n.y + n.height / 2; return cy >= lane.y && cy <= lane.y + lane.height; });
      const tallest = inBand.length ? Math.max(...inBand.map((n) => n.height)) : 36;
      // A lane may STACK parallel branches in vertical slots (distinct node-centre rows). Allow one
      // "tallest + PAD" per slot + a modest channel; the old fat strip blew far past even that.
      const rows = new Set(inBand.map((n) => Math.round(n.y + n.height / 2))).size || 1;
      expect(lane.height, `lane band too tall (fat strip regression?) — h=${lane.height}, tallest=${tallest}, rows=${rows}`)
        .toBeLessThanOrEqual(rows * (tallest + 60) + 80);
    }
    const top = Math.min(...lanes.map((l) => l.y)), bot = Math.max(...lanes.map((l) => l.y + l.height));
    expect(bot - top, "total height ballooned — per-lane strip regression").toBeLessThanOrEqual(1400); // authored ~890, now ~1080; old broken 1946
  });

  it("makes forward edges enter their target from the LEFT (elk port-side rule), not the right", () => {
    // A forward edge (target laid to the right of the source) must enter the target from its LEFT
    // (west) side — entering from the right reads as the flow doubling back. This encodes the user
    // feedback; it caught the fan-in deconcentration dropping the vertical past the target.
    const box = new Map(shapes.filter((s) => !NON_FLOW.has(s.bpmnElement.$type)).map((s) => [s.bpmnElement.id, s.bounds]));
    let rightEntries = 0;
    for (const e of edges) {
      const wp = e.waypoint ?? []; if (wp.length < 2) continue;
      const s = box.get(e.bpmnElement.sourceRef?.id), t = box.get(e.bpmnElement.targetRef?.id);
      if (!s || !t || t.x <= s.x) continue; // only forward edges
      const end = wp[wp.length - 1], prev = wp[wp.length - 2];
      if (Math.abs(end.x - (t.x + t.width)) < 3 && prev.x > end.x) rightEntries++; // entered from the right edge
    }
    expect(rightEntries, "a forward edge entered its target from the right").toBe(0);
  });

  it("routes almost no edge through a node (grid routing: gutters + inter-lane channels)", () => {
    // Grid routing on flow generations: most edges hop to an adjacent column and route through an
    // empty gutter (vertical) + short node-row horizontals; the few skip/back edges take a clear
    // inter-lane channel. Verticals live in empty gutters, so they must NEVER cross a node (hard
    // guarantee). A couple of horizontals may still clip a node in a tight corner (2 on this
    // fixture, down from 14); the bound catches a gross routing regression.
    const nodes = shapes.filter((s) => !NON_FLOW.has(s.bpmnElement.$type)).map((s) => ({ id: s.bpmnElement.id, ...s.bounds }));
    const clips = (a: any, b: any, r: any) => {
      const p = 3, rx0 = r.x + p, ry0 = r.y + p, rx1 = r.x + r.width - p, ry1 = r.y + r.height - p;
      const vertical = Math.abs(a.x - b.x) < 1;
      if (vertical) return { v: true, hit: a.x > rx0 && a.x < rx1 && Math.min(a.y, b.y) < ry1 && Math.max(a.y, b.y) > ry0 };
      if (Math.abs(a.y - b.y) < 1) return { v: false, hit: a.y > ry0 && a.y < ry1 && Math.min(a.x, b.x) < rx1 && Math.max(a.x, b.x) > rx0 };
      return { v: false, hit: false };
    };
    let vertCross = 0, totalCross = 0;
    for (const e of edges) {
      const wp = e.waypoint ?? [];
      const sid = e.bpmnElement.sourceRef?.id, tid = e.bpmnElement.targetRef?.id;
      let crosses = false, vHit = false;
      for (let i = 0; i < wp.length - 1; i++)
        for (const n of nodes) {
          if (n.id === sid || n.id === tid) continue;
          const c = clips(wp[i], wp[i + 1], n);
          if (c.hit) { crosses = true; if (c.v) vHit = true; }
        }
      if (vHit) vertCross++;
      if (crosses) totalCross++;
    }
    expect(vertCross, "a vertical dropped through a node — gutter/track math regressed").toBe(0);
    // 0 crossings on this fixture (grid routing + one-node-per-cell). Tiny headroom catches regressions.
    expect(totalCross).toBeLessThanOrEqual(2);
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
