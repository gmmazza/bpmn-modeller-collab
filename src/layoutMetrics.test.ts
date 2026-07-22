import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  computeMetrics,
  edgeEdgeCrossings,
  edgeNodeClips,
  overlaps,
  laneContainment,
  straightness,
  cohesion,
  type Scene,
} from "./layoutMetrics";

// Minimal-scene builder: every metric function takes the whole Scene, so tests only need to
// fill the slice they exercise; everything else defaults empty.
function makeScene(partial: Partial<Scene>): Scene {
  return { nodes: [], edges: [], lanes: [], labels: [], laneAssignment: {}, ...partial };
}

describe("edgeEdgeCrossings", () => {
  it("counts a perpendicular H×V crossing between different edges", () => {
    const scene = makeScene({
      edges: [
        { id: "e1", source: "a", target: "b", waypoints: [{ x: 0, y: 50 }, { x: 100, y: 50 }] },
        { id: "e2", source: "c", target: "d", waypoints: [{ x: 50, y: 0 }, { x: 50, y: 100 }] },
      ],
    });
    expect(edgeEdgeCrossings(scene)).toEqual({ hv: 1, hh: 0, vv: 0, total: 1 });
  });

  it("does not count a T-junction at a shared node as a crossing (strict-interior regression)", () => {
    // Both edges leave the same source "a" at (0,50): one runs straight out, the other drops
    // down from that same point. A naive inclusive-bounds check would flag this as a crossing
    // because the vertical's x sits exactly at the horizontal's endpoint x — it must not.
    const scene = makeScene({
      edges: [
        { id: "e1", source: "a", target: "b", waypoints: [{ x: 0, y: 50 }, { x: 100, y: 50 }] },
        { id: "e2", source: "a", target: "c", waypoints: [{ x: 0, y: 50 }, { x: 0, y: 150 }] },
      ],
    });
    expect(edgeEdgeCrossings(scene).total).toBe(0);
  });

  it("counts overlapping collinear horizontal segments as hh", () => {
    const scene = makeScene({
      edges: [
        { id: "e1", source: "a", target: "b", waypoints: [{ x: 0, y: 50 }, { x: 60, y: 50 }] },
        { id: "e2", source: "c", target: "d", waypoints: [{ x: 40, y: 50 }, { x: 100, y: 50 }] },
      ],
    });
    expect(edgeEdgeCrossings(scene)).toEqual({ hv: 0, hh: 1, vv: 0, total: 1 });
  });

  it("counts overlapping collinear vertical segments as vv", () => {
    const scene = makeScene({
      edges: [
        { id: "e1", source: "a", target: "b", waypoints: [{ x: 30, y: 0 }, { x: 30, y: 60 }] },
        { id: "e2", source: "c", target: "d", waypoints: [{ x: 30, y: 40 }, { x: 30, y: 100 }] },
      ],
    });
    expect(edgeEdgeCrossings(scene)).toEqual({ hv: 0, hh: 0, vv: 1, total: 1 });
  });

  it("ignores self-crossings within a single edge's own polyline (different-edges-only rule)", () => {
    // A flag-shaped orthogonal polyline that genuinely crosses itself (last horizontal segment
    // crosses the second vertical segment). If an implementation iterated over ALL segment
    // pairs instead of only pairs from DIFFERENT edges, this single edge would score total > 0.
    const scene = makeScene({
      edges: [
        {
          id: "e1", source: "a", target: "b",
          waypoints: [
            { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 },
            { x: -50, y: 100 }, { x: -50, y: 50 }, { x: 150, y: 50 },
          ],
        },
      ],
    });
    expect(edgeEdgeCrossings(scene)).toEqual({ hv: 0, hh: 0, vv: 0, total: 0 });
  });
});

