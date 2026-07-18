import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
// @ts-expect-error no type declarations published
import { BpmnModdle } from "bpmn-moddle";
import { layoutDiagramElk } from "./layoutElk";

// Reproduces the real master-map defect (screenshot 2026-07-18): a Call Activity with several
// named escalation boundary events. bpmn-js / the layouter placed every boundary label centred
// directly below its circle, so with the circles packed on one edge the outcome names overprinted
// each other. The fix cascades stacked labels down a row each. This asserts the invariant on the
// regenerated DI — it fails if the stagger regresses (all labels collapse onto one row again).
const SRC = readFileSync("src/__fixtures__/master-escalation-boundaries.bpmn", "utf8");

async function parseDi(xml: string) {
  const { rootElement } = await new BpmnModdle().fromXML(xml);
  const shapes: any[] = [];
  for (const d of rootElement.diagrams ?? []) for (const pe of d.plane?.planeElement ?? []) {
    if (pe.$type === "bpmndi:BPMNShape" && pe.bpmnElement) shapes.push(pe);
  }
  return shapes;
}

// Long outcome names wrap to ~2 lines when rendered (bpmn-js auto-sizes past the 14px DI hint),
// so "not overprinting" means consecutive stacked labels clear a wrapped label's real height.
const WRAP_CLEARANCE = 28;

describe("layoutDiagramElk — stacked escalation boundary labels don't overprint", () => {
  let shapes: any[];
  beforeAll(async () => {
    shapes = await parseDi(await layoutDiagramElk(SRC));
  });

  it("emits a shape + a label for each named boundary event", () => {
    const boundaries = shapes.filter((s) => s.bpmnElement.$type === "bpmn:BoundaryEvent");
    expect(boundaries).toHaveLength(4);
    for (const b of boundaries) expect(!!b.label?.bounds, `missing label for ${b.bpmnElement.id}`).toBe(true);
  });

  it("staggers the four outcome labels so no two overprint (the screenshot bug)", () => {
    // All four share the one host, so they must be separated VERTICALLY: any two whose y are
    // closer than a wrapped label's height share ink (the labels are wide and centred under
    // circles only ~30px apart, so horizontal separation alone can't save them). This asserts
    // the real render is clean — the first cut used a 16px step and still overprinted on screen.
    const ys = shapes
      .filter((s) => s.bpmnElement.$type === "bpmn:BoundaryEvent" && s.label?.bounds)
      .map((s) => s.label.bounds.y)
      .sort((a, b) => a - b);
    let tooClose = 0;
    for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] < WRAP_CLEARANCE) tooClose++;
    expect(tooClose, "stacked outcome labels sit within a wrapped label's height → they overprint").toBe(0);
  });

  it("keeps the boundary circles distributed, not stacked on one point", () => {
    const circles = shapes
      .filter((s) => s.bpmnElement.$type === "bpmn:BoundaryEvent")
      .map((s) => s.bounds);
    const xs = new Set(circles.map((c) => Math.round(c.x / 4))); // ~4px buckets
    expect(xs.size, "all boundary circles landed on the same x (not distributed)").toBeGreaterThan(1);
  });
});
