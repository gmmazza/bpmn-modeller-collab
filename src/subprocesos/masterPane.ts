// Read-only master-diagram viewer: mounts a non-editable bpmn-js viewer (mirrors
// compareView.ts's historical pane), draws a drill-down badge on every call-activity
// box (🗺 resolved → click opens the linked subprocess file; ⚠ unresolved/ambiguous),
// and can highlight the box whose calledElement matches the process currently open
// elsewhere (e.g. from the popover / stage navigation, wired by later tasks).
import { createCompareModeler, installViewSelectGuard, type ViewerLike } from "../compareView";
import { parseCallLinks } from "../processDocs/diagramInfo";
import { callLinksFromEls, type CallLink } from "./callActivityLinks";
import { parseMasterBoundaries, type MasterBoundary } from "./boundaryLinks";
import { classifyLinks, type LinkStatus } from "./linkStatus";
import type { ProcessRegistry } from "./processRegistry";

export function badgeLabel(state: LinkStatus["state"]): string {
  return state === "resolved" ? "🗺" : "⚠";
}

export function outcomeBadgeText(destinationName: string): string {
  return destinationName.trim() ? `→ ${destinationName.trim()}` : "→ (sin destino)";
}

export interface MasterPaneDeps {
  registry: ProcessRegistry;
  openStage(file: string): Promise<void>; // called on drill-down click
  onError(e: unknown): void;
  // Fired when a linkable box (Task/CallActivity/SubProcess — not gateways, events,
  // pools, the root or a label) is clicked in the master pane. Lets main.ts open the
  // link popover off the LIVE clicked element's businessObject, without reaching into
  // this module's DOM (data-element-id) or re-parsing the master XML per click.
  onElementClick?(info: { elementId: string; name: string; calledElement?: string; anchor: DOMRect }): void;
  // Plain-language name for a boundary's outgoing target node id (a master element).
  resolveDestinationName?(elementId: string): string;
}

// Only these box-ish flow-element types make sense as a "link this to a subprocess"
// target — gateways/events/pools clicked on the master pane are ignored.
function isLinkableBoxType(type: string): boolean {
  return type.includes("Task") || type.endsWith("CallActivity") || type.endsWith("SubProcess");
}

export interface MasterPaneHandle {
  load(masterXml: string): Promise<void>; // (re)load the master diagram + refresh badges
  setCurrentStage(processId: string | null): void; // highlight the box whose calledElement === processId
  refreshBadges(): void; // re-classify against the current registry
  destroy(): void;
}

const CURRENT_MARKER = "subproc-current";

export async function mountMasterPane(container: HTMLElement, deps: MasterPaneDeps): Promise<MasterPaneHandle> {
  const viewer: ViewerLike = await createCompareModeler(container);
  installViewSelectGuard(viewer as unknown as { get(name: string): any });

  // Selection hook for the link popover: the badge overlays (added below) already
  // stopPropagation() on click, and overlays live outside the SVG canvas diagram-js
  // listens on for hit-testing anyway — so they never reach "element.click".
  (viewer as any).get("eventBus").on("element.click", (e: any) => {
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

  let links: CallLink[] = [];
  let boundaries: MasterBoundary[] = [];
  let overlayIds: string[] = [];
  let currentMarker: string | null = null;

  function overlays(): any {
    return viewer.get("overlays");
  }
  function canvas(): any {
    return viewer.get("canvas");
  }

  function clearOverlays(): void {
    const ov = overlays();
    for (const id of overlayIds) {
      try {
        ov.remove(id);
      } catch {
        /* already gone */
      }
    }
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
        html.title = "Ir al subproceso";
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
      try {
        overlayIds.push(ov.add(s.elementId, { position: { top: -8, right: 8 }, html }));
      } catch {
        /* skip */
      }
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
        html.addEventListener("click", (e) => {
          e.stopPropagation();
          void deps.openStage(file).catch(deps.onError);
        });
      }
      try {
        overlayIds.push(overlays().add(b.boundaryId, { position: { bottom: -6, left: 0 }, html }));
      } catch {
        /* boundary not overlay-able yet / gone — skip, matches the link badge loop */
      }
    }
  }

  return {
    async load(masterXml: string) {
      await viewer.importXML(masterXml);
      const els = await parseCallLinks(masterXml);
      links = callLinksFromEls(els);
      boundaries = await parseMasterBoundaries(masterXml);
      refreshBadges();
    },
    setCurrentStage(processId: string | null) {
      const c = canvas();
      if (currentMarker) {
        try {
          c.removeMarker(currentMarker, CURRENT_MARKER);
        } catch {
          /* element gone */
        }
        currentMarker = null;
      }
      if (!processId) return;
      const match = links.find((l) => l.calledElement === processId);
      if (match) {
        try {
          c.addMarker(match.elementId, CURRENT_MARKER);
          currentMarker = match.elementId;
        } catch {
          /* element gone */
        }
      }
    },
    refreshBadges,
    destroy() {
      try {
        viewer.destroy();
      } catch {
        /* already gone */
      }
    },
  };
}