describe("edgeNodeClips", () => {
  it("flags a vertical segment that clips through an unrelated node", () => {
    const scene = makeScene({
      nodes: [
        { id: "obstacle", x: 40, y: 0, width: 20, height: 100 },
        { id: "s", x: -20, y: -20, width: 10, height: 10 },
        { id: "t", x: 40, y: 120, width: 10, height: 10 },
      ],
      edges: [{ id: "e1", source: "s", target: "t", waypoints: [{ x: 50, y: -10 }, { x: 50, y: 110 }] }],
    });
    expect(edgeNodeClips(scene)).toEqual({ horizontal: 0, vertical: 1, total: 1 });
  });

  it("flags a horizontal segment that clips through an unrelated node", () => {
    const scene = makeScene({
      nodes: [
        { id: "obstacle", x: 0, y: 40, width: 100, height: 20 },
        { id: "s", x: -20, y: -20, width: 10, height: 10 },
        { id: "t", x: 120, y: 40, width: 10, height: 10 },
      ],
      edges: [{ id: "e1", source: "s", target: "t", waypoints: [{ x: -10, y: 50 }, { x: 110, y: 50 }] }],
    });
    expect(edgeNodeClips(scene)).toEqual({ horizontal: 1, vertical: 0, total: 1 });
  });

  it("does not flag a segment touching only its own source/target node (attachment exclusion)", () => {
    const scene = makeScene({
      nodes: [
        { id: "obstacle", x: 40, y: 0, width: 20, height: 40 },
        { id: "t2", x: 40, y: 250, width: 10, height: 10 },
      ],
      // "obstacle" is the edge's own source, so the segment starting inside it must not clip.
      edges: [{ id: "e1", source: "obstacle", target: "t2", waypoints: [{ x: 50, y: 20 }, { x: 50, y: 200 }] }],
    });
    expect(edgeNodeClips(scene)).toEqual({ horizontal: 0, vertical: 0, total: 0 });
  });

  it("does not flag a segment only grazing the 3px inset border of a node", () => {
    const scene = makeScene({
      nodes: [
        { id: "n1", x: 0, y: 0, width: 100, height: 100 },
        { id: "s3", x: -20, y: -20, width: 10, height: 10 },
        { id: "t3", x: 1, y: 120, width: 10, height: 10 },
      ],
      // x=1 sits inside the raw rect (0..100) but within the 3px inset margin, so it must not hit.
      edges: [{ id: "e1", source: "s3", target: "t3", waypoints: [{ x: 1, y: -10 }, { x: 1, y: 110 }] }],
    });
    expect(edgeNodeClips(scene)).toEqual({ horizontal: 0, vertical: 0, total: 0 });
  });
});

describe("overlaps", () => {
  it("counts a node×node overlap beyond the 4px tolerance", () => {
    const scene = makeScene({
      nodes: [
        { id: "n1", x: 0, y: 0, width: 50, height: 50 },
        { id: "n2", x: 40, y: 0, width: 50, height: 50 },
      ],
    });
    expect(overlaps(scene).nodeNode).toBe(1);
  });

  it("does not count a near-touch under the 4px tolerance (matches the reused loop's threshold)", () => {
    const scene = makeScene({
      nodes: [
        { id: "n1", x: 0, y: 0, width: 50, height: 50 },
        { id: "n2", x: 48, y: 0, width: 50, height: 50 },
      ],
    });
    expect(overlaps(scene).nodeNode).toBe(0);
  });

  it("counts overlapping label×label boxes", () => {
    const scene = makeScene({
      labels: [
        { id: "l1", owner: "x", x: 0, y: 0, width: 40, height: 14 },
        { id: "l2", owner: "y", x: 20, y: 0, width: 40, height: 14 },
      ],
    });
    expect(overlaps(scene).labelLabel).toBe(1);
  });

  it("counts a label overlapping an unrelated node", () => {
    const scene = makeScene({
      nodes: [{ id: "obstacle", x: 0, y: 0, width: 50, height: 50 }],
      labels: [{ id: "l1", owner: "x", x: 10, y: 10, width: 30, height: 14 }],
    });
    expect(overlaps(scene).labelNode).toBe(1);
  });

  it("excludes a label overlapping its own owner node (internal labels sit inside their shape)", () => {
    const scene = makeScene({
      nodes: [{ id: "n1", x: 0, y: 0, width: 100, height: 40 }],
      labels: [{ id: "lb1", owner: "n1", x: 10, y: 10, width: 60, height: 14 }], // fully inside n1
    });
    expect(overlaps(scene).labelNode).toBe(0);
  });

  it("counts the same label overlapping a DIFFERENT node that isn't its owner", () => {
    const scene = makeScene({
      nodes: [{ id: "n2", x: 0, y: 0, width: 100, height: 40 }], // same box, different id
      labels: [{ id: "lb1", owner: "n1", x: 10, y: 10, width: 60, height: 14 }],
    });
    expect(overlaps(scene).labelNode).toBe(1);
  });

  it("sums all three overlap kinds into total", () => {
    const scene = makeScene({
      nodes: [
        { id: "n1", x: 0, y: 0, width: 50, height: 50 },
        { id: "n2", x: 40, y: 0, width: 50, height: 50 },
        { id: "n3", x: 200, y: 200, width: 50, height: 50 },
      ],
      labels: [
        { id: "l1", owner: "n1", x: 300, y: 0, width: 40, height: 14 },
        { id: "l2", owner: "n2", x: 320, y: 0, width: 40, height: 14 },
        // owner is "n1" (not "n3") even though it geometrically sits inside n3 — this must still
        // count as a labelNode overlap; only overlap with one's OWN owner is exempt.
        { id: "l3", owner: "n1", x: 210, y: 210, width: 20, height: 14 },
      ],
    });
    const r = overlaps(scene);
    expect(r).toEqual({ nodeNode: 1, labelLabel: 1, labelNode: 1, total: 3 });
  });
});

