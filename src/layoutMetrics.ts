/**
 * Pure geometry metrics for the layout-QA harness (no bpmn-moddle dependency, so both the
 * vitest suite and a browser-extracted real scene can feed it). Encodes the 12 visual-
 * organization rules (see .superpowers/sdd/task-2-brief.md) as measurable numbers: hard
 * rules should measure 0 (lane containment, node/label overlaps, verticals through nodes),
 * soft objectives are ratcheted over time (crossings, clips, straightness, cohesion).
 *
 * Tolerances mirror the proven ad-hoc loops in layoutElkReal.test.ts (node overlap 4px,
 * clip inset 3px) so results stay comparable with that suite's history.
 */

export interface SceneNode { id: string; x: number; y: number; width: number; height: number; type?: string }
export interface SceneEdge { id: string; source: string; target: string; waypoints: { x: number; y: number }[] }
export interface SceneLane { id: string; x: number; y: number; width: number; height: number }
export interface SceneLabel { id: string; owner: string; x: number; y: number; width: number; height: number }
export interface Scene {
  nodes: SceneNode[];
  edges: SceneEdge[];
  lanes: SceneLane[];                       // lane bands, absolute rects; empty if diagram has no lanes
  labels: SceneLabel[];                     // REAL rendered label bboxes
  laneAssignment: Record<string, string>;   // nodeId -> laneId (from flowNodeRef); boundary events NOT listed here
  boundaryHosts?: Record<string, string>;   // boundary event id -> host node id (exempt from lane containment)
}

export interface MetricsReport {
  crossings: { hv: number; hh: number; vv: number; total: number };
  clips: { horizontal: number; vertical: number; total: number };
  overlaps: { nodeNode: number; labelLabel: number; labelNode: number; total: number };
  lanes: { outOfLane: number; bandOverlaps: number; missingLaneShapes: number; violations: number };
  straightness: { straightPct: number; sameRowBends: number; dodges: number };
  cohesion: { meanEdgeLength: number; totalEdgeLength: number; bboxArea: number };
}

type Pt = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type Seg = [Pt, Pt];

// Coordinates in this domain come from renderMatrix's Math.round(...), so a sub-pixel epsilon
// is enough for equality/collinearity checks; real rendered label bboxes (SVG getBBox()) can
// carry a little float noise too, hence not using exact ===.
const EPS = 0.5;

function segmentsOf(edge: SceneEdge): Seg[] {
  const wp = edge.waypoints, out: Seg[] = [];
  for (let i = 0; i < wp.length - 1; i++) out.push([wp[i], wp[i + 1]]);
  return out;
}

type SegKind = "h" | "v" | "other";
function segKind(seg: Seg): SegKind {
  const dx = Math.abs(seg[0].x - seg[1].x), dy = Math.abs(seg[0].y - seg[1].y);
  if (dy <= EPS && dx > EPS) return "h";
  if (dx <= EPS && dy > EPS) return "v";
  return "other"; // diagonal or degenerate zero-length — outside the orthogonal-routing domain
}

// Perpendicular crossing: the vertical's x must sit STRICTLY inside the horizontal's x-range
// and the horizontal's y STRICTLY inside the vertical's y-range. Strict (not inclusive) means a
// segment merely touching at the other's endpoint — the normal case for two edges leaving/
// entering the same node — is never counted, which is what "shared endpoints excluded" means.
function hvCross(h: Seg, v: Seg): boolean {
  const hy = (h[0].y + h[1].y) / 2;
  const hxMin = Math.min(h[0].x, h[1].x), hxMax = Math.max(h[0].x, h[1].x);
  const vx = (v[0].x + v[1].x) / 2;
  const vyMin = Math.min(v[0].y, v[1].y), vyMax = Math.max(v[0].y, v[1].y);
  return vx > hxMin + EPS && vx < hxMax - EPS && hy > vyMin + EPS && hy < vyMax - EPS;
}

