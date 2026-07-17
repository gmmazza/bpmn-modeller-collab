// D · Auto-layout — elkjs engine (BETA).
//
// Higher-quality layout than bpmn-auto-layout: elkjs (the Eclipse Layout Kernel JS port)
// runs a proper layered algorithm with orthogonal edge routing and on-edge label
// placement. We regenerate the diagram interchange (DI) from the semantic model. A
// selectable `variant` (horizontal / vertical / tree) picks the elk options; a
// collaboration is laid out as swimlanes (pools stacked, optional lanes as bands).
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

function defaultSize(type: string): { width: number; height: number } {
  if (EVENT_TYPES.has(type)) return { width: 36, height: 36 };
  if (GATEWAY_TYPES.has(type)) return { width: 50, height: 50 };
  if (type === "bpmn:SubProcess" || type === "bpmn:CallActivity") return { width: 120, height: 90 };
  if (type === "bpmn:TextAnnotation") return { width: 100, height: 30 };
  if (type === "bpmn:DataObjectReference" || type === "bpmn:DataStoreReference") return { width: 36, height: 50 };
  return { width: 100, height: 80 }; // tasks
}

const labelWidth = (text: string): number => Math.min(120, Math.max(20, text.length * 6.5));

// Selectable layout variants (the "opciones de organización" menu). Each is a full elk
// option set + the side boundary-event ports ride (so they stay sensible per direction).
export interface ElkVariant {
  id: string;
  label: string;
  portSide: string;
  layoutOptions: Record<string, string>;
}
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
export const ELK_VARIANTS: ElkVariant[] = [
  { id: "horizontal", label: "Flujo horizontal (→)", portSide: "SOUTH", layoutOptions: { ...COMPACT_LAYERED, "elk.direction": "RIGHT" } },
  { id: "vertical", label: "Flujo vertical (↓)", portSide: "EAST", layoutOptions: { ...COMPACT_LAYERED, "elk.direction": "DOWN" } },
  { id: "arbol", label: "Árbol", portSide: "SOUTH", layoutOptions: { "elk.algorithm": "mrtree", "elk.edgeRouting": "ORTHOGONAL", "elk.direction": "RIGHT", "elk.spacing.nodeNode": "40" } },
];
export const DEFAULT_ELK_VARIANT = ELK_VARIANTS[0].id;
export function resolveElkVariant(id: string | undefined): ElkVariant {
  return ELK_VARIANTS.find((v) => v.id === id) ?? ELK_VARIANTS[0];
}

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
  variantId?: string,
): Promise<Map<string, Pt>> {
  const variant = resolveElkVariant(variantId);
  const elk = await getElk();
  const laid = await elk.layout({
    id: "sel",
    layoutOptions: variant.layoutOptions,
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
 * Lay out one process's flow nodes with elk and emit its DI plane elements, translated by
 * (offsetX, offsetY). When the process declares lanes, node rows are remapped into stacked
 * lane bands (elk gives the horizontal order; we assign the vertical band). Returns the
 * emitted shapes/edges, the content bounding box, per-node absolute bounds (for message
 * flows) and the lane bands (for the caller to draw lane shapes).
 */
async function renderProcess(
  process: any, moddle: any, elk: any, variant: ElkVariant,
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

  // Lanes: seed each node's y by its lane so elk (with INTERACTIVE node placement) keeps the
  // lanes as horizontal bands AND routes the edges itself — the same clean orthogonal routing
  // it gives a plain diagram (no home-grown router, no post-hoc y-remap).
  const lanes: any[] = process.laneSets?.[0]?.lanes ?? process.laneSet?.[0]?.lanes ?? [];
  const laneOf = new Map<string, number>();
  lanes.forEach((lane, i) => (lane.flowNodeRef ?? []).forEach((ref: any) => ref?.id && laneOf.set(ref.id, i)));
  const hasLanes = lanes.length > 0;
  const LANE_SEED = 200; // per-lane y hint; elk compacts but preserves the lane order

  // A fully-disconnected node (no edges) would be dumped at layer 0 — the flow start. Keep it
  // where the author put it (and in its lane) instead of moving it.
  const connectedIds = new Set<string>();
  for (const e of elkEdges) { connectedIds.add(e.sources[0]); connectedIds.add(e.targets[0]); }
  const isDisconnected = (id: string) => !connectedIds.has(id) && sizeById.has(id);

  const laid = await elk.layout({
    id: "root",
    layoutOptions: hasLanes
      ? { ...variant.layoutOptions, "elk.direction": "RIGHT", "elk.layered.nodePlacement.strategy": "INTERACTIVE" }
      : variant.layoutOptions,
    children: elkNodes.filter((n) => !isDisconnected(n.id)).map((n) => {
      const child: any = { id: n.id, width: n.width, height: n.height };
      if (hasLanes) child.y = (laneOf.get(n.id) ?? 0) * LANE_SEED;
      const bs = boundaryByHost.get(n.id);
      if (bs?.length) {
        child.layoutOptions = { "elk.portConstraints": "FIXED_SIDE" };
        child.ports = bs.map((b: any) => ({ id: b.id, width: 30, height: 30, layoutOptions: { "elk.port.side": hasLanes ? "SOUTH" : variant.portSide } }));
      }
      return child;
    }),
    edges: elkEdges.map((e) => ({ id: e.id, sources: e.sources, targets: e.targets, labels: e.labels })),
  });

  const laidNode = new Map<string, any>((laid.children ?? []).map((c: any) => [c.id, c]));
  const laidEdge = new Map<string, any>((laid.edges ?? []).map((e: any) => [e.id, e]));

  // Lane bands from elk's output y (each lane's member extent), then snap adjacent bands so
  // they meet edge-to-edge — contiguous swimlanes with no gaps or overlaps.
  const laneBands: Array<{ lane: any; y: number; height: number }> = [];
  if (hasLanes) {
    for (let i = 0; i < lanes.length; i++) {
      const cs = elkNodes.filter((n) => laneOf.get(n.id) === i).map((n) => laidNode.get(n.id)).filter(Boolean);
      const prev = laneBands[i - 1];
      const top = cs.length ? Math.min(...cs.map((c: any) => c.y)) - LANE_PAD : (prev ? prev.y + prev.height : 0);
      const bot = cs.length ? Math.max(...cs.map((c: any) => c.y + c.height)) + LANE_PAD : top + 60;
      laneBands.push({ lane: lanes[i], y: top, height: bot - top });
    }
    for (let i = 0; i < laneBands.length - 1; i++) {
      const mid = (laneBands[i].y + laneBands[i].height + laneBands[i + 1].y) / 2;
      const nextBot = laneBands[i + 1].y + laneBands[i + 1].height;
      laneBands[i].height = mid - laneBands[i].y;
      laneBands[i + 1].y = mid;
      laneBands[i + 1].height = nextBot - mid;
    }
  }
  const contentX = offsetX + (hasLanes ? LANE_HEADER : 0);

  const bounds = (x: number, y: number, w: number, h: number) =>
    moddle.create("dc:Bounds", { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) });

  const nodeBounds = new Map<string, Bounds>();
  const planeElement: any[] = [];

  for (const n of elkNodes) {
    let b: Bounds;
    if (isDisconnected(n.id)) {
      const ob = sizeById.get(n.id)!; // keep the loose box at its original spot (in its lane)
      const li = laneOf.get(n.id);
      const y = hasLanes && li != null && laneBands[li] ? laneBands[li].y + LANE_PAD : ob.y;
      b = { x: ob.x + contentX, y: y + offsetY, width: n.width, height: n.height };
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
    if (fe?.name) {
      const lw = labelWidth(fe.name);
      shape.label = moddle.create("bpmndi:BPMNLabel", { bounds: bounds(b.x + b.width / 2 - lw / 2, b.y + b.height + 4, lw, 14) });
    }
    planeElement.push(shape);
  }

  for (const e of elkEdges) {
    const le = laidEdge.get(e.id);
    const sB = nodeBounds.get(e.sources[0]), tB = nodeBounds.get(e.targets[0]);
    const sLane = laneOf.get(e.sources[0]), tLane = laneOf.get(e.targets[0]);
    // Cross-lane FORWARD edge in a swimlane: keep the line straight in the source lane and
    // only drop to the target's lane at the last moment (user preference) — instead of elk's
    // route which changes lane early. Same-lane / back-edges / no-lane keep elk's routing.
    const dropLate = hasLanes && sB && tB && sLane != null && tLane != null && sLane !== tLane && tB.x > sB.x + sB.width;
    let pts: Pt[];
    if (dropLate) {
      const sx = sB!.x + sB!.width, sy = sB!.y + sB!.height / 2;
      const tx = tB!.x, ty = tB!.y + tB!.height / 2;
      const dropX = Math.max(sx + 20, tx - 25);
      pts = [{ x: sx, y: sy }, { x: dropX, y: sy }, { x: dropX, y: ty }, { x: tx, y: ty }];
    } else {
      const section = le?.sections?.[0];
      if (section) {
        pts = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((p: Pt) => ({ x: p.x + contentX, y: p.y + offsetY }));
      } else {
        if (!sB || !tB) continue;
        pts = [{ x: sB.x + sB.width / 2, y: sB.y + sB.height / 2 }, { x: tB.x + tB.width / 2, y: tB.y + tB.height / 2 }];
      }
    }
    const bc = boundaryBounds.get(e.sources[0]);
    if (bc) pts[0] = { x: bc.x + bc.width / 2, y: bc.y + bc.height / 2 };
    const edge = shapeById.get(e.id) ?? moddle.create("bpmndi:BPMNEdge", { id: `${e.id}_di`, bpmnElement: e._fe });
    edge.waypoint = pts.map((p) => moddle.create("dc:Point", { x: Math.round(p.x), y: Math.round(p.y) }));
    if (e._fe.name) {
      const lw = labelWidth(e._fe.name);
      const srcType = e._fe.sourceRef?.$type;
      const nearSource = GATEWAY_TYPES.has(srcType) || srcType === "bpmn:BoundaryEvent";
      const ll = le?.labels?.[0];
      const pos = nearSource || !ll ? labelNearSource(pts[0], pts[1], lw, 14) : { x: ll.x + contentX, y: ll.y + offsetY };
      edge.label = moddle.create("bpmndi:BPMNLabel", { bounds: bounds(pos.x, pos.y, lw, 14) });
    }
    planeElement.push(edge);
  }

  // Content bounding box (relative to offset), including the lane header column.
  let maxX = 0, maxY = 0;
  for (const b of nodeBounds.values()) {
    maxX = Math.max(maxX, b.x - offsetX + b.width);
    maxY = Math.max(maxY, b.y - offsetY + b.height);
  }
  if (lanes.length) maxY = Math.max(maxY, laneBands[laneBands.length - 1].y + laneBands[laneBands.length - 1].height);
  return { planeElement, width: maxX + 20, height: maxY + 20, nodeBounds, laneBands };
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
export async function layoutDiagramElk(xml: string, variantId?: string): Promise<string> {
  const variant = resolveElkVariant(variantId);
  const moddle = new BpmnModdle();
  const { rootElement: defs } = await moddle.fromXML(xml);
  const roots = (defs as any).rootElements ?? [];
  const collaboration = roots.find((e: any) => e.$type === "bpmn:Collaboration");
  if (collaboration) return layoutCollaborationElk(defs, collaboration, moddle, variant, xml);

  const process = roots.find((e: any) => e.$type === "bpmn:Process" && (e.flowElements?.length ?? 0) > 0);
  if (!process) return xml;

  const elk = await getElk();
  const { shapeById, boundsById } = oldDiFromDefs(defs);
  const { planeElement, nodeBounds } = await renderProcess(process, moddle, elk, variant, boundsById, shapeById, 0, 0);
  const groups = emitGroups(process.artifacts, boundsById, nodeBounds, shapeById, moddle);

  const plane = moddle.create("bpmndi:BPMNPlane", { id: "BPMNPlane_elk", bpmnElement: process, planeElement: [...groups, ...planeElement] });
  (defs as any).diagrams = [moddle.create("bpmndi:BPMNDiagram", { id: "BPMNDiagram_elk", plane })];
  const { xml: out } = await moddle.toXML(defs, { format: true });
  return out ?? xml;
}

/**
 * Swimlane layout: each participant's process is laid out, wrapped in a pool box (with lane
 * bands when it declares lanes), pools stacked vertically, and message flows routed between
 * them. This is what makes auto-organize work on carriles/pools.
 */
async function layoutCollaborationElk(defs: any, collaboration: any, moddle: any, variant: ElkVariant, xml: string): Promise<string> {
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

  // First pass: lay each participant's process out to learn pool widths (use the widest).
  const rendered: Array<{ part: any; res: Awaited<ReturnType<typeof renderProcess>> | null }> = [];
  for (const part of participants) {
    const proc = part.processRef;
    if (!proc || !(proc.flowElements?.length)) { rendered.push({ part, res: null }); continue; }
    const res = await renderProcess(proc, moddle, elk, variant, boundsById, shapeById, 0, 0);
    rendered.push({ part, res });
    poolW = Math.max(poolW, POOL_HEADER + res.width + 20);
  }

  // Second pass: place pools stacked, re-render each at its final offset.
  for (const { part, res } of rendered) {
    const proc = part.processRef;
    const hasLanes = (res?.laneBands.length ?? 0) > 0;
    const contentLeft = POOL_HEADER; // lane header (if any) is added inside renderProcess
    const poolH = res ? res.height + 2 * LANE_PAD : 120;
    // Re-render at final position so all coordinates (and message-flow anchors) are absolute.
    let finalPlane: any[] = [];
    if (proc && res) {
      const placed = await renderProcess(proc, moddle, elk, variant, boundsById, shapeById, contentLeft, poolY + (hasLanes ? 0 : LANE_PAD));
      finalPlane = placed.planeElement;
      for (const [id, b] of placed.nodeBounds) allNodeBounds.set(id, b);
      // Lane shapes span the pool width (right of the pool header).
      for (const band of placed.laneBands) {
        planeElement.push(poolShape(band.lane, POOL_HEADER, poolY + band.y, poolW - POOL_HEADER, band.height));
      }
    }
    planeElement.push(poolShape(part, 0, poolY, poolW, poolH)); // pool (participant) shape
    planeElement.push(...finalPlane);
    poolsBottom = poolY + poolH;
    poolY += poolH + POOL_GAP;
  }

  // Phase groups: infer membership from the old DI, recompute over the new positions, and
  // clamp full-height columns to the pool extent so they don't spill out of the swimlane.
  const groupArtifacts = [
    ...(collaboration.artifacts ?? []),
    ...participants.flatMap((p) => p.processRef?.artifacts ?? []),
  ];
  planeElement.push(...emitGroups(groupArtifacts, boundsById, allNodeBounds, shapeById, moddle, { top: 0, bottom: poolsBottom }));

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