describe("laneContainment", () => {
  it("flags a flow node outside its lane band", () => {
    const scene = makeScene({
      lanes: [{ id: "L1", x: 0, y: 0, width: 500, height: 100 }],
      nodes: [{ id: "n1", x: 10, y: 80, width: 30, height: 60 }], // bottom=140, band bottom=100
      laneAssignment: { n1: "L1" },
    });
    const r = laneContainment(scene);
    expect(r.outOfLane).toBe(1);
    expect(r.violations).toBe(1);
  });

  it("exempts boundary events not listed in laneAssignment", () => {
    const scene = makeScene({
      lanes: [{ id: "L1", x: 0, y: 0, width: 500, height: 100 }],
      nodes: [
        { id: "host", x: 10, y: 10, width: 36, height: 36 },
        // Way outside every lane band, but absent from laneAssignment — must be exempt.
        { id: "boundary1", x: 400, y: 900, width: 36, height: 36, type: "bpmn:BoundaryEvent" },
      ],
      laneAssignment: { host: "L1" },
      boundaryHosts: { boundary1: "host" },
    });
    expect(laneContainment(scene).outOfLane).toBe(0);
  });

  it("flags overlapping/inverted lane bands", () => {
    const scene = makeScene({
      lanes: [
        { id: "L1", x: 0, y: 0, width: 500, height: 100 },
        { id: "L2", x: 0, y: 50, width: 500, height: 100 }, // starts before L1 ends
      ],
    });
    const r = laneContainment(scene);
    expect(r.bandOverlaps).toBe(1);
    expect(r.violations).toBe(1);
  });

  it("finds a non-adjacent band overlap regardless of raw scene.lanes array order", () => {
    // L2 is clear of both; L1 and L3 genuinely overlap (0-100 vs 50-150) — exactly ONE true
    // violation. Placed in array order [L2, L1, L3] (not sorted by y): a scan that only compares
    // RAW-order adjacent pairs checks (L2,L1) and (L1,L3) — the first is a spurious flag (L2 and
    // L1 don't overlap; the check only looks broken because the array isn't sorted), while
    // (L1,L3) IS the real violation — so the raw-order scan reports 2 (one real + one spurious),
    // not 1. Sorting by y before scanning collapses this to the correct single violation.
    const L1 = { id: "L1", x: 0, y: 0, width: 500, height: 100 };     // 0-100
    const L2 = { id: "L2", x: 0, y: 300, width: 500, height: 100 };   // 300-400, clear of both
    const L3 = { id: "L3", x: 0, y: 50, width: 500, height: 100 };    // 50-150, overlaps L1
    const scene = makeScene({ lanes: [L2, L1, L3] });
    const r = laneContainment(scene);
    expect(r.bandOverlaps).toBe(1);
    expect(r.violations).toBe(1);
  });

  it("flags a laneAssignment referencing a lane with no band shape, without double-counting", () => {
    const scene = makeScene({
      lanes: [],
      nodes: [{ id: "n1", x: 0, y: 0, width: 30, height: 30 }],
      laneAssignment: { n1: "GHOST_LANE" },
    });
    const r = laneContainment(scene);
    expect(r.missingLaneShapes).toBe(1);
    expect(r.outOfLane).toBe(0); // can't be checked for containment without a band — must not also count here
    expect(r.violations).toBe(1);
  });
});

