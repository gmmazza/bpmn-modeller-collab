// D · Auto-layout — elkjs engine.
//
// Higher-quality layout than bpmn-auto-layout: elkjs (the Eclipse Layout Kernel JS port)
// runs a proper layered algorithm with orthogonal edge routing and on-edge label
// placement. We regenerate the diagram interchange (DI) from the semantic model. Layout is
// always horizontal (left→right); a collaboration is laid out as swimlanes (pools stacked,
// optional lanes as bands).
// @ts-expect-error no type declarations published
import { BpmnModdle } from "bpmn-moddle";
import { labelNearSource } from "./layoutTidy";

const EVENT_TYPES = new Set([
  "bpmn:StartEvent", "bpmn:EndEvent", "bpmn:IntermediateThrowEvent",
  "bpmn:IntermediateCatchEvent", "bpmn:BoundaryEvent",
]);
const GATEWAY_TYPES = new Set([
  "bpmn:ExclusiveGateway", "bpmn:ParallelGateway", "bpmn:InclusiveGateway",
  "bpmn:EventBasedGateway", "bpmn:ComplexGateway",
]);
// Elements that draw their label OUTSIDE the shape (we place these ourselves).
const EXTERNAL_LABEL_TYPES = new Set([
  ...EVENT_TYPES, ...GATEWAY_TYPES, "bpmn:DataObjectReference", "bpmn:DataStoreReference",
]);
const EDGE_TYPES = new Set(["bpmn:SequenceFlow", "bpmn:Association"]);

const POOL_HEADER = 30; // left band that holds the pool (participant) name
const LANE_HEADER = 30; // left band that holds each lane name (inside the pool)
const LANE_PAD = 18;    // vertical breathing room around a lane's content
const BLABEL_STEP = 34; // vertical step between stacked boundary-event labels on one host. Long
                        // outcome names wrap to ~2 lines (≈28px rendered — taller than the 14px DI
                        // hint), so the step must clear a wrapped label or several escalation
                        // outcomes on one Call Activity still overprint.

function defaultSize(type: string): { width: number; height: number } {
  if (EVENT_TYPES.has(type)) return { width: 36, height: 36 };
  if (GATEWAY_TYPES.has(type)) return { width: 50, height: 50 };
  if (type === "bpmn:SubProcess" || type === "bpmn:CallActivity") return { width: 120, height: 90 };
  if (type === "bpmn:TextAnnotation") return { width: 100, height: 30 };
  if (type === "bpmn:DataObjectReference" || type === "bpmn:DataStoreReference") return { width: 36, height: 50 };
  return { width: 100, height: 80 }; // tasks
}

const labelWidth = (text: string): number => Math.min(120, Math.max(20, text.length * 6.5));

// Lanes declared by a process (laneSets is the spec property; laneSet a defensive fallback).
const lanesOf = (process: any): any[] =>
  process?.laneSets?.[0]?.lanes ?? process?.laneSet?.[0]?.lanes ?? [];

// The auto-layout runs a single horizontal (left→right) flow layout. The earlier selectable
// "vertical" and "árbol" (tree) organizers were removed — horizontal is the only variant.
const COMPACT_LAYERED = {
  "elk.algorithm": "layered",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.layered.crossingMinimization.semiInteractive": "true",
  "elk.spacing.nodeNode": "40",
  "elk.layered.spacing.nodeNodeBetweenLayers": "60",
  "elk.spacing.edgeNode": "20",
  "elk.spacing.edgeEdge": "12",
  "elk.layered.spacing.edgeNodeBetweenLayers": "20",
};
// Horizontal flow: left→right, with boundary-event ports on the SOUTH (bottom) edge.
const LAYOUT_OPTIONS: Record<string, string> = { ...COMPACT_LAYERED, "elk.direction": "RIGHT" };
const BOUNDARY_PORT_SIDE = "SOUTH";

let elkInstance: any = null;
async function getElk(): Promise<any> {
  if (!elkInstance) {
    const mod: any = await import("elkjs/lib/elk.bundled.js");
    const ELK = mod.default ?? mod;
    elkInstance = new ELK();
  }
  return elkInstance;
}

type Bounds = { x: number; y: number; width: number; height: number };
type Pt = { x: number; y: number };

/**
 * Lay out a SUBGRAPH (a selection of nodes + the edges among them) and return each node's
 * new top-left, relative to (0,0). The caller translates these into place — used by
 * "reorganizar solo la selección", which moves the selected shapes and leaves the rest.
 */
export async function layoutSubgraphElk(
  nodes: Array<{ id: string; width: number; height: number }>,
  edges: Array<{ id: string; source: string; target: string }>,
): Promise<Map<string, Pt>> {
  const elk = await getElk();
  const laid = await elk.layout({
    id: "sel",
    layoutOptions: LAYOUT_OPTIONS,
    children: nodes.map((n) => ({ id: n.id, width: n.width, height: n.height })),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  });
  const out = new Map<string, Pt>();
  for (const c of laid.children ?? []) out.set(c.id, { x: c.x, y: c.y });
  return out;
}

/**
 * Index the OLD DI by semantic element id: the plane element (shape/edge) so we can REUSE
 * it — preserving colors (fill/stroke) and any other authored DI attributes that a
 * from-scratch regeneration would drop — plus its bounds (doubles as the size source).
 */
function oldDiFromDefs(defs: any): { shapeById: Map<string, any>; boundsById: Map<string, Bounds> } {
  const shapeById = new Map<string, any>();
  const boundsById = new Map<string, Bounds>();
  for (const d of defs.diagrams ?? []) {
    for (const pe of d.plane?.planeElement ?? []) {
      const id = pe.bpmnElement?.id;
      if (!id) continue;
      shapeById.set(id, pe);
      if (pe.$type === "bpmndi:BPMNShape" && pe.bounds) {
        boundsById.set(id, { x: pe.bounds.x, y: pe.bounds.y, width: pe.bounds.width, height: pe.bounds.height });
      }
    }
  }
  return { shapeById, boundsById };
}

/**
 * Lay out one LANE-LESS process's flow nodes with elk and emit its DI plane elements,
 * translated by (offsetX, offsetY). Laned processes never reach this renderer — callers
 * dispatch them to renderMatrix, where lanes are hard bands by construction — so the
 * returned laneBands is always [] (kept in the shape for the callers' shared handling).
 * Returns the emitted shapes/edges, the content bounding box and per-node absolute bounds
 * (for message flows).
 */
