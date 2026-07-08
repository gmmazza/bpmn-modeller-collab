// Read-only master-diagram viewer: mounts a non-editable bpmn-js viewer (mirrors
// compareView.ts's historical pane), draws a drill-down badge on every call-activity
// box (🗺 resolved → click opens the linked subprocess file; ⚠ unresolved/ambiguous),
// and can highlight the box whose calledElement matches the process currently open
// elsewhere (e.g. from the popover / stage navigation, wired by later tasks).
import { createCompareModeler, installViewSelectGuard, type ViewerLike } from "../compareView";
import { parseCallLinks } from "../processDocs/diagramInfo";
import { callLinksFromEls, type CallLink } from "./callActivityLinks";
import { classifyLinks, type LinkStatus } from "./linkStatus";
import type { ProcessRegistry } from "./processRegistry";

export function badgeLabel(state: LinkStatus["state"]): string {
  return state === "resolved" ? "🗺" : "⚠";
}

export interface MasterPaneDeps {
  registry: ProcessRegistry;
  openStage(file: string): Promise<void>; // called on drill-down click
  onError(e: unknown): void;
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

  let links: CallLink[] = [];
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
  }

  return {
    async load(masterXml: string) {
      await viewer.importXML(masterXml);
      const els = await parseCallLinks(masterXml);
      links = callLinksFromEls(els);
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