describe("straightness", () => {
  const laneAssignment = { s: "L1", t: "L1" };
  const lanes: Scene["lanes"] = [{ id: "L1", x: 0, y: 0, width: 400, height: 60 }];

  it("scores a straight same-row same-lane forward edge as 100% straight, zero bends", () => {
    const scene = makeScene({
      nodes: [
        { id: "s", x: 0, y: 0, width: 40, height: 40 },
        { id: "t", x: 200, y: 0, width: 40, height: 40 },
      ],
      edges: [{ id: "e1", source: "s", target: "t", waypoints: [{ x: 40, y: 20 }, { x: 200, y: 20 }] }],
      laneAssignment, lanes,
    });
    expect(straightness(scene)).toEqual({ straightPct: 100, sameRowBends: 0, dodges: 0 });
  });

  it("penalizes an unnecessary bend on an already Y-aligned same-row edge (placement-failure dodge)", () => {
    const scene = makeScene({
      nodes: [
        { id: "s", x: 0, y: 0, width: 40, height: 40 },
        { id: "t", x: 200, y: 0, width: 40, height: 40 },
      ],
      edges: [{
        id: "e1", source: "s", target: "t",
        waypoints: [{ x: 40, y: 20 }, { x: 120, y: 20 }, { x: 120, y: 60 }, { x: 200, y: 20 }],
      }],
      laneAssignment, lanes,
    });
    const r = straightness(scene);
    expect(r.straightPct).toBe(0);
    expect(r.sameRowBends).toBe(2);
    expect(r.dodges).toBe(2);
  });

  it("excludes edges whose endpoints are not Y-aligned from the population", () => {
    const scene = makeScene({
      nodes: [
        { id: "s", x: 0, y: 0, width: 40, height: 40 },
        { id: "t", x: 200, y: 100, width: 40, height: 40 }, // centre y=120, not within 2px of 20
      ],
      edges: [{
        id: "e1", source: "s", target: "t",
        waypoints: [{ x: 40, y: 20 }, { x: 120, y: 20 }, { x: 120, y: 120 }, { x: 200, y: 120 }],
      }],
      laneAssignment, lanes,
    });
    expect(straightness(scene)).toEqual({ straightPct: 100, sameRowBends: 0, dodges: 0 });
  });

  it("excludes backward edges (target left of source) even if same-row and same-lane", () => {
    const scene = makeScene({
      nodes: [
        { id: "s", x: 200, y: 0, width: 40, height: 40 },
        { id: "t", x: 0, y: 0, width: 40, height: 40 },
      ],
      edges: [{
        id: "e1", source: "s", target: "t",
        waypoints: [{ x: 200, y: 60 }, { x: 200, y: 100 }, { x: 40, y: 100 }, { x: 40, y: 20 }],
      }],
      laneAssignment, lanes,
    });
    expect(straightness(scene)).toEqual({ straightPct: 100, sameRowBends: 0, dodges: 0 });
  });
});

describe("cohesion", () => {
  it("computes total and mean Manhattan edge length exactly", () => {
    const scene = makeScene({
      edges: [
        { id: "e1", source: "a", target: "b", waypoints: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }] }, // 10 + 5 = 15
        { id: "e2", source: "c", target: "d", waypoints: [{ x: 0, y: 0 }, { x: 3, y: 4 }] }, // 3 + 4 = 7
      ],
    });
    const r = cohesion(scene);
    expect(r.totalEdgeLength).toBe(22);
    expect(r.meanEdgeLength).toBe(11);
  });

  it("computes bbox area as the exact union of node, lane, and label rects", () => {
    const scene = makeScene({
      nodes: [{ id: "a", x: 0, y: 0, width: 40, height: 20 }],
      lanes: [{ id: "L1", x: -10, y: -10, width: 100, height: 50 }],
      labels: [{ id: "lb1", owner: "a", x: 120, y: 0, width: 20, height: 10 }],
    });
    // union: x[-10,140], y[-10,40] -> 150 x 50
    expect(cohesion(scene).bboxArea).toBe(7500);
  });
});

