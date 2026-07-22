import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
// @ts-expect-error no type declarations published
import { BpmnModdle } from "bpmn-moddle";
import { layoutDiagramElk } from "./layoutElk";

// Real-world lane-containment regression (bug-first, now fixed). The user added swimlanes to
// the Novotec subprocess diagrams and Auto-organizar scrambled them: nodes escaped their
// authored lane, one band came out inverted (-61px), and the union of lane bands stopped
// tiling the pool (56px dead strip below, 6px overflow above). Root cause: laned diagrams
// without phase groups took the elk-INTERACTIVE "seeded-Y" path, which derived lane bands
// from wherever elk placed the members. Fixed by dispatching every laned process through
// renderMatrix (lanes are hard bands by construction) and sizing the pool to the bands'
// extent. Fixtures are byte-identical copies of qa-workspace/Procesos Novotec BPMN/*.bpmn
// (qa-workspace is gitignored and STRICTLY READ-ONLY — copied here so CI/fresh clones have
// them). Pre-fix evidence: .superpowers/sdd/t4-prefix-report.md (rep_2b_motor_donante showed
// lanes.violations=5) — these invariants reproduced all of it and now pin the fix.
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

const FIXTURES = [
  { name: "rep_2_diagnostico", file: "src/__fixtures__/rep-lanes-diagnostico.bpmn" },
  { name: "rep_4_reparacion", file: "src/__fixtures__/rep-lanes-reparacion.bpmn" },
  { name: "rep_2b_motor_donante", file: "src/__fixtures__/rep-lanes-motor-donante.bpmn" },
];

