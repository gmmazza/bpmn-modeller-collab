import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
// @ts-expect-error no type declarations published
import { BpmnModdle } from "bpmn-moddle";
import { layoutDiagramElk } from "./layoutElk";

// Real-world lane-containment regression. The user added swimlanes to the Novotec subprocess
// diagrams and Auto-organizar scrambles them: nodes escape their authored lane, and/or the
// union of lane bands stops tiling the pool (a dead strip appears). Fixtures are byte-identical
// copies of qa-workspace/Procesos Novotec BPMN/*.bpmn (qa-workspace is gitignored and
// STRICTLY READ-ONLY — copied here so CI/fresh clones have them). See layout-qa/out/report.md
// (pre-fix snapshot: .superpowers/sdd/t4-prefix-report.md) for the harness-measured evidence
// this test encodes as invariants: rep_2b_motor_donante shows lanes.violations=5 and
// overlaps.total=2 after auto-organize; rep_2_diagnostico/rep_4_reparacion come out
// metric-clean but their after-PNGs show a dead strip at the bottom of the pool (the union of
// lane bands doesn't tile it) that the harness's metrics miss but these invariants catch.
const NON_FLOW = new Set(["bpmn:Lane", "bpmn:Participant", "bpmn:Group"]);
const TOL = 2; // px tolerance for band-tiling / containment comparisons

async function parseDi(xml: string) {
  const { rootElement } = await new BpmnModdle().fromXML(xml);
  const shapes: any[] = [], edges: any[] = [];
  for (const d of rootElement.diagrams ?? []) for (const pe of d.plane?.planeElement ?? []) {
    if (pe.$type === "bpmndi:BPMNShape" && pe.bpmnElement) shapes.push(pe);
    else if (pe.$type === "bpmndi:BPMNEdge" && pe.bpmnElement) edges.push(pe);
  }
  return { shapes, edges };
}

type FixtureCfg = {
  name: string;
  file: string;
  // Invariant keys KNOWN to fail on the current pre-fix layoutElk.ts for this fixture (see the
  // module comment above for the harness evidence). Marked via it.fails below so the suite stays
  // green until the T5 dispatch fix (laned diagrams → renderMatrix) flips them back to plain it —
  // an invariant that starts passing unexpectedly will fail the suite here too (it.fails asserts
  // the test currently fails), which is the intended bug-first gate.
  expectFail: Set<string>;
};

const FIXTURES: FixtureCfg[] = [
  {
    name: "rep_2_diagnostico",
    file: "src/__fixtures__/rep-lanes-diagnostico.bpmn",
    expectFail: new Set([
      "tilesPool",  // BUG: dead strip — last lane band's bottom sits 56px above the pool's bottom
      "poolWraps",  // BUG: first lane band's top sits 6px ABOVE the pool's own top edge
    ]),
  },
  {
    name: "rep_4_reparacion",
    file: "src/__fixtures__/rep-lanes-reparacion.bpmn",
    expectFail: new Set([
      "tilesPool",  // BUG: dead strip — last lane band's bottom sits 56px above the pool's bottom
      "poolWraps",  // BUG: first lane band's top sits 6px ABOVE the pool's own top edge
    ]),
  },
  {
    name: "rep_2b_motor_donante",
    file: "src/__fixtures__/rep-lanes-motor-donante.bpmn",
    expectFail: new Set([
      "bandsContiguous", // BUG: lane_deposito ("Depósito") band comes out INVERTED, height = -61px
      "tilesPool",       // BUG: dead strip — last lane band's bottom sits 56px above the pool's bottom
      "minHeight",       // BUG: lane_deposito height -61px, far under the 60px bpmn minimum
      "nodeInOwnLane",   // BUG: 5 nodes escape their authored lane (t_recibe_don, t_dev_don,
                          // end_don_dev land ~1 lane up in lane_laboratorio; end_alt, end_nuevo
                          // land ~2 lanes down in lane_taller) — matches harness lanes.violations=5
      "poolWraps",       // BUG: first lane band's top sits 6px ABOVE the pool's own top edge
    ]),
  },
];