async function renderProcess(
  process: any, moddle: any, elk: any,
  sizeById: Map<string, Bounds>, shapeById: Map<string, any>, offsetX: number, offsetY: number,
): Promise<{ planeElement: any[]; width: number; height: number; nodeBounds: Map<string, Bounds>; laneBands: Array<{ lane: any; y: number; height: number }> }> {
  const flowElements: any[] = process.flowElements ?? [];
  const boundaryHost = new Map<string, string>();
  const boundaryFe = new Map<string, any>();
  const boundaryByHost = new Map<string, any[]>();
  const elkNodes: any[] = [];
  const elkEdges: any[] = [];

  for (const fe of flowElements) {
    const t = fe.$type;
    if (EDGE_TYPES.has(t)) {
      const s = fe.sourceRef?.id, tgt = fe.targetRef?.id;
      if (!s || !tgt) continue;
      const labels = fe.name ? [{ text: fe.name, width: labelWidth(fe.name), height: 14 }] : [];
      elkEdges.push({ id: fe.id, sources: [s], targets: [tgt], labels, _fe: fe });
      continue;
    }
    if (t === "bpmn:BoundaryEvent" && fe.attachedToRef?.id) {
      const hid = fe.attachedToRef.id;
      boundaryHost.set(fe.id, hid);
      boundaryFe.set(fe.id, fe);
      if (!boundaryByHost.has(hid)) boundaryByHost.set(hid, []);
      boundaryByHost.get(hid)!.push(fe);
      continue;
    }
    const size = sizeById.get(fe.id) ?? defaultSize(t);
    elkNodes.push({ id: fe.id, width: size.width, height: size.height, _fe: fe });
  }

  // A fully-disconnected node (no edges) would be dumped at layer 0 — the flow start. Keep it
  // where the author put it instead of moving it.
  const connectedIds = new Set<string>();
  for (const e of elkEdges) { connectedIds.add(e.sources[0]); connectedIds.add(e.targets[0]); }
  const isDisconnected = (id: string) => !connectedIds.has(id) && sizeById.has(id);

  const laid = await elk.layout({
    id: "root",
    layoutOptions: LAYOUT_OPTIONS,
    children: elkNodes.filter((n) => !isDisconnected(n.id)).map((n) => {
      const child: any = { id: n.id, width: n.width, height: n.height };
      const bs = boundaryByHost.get(n.id);
      if (bs?.length) {
        child.layoutOptions = { "elk.portConstraints": "FIXED_SIDE" };
        child.ports = bs.map((b: any) => ({ id: b.id, width: 30, height: 30, layoutOptions: { "elk.port.side": BOUNDARY_PORT_SIDE } }));
      }
      return child;
    }),
    edges: elkEdges.map((e) => ({ id: e.id, sources: e.sources, targets: e.targets, labels: e.labels })),
  });

  const laidNode = new Map<string, any>((laid.children ?? []).map((c: any) => [c.id, c]));
  const laidEdge = new Map<string, any>((laid.edges ?? []).map((e: any) => [e.id, e]));

  const contentX = offsetX;

  const bounds = (x: number, y: number, w: number, h: number) =>
    moddle.create("dc:Bounds", { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) });

  const nodeBounds = new Map<string, Bounds>();
  const planeElement: any[] = [];

  for (const n of elkNodes) {
    let b: Bounds;
    if (isDisconnected(n.id)) {
      const ob = sizeById.get(n.id)!; // keep the loose box at its original spot
      b = { x: ob.x + contentX, y: ob.y + offsetY, width: n.width, height: n.height };
    } else {
      const c = laidNode.get(n.id);
      if (!c) continue;
      b = { x: c.x + contentX, y: c.y + offsetY, width: n.width, height: n.height };
    }
    nodeBounds.set(n.id, b);
    // Reuse the old shape (keeps colors/attrs) — just re-bound it; else create fresh.
    const shape = shapeById.get(n.id) ?? moddle.create("bpmndi:BPMNShape", { id: `${n.id}_di`, bpmnElement: n._fe });
    shape.bounds = bounds(b.x, b.y, b.width, b.height);
    if (EXTERNAL_LABEL_TYPES.has(n._fe.$type) && n._fe.name) {
      const lw = labelWidth(n._fe.name);
      shape.label = moddle.create("bpmndi:BPMNLabel", { bounds: bounds(b.x + b.width / 2 - lw / 2, b.y + b.height + 6, lw, 14) });
    }
    planeElement.push(shape);
  }

  // Boundary events, from the host's laid-out port positions (+ the host's lane shift).
  const boundaryBounds = new Map<string, Bounds>();
  const perHostBoundaries = new Map<string, Array<{ fe: any; shape: any; b: Bounds }>>();
  for (const [bid, hid] of boundaryHost) {
    const host = laidNode.get(hid);
    const port = host?.ports?.find((p: any) => p.id === bid);
    if (!host || !port) continue;
    const size = sizeById.get(bid) ?? { width: 36, height: 36 };
    const cx = host.x + port.x + (port.width ?? 0) / 2 + contentX;
    const cy = host.y + port.y + (port.height ?? 0) / 2 + offsetY;
    const b: Bounds = { x: cx - size.width / 2, y: cy - size.height / 2, width: size.width, height: size.height };
    boundaryBounds.set(bid, b);
    nodeBounds.set(bid, b);
    const fe = boundaryFe.get(bid);
    const shape = shapeById.get(bid) ?? moddle.create("bpmndi:BPMNShape", { id: `${bid}_di`, bpmnElement: fe });
    shape.bounds = bounds(b.x, b.y, b.width, b.height);
    planeElement.push(shape);
    if (!perHostBoundaries.has(hid)) perHostBoundaries.set(hid, []);
    perHostBoundaries.get(hid)!.push({ fe, shape, b });
  }
  // elk distributes FIXED_SIDE ports evenly across the host's side, so N ports on a narrow
  // host land closer than a circle's width and the events overlap (flujo: 4 events 26px
  // apart -> 3 nodeNode overlaps). Re-spread such a host's circles along its bottom edge
  // with a min centre gap, centred on the host — they may overhang its corners slightly,
  // like renderMatrix's distribution does.
  const B_GAP = 44; // 36px circle + clearance
  for (const [hid, list] of perHostBoundaries) {
    if (list.length < 2) continue;
    list.sort((a, z) => a.b.x - z.b.x);
    const centres = list.map((e) => e.b.x + e.b.width / 2);
    if (!centres.slice(1).some((c, i) => c - centres[i] < B_GAP - 4)) continue; // elk spacing already clear
    const hb = nodeBounds.get(hid);
    if (!hb) continue;
    const start = hb.x + hb.width / 2 - ((list.length - 1) * B_GAP) / 2;
    list.forEach((e, i) => {
      e.b.x = start + i * B_GAP - e.b.width / 2; // b is shared with nodeBounds/boundaryBounds
      e.shape.bounds = bounds(e.b.x, e.b.y, e.b.width, e.b.height);
    });
  }
  // Several boundary events can share one host's edge (a Call Activity with N escalation
  // outcomes). A fixed centred-below label overprints its siblings, so cascade each label a
  // row lower — ordered left→right by the circle's x — so the N outcome names stack readably
  // instead of piling on one point (mirrors the outcome-pill stagger in masterPane.ts). Each
  // label is also clamped to the host's x-footprint (+20): a centred label under a re-spread
  // rightmost circle pokes into the NEXT elk layer's nodes (flujo's "Sigue con alternativo"
  // onto the end-event column), which sits closer than a label's half-width.
  for (const [hid, list] of perHostBoundaries) {
    const hb = nodeBounds.get(hid);
    list.sort((a, z) => a.b.x - z.b.x);
    list.forEach(({ fe, shape, b }, i) => {
      if (!fe?.name) return;
      const lw = labelWidth(fe.name);
      const lx = Math.min(b.x + b.width / 2 - lw / 2, hb ? hb.x + hb.width + 20 - lw : Infinity);
      shape.label = moddle.create("bpmndi:BPMNLabel", { bounds: bounds(lx, b.y + b.height + 4 + i * BLABEL_STEP, lw, 14) });
    });
  }

  const gwSeen = new Map<string, number>();
  for (const e of elkEdges) {
    const le = laidEdge.get(e.id);
    const sB = nodeBounds.get(e.sources[0]), tB = nodeBounds.get(e.targets[0]);
    let pts: Pt[];
    const section = le?.sections?.[0];
    if (section) {
      pts = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((p: Pt) => ({ x: p.x + contentX, y: p.y + offsetY }));
    } else {
      if (!sB || !tB) continue;
      pts = [{ x: sB.x + sB.width / 2, y: sB.y + sB.height / 2 }, { x: tB.x + tB.width / 2, y: tB.y + tB.height / 2 }];
    }
    const bc = boundaryBounds.get(e.sources[0]);
    if (bc) {
      const c = { x: bc.x + bc.width / 2, y: bc.y + bc.height / 2 };
      // The circle may have been re-spread away from elk's port — carry the move into the
      // first bend so the opening segment stays orthogonal (the final point never moves).
      if (pts.length > 2) {
        if (Math.abs(pts[0].x - pts[1].x) < 1) pts[1] = { x: c.x, y: pts[1].y };
        else if (Math.abs(pts[0].y - pts[1].y) < 1) pts[1] = { x: pts[1].x, y: c.y };
      }
      pts[0] = c;
    }
    const edge = shapeById.get(e.id) ?? moddle.create("bpmndi:BPMNEdge", { id: `${e.id}_di`, bpmnElement: e._fe });
    edge.waypoint = pts.map((p) => moddle.create("dc:Point", { x: Math.round(p.x), y: Math.round(p.y) }));
    if (e._fe.name) {
      const lw = labelWidth(e._fe.name);
      const srcType = e._fe.sourceRef?.$type;
      const ll = le?.labels?.[0];
      const pos = GATEWAY_TYPES.has(srcType) && sB
        ? branchLabelPos(gwSeen, e._fe.sourceRef.id, sB, 14)
        : srcType === "bpmn:BoundaryEvent" || !ll ? labelNearSource(pts[0], pts[1], lw, 14) : { x: ll.x + contentX, y: ll.y + offsetY };
      edge.label = moddle.create("bpmndi:BPMNLabel", { bounds: bounds(pos.x, pos.y, lw, 14) });
    }
    planeElement.push(edge);
  }

  // Content bounding box (relative to offset).
  let maxX = 0, maxY = 0;
  for (const b of nodeBounds.values()) {
    maxX = Math.max(maxX, b.x - offsetX + b.width);
    maxY = Math.max(maxY, b.y - offsetY + b.height);
  }
  return { planeElement, width: maxX + 20, height: maxY + 20, nodeBounds, laneBands: [] };
}