for (const { name, file } of FIXTURES) {
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

    it("emits exactly the authored lane set (no phantom/missing bands)", () => {
      const outIds = shapes.filter((s) => s.bpmnElement.$type === "bpmn:Lane").map((s) => s.bpmnElement.id);
      expect(new Set(outIds)).toEqual(new Set(laneIds));
    });

    it("lane bands are positive-height and, sorted by y, contiguous (no gaps or overlaps)", () => {
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

    it("the union of lane bands tiles the pool rect exactly (no dead strip)", () => {
      const bands = shapes.filter((s) => s.bpmnElement.$type === "bpmn:Lane").map((s) => s.bounds).sort((a, b) => a.y - b.y);
      const pool = shapes.find((s) => s.bpmnElement.$type === "bpmn:Participant")!.bounds;
      expect(bands.length, "no lane bands found").toBeGreaterThan(0);
      const top = bands[0].y, bottom = bands[bands.length - 1].y + bands[bands.length - 1].height;
      expect(top - pool.y, "first band top != pool top (dead strip above)").toBeLessThanOrEqual(TOL);
      expect((pool.y + pool.height) - bottom, "last band bottom != pool bottom (dead strip below)").toBeLessThanOrEqual(TOL);
    });

    it("every lane band meets the bpmn minimum band height (>= 60px)", () => {
      const bands = shapes.filter((s) => s.bpmnElement.$type === "bpmn:Lane").map((s) => ({ id: s.bpmnElement.id, ...s.bounds }));
      for (const b of bands) expect(b.height, `lane ${b.id} height ${b.height}px < 60px`).toBeGreaterThanOrEqual(60);
    });

    it("every flow node sits fully inside its OWN authored lane band (boundary events exempt)", () => {
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

    it("the pool wraps all lane bands horizontally and vertically", () => {
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

// Gateway branch-label placement (bug-first, 2026-07-22, refined after exe inspection). The
// matrix branch-label column must sit CLOSE to its gateway but ABOVE the gateway's outgoing
// connector lines — two failure modes, both seen in the packaged exe:
//   (1) too FAR: the original stack anchored at the row's top edge (`cy - rowUnit/2`), which for
//       a row of tall task nodes floats the labels ~40px above the gateway they annotate; and
//   (2) ON the line: a later fix centred the stack on the gateway, which dropped the lower
//       branch's label straight onto its horizontal exit segment (rep_2's "Sí, ya la tiene" and
//       rep_2b's "Descartar" struck through by their own connector).
// The gateways' exits fan out staggered from cy downward (e.g. rep_2b gw_decide: 64/66/82), so the
// whole stack must live just ABOVE the highest exit line. These invariants work at the DI level
// (label bounds + edge waypoints ARE what the layouter controls) and reproduce both modes.
const IS_GATEWAY = (t: string) => /Gateway$/.test(t);

const IS_EVENT = (t: string) => /Event$/.test(t);

for (const { name, file } of FIXTURES) {
  describe(`gateway branch-label placement — ${name}`, () => {
    // Per gateway: its box + one record per NAMED outgoing branch (exit-port Y, waypoint count,
    // its own label box, and its target's centre / leaf-event-ness — for the straight-branch check).
    type Branch = { id: string; exitY: number; wp: number; label?: { y: number; h: number; x: number; w: number }; targetCy: number; targetLeafEvent: boolean };
    let gateways: Array<{ gid: string; cy: number; branches: Branch[]; exitPorts: number[] }>;

    beforeAll(async () => {
      const src = readFileSync(file, "utf8");
      const out = await layoutDiagramElk(src);
      const { shapes, edges } = await parseDi(out);
      const box = new Map(shapes.map((s) => [s.bpmnElement.id, s.bounds]));
      const type = new Map(shapes.map((s) => [s.bpmnElement.id, s.bpmnElement.$type as string]));
      const outdeg = new Map<string, number>();
      for (const e of edges) { const s = e.bpmnElement?.sourceRef?.id; if (s) outdeg.set(s, (outdeg.get(s) ?? 0) + 1); }
      const gwIds = new Set(shapes.filter((s) => IS_GATEWAY(s.bpmnElement.$type)).map((s) => s.bpmnElement.id));

      const bySrc = new Map<string, Branch[]>();
      for (const e of edges) {
        const sid = e.bpmnElement?.sourceRef?.id, tid = e.bpmnElement?.targetRef?.id;
        if (!sid || !gwIds.has(sid) || !e.bpmnElement?.name) continue;
        const wp = e.waypoint ?? []; if (!wp.length) continue;
        const tb = tid ? box.get(tid) : undefined;
        const lb = e.label?.bounds;
        (bySrc.get(sid) ?? bySrc.set(sid, []).get(sid)!).push({
          id: e.bpmnElement.id, exitY: wp[0].y, wp: wp.length,
          label: lb ? { y: lb.y, h: lb.height, x: lb.x, w: lb.width } : undefined,
          targetCy: tb ? tb.y + tb.height / 2 : NaN,
          targetLeafEvent: !!tid && (outdeg.get(tid) ?? 0) === 0 && IS_EVENT(type.get(tid) ?? ""),
        });
      }
      gateways = [...bySrc].map(([gid, branches]) => {
        const b = box.get(gid)!;
        return { gid, cy: b.y + b.height / 2, branches, exitPorts: branches.map((br) => br.exitY).sort((a, z) => a - z) };
      });
    });

    it("has a gateway with branch labels (fixture sanity)", () => {
      expect(gateways.length).toBeGreaterThan(0);
    });

    it("gateway exit ports are spread >= 8px apart (connectors of one gateway don't overprint)", () => {
      // The red-arrow bug: rep_2b's 3-way gateway fired two exits 2px apart (y 64/66).
      const offenders: string[] = [];
      for (const g of gateways)
        for (let i = 0; i < g.exitPorts.length - 1; i++) {
          const d = g.exitPorts[i + 1] - g.exitPorts[i];
          if (d < 8) offenders.push(`${g.gid}: exit ports ${Math.round(g.exitPorts[i])}/${Math.round(g.exitPorts[i + 1])} only ${Math.round(d)}px apart`);
        }
      expect(offenders, offenders.join("; ")).toEqual([]);
    });

    it("every branch label rides just above ITS OWN connector (not stacked away from it)", () => {
      // The user's "label junto al connector" ask: each label's bottom sits a few px above its own
      // exit line, within [exitY-24, exitY]. Pre-fix the ≤2-branch path STACKED both labels above
      // the top exit, so the branch whose exit is lower had its label floated ~28px above it.
      const offenders: string[] = [];
      for (const g of gateways)
        for (const br of g.branches) {
          if (!br.label) continue;
          const bottom = br.label.y + br.label.h;
          if (bottom < br.exitY - 24 || bottom > br.exitY)
            offenders.push(`${g.gid}/${br.id}: label bottom ${Math.round(bottom)} not just above its exit ${Math.round(br.exitY)} (want [${Math.round(br.exitY - 24)}, ${Math.round(br.exitY)}])`);
        }
      expect(offenders, offenders.join("; ")).toEqual([]);
    });

    it("a straight branch to a nearby leaf event renders straight — no Z-step", () => {
      // The user's "escalón innecesario" ask: rep_2b's "Reparar con alternativo" → the "Sigue con
      // alternativo" end event stepped (exit y42 ≠ entry y64) because the event wasn't moved to the
      // branch's row. A branch to a leaf event within ~2 gaps of the gateway centre must be a single
      // straight segment (2 waypoints); the layouter nudges the event's height to make it so.
      const offenders: string[] = [];
      for (const g of gateways)
        for (const br of g.branches)
          if (br.targetLeafEvent && Math.abs(br.targetCy - g.cy) <= 44 && br.wp !== 2)
            offenders.push(`${g.gid}/${br.id}: leaf-event branch has ${br.wp} waypoints (Z-step), expected 2 (straight)`);
      expect(offenders, offenders.join("; ")).toEqual([]);
    });
  });
}
