// Quick-wins post-processing for bpmn-auto-layout output.
//
// bpmn-auto-layout forces every activity box to 100x80 (verified: it discards input
// dimensions) and places sequence-flow labels on its grid with no collision handling,
// so a diagram the user had sized nicely comes back cramped — long task names clip and
// gateway condition labels ("Sí"/"No") drift far from the gateway. This pass, run on the
// laid-out XML before it reaches the canvas, does two cheap, high-impact fixes:
//   1. restore each named activity box toward its ORIGINAL size (bounded to the layouter's
//      cell so it doesn't reintroduce overlaps), then ensure it still fits the wrapped
//      label — so existing diagrams keep their good box sizes and fresh ones don't clip;
//   2. pull each gateway-outgoing flow label back near the source gateway.
// It is a pure moddle round-trip (no DOM) so it runs under vitest and stays undoable —
// the caller loads the result as a single coarse-undo snapshot.
// @ts-expect-error no type declarations published
import { BpmnModdle } from "bpmn-moddle";

// Rough glyph metrics for bpmn-js' 12px label font. Approximate on purpose: the goal is
// "no clipped words", not pixel-perfect fit — and staying DOM-free keeps this testable.
const CHAR_W = 6.6;
const LINE_H = 15;
const PAD_X = 12;
const PAD_Y = 16;
const MIN_W = 100;
const MIN_H = 80;
const MAX_W = 140; // keep inside bpmn-auto-layout's 150px cell → no new horizontal overlap
const MAX_H = 130; // keep inside its 140px cell

// Activity shapes carry their label INSIDE the box (so it can clip); events/gateways
// render an external label that this pass repositions instead of resizing.
const SIZED_TYPES = new Set([
  "bpmn:Task", "bpmn:UserTask", "bpmn:ServiceTask", "bpmn:ManualTask", "bpmn:ScriptTask",
  "bpmn:BusinessRuleTask", "bpmn:SendTask", "bpmn:ReceiveTask", "bpmn:CallActivity", "bpmn:SubProcess",
]);
const GATEWAY_TYPES = new Set([
  "bpmn:ExclusiveGateway", "bpmn:ParallelGateway", "bpmn:InclusiveGateway",
  "bpmn:EventBasedGateway", "bpmn:ComplexGateway",
]);

/** Greedy word-wrap to a per-line character budget; a single over-long word stays whole. */
export function wrapLines(text: string, charsPerLine: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= charsPerLine) cur += " " + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/**
 * Box size that fits `name`, starting from (curW, curH) and never shrinking below it,
 * always clamped to [MIN, MAX]. `curW/curH` carry the ORIGINAL box size when restoring,
 * so a well-sized box is preserved and a default 100x80 one grows only as text needs.
 */
export function fitBox(name: string, curW: number, curH: number): { width: number; height: number } {
  let width = Math.min(MAX_W, Math.max(MIN_W, curW));
  const longestWord = Math.max(0, ...name.split(/\s+/).map((w) => w.length));
  const neededForWord = longestWord * CHAR_W + PAD_X;
  if (neededForWord > width) width = Math.min(MAX_W, neededForWord);
  const charsPerLine = Math.max(4, Math.floor((width - PAD_X) / CHAR_W));
  const lines = wrapLines(name, charsPerLine);
  const textHeight = lines.length * LINE_H + PAD_Y;
  const height = Math.min(MAX_H, Math.max(MIN_H, curH, textHeight));
  return { width, height };
}

/** Reposition a shape's bounds to a new size while keeping its center fixed. */
function recenter(bounds: { x: number; y: number; width: number; height: number }, w: number, h: number): void {
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  bounds.x = cx - w / 2;
  bounds.y = cy - h / 2;
  bounds.width = w;
  bounds.height = h;
}

/** Map every shape's element id → its {width,height} in the given diagram XML. */
async function sizesById(xml: string): Promise<Map<string, { width: number; height: number }>> {
  const out = new Map<string, { width: number; height: number }>();
  try {
    const { rootElement } = await new BpmnModdle().fromXML(xml);
    for (const diagram of (rootElement as any)?.diagrams ?? []) {
      for (const pe of diagram.plane?.planeElement ?? []) {
        if (pe.$type === "bpmndi:BPMNShape" && pe.bpmnElement?.id && pe.bounds) {
          out.set(pe.bpmnElement.id, { width: pe.bounds.width, height: pe.bounds.height });
        }
      }
    }
  } catch { /* best-effort — no original sizes to restore */ }
  return out;
}

export async function tidyLayout(laidXml: string, originalXml?: string): Promise<string> {
  const moddle = new BpmnModdle();
  let root: any;
  try {
    const res = await moddle.fromXML(laidXml);
    root = res.rootElement;
  } catch {
    return laidXml; // unparseable → leave it exactly as-is
  }
  if (!root || !Array.isArray(root.diagrams) || !root.diagrams.length) return laidXml;

  // Original box sizes (the layouter flattened them to 100x80); we restore toward these.
  const original = originalXml ? await sizesById(originalXml) : new Map();

  for (const diagram of root.diagrams) {
    const planeElements = diagram.plane?.planeElement ?? [];
    for (const pe of planeElements) {
      if (pe.$type === "bpmndi:BPMNShape") {
        const el = pe.bpmnElement;
        if (el && SIZED_TYPES.has(el.$type) && el.name && pe.bounds) {
          const orig = original.get(el.id);
          const startW = orig?.width ?? pe.bounds.width;
          const startH = orig?.height ?? pe.bounds.height;
          const { width, height } = fitBox(el.name, startW, startH);
          if (width !== pe.bounds.width || height !== pe.bounds.height) recenter(pe.bounds, width, height);
        }
      } else if (pe.$type === "bpmndi:BPMNEdge") {
        const flow = pe.bpmnElement;
        const source = flow?.sourceRef;
        const wp = pe.waypoint;
        if (source && GATEWAY_TYPES.has(source.$type) && flow.name && pe.label?.bounds && wp && wp.length >= 2) {
          // Sit the label on the first ~30% of the flow's first segment, just above the
          // line — close to the gateway so the branch condition reads at a glance.
          const a = wp[0], b = wp[1];
          const cx = a.x + (b.x - a.x) * 0.3;
          const cy = a.y + (b.y - a.y) * 0.3;
          pe.label.bounds.x = cx - pe.label.bounds.width / 2;
          pe.label.bounds.y = cy - pe.label.bounds.height - 4;
        }
      }
    }
  }

  const { xml: out } = await moddle.toXML(root, { format: true });
  return out ?? laidXml;
}
