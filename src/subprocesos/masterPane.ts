// Editable master-diagram pane: mounts a FULL bpmn-js editor (same createBpmnModeler as the
// normal editor) so the master map is directly editable — safe under draft→publish (edits
// live in a local draft until Publicar). Draws a drill-down badge on every call-activity box
// (🗺 resolved / ⚠ unresolved), highlights the box whose calledElement matches the open stage,
// and exposes a double-click drill hook + dirty/getXml for the host's draft/publish wiring.
import { createBpmnModeler, createEditor, type Editor } from "../editor";
import { parseCallLinks } from "../processDocs/diagramInfo";
import { callLinksFromEls, type CallLink } from "./callActivityLinks";
import { parseMasterBoundaries, type MasterBoundary } from "./boundaryLinks";
import { classifyLinks } from "./linkStatus";
import type { LinkStatus } from "./linkStatus";
import type { ProcessRegistry } from "./processRegistry";

export function badgeLabel(state: LinkStatus["state"]): string {
  return state === "resolved" ? "🗺" : "⚠";
}
export function outcomeBadgeText(destinationName: string): string {
  return destinationName.trim() ? `→ ${destinationName.trim()}` : "→ (sin destino)";
}

export interface MasterPaneDeps {
  registry: ProcessRegistry;
  openStage(file: string): Promise<void>;
  onError(e: unknown): void;
  onElementClick?(info: { elementId: string; name: string; calledElement?: string; anchor: DOMRect }): void;
  onDrill?(info: { elementId: string; calledElement: string }): void; // double-click on a linked call activity
  onDirty?(dirty: boolean): void; // master editor became dirty/clean
  onFocus?(): void; // pointerdown inside the master pane (focus tracking)
  resolveDestinationName?(elementId: string): string;
}

// Only these box-ish flow-element types make sense as a "link this to a subprocess"
// target — gateways/events/pools clicked on the master pane are ignored.
function isLinkableBoxType(type: string): boolean {
  return type.includes("Task") || type.endsWith("CallActivity") || type.endsWith("SubProcess");
}

export interface MasterPaneHandle {
  load(masterXml: string): Promise<void>; // (re)load through the editor + refresh badges
  getXml(): Promise<string>;
  isDirty(): boolean;
  markSaved(): void;
  setCurrentStage(processId: string | null): void; // highlight the box whose calledElement === processId
  refreshBadges(): void; // re-classify against the current registry
  destroy(): void;
}

const CURRENT_MARKER = "subproc-current";

