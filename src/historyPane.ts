// Per-pane history controller: owns the preview/compare state and flows for ONE editor
// pane (the stage editor or the master map). Extracted from main.ts's former singleton so
// the master and the subprocess can each resolve their history independently ("dual
// history"): two instances share nothing — state, DOM hosts, viewer, orientation and
// coarse-undo hooks are all injected per pane.
import type { RestorePoint, Revision, User } from "./types";
import { renderHistoryPanel, renderPreviewBar, renderCompareBar, toRestorePoint, showToast } from "./ui";
import { computeDiff } from "./bpmnDiff";
import { applyDiffMarkers, clearDiffMarkers } from "./diffMarkers";
import { syncViewport, type ViewerLike } from "./compareView";

interface EditorLike {
  load(xml: string): Promise<unknown>;
  getXml(): Promise<string>;
  setReadOnly(ro: boolean): void;
}

interface CanvasLike {
  addMarker(id: string, cls: string): void;
  removeMarker(id: string, cls: string): void;
  zoom(mode: string): void;
  viewbox(): { x: number; y: number; width: number; height: number };
  getRootElement(): unknown;
}

export interface HistoryPaneDeps {
  title: () => string; // section heading, e.g. "Maestro: mapa" / "Subproceso: p1"
  getFileId: () => string | null; // null → controller inert (no state-machine coupling)
  api: () => {
    listRevisions(id: string): Promise<Revision[]>;
    getRevisionXml(id: string, rid: string): Promise<string>;
    getXml(id: string): Promise<string>;
  };
  editor: () => EditorLike; // lazy: the pane's editor may be (re)created after mount
  modeler: () => { get(name: string): any }; // the pane's working modeler (canvas/copyPaste/…)
  els: { wrap: HTMLElement; splitHost: HTMLElement; canvas2: HTMLElement; bar: HTMLElement };
  createViewer: (container: HTMLElement) => Promise<ViewerLike>; // compare right-pane factory
  loadWorking: (xml: string) => Promise<void>; // stage: loadIntoEditor (colors); master: handle.load (badges)
  flushWorking: () => Promise<void>; // persist pending edits before swapping the canvas
  getWorkingFallback: () => Promise<string | null>; // draft ?? shared latest
  onWorkingReplaced: (xml: string) => void; // restore/copy landed in the draft (saveDraft + dirty)
  pushCoarseUndo: (xml: string) => void; // pane's coarse-undo stack (importXML wipes native)
  me: () => User;
  orientationKey: string; // per-pane localStorage key for compare orientation
  onChanged: () => void; // host re-render (toolbar state, body-class union, sections)
  onError: (e: unknown) => void;
  toast?: (msg: string) => void;
  diff?: {
    compute: typeof computeDiff;
    apply: typeof applyDiffMarkers;
    clear: typeof clearDiffMarkers;
  };
}

