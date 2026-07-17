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

/** Map every shape's element id → its DI {width,height} across all diagrams. */
function sizesFromDefs(defs: any): Map<string, { width: number; height: number }> {
  const m = new Map<string, { width: number; height: number }>();
  for (const d of defs.diagrams ?? []) {
    for (const pe of d.plane?.planeElement ?? []) {
      if (pe.$type === "bpmndi:BPMNShape" && pe.bpmnElement?.id && pe.bounds) {
        m.set(pe.bpmnElement.id, { width: pe.bounds.width, height: pe.bounds.height });
      }
    }
  }
  return m;
}

/** A simple orthogonal (Z-shaped) route between two shapes, exiting/entering horizontally. */
function routeOrtho(s: Bounds, t: Bounds): Pt[] {
  const sx = s.x + s.width, sy = s.y + s.height / 2;
  const tx = t.x, ty = t.y + t.height / 2;
  if (Math.abs(sy - ty) < 2) return [{ x: sx, y: sy }, { x: tx, y: ty }];
  const midX = (sx + tx) / 2;
  return [{ x: sx, y: sy }, { x: midX, y: sy }, { x: midX, y: ty }, { x: tx, y: ty }];
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
  sizeById: Map<string, { width: number; height: number }>, offsetX: number, offsetY: number,
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

  const laid = await elk.layout({
    id: "root",
    layoutOptions: variant.layoutOptions,
    children: elkNodes.map((n) => {
      const bs = boundaryByHost.get(n.id);
      if (!bs?.length) return { id: n.id, width: n.width, height: n.height };
      return {
        id: n.id, width: n.width, height: n.height,
        layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
        ports: bs.map((b: any) => ({ id: b.id, width: 30, height: 30, layoutOptions: { "elk.port.side": variant.portSide } })),
      };
    }),
    edges: elkEdges.map((e) => ({ id: e.id, sources: e.sources, targets: e.targets, labels: e.labels })),
  });

  const laidNode = new Map<string, any>((laid.children ?? []).map((c: any) => [c.id, c]));
  const laidEdge = new Map<string, any>((laid.edges ?? []).map((e: any) => [e.id, e]));

  // Lanes → repack each lane into a COMPACT band: keep elk's x-order (layering), discard
  // its y (which scatters a lane's nodes across the whole height), and stack nodes into
  // rows only when they'd overlap horizontally. `nodeNewY` is the node's absolute y within
  // the process; when unset the elk y stands (no lanes).
  const lanes: any[] = process.laneSets?.[0]?.lanes ?? process.laneSet?.[0]?.lanes ?? [];
  const laneOf = new Map<string, number>();
  lanes.forEach((lane, i) => (lane.flowNodeRef ?? []).forEach((ref: any) => ref?.id && laneOf.set(ref.id, i)));
  const ROW_H = 110;
  const nodeNewY = new Map<string, number>();
  const laneBands: Array<{ lane: any; y: number; height: number }> = [];
  if (lanes.length) {
    let top = 0;
    for (let i = 0; i < lanes.length; i++) {
      const members = elkNodes
        .filter((n) => laneOf.get(n.id) === i)
        .map((n) => ({ n, c: laidNode.get(n.id) }))
        .filter((m) => m.c)
        .sort((a, b) => a.c.x - b.c.x);
      // Greedy row assignment: a node shares a row unless it overlaps the row's last node in x.
      const rowRight: number[] = [];
      const rowOf = new Map<string, number>();
      for (const { n, c } of members) {
        let r = 0;
        while (r < rowRight.length && rowRight[r] > c.x - 24) r++;
        if (r === rowRight.length) rowRight.push(0);
        rowRight[r] = c.x + n.width;
        rowOf.set(n.id, r);
      }
      const rows = Math.max(1, rowRight.length);
      const height = 2 * LANE_PAD + (rows - 1) * ROW_H + 90;
      laneBands.push({ lane: lanes[i], y: top, height });
      for (const { n } of members) {
        nodeNewY.set(n.id, top + LANE_PAD + (rowOf.get(n.id) ?? 0) * ROW_H);
      }
      top += height;
    }
  }
  const nodeTop = (id: string, elkY: number) => nodeNewY.get(id) ?? elkY;
  const contentX = offsetX + (lanes.length ? LANE_HEADER : 0);

  const bounds = (x: number, y: number, w: number, h: number) =>
    moddle.create("dc:Bounds", { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) });

  const nodeBounds = new Map<string, Bounds>();
  const planeElement: any[] = [];

  for (const n of elkNodes) {
    const c = laidNode.get(n.id);
    if (!c) continue;
    const b: Bounds = { x: c.x + contentX, y: nodeTop(n.id, c.y) + offsetY, width: n.width, height: n.height };
    nodeBounds.set(n.id, b);
    const shape = moddle.create("bpmndi:BPMNShape", { id: `${n.id}_di`, bpmnElement: n._fe, bounds: bounds(b.x, b.y, b.width, b.height) });
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
    const hostTop = nodeTop(hid, host.y);
    const cx = host.x + port.x + (port.width ?? 0) / 2 + contentX;
    const cy = hostTop + port.y + (port.height ?? 0) / 2 + offsetY;
    const b: Bounds = { x: cx - size.width / 2, y: cy - size.height / 2, width: size.width, height: size.height };
    boundaryBounds.set(bid, b);
    nodeBounds.set(bid, b);
    const fe = boundaryFe.get(bid);
    const shape = moddle.create("bpmndi:BPMNShape", { id: `${bid}_di`, bpmnElement: fe, bounds: bounds(b.x, b.y, b.width, b.height) });
    if (fe?.name) {
      const lw = labelWidth(fe.name);
      shape.label = moddle.create("bpmndi:BPMNLabel", { bounds: bounds(b.x + b.width / 2 - lw / 2, b.y + b.height + 4, lw, 14) });
    }
    planeElement.push(shape);
  }

  const remap = lanes.length > 0; // nodes moved off elk's routes → re-route orthogonally
  for (const e of elkEdges) {
    const le = laidEdge.get(e.id);
    let pts: Pt[];
    if (remap) {
      const s = nodeBounds.get(e.sources[0]), t = nodeBounds.get(e.targets[0]);
      if (!s || !t) continue;
      pts = routeOrtho(s, t);
    } else {
      const section = le?.sections?.[0];
      if (section) {
        pts = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((p: Pt) => ({ x: p.x + contentX, y: p.y + offsetY }));
      } else {
        const s = nodeBounds.get(e.sources[0]), t = nodeBounds.get(e.targets[0]);
        if (!s || !t) continue;
        pts = [{ x: s.x + s.width / 2, y: s.y + s.height / 2 }, { x: t.x + t.width / 2, y: t.y + t.height / 2 }];
      }
    }
    const bc = boundaryBounds.get(e.sources[0]);
    if (bc && !remap) pts[0] = { x: bc.x + bc.width / 2, y: bc.y + bc.height / 2 };
    const edge = moddle.create("bpmndi:BPMNEdge", {
      id: `${e.id}_di`, bpmnElement: e._fe,
      waypoint: pts.map((p) => moddle.create("dc:Point", { x: Math.round(p.x), y: Math.round(p.y) })),
    });
    if (e._fe.name) {
      const lw = labelWidth(e._fe.name);
      const srcType = e._fe.sourceRef?.$type;
      const nearSource = GATEWAY_TYPES.has(srcType) || srcType === "bpmn:BoundaryEvent";
      const ll = le?.labels?.[0];
      const pos = nearSource || !ll || remap
        ? labelNearSource(pts[0], pts[1], lw, 14)
        : { x: ll.x + contentX, y: ll.y + offsetY };
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
  const sizeById = sizesFromDefs(defs);
  const { planeElement } = await renderProcess(process, moddle, elk, variant, sizeById, 0, 0);

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
async function layoutCollaborationElk(defs: any, collaboration: any, moddle: any, variant: ElkVariant, xml: string): Promise<string> {
  const elk = await getElk();
  const sizeById = sizesFromDefs(defs);
  const bounds = (x: number, y: number, w: number, h: number) =>
    moddle.create("dc:Bounds", { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) });

  const participants: any[] = collaboration.participants ?? [];
  const planeElement: any[] = [];
  const allNodeBounds = new Map<string, Bounds>();
  const POOL_GAP = 60;
  let poolY = 0;
  let poolW = 600;

  // First pass: lay each participant's process out to learn pool widths (use the widest).
  const rendered: Array<{ part: any; res: Awaited<ReturnType<typeof renderProcess>> | null }> = [];
  for (const part of participants) {
    const proc = part.processRef;
    if (!proc || !(proc.flowElements?.length)) { rendered.push({ part, res: null }); continue; }
    const res = await renderProcess(proc, moddle, elk, variant, sizeById, 0, 0);
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
      const placed = await renderProcess(proc, moddle, elk, variant, sizeById, contentLeft, poolY + (hasLanes ? 0 : LANE_PAD));
      finalPlane = placed.planeElement;
      for (const [id, b] of placed.nodeBounds) allNodeBounds.set(id, b);
      // Lane shapes span the pool width (right of the pool header).
      for (const band of placed.laneBands) {
        planeElement.push(moddle.create("bpmndi:BPMNShape", {
          id: `${band.lane.id}_di`, bpmnElement: band.lane, isHorizontal: true,
          bounds: bounds(POOL_HEADER, poolY + band.y, poolW - POOL_HEADER, band.height),
        }));
      }
    }
    // Pool (participant) shape.
    planeElement.push(moddle.create("bpmndi:BPMNShape", {
      id: `${part.id}_di`, bpmnElement: part, isHorizontal: true,
      bounds: bounds(0, poolY, poolW, poolH),
    }));
    planeElement.push(...finalPlane);
    poolY += poolH + POOL_GAP;
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