describe("computeMetrics", () => {
  it("composes all six metric functions into one report without dropping or mislabeling a field", () => {
    const scene = makeScene({
      nodes: [
        { id: "s", x: 0, y: 0, width: 40, height: 40 },
        { id: "t", x: 200, y: 0, width: 40, height: 40 },
      ],
      edges: [
        { id: "e1", source: "s", target: "t", waypoints: [{ x: 40, y: 20 }, { x: 200, y: 20 }] },
        { id: "e2", source: "x", target: "y", waypoints: [{ x: 50, y: -50 }, { x: 50, y: 50 }] },
      ],
      lanes: [{ id: "L1", x: 0, y: 0, width: 400, height: 60 }],
      laneAssignment: { s: "L1", t: "L1" },
    });
    const report = computeMetrics(scene);
    expect(report.crossings).toEqual(edgeEdgeCrossings(scene));
    expect(report.clips).toEqual(edgeNodeClips(scene));
    expect(report.overlaps).toEqual(overlaps(scene));
    expect(report.lanes).toEqual(laneContainment(scene));
    expect(report.straightness).toEqual(straightness(scene));
    expect(report.cohesion).toEqual(cohesion(scene));
  });
});

describe("computeMetrics on the real Novotec matrix scene", () => {
  // Real bpmn-js extraction (elementRegistry geometry + waypoints + real SVG-measured label
  // boxes) of the layouted src/__fixtures__/novotec-matrix.bpmn — produced by the layout-qa
  // harness (scripts/layout-qa.ts). Synthetic unit cases pass while real output still has
  // defects, so this is what actually catches those. `new URL(...)` does NOT resolve under
  // Vitest for this repo (see src/layoutElkReal.test.ts:12) — cwd-relative readFileSync does.
  const REAL_SCENE: Scene = JSON.parse(readFileSync("src/__fixtures__/scene-novotec-matrix.json", "utf8"));
  const report = computeMetrics(REAL_SCENE);

  it("extracted the expected element counts (extraction/contract drift guard)", () => {
    expect(REAL_SCENE.nodes.length).toBe(42);
    expect(REAL_SCENE.edges.length).toBe(43);
    expect(REAL_SCENE.lanes.length).toBe(7);
    expect(REAL_SCENE.labels.length).toBe(35);
    expect(Object.keys(REAL_SCENE.laneAssignment).length).toBeGreaterThan(0);
  });

  it("holds every hard rule (lane containment, node overlap, vertical clips) at zero", () => {
    // This is a known-good matrix layout (renderMatrix's guaranteed-by-construction rules 1-2).
    // If any of these is non-zero here, that's a real defect in the layouter/extraction, not a
    // test problem — the assertion must stay tight at 0, never loosened to "make it pass".
    expect(report.lanes.violations).toBe(0);
    expect(report.overlaps.nodeNode).toBe(0);
    expect(report.clips.vertical).toBe(0);
  });

  it("pins the measured soft-metric values as a geometry-drift regression guard", () => {
    // Measured once from this static, committed fixture (via computeMetrics(REAL_SCENE), see
    // task-2-report.md for the capture command) — pinned so the test fails the moment metric
    // geometry (crossing/clip logic) drifts, even though the fixture itself never changes.
    expect(report.crossings).toEqual({ hv: 10, hh: 0, vv: 0, total: 10 });
    expect(report.clips.horizontal).toBe(0);
    expect(report.straightness).toEqual({ straightPct: 100, sameRowBends: 0, dodges: 0 });
  });

  it("keeps the remaining metrics within sane structural bounds", () => {
    expect(report.straightness.straightPct).toBeGreaterThanOrEqual(0);
    expect(report.straightness.straightPct).toBeLessThanOrEqual(100);
    expect(report.cohesion.meanEdgeLength).toBeGreaterThan(0);
    expect(report.cohesion.bboxArea).toBeGreaterThan(0);
  });
});
