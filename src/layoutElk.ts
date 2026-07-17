// D · Auto-layout — elkjs engine (BETA).
//
// Higher-quality layout than bpmn-auto-layout: elkjs (the Eclipse Layout Kernel JS port)
// runs a proper layered algorithm with orthogonal edge routing and on-edge label
// placement, so flows don't overlap and gateway condition labels land ON the branch —
// the quality gap the user flagged (Image 16 vs 17). We regenerate the diagram
// interchange (DI) from the semantic model:
//   • node sizes come from the existing DI when present (preserving the user's boxes),
//     else per-type defaults;
//   • edge waypoints come from elk's routed sections;
//   • edge (sequence-flow) labels use elk's absolute label positions;
//   • external node labels (events/gateways) are placed just below the shape ourselves —
//     elk isn't BPMN-aware and parks node labels at the node origin;
//   • boundary events are laid on their host's bottom edge after layout.
//
// BETA scope: a single process. Collaborations/pools (swimlanes) are refused for now —
// swimlane-aware layout is a separate problem elk doesn't solve out of the box.
// @ts-expect-error no type declarations published
import { BpmnModdle } from "bpmn-moddle";
import { UnsupportedLayoutError } from "./autoLayout";
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

function defaultSize(type: string): { width: number; height: number } {
  if (EVENT_TYPES.has(type)) return { width: 36, height: 36 };
  if (GATEWAY_TYPES.has(type)) return { width: 50, height: 50 };
  if (type === "bpmn:SubProcess" || type === "bpmn:CallActivity") return { width: 120, height: 90 };
  if (type === "bpmn:TextAnnotation") return { width: 100, height: 30 };
  if (type === "bpmn:DataObjectReference" || type === "bpmn:DataStoreReference") return { width: 36, height: 50 };
  return { width: 100, height: 80 }; // tasks
}

const labelWidth = (text: string): number => Math.min(120, Math.max(20, text.length * 6.5));

let elkInstance: any = null;
async function getElk(): Promise<any> {
  if (!elkInstance) {
    const mod: any = await import("elkjs/lib/elk.bundled.js");
    const ELK = mod.default ?? mod;
    elkInstance = new ELK();
  }
  return elkInstance;
}

/**
 * Re-layout a single-process diagram with elkjs and return regenerated XML.
 * @throws UnsupportedLayoutError("pools") for collaborations (beta scope).
 */