for (const { name, file, expectFail } of FIXTURES) {
  describe(`layoutDiagramElk lane invariants — ${name}`, () => {
    let shapes: any[];
    let laneIds: string[];
    let laneMembers: Map<string, Set<string>>; // laneId -> flow node ids per authored flowNodeRef
    let boundaryEventIds: Set<string>;

    beforeAll(async () => {
      const src = readFileSync(file, "utf8");
      const out = await layoutDiagramElk(src);
      ({ shapes } = await parseDi(out));

      const { rootElement } = await new BpmnModdle().fromXML(src);
      const collab = rootElement.rootElements.find((e: any) => e.$type === "bpmn:Collaboration");
      const proc = collab.participants[0].processRef;
      const lanes = proc.laneSets?.[0]?.lanes ?? [];
      laneIds = lanes.map((l: any) => l.id);
      laneMembers = new Map(lanes.map((l: any) => [l.id, new Set((l.flowNodeRef ?? []).map((r: any) => r.id))]));
      boundaryEventIds = new Set(
        (proc.flowElements ?? []).filter((f: any) => f.$type === "bpmn:BoundaryEvent").map((f: any) => f.id),
      );
    });

    // Selects it vs it.fails per invariant key for this fixture, per the expectFail evidence above.
    const t = (key: string) => (expectFail.has(key) ? it.fails : it);

    t("laneSet")("emits exactly the authored lane set (no phantom/missing bands)", () => {
      const outIds = shapes.filter((s) => s.bpmnElement.$type === "bpmn:Lane").map((s) => s.bpmnElement.id);
      expect(new Set(outIds)).toEqual(new Set(laneIds));
    });

    t("bandsContiguous")("lane bands are contiguous, positive-height, non-overlapping, ordered top-to-bottom with no gaps", () => {
      const bands = shapes
        .filter((s) => s.bpmnElement.$type === "bpmn:Lane")
        .map((s) => ({ id: s.bpmnElement.id, ...s.bounds }))
        .sort((a, b) => a.y - b.y);
      for (const b of bands) expect(b.height, `lane ${b.id} non-positive height`).toBeGreaterThan(0);
      for (let i = 0; i < bands.length - 1; i++) {
        const gap = bands[i + 1].y - (bands[i].y + bands[i].height);
        expect(Math.abs(gap), `gap/overlap between ${bands[i].id} and ${bands[i + 1].id}: ${gap}px`).toBeLessThanOrEqual(TOL);
      }
    });

    t("tilesPool")("the union of lane bands tiles the pool rect exactly (no dead strip)", () => {
      const bands = shapes.filter((s) => s.bpmnElement.$type === "bpmn:Lane").map((s) => s.bounds).sort((a, b) => a.y - b.y);
      const pool = shapes.find((s) => s.bpmnElement.$type === "bpmn:Participant")!.bounds;
      expect(bands.length, "no lane bands found").toBeGreaterThan(0);
      const top = bands[0].y, bottom = bands[bands.length - 1].y + bands[bands.length - 1].height;
      expect(top - pool.y, "first band top != pool top (dead strip above)").toBeLessThanOrEqual(TOL);
      expect((pool.y + pool.height) - bottom, "last band bottom != pool bottom (dead strip below)").toBeLessThanOrEqual(TOL);
    });

    t("minHeight")("every lane band meets the bpmn minimum band height (>= 60px)", () => {
      const bands = shapes.filter((s) => s.bpmnElement.$type === "bpmn:Lane").map((s) => ({ id: s.bpmnElement.id, ...s.bounds }));
      for (const b of bands) expect(b.height, `lane ${b.id} height ${b.height}px < 60px`).toBeGreaterThanOrEqual(60);
    });

    t("nodeInOwnLane")("every flow node sits fully inside its OWN authored lane band (boundary events exempt)", () => {
      const bandById = new Map(shapes.filter((s) => s.bpmnElement.$type === "bpmn:Lane").map((s) => [s.bpmnElement.id, s.bounds]));
      const nodeShapes = shapes.filter((s) => !NON_FLOW.has(s.bpmnElement.$type) && !boundaryEventIds.has(s.bpmnElement.id));
      const offenders: string[] = [];
      for (const s of nodeShapes) {
        const id = s.bpmnElement.id;
        const ownLane = laneIds.find((lid) => laneMembers.get(lid)!.has(id));
        if (!ownLane) continue; // not referenced by any lane (shouldn't happen — every fixture node is laned)
        const band = bandById.get(ownLane);
        if (!band) { offenders.push(`${id}: own lane ${ownLane} has no band`); continue; }
        const b = s.bounds;
        const within = b.y >= band.y - TOL && b.y + b.height <= band.y + band.height + TOL;
        if (!within) offenders.push(`${id}: [${b.y},${b.y + b.height}] outside band [${band.y},${band.y + band.height}] (lane ${ownLane})`);
      }
      expect(offenders, offenders.join("; ")).toEqual([]);
    });

    t("poolWraps")("the pool wraps all lane bands horizontally and vertically", () => {
      const bands = shapes.filter((s) => s.bpmnElement.$type === "bpmn:Lane").map((s) => s.bounds);
      const pool = shapes.find((s) => s.bpmnElement.$type === "bpmn:Participant")!.bounds;
      for (const b of bands) {
        expect(b.x, "band left outside pool").toBeGreaterThanOrEqual(pool.x - TOL);
        expect(b.x + b.width, "band right outside pool").toBeLessThanOrEqual(pool.x + pool.width + TOL);
        expect(b.y, "band top outside pool").toBeGreaterThanOrEqual(pool.y - TOL);
        expect(b.y + b.height, "band bottom outside pool").toBeLessThanOrEqual(pool.y + pool.height + TOL);
      }
    });
  });
}