// Collinear overlap between two same-orientation segments: they must sit on (nearly) the same
// line AND overlap for more than EPS along it — a mere shared endpoint has zero overlap length.
function collinearOverlap(a: Seg, b: Seg, axis: "h" | "v"): boolean {
  if (axis === "h") {
    const ay = (a[0].y + a[1].y) / 2, by = (b[0].y + b[1].y) / 2;
    if (Math.abs(ay - by) > EPS) return false;
    const ax0 = Math.min(a[0].x, a[1].x), ax1 = Math.max(a[0].x, a[1].x);
    const bx0 = Math.min(b[0].x, b[1].x), bx1 = Math.max(b[0].x, b[1].x);
    return Math.min(ax1, bx1) - Math.max(ax0, bx0) > EPS;
  }
  const ax = (a[0].x + a[1].x) / 2, bx = (b[0].x + b[1].x) / 2;
  if (Math.abs(ax - bx) > EPS) return false;
  const ay0 = Math.min(a[0].y, a[1].y), ay1 = Math.max(a[0].y, a[1].y);
  const by0 = Math.min(b[0].y, b[1].y), by1 = Math.max(b[0].y, b[1].y);
  return Math.min(ay1, by1) - Math.max(ay0, by0) > EPS;
}

/** H×V/H×H/V×V segment-pair intersections between DIFFERENT edges (never within one edge's own
 * polyline). Shared endpoints (two edges leaving/entering the same node) are excluded by
 * construction — see hvCross/collinearOverlap. */
export function edgeEdgeCrossings(scene: Scene): MetricsReport["crossings"] {
  let hv = 0, hh = 0, vv = 0;
  const perEdgeSegs = scene.edges.map((e) => segmentsOf(e).map((s) => ({ s, k: segKind(s) })));
  for (let i = 0; i < perEdgeSegs.length; i++) {
    for (let j = i + 1; j < perEdgeSegs.length; j++) {
      for (const a of perEdgeSegs[i]) for (const b of perEdgeSegs[j]) {
        if (a.k === "other" || b.k === "other") continue;
        if (a.k === "h" && b.k === "v") { if (hvCross(a.s, b.s)) hv++; }
        else if (a.k === "v" && b.k === "h") { if (hvCross(b.s, a.s)) hv++; }
        else if (a.k === "h" && b.k === "h") { if (collinearOverlap(a.s, b.s, "h")) hh++; }
        else if (a.k === "v" && b.k === "v") { if (collinearOverlap(a.s, b.s, "v")) vv++; }
      }
    }
  }
  return { hv, hh, vv, total: hv + hh + vv };
}

// Generalizes layoutElkReal.test.ts's clips() (3px inset, axis-aligned segment vs rect).
function segClipsRect(a: Pt, b: Pt, r: Rect): { orientation: SegKind; hit: boolean } {
  const inset = 3;
  const rx0 = r.x + inset, ry0 = r.y + inset, rx1 = r.x + r.width - inset, ry1 = r.y + r.height - inset;
  const vertical = Math.abs(a.x - b.x) < EPS;
  const horizontal = Math.abs(a.y - b.y) < EPS;
  if (vertical) {
    const x = a.x;
    return { orientation: "v", hit: x > rx0 && x < rx1 && Math.min(a.y, b.y) < ry1 && Math.max(a.y, b.y) > ry0 };
  }
  if (horizontal) {
    const y = a.y;
    return { orientation: "h", hit: y > ry0 && y < ry1 && Math.min(a.x, b.x) < rx1 && Math.max(a.x, b.x) > rx0 };
  }
  return { orientation: "other", hit: false };
}

/** Edges clipping through nodes they don't attach to (rule 2/11) — a node's own source/target
 * edge is exempt (a segment necessarily starts/ends inside its own node). */