/**
 * Position a gateway's branch label ("Sí"/"No") near the gateway but STAGGERED so the
 * branches don't overprint each other (they all exit the gateway at the same point). Labels
 * on down-going branches sit below the exit, up/straight ones above, each stacked by index.
 */
function branchLabelPos(gwSeen: Map<string, number>, gid: string, s: Bounds, lh: number): Pt {
  const k = gwSeen.get(gid) ?? 0;
  gwSeen.set(gid, k + 1);
  // Stack the gateway's branch labels down its right side, one per branch — consistent and
  // separated regardless of how each branch is routed.
  return { x: s.x + s.width + 4, y: s.y + s.height / 2 - lh / 2 + k * (lh + 4) };
}

/**
 * MATRIX layout for lane + group (phase) diagrams. elk can't preserve a 2-D matrix (it lays
 * out by flow dependency), so we place each node in its cell — column = its phase (the group
 * box it sat in, ordered by x), row = its lane — re-spacing columns and lane bands, and route
 * edges orthogonally (drop-late across lanes). Preserves the author's matrix: phase columns
 * never overlap, lanes never overlap, and edges stay in their lane until the last moment.
 */
function renderMatrix(
  process: any, groups: any[], moddle: any, boundsById: Map<string, Bounds>, shapeById: Map<string, any>,
  offsetX: number, offsetY: number,
): { planeElement: any[]; width: number; height: number; nodeBounds: Map<string, Bounds>; laneBands: Array<{ lane: any; y: number; height: number }>; phaseColumns: Array<{ group: any; x: number; width: number }> } {
  const COL_GAP = 34, PAD = 24; // COL_GAP is the MIN gutter; it widens per connector + at phase edges
  const V_TRACK = 34; // spacing between parallel vertical connector tracks inside a gutter
  const HW_TRACK = 14; // spacing between parallel horizontal connector tracks inside an inter-lane channel
  const bounds = (x: number, y: number, w: number, h: number) =>
    moddle.create("dc:Bounds", { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) });

  const lanes: any[] = lanesOf(process);
  const laneOf = new Map<string, number>();
  lanes.forEach((lane, i) => (lane.flowNodeRef ?? []).forEach((r: any) => r?.id && laneOf.set(r.id, i)));
  const L = Math.max(lanes.length, 1);

  // Phases = group boxes ordered by their old x. A node's phase is the group whose OLD box
  // held it (else the nearest by x-center).
  const phaseGroups = groups.map((g) => ({ g, b: shapeById.get(g.id)?.bounds })).filter((x) => x.b).sort((a, b) => a.b.x - b.b.x);
  const P = phaseGroups.length;
  const phaseOf = (id: string): number => {
    const ob = boundsById.get(id);
    if (!ob || !P) return 0;
    const cx = ob.x + ob.width / 2;
    for (let p = 0; p < P; p++) { const b = phaseGroups[p].b; if (cx >= b.x && cx <= b.x + b.width) return p; }
    let best = 0, bd = Infinity;
    for (let p = 0; p < P; p++) { const b = phaseGroups[p].b; const d = Math.abs(cx - (b.x + b.width / 2)); if (d < bd) { bd = d; best = p; } }
    return best;
  };

  const boundaryHost = new Map<string, string>(), boundaryFe = new Map<string, any>();
  const nodes: Array<{ id: string; fe: any; w: number; h: number; p: number; l: number }> = [];
  const edges: any[] = [];
  for (const fe of process.flowElements ?? []) {
    const t = fe.$type;
    if (EDGE_TYPES.has(t)) { if (fe.sourceRef?.id && fe.targetRef?.id) edges.push(fe); continue; }
    if (t === "bpmn:BoundaryEvent" && fe.attachedToRef?.id) { boundaryHost.set(fe.id, fe.attachedToRef.id); boundaryFe.set(fe.id, fe); continue; }
    const size = boundsById.get(fe.id) ?? defaultSize(t);
    nodes.push({ id: fe.id, fe, w: size.width, h: size.height, p: phaseOf(fe.id), l: laneOf.get(fe.id) ?? 0 });
  }

  // FLOW GENERATIONS ("sub-generations", the no-swimlane X logic): each node's generation is its
  // longest-path depth in the sequence-flow graph, so every successor sits STRICTLY after its
  // predecessors — nodes never stack at the same x. The authored old-x is only a proxy for this
  // (and gets it wrong wherever the author didn't align a node to its flow depth), which is what
  // produced the "objeto arriba de otro" stacking. Boundary events inherit their host's depth;
  // cycles (back-edges) are ignored so they don't inflate the depth.
  const hostOf = (id: string) => boundaryHost.get(id) ?? id;
  const preds = new Map<string, Set<string>>();
  for (const n of nodes) preds.set(n.id, new Set());
  for (const fe of edges) {
    const s = hostOf(fe.sourceRef.id), t = hostOf(fe.targetRef.id);
    if (preds.has(t) && preds.has(s) && s !== t) preds.get(t)!.add(s);
  }
  const gen = new Map<string, number>(), gState = new Map<string, number>(); // 1=in-stack, 2=done
  const genDfs = (id: string): void => {
    gState.set(id, 1);
    let g = 0;
    for (const p of preds.get(id) ?? []) {
      const st = gState.get(p) ?? 0;
      if (st === 1) continue;              // back-edge (cycle) — skip, don't push depth forward
      if (st !== 2) genDfs(p);
      g = Math.max(g, (gen.get(p) ?? 0) + 1);
    }
    gen.set(id, g); gState.set(id, 2);
  };
  for (const n of nodes) if ((gState.get(n.id) ?? 0) !== 2) genDfs(n.id);
  const cxOld = (id: string) => { const b = boundsById.get(id); return b ? b.x + b.width / 2 : 0; };

  // FINE COLUMNS (hybrid X): within each phase, bucket nodes by GENERATION into flow steps and
  // flatten to a global left→right list of fine columns. Successors land in later fine columns
  // (clean left-side entry) while the phase stays ONE contiguous X band (its fine columns are
  // consecutive → the phase box is still a clean column, no round-11 mush). Same-generation nodes
  // in different lanes share a fine column (parallel branches align vertically).
  const fineCols: Array<{ phase: number }> = [];
  const fcOf = new Map<string, number>();
  const phaseFc = new Array(P || 1).fill(null).map(() => ({ lo: Infinity, hi: -Infinity }));
  for (let p = 0; p < (P || 1); p++) {
    const inPhase = nodes.filter((n) => n.p === p)
      .sort((a, b) => (gen.get(a.id)! - gen.get(b.id)!) || (cxOld(a.id) - cxOld(b.id)));
    let prevGen = -Infinity, fc = -1;
    for (const n of inPhase) {
      const g = gen.get(n.id)!;
      // New fine column only on a GENERATION step. Same-gen nodes in the same lane are PARALLEL
      // branches — they share the column and get STACKED in vertical slots (below) instead of being
      // spread into sequential columns (which forced one to detour around the other). A layer is a
      // vertical stack, elk-style. Stacked nodes sit at different Y, so no edge passes a cell-mate.
      if (fc < 0 || g > prevGen) { fineCols.push({ phase: p }); fc = fineCols.length - 1; }
      fcOf.set(n.id, fc);
      phaseFc[p].lo = Math.min(phaseFc[p].lo, fc); phaseFc[p].hi = Math.max(phaseFc[p].hi, fc);
      prevGen = g;
    }
  }
  const NF = Math.max(fineCols.length, 1);

  // cells[fc][l] = nodes STACKED top→bottom by their AUTHORED y (slot 0 = the topmost, i.e. the row
  // the author kept as the main flow). Usually one node per cell; parallel same-gen branches stack.
  const yOld = (id: string) => boundsById.get(id)?.y ?? 0;
  const cellKey = (fc: number, l: number) => `${fc}:${l}`;
  const cells = new Map<string, typeof nodes>();
  for (const n of nodes) { const k = cellKey(fcOf.get(n.id)!, n.l); if (!cells.has(k)) cells.set(k, []); cells.get(k)!.push(n); }
  for (const arr of cells.values()) arr.sort((a, b) => yOld(a.id) - yOld(b.id));
  const slotOf = new Map<string, number>();
  for (const arr of cells.values()) arr.forEach((n, i) => slotOf.set(n.id, i));

  const colW = new Array(NF).fill(80);   // widest single node in the column (nodes stack, not spread)
  const rowUnit = new Array(L).fill(90); // one slot's height in a lane = tallest node + 2·PAD
  const slots = new Array(L).fill(1);    // max stacked nodes in any of the lane's cells
  for (let f = 0; f < NF; f++) for (let l = 0; l < L; l++) {
    const arr = cells.get(cellKey(f, l)) ?? [];
    if (!arr.length) continue;
    slots[l] = Math.max(slots[l], arr.length);
    for (const n of arr) { colW[f] = Math.max(colW[f], n.w); rowUnit[l] = Math.max(rowUnit[l], n.h + 2 * PAD); }
  }
  const laneH = new Array(L).fill(0).map((_, l) => slots[l] * rowUnit[l]); // node-band = all slots stacked
  // Gateway branch labels ("Sí"/"No") live in a column just right of their gateway (see the
  // stack further down). The gutter right of a gateway's fine column must reserve room for the
  // longest branch label BEFORE the vertical tracks — with the bare COL_GAP the label overruns
  // the neighbouring column's node (rep_2's "No, necesita PaP" overprint).
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const labelPad = new Array(NF + 1).fill(0);
  for (const fe of edges) {
    const src = fe.sourceRef?.id ? nodeById.get(fe.sourceRef.id) : undefined;
    if (!src || !fe.name || !GATEWAY_TYPES.has(src.fe.$type)) continue;
    const f = fcOf.get(src.id)!;
    // Part of the label column that sticks past the gateway's fine column into the gutter.
    const into = 6 + labelWidth(fe.name) + 4 - (colW[f] - src.w) / 2;
    labelPad[f + 1] = Math.max(labelPad[f + 1], into);
  }
  const nodeCell = new Map<string, { fc: number; l: number }>();
  for (const n of nodes) nodeCell.set(n.id, { fc: fcOf.get(n.id)!, l: n.l });
  for (const [bid, hid] of boundaryHost) { const c = nodeCell.get(hid); if (c) nodeCell.set(bid, c); }

  // --- Grid routing plan. Fine columns (flow generations) turn MOST edges into adjacent-column
  // hops routed cleanly through an EMPTY column gutter (vertical) with short horizontals at the
  // node rows. Only a SKIP edge (|Δgeneration| ≥ 2) or a back-edge would need a LONG horizontal
  // that crosses intermediate nodes — those are routed through a clear INTER-LANE CHANNEL instead
  // (borrowed from elk's channel routing): two gutter verticals joined by a horizontal that runs
  // on a lane boundary (no nodes there), each connector on its own track so parallels never
  // overprint. Gutter g sits left of fine column g (0..NF); channel c sits above lane band c.
  type Plan =
    | { fe: any; kind: "straight" }
    | { fe: any; kind: "gutter"; gX: number; tGut: number }
    // both rows blocked → route in a SUB-ROW inside the SOURCE lane (widen that lane, stay inside it)
    | { fe: any; kind: "subrow"; gS: number; tGutS: number; gT: number; tGutT: number; subLane: number; subDir: number; subI: number }
    // back-edge → exit right/bottom-rear, loop through a source-lane sub-row, ENTER the target from the LEFT
    | { fe: any; kind: "return"; gT: number; tGutT: number; subLane: number; subDir: number; subI: number };
  const gutterN = new Map<number, number>(); // gutter → vertical tracks allocated
  const subN = new Map<string, number>();    // "lane:dir" → intra-lane sub-row tracks allocated
  const bump = (m: Map<any, number>, k: any) => { const v = m.get(k) ?? 0; m.set(k, v + 1); return v; };
  // Is `lane` empty across the fine columns strictly between a and b? (topological, no pixels.)
  const laneClear = (a: number, b: number, lane: number) => {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    for (let f = lo + 1; f < hi; f++) if ((cells.get(cellKey(f, lane)) ?? []).length) return false;
    return true;
  };
  const plans: Plan[] = [];
  for (const fe of edges) {
    const sc = nodeCell.get(fe.sourceRef.id), tc = nodeCell.get(fe.targetRef.id);
    if (!sc || !tc) continue;
    const dfc = tc.fc - sc.fc;
    // Same lane, same/adjacent fine column → straight left-to-right (main flow reads horizontally).
    if (sc.l === tc.l && dfc >= 0 && dfc <= 1) { plans.push({ fe, kind: "straight" }); continue; }
    // BACK-EDGE (target laid to the left): all exits leave the RIGHT or the rear (left) half of the
    // top/bottom, all entries arrive at the LEFT — so a return loops out the bottom-rear, runs back
    // in a source-lane sub-row, and enters the target from the west. Never exit the left face.
    if (dfc < 0) {
      const subDir = tc.l < sc.l ? -1 : 1, subLane = sc.l;
      const subI = bump(subN, `${subLane}:${subDir}`);
      const gT = tc.fc, tGutT = bump(gutterN, gT); // gutter just left of the target → enter WEST
      plans.push({ fe, kind: "return", gT, tGutT, subLane, subDir, subI });
      continue;
    }
    const gTarget = tc.fc, gSource = sc.fc + 1; // gutters beside target / source
    // The user's rule: stay HORIZONTAL in the SOURCE lane and make the ONE vertical change at the
    // LAST moment, just before the target. SOURCE lane clear across the span → drop-late (run at the
    // source's row, drop in the gutter beside the target). Else route in a SUB-ROW inside the source
    // lane (widen it a hair) so the connector STILL runs at the source's level and turns late —
    // never at the target's row (which would turn early), never in the gap between lanes.
    if (laneClear(sc.fc, tc.fc, sc.l)) {
      plans.push({ fe, kind: "gutter", gX: gTarget, tGut: bump(gutterN, gTarget) });
    } else {
      const subDir = tc.l < sc.l ? -1 : 1, subLane = sc.l;
      const subI = bump(subN, `${subLane}:${subDir}`);
      const gS = gSource, gT = gTarget;
      plans.push({ fe, kind: "subrow", gS, tGutS: bump(gutterN, gS), gT, tGutT: bump(gutterN, gT), subLane, subDir, subI });
    }
  }
  const gutterCount = (g: number) => gutterN.get(g) ?? 0;
  // Widen the gutter at a PHASE BOUNDARY (fine cols g-1 and g in different phases) so phases read
  // as separated bands, not just where their dashed boxes happen to sit.
  const PHASE_GAP = 70;
  const phaseBoundary = (g: number) => g > 0 && g < NF && fineCols[g].phase !== fineCols[g - 1].phase;
  const gutterW = (g: number) =>
    Math.max(COL_GAP, 40 + Math.max(0, gutterCount(g) - 1) * V_TRACK) + labelPad[g] + (phaseBoundary(g) ? PHASE_GAP : 0);

  // Intra-lane SUB-ROWS: a lane band = its node band (laneH[l] = slots · rowUnit) PLUS a thin
  // routing sub-row per blocked/back edge that runs INSIDE this lane, above or below the node band
  // (never in the gap between lanes — that read as "outside the swimlane"). The lane WIDENS to fit
  // only the connectors that need it (0 otherwise), so bands stay compact.
  const nodeBandH = laneH; // node band = slots · rowUnit (stacked parallel branches)
  const upN = (l: number) => subN.get(`${l}:-1`) ?? 0;
  const downN = (l: number) => subN.get(`${l}:1`) ?? 0;
  const laneFullH = new Array(L).fill(0).map((_, l) => upN(l) * HW_TRACK + nodeBandH[l] + downN(l) * HW_TRACK);
  const laneY = new Array(L); { let y = 0; for (let l = 0; l < L; l++) { laneY[l] = y; y += laneFullH[l]; } }
  const innerH = L ? laneY[L - 1] + laneFullH[L - 1] : 0;
  // top of a node's SLOT within its lane band (slot 0 = the main row, higher slots stack below).
  const slotTop = (l: number, s: number) => laneY[l] + upN(l) * HW_TRACK + s * rowUnit[l];
  const subRowY = (l: number, dir: number, i: number) => offsetY + (dir < 0
    ? laneY[l] + (i + 0.5) * HW_TRACK                                        // up sub-row (above the node band)
    : laneY[l] + upN(l) * HW_TRACK + nodeBandH[l] + (i + 0.5) * HW_TRACK);   // down sub-row (below the node band)

  const colX = new Array(NF); { let x = gutterW(0); for (let f = 0; f < NF; f++) { colX[f] = x; x += colW[f] + gutterW(f + 1); } }
  const contentX = offsetX + LANE_HEADER;
  const gutterMid = (g: number) => (g === 0 ? 0 : colX[g - 1] + colW[g - 1]) + gutterW(g) / 2;
  // Tracks sit in the RIGHT part of the gutter, past the branch-label pad, so gutter verticals
  // never strike through the label column.
  const trackX = (g: number, i: number) => contentX + gutterMid(g) + labelPad[g] / 2 + (i - (gutterCount(g) - 1) / 2) * V_TRACK;

  const nodeBounds = new Map<string, Bounds>();
  const planeElement: any[] = [];
  const emitShape = (id: string, fe: any, b: Bounds, externalLabel: boolean) => {
    const shape = shapeById.get(id) ?? moddle.create("bpmndi:BPMNShape", { id: `${id}_di`, bpmnElement: fe });
    shape.bounds = bounds(b.x, b.y, b.width, b.height);
    if (externalLabel && fe?.name) {
      const lw = labelWidth(fe.name);
      shape.label = moddle.create("bpmndi:BPMNLabel", { bounds: bounds(b.x + b.width / 2 - lw / 2, b.y + b.height + 6, lw, 14) });
    }
    planeElement.push(shape);
  };

  // Nodes sit centred horizontally in their fine column; vertically each takes its SLOT within the
  // lane band (slot 0 = main row on top, parallel branches stacked below). Single-node lanes just
  // centre the one node in the (single-slot) band.
  for (const n of nodes) {
    const c = nodeCell.get(n.id)!, s = slotOf.get(n.id)!;
    const b: Bounds = {
      x: contentX + colX[c.fc] + (colW[c.fc] - n.w) / 2,
      y: offsetY + slotTop(c.l, s) + (rowUnit[c.l] - n.h) / 2,
      width: n.w, height: n.h,
    };
    nodeBounds.set(n.id, b);
    emitShape(n.id, n.fe, b, EXTERNAL_LABEL_TYPES.has(n.fe.$type));
  }

  // Boundary events on their host's bottom edge.
  const hostSeen = new Map<string, number>();
  for (const [bid, hid] of boundaryHost) {
    const hb = nodeBounds.get(hid);
    const size = boundsById.get(bid) ?? { width: 36, height: 36 };
    if (!hb) continue;
    const seen = hostSeen.get(hid) ?? 0; hostSeen.set(hid, seen + 1);
    const b: Bounds = { x: hb.x + hb.width * (0.3 + 0.35 * seen) - size.width / 2, y: hb.y + hb.height - size.height / 2, width: size.width, height: size.height };
    nodeBounds.set(bid, b);
    const fe = boundaryFe.get(bid);
    const shape = shapeById.get(bid) ?? moddle.create("bpmndi:BPMNShape", { id: `${bid}_di`, bpmnElement: fe });
    shape.bounds = bounds(b.x, b.y, b.width, b.height);
    // Cascade stacked outcome labels a row lower each (seen is already left→right) so several
    // escalation boundaries on one host don't overprint their names — see renderProcess.
    if (fe?.name) { const lw = labelWidth(fe.name); shape.label = moddle.create("bpmndi:BPMNLabel", { bounds: bounds(b.x + b.width / 2 - lw / 2, b.y + b.height + 4 + seen * BLABEL_STEP, lw, 14) }); }
    planeElement.push(shape);
  }

  // Port distribution. The MAIN FLOW (a straight same-lane edge) leaves and enters at the node's
  // CENTRE so it stays perfectly straight — no tiny unnecessary step (the thing the user was
  // nudging nodes by hand to fix). BRANCH edges spread into the HALF they head toward (up-going in
  // the top half, down-going in the bottom half), ordered by the other endpoint's Y so they never
  // overprint or cross. Entries follow the same rule (straight → centre, others by direction).
  const cyOf = (id: string) => { const b = nodeBounds.get(id); return b ? b.y + b.height / 2 : 0; };
  const cxOf = (id: string) => { const b = nodeBounds.get(id); return b ? b.x + b.width / 2 : 0; };
  const kindOf = new Map<string, string>(plans.map((pl) => [pl.fe.id, pl.kind]));
  const exitY = new Map<string, number>(), entryY = new Map<string, number>();
  const outBy = new Map<string, any[]>(), inBy = new Map<string, any[]>();
  for (const pl of plans) {
    if (!nodeBounds.get(pl.fe.sourceRef.id) || !nodeBounds.get(pl.fe.targetRef.id)) continue;
    (outBy.get(pl.fe.sourceRef.id) ?? outBy.set(pl.fe.sourceRef.id, []).get(pl.fe.sourceRef.id)!).push(pl.fe);
    (inBy.get(pl.fe.targetRef.id) ?? inBy.set(pl.fe.targetRef.id, []).get(pl.fe.targetRef.id)!).push(pl.fe);
  }
  // Place a group of edges within the [lo,hi] Y range of a node side, ordered by `key`. If the
  // range is too tight to give each a MIN_PORT_GAP (small gateways with several same-side edges),
  // EXPAND symmetrically around the range centre so the ports never crowd/overprint — this is the
  // vertical spacing the user was fixing by hand on the join fan-in.
  const MIN_PORT_GAP = 16;
  const spread = (g: any[], lo: number, hi: number, key: (fe: any) => number, set: (fe: any, y: number) => void) => {
    g.sort((a, z) => key(a) - key(z));
    const n = g.length;
    if (!n) return;
    let step = (hi - lo) / (n + 1);
    if (step < MIN_PORT_GAP) { const mid = (lo + hi) / 2, half = (MIN_PORT_GAP * (n + 1)) / 2; lo = mid - half; hi = mid + half; step = MIN_PORT_GAP; }
    g.forEach((fe, i) => set(fe, lo + step * (i + 1)));
  };
  for (const [sid, list] of outBy) {
    const b = nodeBounds.get(sid)!, cy = b.y + b.height / 2;
    const up: any[] = [], down: any[] = [];
    for (const fe of list) {
      // Only a TRUE horizontal main-flow edge (target on the SAME row) leaves the centre. An edge to
      // a stacked sibling in a lower/upper slot is a branch even if same-lane — distribute it, else
      // it overprints the horizontal exit (why "Hay otro motor" fired Sí+No from one spot).
      if (kindOf.get(fe.id) === "straight" && Math.abs(cyOf(fe.targetRef.id) - cy) < 2) { exitY.set(fe.id, cy); continue; }
      (cyOf(fe.targetRef.id) < cy ? up : down).push(fe);
    }
    // Fan-out: order branches by the TARGET's x so the one dropping FARTHEST exits at the level
    // closest to centre (its long horizontal then stays clear of the nearer branch's vertical) —
    // ordering by target y instead let a far-but-lower branch cross a near-but-higher one.
    spread(up, b.y + 6, cy, (fe) => -cxOf(fe.targetRef.id), (fe, y) => exitY.set(fe.id, y));
    spread(down, cy, b.y + b.height - 6, (fe) => -cxOf(fe.targetRef.id), (fe, y) => exitY.set(fe.id, y));
  }
  for (const [tid, list] of inBy) {
    const b = nodeBounds.get(tid)!, cy = b.y + b.height / 2;
    const up: any[] = [], down: any[] = [];
    for (const fe of list) {
      if (kindOf.get(fe.id) === "straight" && Math.abs(cyOf(fe.sourceRef.id) - cy) < 2) { entryY.set(fe.id, cy); continue; } // true horizontal → centre
      (cyOf(fe.sourceRef.id) < cy ? up : down).push(fe);
    }
    // Entry SLOT order must match the vertical-track order (both keyed by source x) or the entry
    // horizontals cross the verticals. From ABOVE (verticals descend): closest source → TOP slot,
    // so its short vertical never spans the lower slots. From BELOW (verticals rise): farthest
    // source → TOP slot. (Both verified against the join and the Trasladar fan-ins.)
    spread(up, b.y + 6, cy, (fe) => -cxOf(fe.sourceRef.id), (fe, y) => entryY.set(fe.id, y));
    spread(down, cy, b.y + b.height - 6, (fe) => cxOf(fe.sourceRef.id), (fe, y) => entryY.set(fe.id, y));
  }

  // Connector NESTING: now that entry/exit Y are known, order the parallel verticals inside each
  // gutter so they DON'T cross. For a fan-in entering a node's left side, the edge landing on the
  // TOP slot takes the track CLOSEST to the node (innermost) and the bottom slot the outermost —
  // i.e. order by the Y the vertical connects to on that side, descending. Same for sub-row tracks.
  const entryYof = (fe: any) => entryY.get(fe.id) ?? cyOf(fe.targetRef.id);
  // Anti-crossing NESTING keyed by the FAR endpoint's x (not the local y). The crossing happens when
  // one connector reaches the node with a VERTICAL and another's HORIZONTAL runs across it. To avoid
  // it, the connector whose OTHER end is CLOSEST (largest x on the source side) takes the INNERMOST
  // track (nearest the node); the ones coming from farther away take OUTER tracks, so their long
  // horizontals stop short of the inner verticals. Order each gutter by that x, ascending (far = out).
  const gOrder = new Map<number, Array<{ k: number; set: (i: number) => void }>>();
  const sOrder = new Map<string, Array<{ y: number; set: (i: number) => void }>>();
  const gAdd = (g: number, k: number, set: (i: number) => void) => { (gOrder.get(g) ?? gOrder.set(g, []).get(g)!).push({ k, set }); };
  const sAdd = (key: string, y: number, set: (i: number) => void) => { (sOrder.get(key) ?? sOrder.set(key, []).get(key)!).push({ y, set }); };
  for (const pl of plans) {
    if (pl.kind === "gutter") gAdd(pl.gX, cxOf(pl.fe.sourceRef.id), (i) => (pl.tGut = i)); // entry vertical → key = source x
    else if (pl.kind === "subrow") {
      gAdd(pl.gS, cxOf(pl.fe.targetRef.id), (i) => (pl.tGutS = i)); gAdd(pl.gT, cxOf(pl.fe.sourceRef.id), (i) => (pl.tGutT = i));
      sAdd(`${pl.subLane}:${pl.subDir}`, entryYof(pl.fe), (i) => (pl.subI = i));
    } else if (pl.kind === "return") {
      gAdd(pl.gT, cxOf(pl.fe.sourceRef.id), (i) => (pl.tGutT = i));
      sAdd(`${pl.subLane}:${pl.subDir}`, cyOf(pl.fe.sourceRef.id), (i) => (pl.subI = i));
    }
  }
  for (const list of gOrder.values()) { list.sort((a, b) => a.k - b.k); list.forEach((e, i) => e.set(i)); }
  for (const list of sOrder.values()) { list.sort((a, b) => a.y - b.y); list.forEach((e, i) => e.set(i)); }

  // Gateway branch labels: a clean column just right of the gateway, top-aligned to the row's
  // top edge (the whitespace above the gateway's vertex, clear of the gateway's own name label
  // below it), stacked with REAL wrap-height steps — a 120px-clamped label renders ~2 lines
  // (~28px), so a fixed 18px step made stacked labels overprint (rep_2b). Ordered by exit Y so
  // the top label belongs to the top branch. The labelPad gutter widening guarantees the column
  // fits before the next node and the vertical tracks.
  const estLabelH = (name: string) => 14 * Math.max(1, Math.ceil((name.length * 6.5) / 120));
  const branchLabel = new Map<string, Pt>();
  {
    const bySrc = new Map<string, any[]>();
    for (const pl of plans) {
      const fe = pl.fe;
      if (fe.name && GATEWAY_TYPES.has(fe.sourceRef?.$type) && nodeBounds.has(fe.sourceRef.id))
        (bySrc.get(fe.sourceRef.id) ?? bySrc.set(fe.sourceRef.id, []).get(fe.sourceRef.id)!).push(fe);
    }
    for (const [gid, list] of bySrc) {
      const b = nodeBounds.get(gid)!;
      const cy = b.y + b.height / 2;
      list.sort((a, z) => (exitY.get(a.id) ?? cy) - (exitY.get(z.id) ?? cy));
      let y = cy - rowUnit[nodeCell.get(gid)!.l] / 2 + 2; // the gateway's row-top edge
      for (const fe of list) {
        branchLabel.set(fe.id, { x: b.x + b.width + 6, y });
        y += estLabelH(fe.name) + 4;
      }
    }
  }
  for (const pl of plans) {
    const fe = pl.fe;
    const s = nodeBounds.get(fe.sourceRef.id), t = nodeBounds.get(fe.targetRef.id);
    if (!s || !t) continue;
    const sey = exitY.get(fe.id) ?? s.y + s.height / 2, tey = entryY.get(fe.id) ?? t.y + t.height / 2;
    let pts: Pt[];
    if (pl.kind === "straight") {
      // Keep the main flow horizontal; only bend (orthogonally) if the two ports ended up at
      // different heights because the source or target fans out.
      pts = sey === tey
        ? [{ x: s.x + s.width, y: sey }, { x: t.x, y: tey }]
        : [{ x: s.x + s.width, y: sey }, { x: (s.x + s.width + t.x) / 2, y: sey }, { x: (s.x + s.width + t.x) / 2, y: tey }, { x: t.x, y: tey }];
    } else if (pl.kind === "gutter") {
      // side-exit → gutter drop → side-enter (adjacent columns, short).
      const gx = trackX(pl.gX, pl.tGut);
      const sx = gx >= s.x + s.width / 2 ? s.x + s.width : s.x;
      const tx = gx >= t.x + t.width / 2 ? t.x + t.width : t.x;
      pts = sey === tey
        ? [{ x: sx, y: sey }, { x: tx, y: tey }]
        : [{ x: sx, y: sey }, { x: gx, y: sey }, { x: gx, y: tey }, { x: tx, y: tey }];
    } else if (pl.kind === "subrow") {
      // Both rows blocked: exit EAST, drop into a sub-row INSIDE the source lane (above/below the
      // node row — still inside the swimlane), run across it, then one vertical in the gutter beside
      // the target and enter WEST. The sub-row is clear (nodes sit on the node row, not here).
      const xS = trackX(pl.gS, pl.tGutS), xT = trackX(pl.gT, pl.tGutT), ry = subRowY(pl.subLane, pl.subDir, pl.subI);
      pts = [{ x: s.x + s.width, y: sey }, { x: xS, y: sey }, { x: xS, y: ry }, { x: xT, y: ry }, { x: xT, y: tey }, { x: t.x, y: tey }];
    } else {
      // return (back-edge): exit the source's BOTTOM/TOP rear (never the left face), loop back in a
      // source-lane sub-row, rise/drop in the gutter just left of the target, and ENTER from the WEST.
      const xT = trackX(pl.gT, pl.tGutT), ry = subRowY(pl.subLane, pl.subDir, pl.subI);
      const sBackX = s.x + s.width * 0.3, sBackY = pl.subDir < 0 ? s.y : s.y + s.height;
      pts = [{ x: sBackX, y: sBackY }, { x: sBackX, y: ry }, { x: xT, y: ry }, { x: xT, y: tey }, { x: t.x, y: tey }];
    }
    const edge = shapeById.get(fe.id) ?? moddle.create("bpmndi:BPMNEdge", { id: `${fe.id}_di`, bpmnElement: fe });
    edge.waypoint = pts.map((pt) => moddle.create("dc:Point", { x: Math.round(pt.x), y: Math.round(pt.y) }));
    if (fe.name) {
      const lw = labelWidth(fe.name);
      const pos = branchLabel.get(fe.id) ?? labelNearSource(pts[0], pts[1], lw, 14);
      edge.label = moddle.create("bpmndi:BPMNLabel", { bounds: bounds(pos.x, pos.y, lw, 14) });
    }
    planeElement.push(edge);
  }

  // Lane bands tile the full height with no gaps: each band absorbs the channel ABOVE it (and the
  // last band the channel below), so the inter-lane routing channels sit inside the swimlanes.
  const laneBands = lanes.map((lane, l) => ({ lane, y: laneY[l], height: laneFullH[l] }));
  // A phase box spans ALL its fine columns (a clean, contiguous column — no round-11 overlap),
  // from just left of its first to just right of its last, meeting the neighbouring phase mid-gap.
  const phaseColumns = phaseGroups.map((pg, p) => {
    const r = phaseFc[p];
    if (r.hi < r.lo) return null; // a phase with no nodes contributes no box
    const left = colX[r.lo] - gutterW(r.lo) / 2;
    const right = colX[r.hi] + colW[r.hi] + gutterW(r.hi + 1) / 2;
    return { group: pg.g, x: contentX + left, width: right - left };
  }).filter(Boolean) as Array<{ group: any; x: number; width: number }>;
  const totalW = LANE_HEADER + colX[NF - 1] + colW[NF - 1] + gutterW(NF);
  return { planeElement, width: totalW + 20, height: innerH + 20, nodeBounds, laneBands, phaseColumns };
}