export function createHistoryController(deps: HistoryPaneDeps) {
  const toast = deps.toast ?? showToast;
  const diff = deps.diff ?? { compute: computeDiff, apply: applyDiffMarkers, clear: clearDiffMarkers };

  // ---- state (formerly main.ts's singleton block) ----
  let points: RestorePoint[] = [];
  let comparePoints: Array<{ id: string; label: string }> = [];
  let previewingRid: string | null = null;
  let prePreviewXml: string | null = null;
  let comparing = false;
  let compareSel: string[] = [];
  let compareLeft = "actual";
  let compareRight: string | null = null;
  let orientation: "h" | "v" = (localStorage.getItem(deps.orientationKey) as "h" | "v") || "h";
  let viewer: ViewerLike | null = null;
  let unsync: (() => void) | null = null;
  let markedLeft: string[] = [];
  let markedRight: string[] = [];
  let preCompareXml: string | null = null;
  let compareEdited = false;
  let sectionEl: HTMLElement | null = null; // last container renderSection() drew into

  const recencyOf = (id: string): number => (id === "actual" ? Infinity : Number(id) || 0);
  const labelOf = (id: string): string =>
    id === "actual" ? "Actual (editable)" : (comparePoints.find((p) => p.id === id)?.label ?? id);
  const canvasOf = (m: { get(name: string): any }): CanvasLike => m.get("canvas");

  // ---- history list ----
  async function loadHistory(): Promise<void> {
    const fid = deps.getFileId();
    if (!fid) { points = []; comparePoints = []; renderSectionNow(); return; }
    const revs = await deps.api().listRevisions(fid);
    points = revs
      .map((r) => toRestorePoint(r, deps.me()))
      .sort((a, b) => Date.parse(b.modifiedTime) - Date.parse(a.modifiedTime));
    comparePoints = points.map((p) => ({
      id: p.id,
      label: `${new Date(p.modifiedTime).toLocaleString()} — ${p.authorName}${p.isExternal ? " (externo)" : ""}`,
    }));
    renderSectionNow();
  }

  function renderSection(container: HTMLElement): void {
    sectionEl = container;
    if (!deps.getFileId()) {
      // Inert (no file behind this pane): render nothing — a hidden-but-present
      // "Actual" row would still match selectors and confuse checkbox wiring.
      container.innerHTML = "";
      return;
    }
    renderHistoryPanel(container, points, {
      title: deps.title(),
      compare: { selected: compareSel, onToggle: (id, checked) => void toggleSel(id, checked).catch(deps.onError), orientation },
    });
  }
  function renderSectionNow(): void {
    if (sectionEl) renderSection(sectionEl);
  }

  // ---- selection dispatcher: 2 → compare, 1 revision → preview, 0/actual → working ----
  async function toggleSel(id: string, checked: boolean): Promise<void> {
    if (checked) {
      if (!compareSel.includes(id)) compareSel.push(id);
      while (compareSel.length > 2) compareSel.shift();
    } else {
      compareSel = compareSel.filter((x) => x !== id);
    }
    renderSectionNow();
    await applySelection();
  }

  async function applySelection(): Promise<void> {
    const fid = deps.getFileId();
    if (!fid) return;

    if (compareSel.length === 2) {
      if (previewingRid !== null) await restoreWorking();
      const [a, b] = [...compareSel].sort((x, y) => recencyOf(y) - recencyOf(x));
      compareLeft = a;
      compareRight = b; // always a revision id ("actual" is newest → always left)
      if (!comparing) {
        await deps.flushWorking();
        preCompareXml = await deps.editor().getXml();
        compareEdited = false;
        comparing = true;
        deps.els.canvas2.hidden = false;
        deps.els.splitHost.classList.add("split");
        applyOrientation();
        deps.els.wrap.classList.add("pane-comparing");
        if (!viewer) {
          viewer = await deps.createViewer(deps.els.canvas2);
          viewer.get("eventBus").on("selection.changed", () => renderCompareBarNow());
        }
      }
      await renderCompare();
      renderCompareBarNow();
      deps.onChanged();
      return;
    }

    if (comparing) await exitCompare({ clearChecks: false });

    const singleRev = compareSel.length === 1 && compareSel[0] !== "actual" ? compareSel[0] : null;
    if (singleRev) {
      await enterPreview(fid, singleRev, labelOf(singleRev));
      return;
    }
    if (previewingRid !== null) {
      await restoreWorking();
      deps.onChanged();
      toast("Volviste a la versión actual");
    }
  }

  // ---- preview ----
  async function enterPreview(fid: string, rid: string, label: string): Promise<void> {
    if (previewingRid === null) {
      await deps.flushWorking(); // persist pending edits before the canvas shows the revision
      prePreviewXml = await deps.editor().getXml(); // snapshot the working version once
    }
    const xml = await deps.api().getRevisionXml(fid, rid);
    await deps.loadWorking(xml);
    deps.editor().setReadOnly(true);
    previewingRid = rid;
    deps.els.wrap.classList.add("pane-previewing");
    renderPreviewBar(deps.els.bar, label, {
      onExit: () => void exitPreview().catch(deps.onError),
      onRestore: () => void restoreToDraft(rid).catch(deps.onError),
    });
    deps.onChanged();
  }

  // Silently return the pane to the working version (draft/shared) without toasting.
  async function restoreWorking(): Promise<void> {
    if (previewingRid === null) return;
    const xml = prePreviewXml ?? (await deps.getWorkingFallback());
    clearPreviewUI();
    if (xml != null) {
      await deps.loadWorking(xml);
      deps.editor().setReadOnly(false);
    }
  }

  async function exitPreview(): Promise<void> {
    if (previewingRid === null) return;
    await restoreWorking();
    compareSel = [];
    renderSectionNow();
    deps.onChanged();
    toast("Volviste a la versión actual");
  }

  // "↩ Restaurar esta versión": bring the previewed revision into the pane's draft.
  async function restoreToDraft(rid: string): Promise<void> {
    const fid = deps.getFileId();
    if (!fid) return;
    const xml = await deps.api().getRevisionXml(fid, rid);
    // Snapshot the pre-history working version so Ctrl+Z can revert the restore even
    // though importXML wipes the native command stack.
    const preRestore = prePreviewXml ?? (await deps.getWorkingFallback());
    if (preRestore != null) deps.pushCoarseUndo(preRestore);
    clearPreviewUI(); // leaving preview WITHOUT restoring — we replace the working version
    compareSel = [];
    await deps.loadWorking(xml);
    deps.editor().setReadOnly(false);
    deps.onWorkingReplaced(xml);
    renderSectionNow();
    deps.onChanged();
    toast("Restaurado en tu borrador — Ctrl+Z para deshacer, o Publicá para compartir");
  }

  function clearPreviewUI(): void {
    previewingRid = null;
    prePreviewXml = null;
    deps.els.wrap.classList.remove("pane-previewing");
    if (!comparing) deps.els.bar.innerHTML = "";
  }

  // ---- compare ----
  function applyOrientation(): void {
    deps.els.splitHost.classList.toggle("vertical", orientation === "v");
  }
  function toggleOrientation(): void {
    orientation = orientation === "h" ? "v" : "h";
    try { localStorage.setItem(deps.orientationKey, orientation); } catch { /* ignore */ }
    applyOrientation();
    renderCompareBarNow();
    renderSectionNow(); // side badges follow orientation (izq/der ↔ arriba/abajo)
  }

  async function renderCompare(): Promise<void> {
    const fid = deps.getFileId();
    if (!comparing || !fid || !compareRight || !viewer) return;
    const rightXml = await deps.api().getRevisionXml(fid, compareRight);
    const leftXml = compareLeft === "actual"
      ? (preCompareXml ?? (await deps.api().getXml(fid)))
      : await deps.api().getRevisionXml(fid, compareLeft);
    await deps.editor().load(leftXml);
    deps.editor().setReadOnly(true); // compare is pure visualization — left pane read-only too
    try { canvasOf(deps.modeler()).zoom("fit-viewport"); } catch { /* ok */ }
    await viewer.importXML(rightXml);
    try { canvasOf(viewer as any).zoom("fit-viewport"); } catch { /* ok */ }
    await applyCompareDiff(rightXml, leftXml);
    if (unsync) unsync();
    unsync = syncViewport(deps.modeler(), viewer as unknown as { get(n: string): any });
  }

  async function applyCompareDiff(oldXml: string, newXml: string): Promise<void> {
    if (!viewer) return;
    const changes = await diff.compute(oldXml, newXml); // old = right (older), new = left (newer)
    const leftCanvas = canvasOf(deps.modeler());
    const rightCanvas = canvasOf(viewer as any);
    diff.clear(leftCanvas, markedLeft);
    diff.clear(rightCanvas, markedRight);
    markedLeft = diff.apply(leftCanvas, changes, "new");
    markedRight = diff.apply(rightCanvas, changes, "old");
  }

  function renderCompareBarNow(): void {
    if (!comparing || !compareRight) return;
    let copyCount = 0;
    try { copyCount = viewer ? viewer.get("selection").get().length : 0; } catch { copyCount = 0; }
    renderCompareBar(deps.els.bar, {
      leftLabel: labelOf(compareLeft),
      rightLabel: labelOf(compareRight),
      orientation,
      copyCount,
      canCopy: compareLeft === "actual", // paste only into the editable "Actual" pane
      onOrientation: toggleOrientation,
      onCopy: () => void copySelectionToWorking().catch(deps.onError),
      onExit: () => void exitCompare().catch(deps.onError),
    });
  }

  // Copy elements selected in the historical (right) pane into the pane's working
  // version via bpmn-js copyPaste. First paste pushes a coarse snapshot (undo after exit).
  async function copySelectionToWorking(): Promise<void> {
    const fid = deps.getFileId();
    if (!fid || !viewer || compareLeft !== "actual") return;
    const selected = viewer.get("selection").get();
    if (!selected.length) return;
    if (!compareEdited) {
      deps.pushCoarseUndo(preCompareXml ?? (await deps.editor().getXml()));
    }
    const tree = viewer.get("copyPaste").copy(selected);
    const m = deps.modeler();
    const targetCanvas = canvasOf(m);
    m.get("clipboard").set(tree);
    const vb = targetCanvas.viewbox();
    const pasted = m.get("copyPaste").paste({
      element: targetCanvas.getRootElement(),
      point: { x: vb.x + vb.width / 2, y: vb.y + vb.height / 2 },
    });
    try { if (Array.isArray(pasted) && pasted.length) m.get("selection").select(pasted); } catch { /* ok */ }
    compareEdited = true;
    preCompareXml = await deps.editor().getXml(); // exit keeps the paste
    deps.onWorkingReplaced(preCompareXml);
    renderCompareBarNow();
    toast(`${selected.length} elemento(s) copiados a tu versión actual — Publicá para compartir`);
  }

  function teardownCompare(): void {
    comparing = false;
    if (unsync) { unsync(); unsync = null; }
    try { diff.clear(canvasOf(deps.modeler()), markedLeft); } catch { /* ok */ }
    markedLeft = [];
    markedRight = [];
    if (viewer) { try { viewer.destroy(); } catch { /* ok */ } viewer = null; }
    deps.els.canvas2.hidden = true;
    deps.els.canvas2.innerHTML = "";
    deps.els.splitHost.classList.remove("split");
    deps.els.wrap.classList.remove("pane-comparing");
    deps.els.bar.innerHTML = "";
  }

  async function exitCompare(opts: { clearChecks?: boolean } = {}): Promise<void> {
    if (!comparing) return;
    // preCompareXml carries any elements copied from the historical pane, so they survive.
    const restore = preCompareXml ?? (await deps.getWorkingFallback());
    teardownCompare();
    preCompareXml = null;
    compareEdited = false;
    compareRight = null;
    if (opts.clearChecks !== false) compareSel = []; // "Salir" clears checks; unchecking keeps them
    if (restore != null) {
      await deps.loadWorking(restore);
      deps.editor().setReadOnly(false);
    }
    renderSectionNow();
    deps.onChanged();
    toast("Saliste de la comparación");
  }

  // Drop compare state without restoring (file switch / pane teardown).
  function clearCompareUI(): void {
    if (!comparing) return;
    teardownCompare();
    preCompareXml = null;
    compareEdited = false;
    compareRight = null;
    compareSel = [];
  }

  function destroy(): void {
    clearCompareUI();
    clearPreviewUI();
    points = [];
    comparePoints = [];
    sectionEl = null;
  }

  return {
    loadHistory,
    renderSection,
    toggleSel,
    applySelection,
    enterPreviewByRid: (rid: string) => {
      const fid = deps.getFileId();
      return fid ? enterPreview(fid, rid, labelOf(rid)) : Promise.resolve();
    },
    exitPreview,
    exitCompare,
    restoreToDraft,
    copySelectionToWorking,
    clearPreviewUI,
    clearCompareUI,
    isPreviewing: () => previewingRid !== null,
    isComparing: () => comparing,
    isBusy: () => previewingRid !== null || comparing,
    getSelection: () => [...compareSel],
    hasPoints: () => points.length > 0,
    destroy,
  };
}

export type HistoryController = ReturnType<typeof createHistoryController>;