export function edgeNodeClips(scene: Scene): MetricsReport["clips"] {
  let horizontal = 0, vertical = 0;
  for (const e of scene.edges) {
    for (const seg of segmentsOf(e)) {
      for (const n of scene.nodes) {
        if (n.id === e.source || n.id === e.target) continue;
        const c = segClipsRect(seg[0], seg[1], n);
        if (!c.hit) continue;
        if (c.orientation === "v") vertical++;
        else if (c.orientation === "h") horizontal++;
      }
    }
  }
  return { horizontal, vertical, total: horizontal + vertical };
}

// Generalizes layoutElkReal.test.ts's node-overlap loop (4px tolerance).
function rectOverlaps(a: Rect, b: Rect, tolerance: number): boolean {
  const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return ox > tolerance && oy > tolerance;
}

/** Node×node (4px tolerance, matching the proven loop), label×label and label×node with REAL
 * rendered label boxes — labels are held to a tighter tolerance since "never overprint" is a
 * hard rule (3), not a placement-noise allowance like node stacking. A label overlapping its
 * OWN owner node is exempt from label×node — internal labels (e.g. a task's name) are drawn
 * inside their owner shape by design and would otherwise fire on every internally-labelled node. */
export function overlaps(scene: Scene): MetricsReport["overlaps"] {
  let nodeNode = 0;
  for (let i = 0; i < scene.nodes.length; i++)
    for (let j = i + 1; j < scene.nodes.length; j++)
      if (rectOverlaps(scene.nodes[i], scene.nodes[j], 4)) nodeNode++;

  let labelLabel = 0;
  for (let i = 0; i < scene.labels.length; i++)
    for (let j = i + 1; j < scene.labels.length; j++)
      if (rectOverlaps(scene.labels[i], scene.labels[j], 0.5)) labelLabel++;

  let labelNode = 0;
  for (const l of scene.labels)
    for (const n of scene.nodes) {
      if (l.owner === n.id) continue;
      if (rectOverlaps(l, n, 0.5)) labelNode++;
    }

  return { nodeNode, labelLabel, labelNode, total: nodeNode + labelLabel + labelNode };
}

/** Lane containment (rule 1): flow nodes outside their assigned lane's Y band, lane bands that
 * overlap/invert their authored order, and laneAssignment entries pointing at a lane with no
 * band rect. Boundary events are exempt by construction — they're never keys in laneAssignment
 * (see layoutElk.ts:462, they inherit the host's cell), so they're simply never iterated here. */
export function laneContainment(scene: Scene): MetricsReport["lanes"] {
  const laneById = new Map(scene.lanes.map((l) => [l.id, l]));
  const nodeById = new Map(scene.nodes.map((n) => [n.id, n]));
  const tol = 1;

  let outOfLane = 0;
  // Distinct missing lane IDs, not one per referencing node — this counts missing SHAPES.
  const missingLaneIds = new Set<string>();
  for (const [nodeId, laneId] of Object.entries(scene.laneAssignment)) {
    const lane = laneById.get(laneId);
    if (!lane) { missingLaneIds.add(laneId); continue; }
    const node = nodeById.get(nodeId);
    if (!node) continue;
    // Lanes are hard Y bands (rule 1) — only the vertical extent is checked; flow order lives on X.
    const within = node.y >= lane.y - tol && node.y + node.height <= lane.y + lane.height + tol;
    if (!within) outOfLane++;
  }

  // Bands, sorted by Y (scene.lanes isn't guaranteed to already be in visual top-to-bottom
  // order), must not overlap or invert — either defect shows up as one band's bottom crossing
  // the next one's top. Checking only ADJACENT pairs after sorting is sufficient to catch every
  // violating pair, not just neighbours: if each sorted-adjacent pair is clear (next.y >= this
  // band's bottom), then by transitivity every later band's y is also >= every earlier band's
  // bottom, so no non-adjacent pair can overlap either. Scanning the RAW (unsorted) array
  // instead is a blind spot — two non-adjacent-in-sort-order bands that truly overlap can be
  // missed while an unrelated adjacent-in-raw-order pair gets flagged instead (see test).
  const sortedLanes = [...scene.lanes].sort((a, b) => a.y - b.y);
  let bandOverlaps = 0;
  for (let i = 0; i < sortedLanes.length - 1; i++) {
    if (sortedLanes[i].y + sortedLanes[i].height > sortedLanes[i + 1].y + tol) bandOverlaps++;
  }

  const missingLaneShapes = missingLaneIds.size;
  return { outOfLane, bandOverlaps, missingLaneShapes, violations: outOfLane + bandOverlaps + missingLaneShapes };
}