/**
 * Rebuild group (phase) boxes. A bpmn:Group has no member list, so we infer membership from
 * the OLD DI (which elements sat inside its old box) and recompute the box as the bounding
 * box of those same elements' NEW positions. Reuses the old shape (keeps category/name).
 */
function emitGroups(
  artifacts: any[] | undefined, oldBoundsById: Map<string, Bounds>, newBoundsById: Map<string, Bounds>,
  shapeById: Map<string, any>, moddle: any, columnExtent?: { top: number; bottom: number },
): any[] {
  const out: any[] = [];
  // Old + new vertical extents, to detect "phase column" groups (ones that spanned most of
  // the old height, i.e. all lanes) and span them across the FULL new height — otherwise
  // their boxes shrink to their members' rows and read as indented/staggered.
  const oldYs = [...oldBoundsById.values()];
  const oldContentH = oldYs.length ? Math.max(...oldYs.map((b) => b.y + b.height)) - Math.min(...oldYs.map((b) => b.y)) : 1;
  const newYs = [...newBoundsById.values()];
  const newTop = newYs.length ? Math.min(...newYs.map((b) => b.y)) : 0;
  const newBot = newYs.length ? Math.max(...newYs.map((b) => b.y + b.height)) : 0;

  for (const a of artifacts ?? []) {
    if (a.$type !== "bpmn:Group") continue;
    const shape = shapeById.get(a.id);
    const ob = shape?.bounds;
    if (!ob) continue;
    const members: Bounds[] = [];
    for (const [id, nb] of newBoundsById) {
      const o = oldBoundsById.get(id);
      if (!o) continue;
      const cx = o.x + o.width / 2, cy = o.y + o.height / 2;
      if (cx >= ob.x && cx <= ob.x + ob.width && cy >= ob.y && cy <= ob.y + ob.height) members.push(nb);
    }
    if (!members.length) continue;
    const minX = Math.min(...members.map((m) => m.x)) - 20;
    const maxX = Math.max(...members.map((m) => m.x + m.width)) + 20;
    const isColumn = ob.height >= 0.6 * oldContentH; // spanned most lanes → keep it full-height
    // A phase column is clamped to the pool's extent (columnExtent) when given, so it never
    // spills above/below the swimlane; otherwise it spans the diagram's node extent.
    const minY = isColumn ? (columnExtent ? columnExtent.top : newTop - 34) : Math.min(...members.map((m) => m.y)) - 34;
    const maxY = isColumn ? (columnExtent ? columnExtent.bottom : newBot + 20) : Math.max(...members.map((m) => m.y + m.height)) + 20;
    shape.bounds = moddle.create("dc:Bounds", { x: Math.round(minX), y: Math.round(minY), width: Math.round(maxX - minX), height: Math.round(maxY - minY) });
    if (shape.label?.bounds) { shape.label.bounds.x = Math.round(minX + 8); shape.label.bounds.y = Math.round(minY + 4); }
    out.push(shape);
  }
  return out;
}

