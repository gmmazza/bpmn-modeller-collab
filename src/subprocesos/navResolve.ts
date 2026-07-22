// Pure navigation resolver for the stage "◀ viene de / ▶ va a" pills. Turns a pill target
// into an intent the host can act on, WITHOUT touching the modeler — so it is unit-testable
// against real master/registry data (bpmn-js does not boot under happy-dom).
//   - "open": the target is another stage → the host opens that subprocess file.
//   - "highlight": the target is a plain master node (start / task / gateway / end) → the
//     host focuses the master map and highlights it.
//   - "none": the exit has no destination at all.
import type { EntrySource } from "./entrySources";
import type { StageExit } from "./stageOverlays";
import type { ProcessEntry } from "./processRegistry";

export type NavIntent =
  | { kind: "open"; file: string; processId: string }
  | { kind: "highlight"; masterElementId: string }
  | { kind: "none" };

// Mirrors ProcessRegistry.resolve: a processId → its single owning file, or null when the
// processId is absent or ambiguous (referenced by more than one file).
type Resolve = (processId: string) => ProcessEntry | null;

// "◀ viene de": open the source stage if it resolves to a file; else highlight the source
// element in the master map (e.g. the master start, which has no subprocess of its own).
export function resolveEntryNav(source: EntrySource, resolve: Resolve): NavIntent {
  if (source.processId) {
    const hit = resolve(source.processId);
    if (hit) return { kind: "open", file: hit.file, processId: source.processId };
  }
  return { kind: "highlight", masterElementId: source.elementId };
}

// "▶ va a": the exit points at a master element. If that element is a Call Activity whose
// calledElement resolves to a stage file, open it; else highlight the element in the map.
export function resolveExitNav(
  exit: StageExit,
  masterNodeCalled: Map<string, string>,
  resolve: Resolve,
): NavIntent {
  if (!exit.targetMasterId) return { kind: "none" };
  const pid = masterNodeCalled.get(exit.targetMasterId);
  if (pid) {
    const hit = resolve(pid);
    if (hit) return { kind: "open", file: hit.file, processId: pid };
  }
  return { kind: "highlight", masterElementId: exit.targetMasterId };
}