/** Straightness (rule 4): among forward, same-lane edges whose endpoints are already Y-aligned
 * (nothing should force a bend), what fraction are drawn as one straight 2-waypoint segment, and
 * how many bend points show up anyway. sameRowBends and dodges share the exact same population
 * today (both are "bends on already-aligned same-row edges") and so are numerically equal; they
 * are kept as separate fields because a later round may loosen the Y-alignment tolerance for one
 * without the other, at which point the populations — and the numbers — diverge. */
export function straightness(scene: Scene): MetricsReport["straightness"] {
  const nodeById = new Map(scene.nodes.map((n) => [n.id, n]));
  const laneOf = (id: string): string | undefined =>
    scene.laneAssignment[id] ?? (scene.boundaryHosts?.[id] ? scene.laneAssignment[scene.boundaryHosts[id]] : undefined);
  const centreX = (n: SceneNode) => n.x + n.width / 2;
  const centreY = (n: SceneNode) => n.y + n.height / 2;

  const qualifying: SceneEdge[] = [];
  for (const e of scene.edges) {
    const s = nodeById.get(e.source), t = nodeById.get(e.target);
    if (!s || !t) continue;
    const sLane = laneOf(e.source), tLane = laneOf(e.target);
    if (sLane === undefined || tLane === undefined || sLane !== tLane) continue;
    if (!(centreX(t) > centreX(s))) continue; // forward only
    if (Math.abs(centreY(s) - centreY(t)) > 2) continue; // Y-aligned within 2px
    qualifying.push(e);
  }

  let straight = 0, bends = 0;
  for (const e of qualifying) {
    const wp = e.waypoints;
    if (wp.length === 2 && Math.abs(wp[0].y - wp[1].y) < EPS) straight++;
    else bends += Math.max(0, wp.length - 2);
  }

  const straightPct = qualifying.length ? (straight / qualifying.length) * 100 : 100;
  return { straightPct, sameRowBends: bends, dodges: bends };
}

/** Cohesion (rule 12): mean/total Manhattan connector length, and the diagram's overall bbox
 * area (union of every node, lane band, and label — the full rendered extent). */
export function cohesion(scene: Scene): MetricsReport["cohesion"] {
  let totalEdgeLength = 0;
  for (const e of scene.edges) {
    for (const seg of segmentsOf(e)) totalEdgeLength += Math.abs(seg[1].x - seg[0].x) + Math.abs(seg[1].y - seg[0].y);
  }
  const meanEdgeLength = scene.edges.length ? totalEdgeLength / scene.edges.length : 0;

  // Judgment call: the bbox union includes lane and label rects, not just nodes — lanes
  // typically define the diagram's outer extent even where node coverage is sparse near an edge.
  const rects: Rect[] = [...scene.nodes, ...scene.lanes, ...scene.labels];
  let bboxArea = 0;
  if (rects.length) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of rects) {
      minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.width); maxY = Math.max(maxY, r.y + r.height);
    }
    bboxArea = Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
  }
  return { meanEdgeLength, totalEdgeLength, bboxArea };
}

export function computeMetrics(scene: Scene): MetricsReport {
  return {
    crossings: edgeEdgeCrossings(scene),
    clips: edgeNodeClips(scene),
    overlaps: overlaps(scene),
    lanes: laneContainment(scene),
    straightness: straightness(scene),
    cohesion: cohesion(scene),
  };
}