/** Single-process (no pools) layout: one process rendered at the origin. */
export async function layoutDiagramElk(xml: string): Promise<string> {
  const moddle = new BpmnModdle();
  const { rootElement: defs } = await moddle.fromXML(xml);
  const roots = (defs as any).rootElements ?? [];
  const collaboration = roots.find((e: any) => e.$type === "bpmn:Collaboration");
  if (collaboration) return layoutCollaborationElk(defs, collaboration, moddle, xml);

  const process = roots.find((e: any) => e.$type === "bpmn:Process" && (e.flowElements?.length ?? 0) > 0);
  if (!process) return xml;

  const { shapeById, boundsById } = oldDiFromDefs(defs);
  let planeElement: any[];
  if (lanesOf(process).length) {
    // Defensive: a laned process with NO wrapping pool. Lanes must still come out as hard
    // bands, so it takes the same matrix path as pooled processes; its lane bands and phase
    // columns are emitted directly (there is no pool shape to hold them).
    const groups = (process.artifacts ?? []).filter((a: any) => a.$type === "bpmn:Group");
    const res = renderMatrix(process, groups, moddle, boundsById, shapeById, 0, 0);
    const rect = (el: any, x: number, y: number, w: number, h: number, horizontal: boolean) => {
      const s = shapeById.get(el.id) ?? moddle.create("bpmndi:BPMNShape", { id: `${el.id}_di`, bpmnElement: el });
      s.bounds = moddle.create("dc:Bounds", { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) });
      if (horizontal) s.isHorizontal = true;
      if (s.label?.bounds) { s.label.bounds.x = Math.round(x + 8); s.label.bounds.y = Math.round(y + 4); }
      return s;
    };
    const bandsBottom = res.laneBands.reduce((m, b) => Math.max(m, b.y + b.height), 0);
    planeElement = [
      ...res.phaseColumns.map((c) => rect(c.group, c.x, 0, c.width, bandsBottom, false)),
      ...res.laneBands.map((b) => rect(b.lane, 0, b.y, res.width, b.height, true)),
      ...res.planeElement,
    ];
  } else {
    const elk = await getElk();
    const { planeElement: pe, nodeBounds } = await renderProcess(process, moddle, elk, boundsById, shapeById, 0, 0);
    planeElement = [...emitGroups(process.artifacts, boundsById, nodeBounds, shapeById, moddle), ...pe];
  }

  const plane = moddle.create("bpmndi:BPMNPlane", { id: "BPMNPlane_elk", bpmnElement: process, planeElement });
  (defs as any).diagrams = [moddle.create("bpmndi:BPMNDiagram", { id: "BPMNDiagram_elk", plane })];
  const { xml: out } = await moddle.toXML(defs, { format: true });
  return out ?? xml;
}

