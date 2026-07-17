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

  const nodeById = new Map<string, any>();
  const boundary: any[] = [];
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
    if (t === "bpmn:BoundaryEvent") { boundary.push(fe); continue; } // placed on host after layout
    const size = sizeById.get(fe.id) ?? defaultSize(t);
    nodeById.set(fe.id, fe);
    elkNodes.push({ id: fe.id, width: size.width, height: size.height, _fe: fe, _size: size });
  }

  const elk = await getElk();
  const laid = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "50",
      "elk.layered.spacing.nodeNodeBetweenLayers": "70",
      "elk.spacing.edgeNode": "25",
      "elk.spacing.edgeEdge": "15",
      "elk.layered.spacing.edgeNodeBetweenLayers": "25",
    },
    children: elkNodes.map((n) => ({ id: n.id, width: n.width, height: n.height })),
    edges: elkEdges.map((e) => ({ id: e.id, sources: e.sources, targets: e.targets, labels: e.labels })),
  });

  const laidNode = new Map<string, any>((laid.children ?? []).map((c: any) => [c.id, c]));
  const laidEdge = new Map<string, any>((laid.edges ?? []).map((e: any) => [e.id, e]));

  const bounds = (x: number, y: number, w: number, h: number) =>
    moddle.create("dc:Bounds", { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) });
  const planeElement: any[] = [];

  // Node shapes (+ external labels below the shape).
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

  // Boundary events: sit on the host's bottom edge, spread across it.
  const hostCounts = new Map<string, number>();
  for (const b of boundary) {
    const host = laidNode.get(b.attachedToRef?.id);
    const size = sizeById.get(b.id) ?? defaultSize(b.$type);
    let x: number, y: number;
    if (host) {
      const seen = hostCounts.get(b.attachedToRef.id) ?? 0;
      hostCounts.set(b.attachedToRef.id, seen + 1);
      x = host.x + host.width * (0.3 + 0.4 * seen) - size.width / 2;
      y = host.y + host.height - size.height / 2;
    } else { x = 0; y = 0; }
    const shape = moddle.create("bpmndi:BPMNShape", {
      id: `${b.id}_di`, bpmnElement: b, bounds: bounds(x, y, size.width, size.height),
    });
    if (b.name) {
      const lw = labelWidth(b.name);
      shape.label = moddle.create("bpmndi:BPMNLabel", { bounds: bounds(x + size.width / 2 - lw / 2, y + size.height + 6, lw, 14) });
    }
    planeElement.push(shape);
  }

  // Edges: waypoints from elk sections; sequence-flow labels from elk's positions.
  for (const e of elkEdges) {
    const le = laidEdge.get(e.id);
    const section = le?.sections?.[0];
    let pts: Array<{ x: number; y: number }>;
    if (section) {
      pts = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
    } else {
      const a = laidNode.get(e.sources[0]), b = laidNode.get(e.targets[0]);
      if (!a || !b) continue;
      pts = [{ x: a.x + a.width / 2, y: a.y + a.height / 2 }, { x: b.x + b.width / 2, y: b.y + b.height / 2 }];
    }
    const edge = moddle.create("bpmndi:BPMNEdge", {
      id: `${e.id}_di`, bpmnElement: e._fe,
      waypoint: pts.map((p) => moddle.create("dc:Point", { x: Math.round(p.x), y: Math.round(p.y) })),
    });
    const ll = le?.labels?.[0];
    if (e._fe.name && ll) {
      edge.label = moddle.create("bpmndi:BPMNLabel", { bounds: bounds(ll.x, ll.y, ll.width ?? labelWidth(e._fe.name), ll.height ?? 14) });
    }
    planeElement.push(edge);
  }

  const plane = moddle.create("bpmndi:BPMNPlane", { id: "BPMNPlane_elk", bpmnElement: process, planeElement });
  const diagram = moddle.create("bpmndi:BPMNDiagram", { id: "BPMNDiagram_elk", plane });
  (defs as any).diagrams = [diagram];

  const { xml: out } = await moddle.toXML(defs, { format: true });
  return out ?? xml;
}