export async function mountMasterPane(container: HTMLElement, deps: MasterPaneDeps): Promise<MasterPaneHandle> {
  const modeler = await createBpmnModeler(container);
  const editor: Editor = createEditor(modeler);
  editor.onDirtyChange((d) => deps.onDirty?.(d));

  const eventBus = modeler.get("eventBus");

  // Focus tracking: any pointerdown inside the master pane means "the master is the active
  // pane" (drives docsFileId + which pane Publicar/Ctrl+S targets in main.ts).
  container.addEventListener("pointerdown", () => deps.onFocus?.(), true);

  // Single-click on a linkable box → link popover (Vincular / Crear / Desvincular).
  eventBus.on("element.click", (e: any) => {
    const el = e?.element;
    if (!el || el.type === "bpmn:Process" || el.type === "label" || el === canvas().getRootElement()) return;
    if (!isLinkableBoxType(el.type ?? "")) return;
    deps.onElementClick?.({
      elementId: el.id,
      name: el.businessObject?.name ?? "",
      calledElement: el.businessObject?.calledElement,
      anchor: e.gfx?.getBoundingClientRect?.() ?? new DOMRect(),
    });
  });

  // Double-click drill: intercept dblclick ONLY for a call activity that links out to a
  // subprocess (has calledElement). Returning false vetoes bpmn-js' native direct-edit
  // (label rename) for that element so the double-click drills instead. Other elements —
  // and call activities WITHOUT a calledElement — fall through to native label editing.
  // (Rename a linked call activity via F2 / the Propiedades tab; see Task 5.)
  eventBus.on("element.dblclick", 1600, (e: any) => {
    const el = e?.element;
    const called = el?.businessObject?.calledElement;
    if (el && (el.type ?? "").endsWith("CallActivity") && called) {
      deps.onDrill?.({ elementId: el.id, calledElement: called });
      return false;
    }
    return undefined;
  });

  let links: CallLink[] = [];
  let boundaries: MasterBoundary[] = [];
  let overlayIds: string[] = [];
  let currentMarker: string | null = null;

  function overlays(): any { return modeler.get("overlays"); }
  function canvas(): any { return modeler.get("canvas"); }

  function clearOverlays(): void {
    const ov = overlays();
    for (const id of overlayIds) { try { ov.remove(id); } catch { /* already gone */ } }
    overlayIds = [];
  }

  function refreshBadges(): void {
    clearOverlays();
    const ov = overlays();
    const statuses = classifyLinks(links, deps.registry);
    for (const s of statuses) {
      const html = document.createElement("div");
      html.className = `subproc-badge subproc-${s.state}`;
      html.textContent = badgeLabel(s.state);
      if (s.state === "resolved") {
        html.classList.add("subproc-badge-clickable");
        html.title = "Doble clic en la etapa para abrirla";
        html.addEventListener("click", (e) => {
          e.stopPropagation();
          void deps.openStage(s.file).catch(deps.onError);
        });
      } else {
        html.title = s.state === "unresolved" ? "Subproceso sin resolver" : "Vínculo ambiguo";
      }
      // The element may not be overlay-able yet (diagram still rendering) or gone
      // (removed since the last parse) — skip rather than let one bad overlay abort
      // the whole draw, matching the pattern in ideaBadges.ts / ideasOverlays.ts.
      try { overlayIds.push(ov.add(s.elementId, { position: { top: -8, right: 8 }, html })); } catch { /* skip */ }
    }
    for (const b of boundaries) {
      const destName = deps.resolveDestinationName?.(b.outgoingTargetId ?? "") ?? "";
      const html = document.createElement("div");
      html.className = "subproc-outcome-badge";
      html.textContent = outcomeBadgeText(destName);
      // Drill from the outcome badge into the subprocess whose Call Activity this
      // boundary is attached to (so the reader lands on the process that raises it).
      const link = links.find((l) => l.elementId === b.callActivityId);
      const file = link ? deps.registry.resolve(link.calledElement)?.file : undefined;
      if (file) {
        html.classList.add("subproc-badge-clickable");
        html.title = "Ir al subproceso de este resultado";
        html.addEventListener("click", (e) => { e.stopPropagation(); void deps.openStage(file).catch(deps.onError); });
      }
      try { overlayIds.push(overlays().add(b.boundaryId, { position: { bottom: -6, left: 0 }, html })); } catch { /* skip */ }
    }
  }

  return {
    async load(masterXml: string) {
      await editor.load(masterXml); // editor.load wraps importXML + resets dirty
      const els = await parseCallLinks(masterXml);
      links = callLinksFromEls(els);
      boundaries = await parseMasterBoundaries(masterXml);
      refreshBadges();
    },
    getXml: () => editor.getXml(),
    isDirty: () => editor.isDirty(),
    markSaved: () => editor.markSaved(),
    setCurrentStage(processId: string | null) {
      const c = canvas();
      if (currentMarker) { try { c.removeMarker(currentMarker, CURRENT_MARKER); } catch { /* gone */ } currentMarker = null; }
      if (!processId) return;
      const match = links.find((l) => l.calledElement === processId);
      if (match) { try { c.addMarker(match.elementId, CURRENT_MARKER); currentMarker = match.elementId; } catch { /* gone */ } }
    },
    refreshBadges,
    destroy() {
      try { (modeler as any).destroy?.(); } catch { /* already gone */ }
    },
  };
}