/**
 * Swimlane layout: each participant's process is laid out, wrapped in a pool box (with lane
 * bands when it declares lanes), pools stacked vertically, and message flows routed between
 * them. This is what makes auto-organize work on carriles/pools.
 */
async function layoutCollaborationElk(defs: any, collaboration: any, moddle: any, xml: string): Promise<string> {
  const elk = await getElk();
  const { shapeById, boundsById } = oldDiFromDefs(defs);
  const bounds = (x: number, y: number, w: number, h: number) =>
    moddle.create("dc:Bounds", { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) });
  // Reuse the old pool/lane shape (keeps color/fill) with fresh bounds, else create one.
  const poolShape = (el: any, x: number, y: number, w: number, h: number) => {
    const s = shapeById.get(el.id) ?? moddle.create("bpmndi:BPMNShape", { id: `${el.id}_di`, bpmnElement: el });
    s.bounds = bounds(x, y, w, h);
    s.isHorizontal = true;
    return s;
  };

  const participants: any[] = collaboration.participants ?? [];
  const planeElement: any[] = [];
  const allNodeBounds = new Map<string, Bounds>();
  const POOL_GAP = 60;
  let poolY = 0;
  let poolW = 600;
  let poolsBottom = 0;

  // Matrix mode: a diagram with lane + group (phase) structure is a 2-D matrix elk can't
  // preserve, so it's laid out cell-by-cell (column = phase, row = lane) instead.
  const groups = [
    ...(collaboration.artifacts ?? []).filter((a: any) => a.$type === "bpmn:Group"),
    ...participants.flatMap((p) => (p.processRef?.artifacts ?? []).filter((a: any) => a.$type === "bpmn:Group")),
  ];
  const matrixMode = groups.length > 0;
  // A LANED process always takes the matrix path too (even with zero groups — renderMatrix
  // degenerates cleanly): its lanes are hard bands by construction. The old elk-INTERACTIVE
  // "seeded-Y" path only HINTED each node's lane and derived the bands from wherever elk
  // placed the members, so nodes escaped their lane and bands could invert (rep_2b: 5
  // out-of-lane nodes, one -61px band). Lane-less pools keep the plain elk path.
  const renderOne = (proc: any, ox: number, oy: number): Promise<any> =>
    matrixMode || lanesOf(proc).length
      ? Promise.resolve(renderMatrix(proc, groups, moddle, boundsById, shapeById, ox, oy))
      : renderProcess(proc, moddle, elk, boundsById, shapeById, ox, oy);
  const groupColumnShape = (group: any, x: number, y: number, w: number, h: number) => {
    const s = shapeById.get(group.id) ?? moddle.create("bpmndi:BPMNShape", { id: `${group.id}_di`, bpmnElement: group });
    s.bounds = bounds(x, y, w, h);
    if (s.label?.bounds) { s.label.bounds.x = Math.round(x + 8); s.label.bounds.y = Math.round(y + 4); }
    return s;
  };

  // First pass: lay each participant's process out to learn pool widths (use the widest).
  const rendered: Array<{ part: any; res: any }> = [];
  for (const part of participants) {
    const proc = part.processRef;
    if (!proc || !(proc.flowElements?.length)) { rendered.push({ part, res: null }); continue; }
    const res = await renderOne(proc, 0, 0);
    rendered.push({ part, res });
    poolW = Math.max(poolW, POOL_HEADER + res.width + 20);
  }

  // Second pass: place pools stacked, re-render each at its final offset.
  const groupCols: any[] = []; // matrix-mode phase columns to draw as clean, contained boxes
  for (const { part, res } of rendered) {
    const proc = part.processRef;
    const hasLanes = (res?.laneBands.length ?? 0) > 0;
    const contentLeft = POOL_HEADER; // lane header (if any) is added inside the renderer
    // A laned pool's interior IS its lane bands — they must tile it exactly (padding already
    // lives INSIDE each band), so the pool height is the bands' extent. Adding the lane-less
    // breathing room (height's +20 margin + 2·LANE_PAD) left a 56px dead strip below the
    // last band. Lane-less pools keep the padding around their free-floating flow.
    const poolH = !res ? 120
      : hasLanes ? res.laneBands.reduce((m: number, b: any) => Math.max(m, b.y + b.height), 0)
      : res.height + 2 * LANE_PAD;
    // Re-render at final position so all coordinates (and message-flow anchors) are absolute.
    let finalPlane: any[] = [];
    if (proc && res) {
      const placed = await renderOne(proc, contentLeft, poolY + (hasLanes ? 0 : LANE_PAD));
      finalPlane = placed.planeElement;
      for (const [id, b] of placed.nodeBounds) allNodeBounds.set(id, b);
      for (const band of placed.laneBands) {
        planeElement.push(poolShape(band.lane, POOL_HEADER, poolY + band.y, poolW - POOL_HEADER, band.height));
      }
      // Phase columns span the pool height, clean and non-overlapping (matrix mode).
      for (const col of placed.phaseColumns ?? []) {
        groupCols.push(groupColumnShape(col.group, col.x, poolY, col.width, poolH));
      }
    }
    planeElement.push(poolShape(part, 0, poolY, poolW, poolH)); // pool (participant) shape
    planeElement.push(...finalPlane);
    poolsBottom = poolY + poolH;
    poolY += poolH + POOL_GAP;
  }

  // Phase groups. Matrix mode already produced clean full-height columns; otherwise infer
  // membership from the old DI and clamp full-height columns to the pool extent.
  if (matrixMode) {
    planeElement.push(...groupCols);
  } else {
    const groupArtifacts = [
      ...(collaboration.artifacts ?? []),
      ...participants.flatMap((p) => p.processRef?.artifacts ?? []),
    ];
    planeElement.push(...emitGroups(groupArtifacts, boundsById, allNodeBounds, shapeById, moddle, { top: 0, bottom: poolsBottom }));
  }

  // Message flows between pools → orthogonal routes between the anchored elements.
  for (const mf of collaboration.messageFlows ?? []) {
    const s = allNodeBounds.get(mf.sourceRef?.id), t = allNodeBounds.get(mf.targetRef?.id);
    if (!s || !t) continue;
    // Exit the source vertically toward the target pool.
    const down = t.y > s.y;
    const sp: Pt = { x: s.x + s.width / 2, y: down ? s.y + s.height : s.y };
    const tp: Pt = { x: t.x + t.width / 2, y: down ? t.y : t.y + t.height };
    const midY = (sp.y + tp.y) / 2;
    const pts: Pt[] = [sp, { x: sp.x, y: midY }, { x: tp.x, y: midY }, tp];
    const edge = moddle.create("bpmndi:BPMNEdge", { id: `${mf.id}_di`, bpmnElement: mf, waypoint: pts.map((p) => moddle.create("dc:Point", { x: Math.round(p.x), y: Math.round(p.y) })) });
    if (mf.name) {
      const lw = labelWidth(mf.name);
      edge.label = moddle.create("bpmndi:BPMNLabel", { bounds: bounds((sp.x + tp.x) / 2 - lw / 2, midY - 16, lw, 14) });
    }
    planeElement.push(edge);
  }

  const plane = moddle.create("bpmndi:BPMNPlane", { id: "BPMNPlane_elk", bpmnElement: collaboration, planeElement });
  (defs as any).diagrams = [moddle.create("bpmndi:BPMNDiagram", { id: "BPMNDiagram_elk", plane })];
  const { xml: out } = await moddle.toXML(defs, { format: true });
  return out ?? xml;
}
