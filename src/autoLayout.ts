// D · Auto-layout (D-lite) — one-click "Auto-organizar" for plain staged diagrams.
//
// Backed by `bpmn-auto-layout` (bpmn.io's official but low-maintenance layouter). It
// lays a SINGLE process out left-to-right by regenerating the diagram-interchange (DI)
// from the semantic model. That is exactly the shape produced by this app's staged
// (master → subprocess) workflow, which is why D-lite targets it instead of elkjs.
//
// Two things the caller must know:
//  1. It does NOT understand collaborations/pools. Feeding it a multi-pool diagram
//     silently drops every participant and all but the first process (verified against
//     v1.3.0, 2026-07-17) — so `layoutDiagram` refuses those up front via `hasPools`.
//  2. Regenerating the DI discards any colors set with the native bpmn-js color picker
//     (they live on the BPMNShape DI). The app's own layer colors are safe — they are
//     diagram-js markers in the `.layers.json` sidecar, reapplied by `loadIntoEditor`.
//     The caller runs this as a coarse-undo snapshot, so the whole re-layout is
//     revertible with Ctrl+Z.

/** Thrown when the diagram is out of scope for D-lite (currently: has pools). */
export class UnsupportedLayoutError extends Error {
  constructor(public readonly reason: "pools") {
    super(`auto-layout unsupported: ${reason}`);
    this.name = "UnsupportedLayoutError";
  }
}

/**
 * True when the XML declares at least one BPMN participant (i.e. a pool / collaboration).
 * Matches the element tag only — with any namespace prefix, or none — so a "Participant"
 * substring inside a task name or attribute value never trips it.
 */
export function hasPools(xml: string): boolean {
  return /<(?:[\w.-]+:)?participant[\s/>]/i.test(xml);
}

/**
 * Re-layout a plain (single-process, no-pool) BPMN diagram and return the new XML.
 * The `bpmn-auto-layout` dependency is imported lazily so it only enters the bundle
 * that a click actually needs — mirroring how the editor code-splits bpmn-js.
 *
 * @throws UnsupportedLayoutError  the diagram has pools (would be destroyed).
 * @throws unknown                 library/parse errors are rethrown for the caller to surface.
 */
export async function layoutDiagram(xml: string): Promise<string> {
  if (hasPools(xml)) throw new UnsupportedLayoutError("pools");
  const { layoutProcess } = await import("bpmn-auto-layout");
  return await layoutProcess(xml);
}