export async function layoutDiagramElk(xml: string): Promise<string> {
  const moddle = new BpmnModdle();
  const { rootElement: defs } = await moddle.fromXML(xml);
  const roots = (defs as any).rootElements ?? [];
  if (roots.some((e: any) => e.$type === "bpmn:Collaboration")) {
    throw new UnsupportedLayoutError("pools");
  }
  const process = roots.find((e: any) => e.$type === "bpmn:Process" && (e.flowElements?.length ?? 0) > 0);
  if (!process) return xml;

  const flowElements: any[] = process.flowElements ?? [];
  const sizeById = new Map<string, { width: number; height: number }>();
  for (const d of (defs as any).diagrams ?? []) {
    for (const pe of d.plane?.planeElement ?? []) {
      if (pe.$type === "bpmndi:BPMNShape" && pe.bpmnElement?.id && pe.bounds) {
        sizeById.set(pe.bpmnElement.id, { width: pe.bounds.width, height: pe.bounds.height });
      }
    }
  }

  const boundaryHost = new Map<string, string>(); // boundary event id → host id
  const boundaryFe = new Map<string, any>();      // boundary event id → moddle element
  const boundaryByHost = new Map<string, any[]>(); // host id → [boundary elements]
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
    // A boundary event becomes a PORT on its host (not a free layer node) — otherwise elk
    // spreads it and its outgoing flows across the diagram (verified on the real master).
    // As a port, it stays pinned to the host border and the layout stays compact.
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

  const elk = await getElk();
  const laid = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      // Compact, order-preserving placement so the result stays close to a hand layout.
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.semiInteractive": "true",
      "elk.spacing.nodeNode": "40",
      "elk.layered.spacing.nodeNodeBetweenLayers": "60",
      "elk.spacing.edgeNode": "20",
      "elk.spacing.edgeEdge": "12",
      "elk.layered.spacing.edgeNodeBetweenLayers": "20",
    },
    children: elkNodes.map((n) => {
      const bs = boundaryByHost.get(n.id);
      if (!bs?.length) return { id: n.id, width: n.width, height: n.height };
      // Boundary events ride the host's SOUTH edge as fixed ports.
      return {
        id: n.id, width: n.width, height: n.height,
        layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
        ports: bs.map((b: any) => ({ id: b.id, width: 30, height: 30, layoutOptions: { "elk.port.side": "SOUTH" } })),
      };
    }),
    edges: elkEdges.map((e) => ({ id: e.id, sources: e.sources, targets: e.targets, labels: e.labels })),
  });

  const laidNode = new Map<string, any>((laid.children ?? []).map((c: any) => [c.id, c]));
  const laidEdge = new Map<string, any>((laid.edges ?? []).map((e: any) => [e.id, e]));

  const bounds = (x: number, y: number, w: number, h: number) =>
    moddle.create("dc:Bounds", { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) });
  const centerOf = (n: any) => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 });

  // Boundary event bounds, read off their host's laid-out port positions (host-relative).
  const boundaryBounds = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const [bid, hid] of boundaryHost) {
    const host = laidNode.get(hid);
    const port = host?.ports?.find((p: any) => p.id === bid);
    if (!host || !port) continue;
    const size = sizeById.get(bid) ?? { width: 36, height: 36 };
    const cx = host.x + port.x + (port.width ?? 0) / 2;
    const cy = host.y + port.y + (port.height ?? 0) / 2;
    boundaryBounds.set(bid, { x: cx - size.width / 2, y: cy - size.height / 2, width: size.width, height: size.height });
  }
  const nodeCenter = (id: string): { x: number; y: number } | null => {
    const b = boundaryBounds.get(id);
    if (b) return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const n = laidNode.get(id);
    return n ? centerOf(n) : null;
  };

  const planeElement: any[] = [];

  // Regular node shapes (+ external labels below the shape).
  for (const n of elkNodes) {
    const c = laidNode.get(n.id);
    if (!c) continue;
    const shape = moddle.create("bpmndi:BPMNShape", {
      id: `${n.id}_di`, bpmnElement: n._fe, bounds: bounds(c.x, c.y, n.width, n.height),
    });
    if (EXTERNAL_LABEL_TYPES.has(n._fe.$type) && n._fe.name) {
      const lw = labelWidth(n._fe.name);
      shape.label = moddle.create("bpmndi:BPMNLabel", {
        bounds: bounds(c.x + n.width / 2 - lw / 2, c.y + n.height + 6, lw, 14),
      });
    }
    planeElement.push(shape);
  }

  // Boundary event shapes (on the host border) + their own labels below.
  for (const [bid, bb] of boundaryBounds) {
    const fe = boundaryFe.get(bid);
    const shape = moddle.create("bpmndi:BPMNShape", { id: `${bid}_di`, bpmnElement: fe, bounds: bounds(bb.x, bb.y, bb.width, bb.height) });
    if (fe?.name) {
      const lw = labelWidth(fe.name);
      shape.label = moddle.create("bpmndi:BPMNLabel", { bounds: bounds(bb.x + bb.width / 2 - lw / 2, bb.y + bb.height + 4, lw, 14) });
    }
    planeElement.push(shape);
  }

  // Edges: waypoints from elk sections. Labels for gateway- and boundary-sourced flows sit
  // near their source (the branch condition / "redirector" pills) so they don't pile up at
  // mid-connector; other flow labels keep elk's on-edge position.
  for (const e of elkEdges) {
    const le = laidEdge.get(e.id);
    const section = le?.sections?.[0];
    let pts: Array<{ x: number; y: number }>;
    if (section) {
      pts = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
    } else {
      const a = nodeCenter(e.sources[0]), b = nodeCenter(e.targets[0]);
      if (!a || !b) continue;
      pts = [a, b];
    }
    // Boundary-sourced edge: pin its start onto the boundary shape.
    const bc = boundaryBounds.get(e.sources[0]);
    if (bc) pts[0] = { x: bc.x + bc.width / 2, y: bc.y + bc.height / 2 };
    const edge = moddle.create("bpmndi:BPMNEdge", {
      id: `${e.id}_di`, bpmnElement: e._fe,
      waypoint: pts.map((p) => moddle.create("dc:Point", { x: Math.round(p.x), y: Math.round(p.y) })),
    });
    if (e._fe.name) {
      const lw = labelWidth(e._fe.name);
      const srcType = e._fe.sourceRef?.$type;
      const nearSource = GATEWAY_TYPES.has(srcType) || srcType === "bpmn:BoundaryEvent";
      const ll = le?.labels?.[0];
      const pos = nearSource || !ll ? labelNearSource(pts[0], pts[1], lw, 14) : { x: ll.x, y: ll.y };
      edge.label = moddle.create("bpmndi:BPMNLabel", { bounds: bounds(pos.x, pos.y, lw, 14) });
    }
    planeElement.push(edge);
  }

  const plane = moddle.create("bpmndi:BPMNPlane", { id: "BPMNPlane_elk", bpmnElement: process, planeElement });
  const diagram = moddle.create("bpmndi:BPMNDiagram", { id: "BPMNDiagram_elk", plane });
  (defs as any).diagrams = [diagram];

  const { xml: out } = await moddle.toXML(defs, { format: true });
  return out ?? xml;
}
