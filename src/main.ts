// bpmn-js styles bundled from the npm package (no CDN, version-locked).
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";
import "./diff.css";
import "bpmn-js-color-picker/colors/color-picker.css";
import "bpmn-js-token-simulation/assets/css/bpmn-js-token-simulation.css";
import "diagram-js-minimap/assets/diagram-js-minimap.css";
import "@bpmn-io/properties-panel/dist/assets/properties-panel.css";
import "bpmn-js-bpmnlint/dist/assets/css/bpmn-js-bpmnlint.css";
import "./viz.css";
import "./layers.css";
import "./app.css";

import { applyTheme, getTheme, toggleTheme } from "./theme";
import { icon } from "./icons";
import { layoutDiagram, UnsupportedLayoutError } from "./autoLayout";
import { layoutDiagramElk, layoutSubgraphElk } from "./layoutElk";
import { showHelp } from "./help";
import { createInspector, type Inspector } from "./inspector";
import { mountResizer } from "./ui/resizer";

import { evaluateUpdate } from "./appUpdate";
import { createFsClient, type FsClient } from "./fsClient";
import { createDocsClient, type DocsClient } from "./processDocs/docsClient";
import { createIdeasClient } from "./processDocs/ideasClient";
import { createNotePanelController } from "./processDocs/notePanelController";
import { createIdeaMode } from "./processDocs/ideaMode";
import { createIdeasControllerV2 } from "./processDocs/ideasControllerV2";
import { aiAuthorName } from "./processDocs/aiIdentity";
import { listDocumentableElements, toDiagramElement } from "./processDocs/bpmnDocsAdapter";
import { ensureAgentsFile, ensureLocalOverlay } from "./processDocs/agentsFile";
import { ensureBpmnDesignSkill } from "./processDocs/bpmnDesignSkill";
import { buildFolderIndex, baseNameOf as baseNameOfFile, type IndexSource } from "./processDocs/folderIndex";
import { resolveCalledProcess, findEventCounterpart, type DiagramInfo } from "./processDocs/resolveTargets";
import { extractInterProcessRefs, type RawEl } from "./processDocs/interProcessRefs";
import { createLayersClient } from "./layers/layersClient";
import { createLayerView, type LayerView } from "./layers/layerView";
import { renderLayersPanel } from "./layers/layersPanel";
import { renderLayersModal, type LayersModalHandlers } from "./layers/layersModal";
import { createTemplatesClient, type TemplatesClient } from "./layers/layerTemplates";
import { createFuentesClient } from "./fuentes/fuentesClient";
import { renderFuentesPanel } from "./fuentes/fuentesPanel";
import { hasOpenPath, openSourceExternal } from "./fuentesApi";
import { createDatosClient, collectDatosTools } from "./datos/datosClient";
import { renderDatosPanel } from "./datos/datosPanel";
import { createDatosOverlays } from "./datos/datosBadges";
import { openExternalUrl } from "./datos/externalUrl";
import { anchorFormulario, anchorAlmacenamiento } from "./datos/datosAnchor";
import type { DatosCategory, DatosEntry } from "./datos/datosModel";
import {
  addColorDimension, addAnnotationDimension, renameDimension, deleteDimension,
  addCategory, updateCategory, deleteCategory, mergeTemplate, reorderCategory, type LayerFile,
} from "./layers/layerModel";
import { loadSavedDir, pickDir } from "./folder";
import { createEditor, createBpmnModeler, type ModelerLike } from "./editor";
import { getName, setName } from "./identity";
import { getVizSettings, setVizSettings, type VizSettings } from "./vizSettings";
import { exportSvg, exportPng } from "./exporters";
import { graphFromModeler } from "./processDocs/flowOrder";
import { buildManual, exportManualHtml } from "./processDocs/manualController";
import { createHeatmapController } from "./heatmap";
import { reduce, initialState, type AppState } from "./state";
import { readLock, lockState, lockProps, clearProps, isStale, isExpired } from "./lockManager";
import { saveDraft, loadDraft, hasDraft, clearDraft } from "./draftStore";
import { getAutosave, setAutosave } from "./draftPrefs";
import { diffTree } from "./watcher";
import { computeDiff } from "./bpmnDiff";
import { createDiffView, type DiffView } from "./diffView";
import { isSyncConflict } from "./syncConflict";
import { getPresets, getLastPresetId, setLastPresetId } from "./terminalPresets";
import { openExternalTerminal, hasTermApi } from "./termApi";
import { showConfigModal, type ConfigSection } from "./configModal";
import { buildAiMenu } from "./aiMenu";
import type { User, TreeEntry, LockInfo, LockState } from "./types";
import { renderFileTree } from "./fileTree";
import { openContextMenu } from "./contextMenu";
import { pickFolder } from "./folderPicker";
import {
  renderConflictBar,
  renderSyncWarning,
  showToast,
  promptText,
  confirmModal,
  pickReservationDuration,
} from "./ui";
import { createCompareModeler, installViewSelectGuard, enableRubberBandSelect } from "./compareView";
import { createHistoryController, type HistoryController } from "./historyPane";
// A.2 master mode (subprocesos): process registry + read-only master map pane.
import { parseDiagramInfo, parseCallLinks } from "./processDocs/diagramInfo";
import { callLinksFromEls, linkBox, unlinkBox, newSubprocessSkeleton } from "./subprocesos/callActivityLinks";
import { createProcessRegistry } from "./subprocesos/processRegistry";
import { mountMasterPane, type MasterPaneHandle } from "./subprocesos/masterPane";
import { renderLinkPopover } from "./subprocesos/linkPopover";
import { buildStageOverlayModel, mountStageOverlays } from "./subprocesos/stageOverlays";
import { resolveEntryNav, resolveExitNav, type NavIntent } from "./subprocesos/navResolve";
import { findReferencingMaster } from "./subprocesos/findReferencingMaster";
import { markEndAsEscalation, revertEscalationToNormal, addEscalationBoundary, removeEscalationBoundary } from "./subprocesos/outcomeAuthoring";
import { renderOutcomePopover } from "./subprocesos/outcomePopover";
import { typeBadgeFor } from "./subprocesos/typeBadges";
import { buildMasterSubs } from "./subprocesos/masterSubsIndex";

const EMPTY_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false" />
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1" />
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

async function bootstrap() {
  applyTheme(getTheme());

  const root = document.getElementById("app")!;

  let api: FsClient;
  let rootHandle: FileSystemDirectoryHandle | null = null; // current working folder handle (for its display name)
  let state: AppState = initialState;
  let me: User = { name: "", email: "" };
  let openHeadRevisionId: string | null = null;
  // Master mode has its own publish baseline, decoupled from openHeadRevisionId: drilling
  // into a stage (openFile) overwrites openHeadRevisionId with the stage's revision, so
  // publishMaster must not compare against it — otherwise "Cerrar subproceso" + Publicar
  // on the master would spuriously conflict against the stage's revision id.
  let masterHeadRevisionId: string | null = null;
  let forceOverwrite = false;
  let pollTimer: number | null = null;
  let openLock: LockInfo = {}; // reservation info for the currently-open file (display + expiry)
  let folderId = "default"; // stable id of the current shared folder; namespaces local drafts
  // History preview/compare lives in a per-pane controller (src/historyPane.ts) — the
  // stage editor's instance; a master-pane instance joins it in the dual-history phases.
  let stageHistory: HistoryController | null = null;
  let editor: ReturnType<typeof createEditor>;
  let diffView: DiffView;
  let modeler: ModelerLike;
  let heatmap: { start(): void; stop(): void } | null = null;
  let applyingViz = false;
  let layersClient: ReturnType<typeof createLayersClient>;
  let docsClient: DocsClient;
  let ideasClientV2: ReturnType<typeof createIdeasClient>;
  let docsController: ReturnType<typeof createNotePanelController> | null = null;
  let ideasCtl: ReturnType<typeof createIdeasControllerV2> | null = null;
  let ideaMode: ReturnType<typeof createIdeaMode>;
  let docsFileId = "";
  const docsSelectionCbs: Array<() => void> = [];
  let layerView: LayerView | null = null;
  let layerFile: LayerFile | null = null;
  let activeColorId: string | null = null;
  let annotationsOn: string[] = [];
  let selectedId: string | null = null;
  let templatesClient: TemplatesClient | null = null;
  let layersModalEl: HTMLElement | null = null;
  let fuentesOpenConfirmed = false; // "Abrir" confirm shown once per session, not per file
  let datosOverlays: ReturnType<typeof createDatosOverlays>;
  let inspector: Inspector;
  let expanded = new Set<string>();
  let treeVersions = new Map<string, string>();
  let folderIndex: DiagramInfo[] | null = null;

  // ---- A.2 master mode (subprocesos) ----
  // Registry of processId → file, kept in sync with the shared file tree. `api` is
  // reassigned per-folder in useFolder(); the closures below read it lazily.
  const registry = createProcessRegistry({
    readXml: (f) => api.readPath(f),
    parseProcessId: async (xml) => (await parseDiagramInfo(xml)).processId,
  });
  let masterHandle: MasterPaneHandle | null = null; // editable master modeler pane, when in master mode
  let currentMasterFile: string | null = null; // the master .bpmn currently mapped (null = not in master mode)
  let masterNodeNames = new Map<string, string>(); // elementId -> name, for outcome badges
  let masterNodeTypes = new Map<string, string>(); // elementId -> $type, to filter valid outcome destinations
  let stageOverlaysHandle: { clear(): void } | null = null; // "viene de / va a" pills on the open stage
  // Show/hide state for the navigation pills (drill 🗺, → destino, ◀ viene de, ▶ va a).
  // Persisted; pills are hidden via a body class so both panes react at once and the choice
  // survives the per-import overlay wipe + reloads. Default ON.
  let navPillsVisible = localStorage.getItem("navPillsVisible") !== "0";
  let linkPopoverEl: HTMLElement | null = null; // currently open link popover (Vincular/Crear/Ir/Desvincular), if any
  let masterPaneFocused = false; // true → the master pane is the active editor for Publicar/Ctrl+S
  let masterDraftTimer: number | null = null; // debounce for the master pane's local-draft autosave
  let masterDraftPending = false; // master edits not yet written to the local draft (mirrors draftPending)

  // File-tree 🗺 "maestro" badges (Task 7): which .bpmn paths are masters, mirroring the
  // registry's re-parse-only-what-changed pattern so a large folder doesn't re-read every
  // file's XML on each refresh. Best-effort — never blocks rendering the tree.
  const mastersCache = new Set<string>();
  const masterFileVersions = new Map<string, string>(); // path -> version already checked
  // A.6: master -> same-folder subprocess files, rebuilt alongside mastersCache (only
  // re-parsing version-changed masters). Feeds nestSubprocesses in renderTree.
  const masterSubs = new Map<string, string[]>();               // masterPath -> sub file paths
  const masterLinksCache = new Map<string, { version: string; called: string[] }>(); // per-master calledElements
  const collapsedMasters = new Set<string>();                    // master paths whose sub-group is collapsed
  async function refreshMastersCache(files: TreeEntry[]): Promise<void> {
    // Mutates the shared `mastersCache` Set per-key (mirrors processRegistry.ts's
    // `sync`) instead of snapshot-then-swap: refreshFileList() has many call sites
    // (watcher, folder-toggle, etc.), so two refreshes can overlap. A copy-swap would
    // let whichever run finishes last clobber the other's addition/removal — and since
    // masterFileVersions is updated per file as "checked", the clobbered entry would
    // stay wrong until that file's version changes again.
    const bpmn = files.filter((f) => f.kind === "file" && f.path.toLowerCase().endsWith(".bpmn"));
    const seen = new Set(bpmn.map((f) => f.path));
    for (const path of [...masterFileVersions.keys()]) {
      if (!seen.has(path)) {
        masterFileVersions.delete(path);
        mastersCache.delete(path);
        masterLinksCache.delete(path);
      }
    }
    for (const f of bpmn) {
      const version = f.version ?? "";
      if (masterFileVersions.get(f.path) === version) continue; // unchanged, keep cached verdict
      masterFileVersions.set(f.path, version);
      const xml = await api.readPath(f.path).catch(() => null);
      if (xml && (await xmlIsMaster(xml))) {
        mastersCache.add(f.path);
        // Cache this master's calledElements for the subprocess index (best-effort).
        try {
          const called = callLinksFromEls(await parseCallLinks(xml)).map((l) => l.calledElement);
          masterLinksCache.set(f.path, { version, called });
        } catch { masterLinksCache.set(f.path, { version, called: [] }); }
      } else {
        mastersCache.delete(f.path);
        masterLinksCache.delete(f.path);
      }
    }
    // getFolderIndex() (main.ts:544) is async + memoized (invalidated to null in
    // refreshFileList); resolve it once, then rebuild the index synchronously.
    const idx = await getFolderIndex().catch(() => [] as DiagramInfo[]);
    rebuildMasterSubs(idx);
  }

  function rebuildMasterSubs(idx: DiagramInfo[]): void {
    // resolve a calledElement to a file: registry first (processId), then folderIndex
    // baseName fallback (parity with the drill-down's resolveCalledProcess).
    const resolve = (called: string): string | null =>
      registry.resolve(called)?.file ?? resolveCalledProcess(called, idx);
    const next = buildMasterSubs(
      [...mastersCache],
      (m) => masterLinksCache.get(m)?.called ?? [],
      resolve,
    );
    masterSubs.clear();
    for (const [k, v] of next) masterSubs.set(k, v);
  }

  function closeLinkPopover(): void {
    if (linkPopoverEl) { linkPopoverEl.remove(); linkPopoverEl = null; }
  }

  // The master pane (subprocesos/masterPane.ts) owns the click-to-popover wiring via
  // its onElementClick hook (backed by the underlying viewer's real eventBus) — it
  // already filters to linkable box types and hands us the live element's data, so we
  // never touch its DOM structure or re-parse the master XML per click.
  function onMasterElementClick(info: { elementId: string; name: string; calledElement?: string; anchor: DOMRect }): void {
    if (!currentMasterFile) return;
    const masterFile = currentMasterFile;
    closeLinkPopover();
    linkPopoverEl = renderLinkPopover(info.anchor, {
      element: { id: info.elementId, name: info.name || info.elementId, calledElement: info.calledElement },
      processes: registry.all(),
      onLinkExisting: (processId) => linkMasterBox(masterFile, info.elementId, processId),
      onCreateNew: () => createAndLinkSubprocess(masterFile, { id: info.elementId, name: info.name, type: "" }),
      onUnlink: () => unlinkMasterBox(masterFile, info.elementId),
    });
  }

  // Apply a calledElement change to a box on the master via a transient round-trip:
  // open the master in the normal editor (asPlainEditor — this exits master mode),
  // mutate with the modeler-touching helper, publish directly (this is a programmatic
  // action from the popover, not the toolbar Publicar button, so it skips the confirm
  // dialog), then re-enter master mode so the badges/registry reflect the new link.
  // (The master pane is itself editable now (A.5 Task 4); inlining these popover
  // link/unlink mutations into it is a deliberate follow-up, out of scope here.)
  async function linkMasterBox(masterFile: string, elementId: string, processId: string): Promise<void> {
    await openFile(masterFile, { asPlainEditor: true });
    const el = (modeler.get("elementRegistry") as any).get(elementId);
    if (!el) { showToast("No se encontró el elemento en el mapa"); return; }
    linkBox(modeler, el, processId);
    await save(masterFile);
    if (state.kind === "editing" && state.conflict) return; // conflict bar showing — let the user resolve it normally
    const newMasterXml = await api.getXml(masterFile);
    await enterMasterMode(masterFile, newMasterXml);
  }

  async function unlinkMasterBox(masterFile: string, elementId: string): Promise<void> {
    await openFile(masterFile, { asPlainEditor: true });
    const el = (modeler.get("elementRegistry") as any).get(elementId);
    if (!el) { showToast("No se encontró el elemento en el mapa"); return; }
    unlinkBox(modeler, el);
    await save(masterFile);
    if (state.kind === "editing" && state.conflict) return;
    const newMasterXml = await api.getXml(masterFile);
    await enterMasterMode(masterFile, newMasterXml);
  }

  // ---- A.3 assisted outcome authoring (Marcar como resultado alternativo / Volver) ----
  // Clicking an end event in the stage editor (while a stage is open in master mode) opens
  // a popover to convert a plain none-end into an escalation end (declaring the escalation
  // and adding the master's matching interrupting boundary wired to a chosen destination),
  // or the inverse. Both sides round-trip through the existing draft->publish + conflict
  // path (see markOutcomeAlternative / revertOutcomeNormal). The click handler is
  // registered once in mountModeler and gated on currentMasterFile + an open stage.
  function openOutcomePopover(endEl: any, stageFile: string): void {
    const masterFile = currentMasterFile;
    if (!masterFile) return;
    const isEscalation = ((endEl.businessObject?.eventDefinitions ?? [])[0]?.$type ?? "").endsWith("EscalationEventDefinition");
    // Destinations = master stages (Call Activities) + master end events only. Filtering by
    // type keeps tasks/gateways/sequence-flows out of the picker: a non-node target would
    // make addEscalationBoundary's modeling.connect throw or corrupt the diagram.
    const destinations = [...masterNodeNames.entries()]
      .filter(([id]) => { const t = masterNodeTypes.get(id) ?? ""; return t.endsWith("CallActivity") || t.endsWith("EndEvent"); })
      .map(([id, name]) => ({ id, label: name || id }));
    const rect = endEl.gfx?.getBoundingClientRect?.() ?? new DOMRect();
    renderOutcomePopover(rect, {
      end: { id: endEl.id, name: endEl.businessObject?.name ?? "", isEscalation },
      destinations,
      onMarkAlternative: (destId) => markOutcomeAlternative(stageFile, masterFile, endEl.id, destId),
      onRevertNormal: () => revertOutcomeNormal(stageFile, masterFile, endEl.id),
    });
  }

  async function markOutcomeAlternative(stageFile: string, masterFile: string, endId: string, destinationId: string): Promise<void> {
    // 1) Subprocess side: mark the end as escalation, publish the stage.
    const stageEnd = (modeler.get("elementRegistry") as any).get(endId);
    if (!stageEnd) { showToast("No se encontró el resultado en el subproceso"); return; }
    const pid = (await parseDiagramInfo(await api.getXml(stageFile))).processId;
    const outcomeName = stageEnd.businessObject?.name ?? endId;
    const code = markEndAsEscalation(modeler, stageEnd, { processId: pid, outcomeName });
    await save(stageFile);
    if (state.kind === "editing" && state.conflict) return; // let the user resolve
    // 2) Master side: open master, add the interrupting boundary + destination flow, publish.
    const callActivityId = callLinksFromEls(await parseCallLinks(await api.getXml(masterFile)))
      .find((l) => l.calledElement === pid)?.elementId;
    if (!callActivityId) { showToast("No se encontró la etapa en el mapa"); return; }
    await openFile(masterFile, { asPlainEditor: true });
    addEscalationBoundary(modeler, { callActivityId, escalationCode: code, outcomeName, destinationId });
    await save(masterFile);
    if (state.kind === "editing" && state.conflict) return;
    // 3) Re-enter the map and re-open the stage so badges/overlays reflect the new outcome.
    await enterMasterMode(masterFile, await api.getXml(masterFile));
    await openStage(stageFile);
  }

  async function revertOutcomeNormal(stageFile: string, masterFile: string, endId: string): Promise<void> {
    const stageEnd = (modeler.get("elementRegistry") as any).get(endId);
    if (!stageEnd) return;
    const code = ((stageEnd.businessObject?.eventDefinitions ?? [])[0]?.escalationRef?.escalationCode) as string | undefined;
    revertEscalationToNormal(modeler, stageEnd);
    await save(stageFile);
    if (state.kind === "editing" && state.conflict) return;
    if (code) {
      await openFile(masterFile, { asPlainEditor: true });
      removeEscalationBoundary(modeler, code);
      await save(masterFile);
      if (state.kind === "editing" && state.conflict) return;
    }
    await enterMasterMode(masterFile, await api.getXml(masterFile));
    await openStage(stageFile);
  }

  // "Crear subproceso nuevo": generate a fresh skeleton .bpmn, write it to the shared
  // folder, make sure the registry knows about it (needed so the master's badge shows
  // "resolved" right away), link the clicked box to it, then drill down into the stage.
  async function createAndLinkSubprocess(masterFile: string, el: RawEl): Promise<void> {
    const taken = new Set(registry.all().map((p) => p.processId));
    const { xml, processId } = newSubprocessSkeleton(el.name || el.id, taken);
    const file = `${processId}.bpmn`;
    await api.createFile(file, xml);
    await refreshFileList();
    await registry.sync(
      lastTree.filter((e) => e.kind === "file" && e.path.endsWith(".bpmn"))
        .map((e) => ({ path: e.path, version: e.version ?? "" })),
    );
    await linkMasterBox(masterFile, el.id, processId);
    await openStage(file);
  }

  function guard(fn: () => Promise<void>) {
    return () => fn().catch(onError);
  }
  function onError(e: unknown) {
    if ((e as any)?.name === "NotAllowedError" || (e as any)?.name === "SecurityError") {
      showToast("Se perdió el permiso de la carpeta — elegila de nuevo");
      showFolderGate();
      return;
    }
    showToast(String((e as any)?.message ?? e));
  }

  // Web fallback for "Abrir" on a fuente when the Electron shell:openPath IPC
  // isn't available — downloads the bytes instead of opening them externally.
  function downloadBytes(name: string, bytes: Uint8Array): void {
    const blob = new Blob([bytes.slice()]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Opening a source with the OS's default app is a one-time-per-session heads-up
  // (not per file) — once the user accepts it, stop asking for the rest of the session.
  async function confirmOpenOnce(): Promise<boolean> {
    if (fuentesOpenConfirmed) return true;
    const ok = await confirmModal(
      "Vas a abrir este archivo con la aplicación externa asociada de tu sistema. ¿Continuar?",
      "Abrir",
    );
    if (ok) fuentesOpenConfirmed = true;
    return ok;
  }

  // npm registry has no CORS → use Electron main when available; web may be blocked.
  async function fetchLatestBpmnJs(): Promise<string> {
    if (window.versionApi) {
      const v = await window.versionApi.latestBpmnJs();
      if (!v) throw new Error("sin respuesta");
      return v;
    }
    const res = await fetch("https://registry.npmjs.org/bpmn-js/latest");
    const j = await res.json();
    return j.version;
  }

  async function maybeShowUpdateBanner(): Promise<void> {
    if (!window.appUpdate) return;
    try {
      const [current, feed] = await Promise.all([
        window.appUpdate.currentVersion(),
        window.appUpdate.checkFeed(),
      ]);
      const r = evaluateUpdate(current, feed);
      if (!r.updateAvailable) return;
      const el = document.getElementById("appupdate");
      if (!el) return;
      el.innerHTML = `<div class="appupdate-bar">Versión ${r.latest} disponible.
        <button id="appupdate-get" type="button">Descargar</button>
        <button id="appupdate-later" type="button">Después</button></div>`;
      document.getElementById("appupdate-get")?.addEventListener("click", () => {
        window.appUpdate?.openDownload(r.url);
      });
      document.getElementById("appupdate-later")?.addEventListener("click", () => {
        el.innerHTML = "";
      });
    } catch {
      /* silent: no feed / offline */
    }
  }

  // ---- Folder gate ----
  function showFolderGate() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (heatmap) {
      heatmap.stop();
      heatmap = null;
    }
    root.innerHTML = `
      <header id="appheader">
        <span class="brand">◈ BPMN compartida</span>
        <span class="spacer"></span>
        <button class="btn icon-only" id="gate-theme" type="button" title="Tema"></button>
      </header>
      <main class="gate">
        <div class="gate-card">
          <div class="gate-icon">${icon("folder")}</div>
          <h2>Elegí tu carpeta de trabajo</h2>
          <p>Seleccioná la carpeta sincronizada (Google Drive, OneDrive…) que contiene —o contendrá— los diagramas <code>.bpmn</code>. Se recordará en este equipo.</p>
          <button class="btn primary" id="pick" type="button">Elegir carpeta</button>
        </div>
      </main>`;
    const gtheme = document.getElementById("gate-theme")!;
    const renderGTheme = () => { gtheme.innerHTML = icon(getTheme() === "dark" ? "sun" : "moon"); };
    renderGTheme();
    gtheme.addEventListener("click", () => { toggleTheme(); renderGTheme(); });
    document.getElementById("pick")!.addEventListener("click", () => {
      void (async () => {
        const dir = await pickDir();
        if (dir) {
          await useFolder(dir);
          await ensureNameThenApp();
        } else {
          showToast("No se eligió una carpeta usable");
        }
      })().catch(onError);
    });
  }

  // A stable id for the current shared folder, used to namespace local drafts so
  // switching projects/teams never resumes another project's draft. Electron exposes
  // the folder's absolute path (unique); the web only exposes the folder name.
  async function computeFolderId(): Promise<string> {
    const fsapi = typeof window !== "undefined" ? (window as unknown as { fsapi?: { getRoot?: () => Promise<string | null> } }).fsapi : null;
    if (fsapi && typeof fsapi.getRoot === "function") {
      try { const root = await fsapi.getRoot(); if (root) return String(root); } catch { /* fall back to name */ }
    }
    return rootHandle?.name ?? "default";
  }

  // Wire up all folder-scoped clients for a freshly-selected working folder. Shared
  // by the first-launch gate, the change-folder modal, and the saved-folder restore.
  async function useFolder(dir: FileSystemDirectoryHandle): Promise<void> {
    rootHandle = dir;
    api = createFsClient(dir);
    registry.clear(); // fresh folder → drop the previous folder's process index
    exitMasterMode(); // tear down any master pane left over from the previous folder
    layersClient = createLayersClient(api);
    docsClient = createDocsClient(api);
    ideasClientV2 = createIdeasClient(api);
    folderId = await computeFolderId();
    void ensureAgentsFile(api);
    void ensureBpmnDesignSkill(api);
    void ensureLocalOverlay(api);
  }

  // Floating modal to change the working folder WITHOUT tearing down the app, so
  // cancelling returns you to your current session (unlike the full-screen gate,
  // which is only for first launch / lost permission).
  function changeFolder() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="gate-card">
        <div class="gate-icon">${icon("folder")}</div>
        <h2>Cambiar carpeta de trabajo</h2>
        <p>Elegí la carpeta sincronizada (Google Drive, OneDrive…) con los diagramas <code>.bpmn</code>.</p>
        <div class="gate-actions">
          <button class="btn" id="fm-cancel" type="button">Cancelar</button>
          <button class="btn primary" id="fm-pick" type="button">Elegir carpeta</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector("#fm-cancel")!.addEventListener("click", close);
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
    overlay.querySelector("#fm-pick")!.addEventListener("click", () => {
      void (async () => {
        const dir = await pickDir();
        if (!dir) { showToast("No se eligió una carpeta usable"); return; } // keep modal open to retry/cancel
        close();
        await useFolder(dir);
        await ensureNameThenApp();
      })().catch(onError);
    });
  }

  // ---- Identity ----
  async function ensureNameThenApp() {
    let name = getName();
    if (!name) {
      // window.prompt() is unsupported in Electron's renderer; use our in-app modal.
      const entered = await promptText("¿Tu nombre? (se muestra en los bloqueos y el historial)");
      if (!entered) {
        showToast("Necesitás un nombre para editar");
        return;
      }
      name = entered;
      setName(name);
    }
    me = { name, email: name }; // typed name is the identity key (reuses lockManager)
    void startApp().catch(onError);
  }

  const baseName = (id: string) => id.replace(/\.bpmn$/i, "");

  async function getFolderIndex(): Promise<DiagramInfo[]> {
    if (folderIndex) return folderIndex;
    const src: IndexSource = {
      listBpmnFiles: async () => lastTree.filter((e) => e.kind === "file" && e.path.endsWith(".bpmn")).map((e) => e.path),
      readXml: (file) => api.getXml(file).catch(() => null),
    };
    folderIndex = await buildFolderIndex(src);
    return folderIndex;
  }

  function toRawEl(el: any): RawEl {
    const bo = el.businessObject ?? {};
    const type: string = bo.$type ?? "";
    const raw: RawEl = { id: el.id, name: bo.name ?? "", type };
    if (bo.calledElement) raw.calledElement = bo.calledElement;
    const defs: any[] = bo.eventDefinitions ?? [];
    if (defs.length) {
      const dt: string = defs[0].$type ?? "";
      const kind = dt.includes("Message") ? "message" : dt.includes("Signal") ? "signal" : dt.includes("Link") ? "link" : null;
      if (kind) {
        raw.eventKind = kind;
        raw.isThrow = type.includes("ThrowEvent") || type.includes("EndEvent");
        const ref = defs[0].messageRef ?? defs[0].signalRef;
        raw.eventRefName = ref?.name ?? (kind === "link" ? defs[0].name : undefined);
      }
    }
    return raw;
  }

  async function mountModeler(): Promise<void> {
    const $ = (id: string) => document.getElementById(id)!;
    const canvasEl = $("canvas") as HTMLElement;
    const propsEl = $("propspanel") as HTMLElement;
    const settings = getVizSettings();

    if (heatmap) {
      heatmap.stop();
      heatmap = null;
    }
    if (modeler && typeof (modeler as any).destroy === "function") {
      (modeler as any).destroy();
    }
    canvasEl.innerHTML = "";

    modeler = await createBpmnModeler(canvasEl, { propertiesParent: propsEl, settings });
    editor = createEditor(modeler);
    diffView = createDiffView(modeler, editor);
    layerView = createLayerView(modeler);
    try {
      const linting = modeler.get("linting");
      // Public API in bpmn-js-bpmnlint is toggle(newActive); setActive is internal.
      if (linting && typeof linting.toggle === "function") linting.toggle(true);
    } catch {
      /* linting service optional */
    }
    // re-apply the active layer after a modeler rebuild
    selectedId = null;
    if (layerFile) reapplyLayers();
    tagPools();
    datosOverlays = createDatosOverlays({
      add: (elementId: string, html: HTMLElement) =>
        (modeler.get("overlays") as any).add(elementId, "datos", { position: { bottom: -14, left: -10 }, html }),
      remove: (id: string) => (modeler.get("overlays") as any).remove(id),
    });
    // pools/lanes created or rebuilt by edits lose the tag → re-tag on every change.
    modeler.get("eventBus").on("import.done", () => tagPools());
    modeler.get("eventBus").on("commandStack.changed", () => {
      tagPools(); armIdle();
      if (editor.isLoading()) return; // ignore the load-induced churn (clear + import)
      draftPending = true; updateLocalStatus(); scheduleDraftSave();
    });
    // A brand-new native edit branches history → the coarse redo stack is stale.
    modeler.get("eventBus").on("commandStack.executed", () => { coarseRedo.length = 0; });
    modeler.get("eventBus").on("selection.changed", (e: { newSelection: Array<{ id: string }> }) => {
      selectedId = e.newSelection.length === 1 ? e.newSelection[0].id : null;
      renderLayers();
      void renderDatos();
      docsSelectionCbs.forEach((cb) => cb());
    });
    editor.onDirtyChange((dirty) => {
      dispatch({ type: "dirtyChanged", dirty });
    });
    if (settings.heatmap) {
      heatmap = createHeatmapController(modeler, canvasEl);
      heatmap.start();
    }
    // Single dblclick handler: Call Activity first, else Message/Signal counterpart.
    modeler.get("eventBus").on("element.dblclick", (e: { element: any }) => {
      const bo = e.element.businessObject;
      if (bo?.$type === "bpmn:CallActivity" && bo.calledElement) {
        void (async () => {
          const idx = await getFolderIndex();
          const file = resolveCalledProcess(bo.calledElement!, idx);
          if (file) await openFile(file);
          else showToast("No se encontró el proceso referenciado");
        })().catch(onError);
        return;
      }
      const els: RawEl[] = [toRawEl(e.element)];
      const { events } = extractInterProcessRefs(els);
      if (!events.length) return;
      void (async () => {
        const idx = await getFolderIndex();
        const file = findEventCounterpart(events[0], docsFileId, idx);
        if (file) { showToast(`Ir al proceso vinculado: ${baseNameOfFile(file)}`); await openFile(file); }
      })().catch(onError);
    });
    // A.3: while a stage is open inside a master map, clicking an end event offers the
    // outcome popover (Marcar como resultado alternativo / Volver a resultado normal).
    // Registered once here (not per openStage) since the modeler persists across
    // drill-downs; gated on master mode + an open stage (state.fileId is that stage).
    modeler.get("eventBus").on("element.click", (e: { element: any }) => {
      const el = e?.element;
      if (!currentMasterFile || !el || !(el.type ?? "").endsWith("EndEvent")) return;
      const stageFile = state.kind === "editing" ? state.fileId : null;
      if (!stageFile) return;
      openOutcomePopover(el, stageFile);
    });
  }

  async function applyVizSettings(next: VizSettings): Promise<void> {
    if (applyingViz) return;
    applyingViz = true;
    try {
      setVizSettings(next);
      // Preserve the open file (and any unpublished draft) across the modeler rebuild.
      const open = state.kind === "editing" ? state.fileId : null;
      if (open) await flushDraft(); // capture pending edits locally — do NOT publish
      await mountModeler();
      if (open) {
        await loadIntoEditor(loadDraft(folderId, open) ?? (await api.getXml(open)));
        editor.setReadOnly(false); // canvas is always editable in the draft model
      }
    } finally {
      applyingViz = false;
    }
  }

  // ---- Layers ----
  async function loadLayers(fileId: string): Promise<void> {
    layerFile = await layersClient.load(fileId);
    activeColorId = null;
    annotationsOn = [];
    selectedId = null;
    reapplyLayers();
    renderLayers();
  }

  // ---- Docs ----
  async function loadDocs(fileId: string): Promise<void> {
    docsFileId = fileId;
    await docsController?.refresh();
    void refreshDatosBadges().catch(onError);
  }

  // Drag the inspector's left edge to resize its width (persisted). The
  // --inspector-width CSS var sizes only .inspector-panes (the rail is fixed
  // width), so read/write that var — not the #inspector rect, which also
  // includes the rail and would drift the value on every drag.
  function setupInspectorResize(): void {
    const insp = document.getElementById("inspector");
    if (!insp || insp.querySelector(".inspector-resizer")) return;
    const MIN = 220, MAX = 760, DEFAULT = 300;
    const saved = Number(localStorage.getItem("inspectorWidth"));
    if (saved >= MIN && saved <= MAX) insp.style.setProperty("--inspector-width", `${saved}px`);
    const resizer = document.createElement("div");
    resizer.className = "inspector-resizer";
    resizer.title = "Arrastrá para ajustar el ancho";
    insp.appendChild(resizer);
    const currentWidth = (): number =>
      parseFloat(getComputedStyle(insp).getPropertyValue("--inspector-width")) || DEFAULT;
    let startX = 0, startW = 0, dragging = false;
    const onMove = (e: MouseEvent): void => {
      if (!dragging) return;
      const w = Math.min(MAX, Math.max(MIN, startW + (startX - e.clientX)));
      insp.style.setProperty("--inspector-width", `${w}px`);
    };
    const onUp = (): void => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove("col-resizing");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      try { localStorage.setItem("inspectorWidth", String(Math.round(currentWidth()))); } catch { /* ignore */ }
    };
    resizer.addEventListener("mousedown", (e) => {
      dragging = true;
      startX = e.clientX;
      startW = currentWidth();
      document.body.classList.add("col-resizing");
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      e.preventDefault();
    });
  }

  // Drag the left file panel's right edge to resize its width (persisted). The width
  // drives #files via the --files-width CSS var. Mirrors setupInspectorResize but for
  // the LEFT panel, using the shared resizer helper.
  function setupFilesResize(): void {
    const files = document.getElementById("files");
    if (!files || files.querySelector(".files-resizer")) return;
    const MIN = 180, MAX = 520;
    const saved = Number(localStorage.getItem("filesWidth"));
    if (saved >= MIN && saved <= MAX) files.style.setProperty("--files-width", `${saved}px`);
    const handle = document.createElement("div");
    handle.className = "files-resizer";
    handle.title = "Arrastrá para ajustar el ancho";
    files.appendChild(handle);
    mountResizer(handle, {
      axis: "x",
      min: MIN,
      max: MAX,
      getSize: () => files.getBoundingClientRect().width,
      setSize: (px) => files.style.setProperty("--files-width", `${px}px`),
      onCommit: (px) => { try { localStorage.setItem("filesWidth", String(Math.round(px))); } catch { /* ignore */ } },
    });
  }

  // Drag the horizontal divider between the master map (top) and the open stage (bottom).
  // Sets --master-split (a %) on #canvasarea; #master-canvas takes that as its flex-basis
  // height while a stage is open. Persisted. Only meaningful in master-mode with a stage
  // (the divider is [hidden] otherwise — toggled by showStageHint / enter/exitMasterMode).
  // Uses direct pointer wiring (not mountResizer): the helper's setSize receives an
  // absolute px-based size (startSize + px delta), which doesn't compose with a
  // percent-based split — mirrors setupCanvasSplitResize below for the % case.
  function setupMasterSplitResize(): void {
    const area = document.getElementById("canvasarea");
    const handle = document.getElementById("master-split-resizer");
    if (!area || !handle) return;
    const saved = Number(localStorage.getItem("masterSplit"));
    if (saved >= 15 && saved <= 85) area.style.setProperty("--master-split", `${saved}%`);
    let dragging = false;
    const onMove = (e: MouseEvent): void => {
      if (!dragging) return;
      const r = area.getBoundingClientRect();
      const pct = Math.min(85, Math.max(15, ((e.clientY - r.top) / r.height) * 100));
      area.style.setProperty("--master-split", `${pct}%`);
    };
    const onUp = (): void => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove("col-resizing");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const cur = getComputedStyle(area).getPropertyValue("--master-split").trim();
      const pct = Math.round(parseFloat(cur || "40"));
      if (pct >= 15 && pct <= 85) { try { localStorage.setItem("masterSplit", String(pct)); } catch { /* ignore */ } }
    };
    handle.addEventListener("mousedown", (e) => {
      dragging = true;
      document.body.classList.add("col-resizing");
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      e.preventDefault();
    });
  }

  // Draggable separator between a pane's two compare canvases. Sets --split (a %) on the
  // pane's .pane-split element (NOT the shared #canvasarea, so the master's and stage's
  // compares don't fight over one variable). Axis follows the pane's own orientation.
  function setupPaneSplitResize(splitId: string, resizerId: string): void {
    const area = document.getElementById(splitId);
    const resizer = document.getElementById(resizerId);
    if (!area || !resizer) return;
    let dragging = false;
    const onMove = (e: MouseEvent): void => {
      if (!dragging) return;
      const r = area.getBoundingClientRect();
      const vertical = area.classList.contains("vertical");
      const pct = vertical ? ((e.clientY - r.top) / r.height) * 100 : ((e.clientX - r.left) / r.width) * 100;
      area.style.setProperty("--split", `${Math.min(85, Math.max(15, pct))}%`);
    };
    const onUp = (): void => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove("col-resizing");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    resizer.addEventListener("mousedown", (e) => {
      dragging = true;
      document.body.classList.add("col-resizing");
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      e.preventDefault();
    });
  }

  function reapplyLayers(): void {
    if (!layerView || !layerFile) return;
    const colorDim = layerFile.dimensions.find((d) => d.id === activeColorId && d.type === "color");
    layerView.applyColor((colorDim as any) ?? null);
    for (const d of layerFile.dimensions) {
      if (d.type === "annotation") layerView.setAnnotation(d, annotationsOn.includes(d.id));
    }
  }

  // bpmn-js renders pools (Participant) and lanes with the same DOM class as any
  // shape, so there is no CSS hook to give them a distinct dark-mode fill. Tag their
  // graphics with "bpmn-pool" by BPMN type so the dark theme can style only them.
  function tagPools(): void {
    try {
      const reg = modeler.get("elementRegistry");
      const canvas = modeler.get("canvas");
      reg.forEach((el: { businessObject?: { $type?: string } }) => {
        const t = el.businessObject?.$type;
        if (t !== "bpmn:Participant" && t !== "bpmn:Lane") return;
        const gfx = canvas.getGraphics(el);
        if (gfx && !gfx.classList.contains("bpmn-pool")) gfx.classList.add("bpmn-pool");
      });
    } catch {
      /* modeler/registry not ready */
    }
  }

  // Re-importing XML (editor.load) rebuilds every element's graphics, which drops
  // the diagram-js markers that implement layer coloring. Any reload/restore/rebuild
  // path must re-apply the active layer afterwards, or colors silently disappear.
  async function loadIntoEditor(xml: string): Promise<void> {
    await editor.load(xml);
    if (layerFile) reapplyLayers();
    tagPools();
    void refreshDatosBadges().catch(onError);
  }

  function renderLayers(): void {
    const panel = document.getElementById("layerspanel");
    if (!panel || panel.hidden || !layerFile) return;
    renderLayersPanel(
      panel as HTMLElement,
      { layers: layerFile, activeColorId, annotationsOn, selectedId },
      {
        onPickColor: (id) => {
          activeColorId = id;
          reapplyLayers();
          renderLayers();
        },
        onToggleAnnotation: (id, on) => {
          annotationsOn = on ? [...annotationsOn, id] : annotationsOn.filter((x) => x !== id);
          reapplyLayers();
          renderLayers();
        },
        onAssign: (dimId, elementId, value) => {
          void assignLayer(dimId, elementId, value).catch(onError);
        },
        onManage: () => {
          void openLayersManager().catch(onError);
        },
      },
    );
  }

  async function renderFuentes(): Promise<void> {
    const panel = inspector.paneEl("fuentes");
    if (!panel || panel.hidden || !docsFileId) return;
    const client = createFuentesClient(api, docsFileId);
    await renderFuentesPanel(panel, {
      client,
      canOpenExternal: hasOpenPath(),
      openExternal: (rel) => openSourceExternal(rel),
      download: (name, bytes) => downloadBytes(name, bytes),
      confirmOpen: confirmOpenOnce,
      onError,
      onVerIdeas: (fuente) => {
        inspector.setTab("ideas");
        ideasCtl?.setFuenteFilter(fuente);
      },
    });
  }

  function selectedElementLabel(): string {
    if (!selectedId) return "";
    const el = (modeler?.get("elementRegistry") as any)?.get?.(selectedId);
    return (el && el.businessObject && el.businessObject.name) || selectedId;
  }

  async function renderDatos(): Promise<void> {
    const panel = inspector.paneEl("datos");
    if (!panel || panel.hidden || !docsFileId) return;
    const client = createDatosClient(api, docsFileId);
    const diagramIds = lastTree.filter((e) => e.kind === "file" && e.path.endsWith(".bpmn")).map((e) => e.path);
    let toolSuggestions: string[] = [];
    try {
      toolSuggestions = await collectDatosTools(api, diagramIds);
    } catch {
      /* suggestions are best-effort — never block the panel */
    }
    await renderDatosPanel(panel, {
      client,
      elementId: selectedId,
      elementLabel: selectedElementLabel(),
      openExternalUrl: (url) => openExternalUrl(url),
      onError,
      onMostrarEnDiagrama: (category, entry) => mostrarEnDiagrama(category, entry),
      onChanged: () => { void refreshDatosBadges(); },
      toolSuggestions,
    });
  }

  // Best-effort: badges are a read-model over the sidecar, never block canvas interaction.
  async function refreshDatosBadges(): Promise<void> {
    if (!docsFileId || !datosOverlays) return;
    const client = createDatosClient(api, docsFileId);
    const file = await client.load();
    datosOverlays.render(file, (elementId) => {
      const el = (modeler?.get("elementRegistry") as any)?.get?.(elementId);
      if (el) (modeler?.get("selection") as any)?.select?.(el);
      inspector.setTab("datos");
      void renderDatos();
    });
  }

  // "Mostrar en el diagrama": creates the standard Data Object/Store anchor for the given
  // entry, publishes it directly (a programmatic action from the panel, not the toolbar
  // Publicar button — skips the confirm dialog, same precedent as linkMasterBox/unlinkMasterBox),
  // then stamps the created anchor's id back onto the sidecar entry so the button hides.
  async function mostrarEnDiagrama(category: DatosCategory, entry: DatosEntry): Promise<void> {
    // The anchor is created in the STAGE modeler (selectedId is a stage selection), so
    // this is only coherent when the stage is the active pane. With the master focused,
    // docsFileId points at the MASTER — saving there would overwrite the shared map
    // with the stage's XML. Guard hard and save to the stage's own file id.
    if (state.kind !== "editing" || !selectedId || activePane() === "master") return;
    const stageFileId = state.fileId;
    const el = (modeler.get("elementRegistry") as any).get(selectedId);
    if (!el) { showToast("No se encontró el elemento en el diagrama"); return; }
    const anchor =
      category === "formularios" ? anchorFormulario(modeler, el, entry.nombre) : anchorAlmacenamiento(modeler, el, entry.nombre);
    await save(stageFileId);
    if (state.kind === "editing" && state.conflict) return; // conflict bar showing — let the user resolve it normally
    const client = createDatosClient(api, stageFileId);
    await client.markAnchored(selectedId, category, entry.id, anchor.id);
    await refreshDatosBadges();
  }

  async function assignLayer(dimId: string, elementId: string, value: string | null): Promise<void> {
    if (!layerFile || state.kind !== "editing") return;
    const dim = layerFile.dimensions.find((d) => d.id === dimId);
    if (!dim) return;
    if (value === null) delete dim.assignments[elementId];
    else dim.assignments[elementId] = value;
    // Color immediately — the visual update must NOT be gated on the disk write.
    // A cloud-sync client (Google Drive/OneDrive) can briefly lock the sidecar, making
    // the save throw; if that ran first, the element would silently stay uncolored.
    reapplyLayers();
    renderLayers();
    await layersClient.save(state.fileId, layerFile);
  }

  const layersModalHandlers: LayersModalHandlers = {
    onAddColorDim: () => void applyLayerEdit((lf) => addColorDimension(lf, "Nueva capa").lf),
    onAddAnnotationDim: () => void applyLayerEdit((lf) => addAnnotationDimension(lf, "Nueva anotación").lf),
    onRenameDim: (id, label) => void applyLayerEdit((lf) => renameDimension(lf, id, label)),
    onDeleteDim: (id) => void applyLayerEdit((lf) => deleteDimension(lf, id)),
    onAddCategory: (dimId) => void applyLayerEdit((lf) => addCategory(lf, dimId, "Nueva categoría", "#AED6F1").lf),
    onUpdateCategory: (dimId, catId, patch) => void applyLayerEdit((lf) => updateCategory(lf, dimId, catId, patch)),
    onDeleteCategory: (dimId, catId) => void applyLayerEdit((lf) => deleteCategory(lf, dimId, catId)),
    onReorderCategory: (dimId, from, to) => void applyLayerEdit((lf) => reorderCategory(lf, dimId, from, to)),
    onApplyTemplate: (slug) => void applyTemplate(slug),
    onSaveTemplate: (name) => void saveTemplate(name),
    onDeleteTemplate: (slug) => void deleteTemplate(slug),
  };

  // Apply a structural edit: mutate → reconcile active state → re-color (never gated
  // on the disk write) → re-render panel + modal → persist the sidecar last.
  async function applyLayerEdit(mutate: (lf: LayerFile) => LayerFile): Promise<void> {
    if (!layerFile || state.kind !== "editing") return;
    layerFile = mutate(layerFile);
    if (activeColorId && !layerFile.dimensions.some((d) => d.id === activeColorId && d.type === "color")) {
      activeColorId = null;
    }
    annotationsOn = annotationsOn.filter((id) =>
      layerFile!.dimensions.some((d) => d.id === id && d.type === "annotation"),
    );
    reapplyLayers();
    renderLayers();
    await refreshLayersModal();
    await layersClient.save(state.fileId, layerFile);
  }

  async function applyTemplate(slug: string): Promise<void> {
    if (!templatesClient) return;
    const t = await templatesClient.load(slug);
    if (!t) return;
    await applyLayerEdit((lf) => mergeTemplate(lf, t.dimensions));
  }

  async function saveTemplate(name: string): Promise<void> {
    if (!templatesClient || !layerFile || !name.trim()) return;
    await templatesClient.save(name.trim(), layerFile.dimensions);
    await refreshLayersModal();
  }

  async function deleteTemplate(slug: string): Promise<void> {
    if (!templatesClient) return;
    await templatesClient.remove(slug);
    await refreshLayersModal();
  }

  async function openLayersManager(): Promise<void> {
    if (layersModalEl || !layerFile || state.kind !== "editing") return;
    templatesClient = createTemplatesClient(api);
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "layers-modal";
    overlay.innerHTML = `
      <div class="lm-box" role="dialog" aria-modal="true" aria-label="Gestionar capas">
        <div class="lm-head">
          <h2>Gestionar capas</h2>
          <button class="btn icon-only lm-close" type="button" title="Cerrar">${icon("close")}</button>
        </div>
        <div class="lm-body"></div>
      </div>`;
    document.body.appendChild(overlay);
    layersModalEl = overlay;
    const close = (): void => {
      overlay.remove();
      layersModalEl = null;
      document.removeEventListener("keydown", onKey);
    };
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") close();
    }
    overlay.querySelector(".lm-close")!.addEventListener("click", close);
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", onKey);
    await refreshLayersModal();
  }

  async function refreshLayersModal(): Promise<void> {
    if (!layersModalEl || !layerFile || !templatesClient) return;
    const body = layersModalEl.querySelector(".lm-body") as HTMLElement;
    const templates = await templatesClient.list();
    renderLayersModal(body, { layers: layerFile, templates }, layersModalHandlers);
  }

  // ---- App shell ----
  async function startApp() {
    root.innerHTML = `
      <header id="appheader">
        <span class="brand">◈ BPMN compartida</span>
        <span class="spacer"></span>
        <span class="hchip" id="folderchip"></span>
        <button class="btn" id="userbtn" type="button"></button>
        <button class="btn icon-only" id="helpbtn" type="button" title="Ayuda">${icon("help")}</button>
        <button class="btn icon-only" id="themebtn" type="button" title="Tema"></button>
      </header>
      <div id="toolbar">
        <button class="btn icon-only" id="toggle-files" type="button" title="Ocultar panel de archivos">${icon("panelLeft")}</button>
        <span class="divider"></span>
        <div class="tgroup">
          <button class="btn icon-only" id="newfile" type="button" title="Nuevo diagrama">${icon("new")}</button>
          <button class="btn icon-only" id="undo" type="button" title="Deshacer (Ctrl+Z)">${icon("undo")}</button>
          <button class="btn icon-only" id="redo" type="button" title="Rehacer (Ctrl+Y)">${icon("redo")}</button>
          <span class="menu" id="autolayout-menu">
            <button class="btn icon-only" id="autolayout" type="button" title="Auto-organizar (alta calidad)">${icon("autoLayout")}</button>
            <button class="btn icon-only" id="autolayout-caret" type="button" title="Opciones de organización" aria-haspopup="true">${icon("chevron")}</button>
            <div class="menu-pop" id="autolayout-pop" hidden></div>
          </span>
        </div>
        <span class="divider"></span>
        <div class="tgroup" id="localgroup">
          <span class="glabel">Local</span>
          <button class="btn toggle-btn" id="autosave-toggle" type="button" role="switch" aria-checked="true" title="Autoguardado del borrador local (privado)"><span class="switch" aria-hidden="true"><span class="switch-knob"></span></span><span class="btn-label">Autoguardado</span></button>
          <button class="btn" id="savedraft" type="button" title="Guardar borrador local ahora (privado)">${icon("save")}<span class="btn-label">Guardar</span></button>
          <span class="lstatus" id="localstatus"></span>
        </div>
        <span class="divider"></span>
        <div class="tgroup" data-prio="1">
          <div class="menu" id="settingsmenu">
            <button class="btn icon-only" id="settings" type="button" title="Configuraciones">${icon("settings")}</button>
          </div>
        </div>
        <span class="divider"></span>
        <div class="tgroup" data-prio="2">
          <button class="btn icon-only" id="exportSvg" type="button" title="Exportar SVG">${icon("download")}<span style="font-size:11px">SVG</span></button>
          <button class="btn icon-only" id="exportPng" type="button" title="Exportar PNG">${icon("download")}<span style="font-size:11px">PNG</span></button>
          <button class="btn icon-only" id="manual" type="button" title="Manual del proceso">${icon("book")}<span style="font-size:11px">Manual</span></button>
        </div>
        <div class="tgroup ia-group menu">
          <button class="btn icon-only" id="ai-config" type="button" title="IA">${icon("sparkles")}<span style="font-size:11px">IA</span></button>
          <button class="btn icon-only" id="ai-quicklaunch" type="button" title="Lanzar el último preset" hidden>▶</button>
        </div>
        <span class="spacer"></span>
        <div class="tgroup" id="sharedgroup">
          <span class="glabel">Compartido</span>
          <span class="lock-chip" id="filechip"></span>
          <button class="btn" id="editmode" type="button" hidden></button>
          <button class="btn" id="save" type="button" title="Publicar cambios al equipo (Ctrl+S)">${icon("upload")}<span class="btn-label">Publicar</span><span class="dot" id="savedot" hidden></span></button>
          <button class="btn" id="close" type="button" hidden>Cerrar</button>
        </div>
        <div class="menu" id="moremenu" hidden>
          <button class="btn icon-only" id="more" type="button" title="Más herramientas">${icon("more")}</button>
          <div id="morepop" class="menu-pop" hidden></div>
        </div>
        <span class="divider"></span>
        <button class="btn icon-only" id="toggle-inspector" type="button" title="Mostrar panel lateral">${icon("panelRight")}</button>
      </div>
      <div id="sync"></div>
      <div id="conflict"></div>
      <div id="master-bar" hidden></div>
      <div id="map-offer" hidden></div>
      <div id="appupdate"></div>
      <main class="app">
        <aside id="files"><div class="files-tree"></div></aside>
        <section id="canvasarea">
          <button id="navpills-toggle" type="button" hidden aria-pressed="true" title="Ocultar vínculos de navegación"><span class="npt-ico">🔗</span><span class="npt-lbl">Vínculos</span></button>
          <div id="stage-hint" hidden>Doble-clic en una etapa para abrirla</div>
          <div id="master-wrap" class="pane-wrap" hidden>
            <div id="master-pane-bar" class="pane-bar"></div>
            <div id="master-split" class="pane-split">
              <section id="master-canvas"></section>
              <div class="canvas-resizer" id="master-canvassplit" title="Arrastrá para ajustar el split"></div>
              <section id="master-canvas2" hidden></section>
            </div>
          </div>
          <div id="master-split-resizer" class="master-split-resizer" hidden></div>
          <div id="stage-wrap" class="pane-wrap">
            <div id="stage-pane-bar" class="pane-bar"></div>
            <div id="stage-split" class="pane-split">
              <section id="canvas"></section>
              <div class="canvas-resizer" id="canvassplit" title="Arrastrá para ajustar el split"></div>
              <section id="canvas2" hidden></section>
            </div>
          </div>
        </section>
        <div id="inspector"></div>
      </main>`;

    inspector = createInspector(document.getElementById("inspector")!, [
      { id: "capas", label: "Capas", icon: "layers" },
      { id: "propiedades", label: "Propiedades", icon: "properties" },
      { id: "historial", label: "Historial", icon: "clock" },
      { id: "documentacion", label: "Documentación", icon: "fileText" },
      { id: "fuentes", label: "Fuentes", icon: "paperclip" },
      { id: "datos", label: "Datos y herramientas", icon: "database" },
      { id: "ideas", label: "Ideas", icon: "bulb" },
    ], (tabId) => {
      // Selecting the Ideas tab IS "idea mode": badges + selection-focus on; off elsewhere.
      const on = tabId === "ideas";
      void ideaMode?.setEnabled(on);
      if (on) void ideasCtl?.refresh();
      // Lazy per-pane refresh that the removed toolbar jump-buttons used to trigger.
      if (tabId === "capas") renderLayers();
      if (tabId === "documentacion") void docsController?.refresh();
      if (tabId === "fuentes") void renderFuentes();
      if (tabId === "datos") void renderDatos();
    });
    // Reuse existing render targets so mountModeler/renderLayers/loadHistory are unchanged.
    inspector.paneEl("propiedades").id = "propspanel";
    inspector.paneEl("capas").id = "layerspanel";
    inspector.paneEl("capas").classList.add("layers-panel");
    inspector.paneEl("historial").id = "history";
    inspector.hide();
    setupInspectorResize();
    setupFilesResize();
    setupMasterSplitResize();
    setupPaneSplitResize("stage-split", "canvassplit");
    setupPaneSplitResize("master-split", "master-canvassplit");
    // Navigation-pills show/hide toggle (floating over the canvas). Apply the persisted
    // choice once so the body class + button reflect it from the first render.
    document.getElementById("navpills-toggle")?.addEventListener("click", () => toggleNavPills());
    applyNavPillsVisibility();
    mountStageHistory(); // per-pane history controller — needs the shell DOM above
    // Focus tracking for the stage pane (the master pane wires its own via onFocus).
    document.getElementById("stage-wrap")?.addEventListener("pointerdown", () => focusStagePane(), true);

    await mountModeler();

    function selectElementById(id: string): void {
      const reg = modeler.get("elementRegistry");
      const el = reg.get(id);
      if (el) modeler.get("selection").select(el);
    }

    docsController?.destroy?.();
    docsController = createNotePanelController({
      docs: docsClient,
      mount: inspector.paneEl("documentacion"),
      diagramId: () => docsFileId,
      processName: () => docsFileId.replace(/\.bpmn$/i, "").split("/").pop() ?? docsFileId,
      listElements: () => (modeler ? listDocumentableElements(modeler) : []),
      getSelected: () => {
        const sel = (modeler?.get("selection")?.get?.() ?? []) as Array<{ id: string; businessObject?: { name?: string; $type?: string } }>;
        return sel[0] ? toDiagramElement(sel[0]) : null;
      },
      onSelectionChange: (cb) => docsSelectionCbs.push(cb),
      wikiProcesses: () =>
        lastTree.filter((e) => e.kind === "file" && e.path.endsWith(".bpmn")).map((e) => e.path.replace(/\.bpmn$/i, "")),
      navigateWiki: (target) => {
        if (target.kind === "bare") {
          const asFile = `${target.text}.bpmn`;
          if (lastTree.some((e) => e.path === asFile)) { void openFile(asFile).catch(onError); return; }
          const el = listDocumentableElements(modeler).find((e) => e.name === target.text);
          if (el) selectElementById(el.id);
        } else if (target.kind === "element") {
          void (async () => {
            if (target.process) {
              const idx = await getFolderIndex();
              const file = resolveCalledProcess(target.process, idx) ?? `${target.process}.bpmn`;
              if (file !== docsFileId && lastTree.some((e) => e.path === file)) {
                await openFile(file);
              }
            }
            selectElementById(target.element);
          })().catch(onError);
        } else if (target.kind === "idea") {
          showIdeasTab();
        }
      },
    });

    // ---- Ideas panel (own inspector tab, shown only in idea mode) ----
    // Mount into a CHILD of the pane, not the pane itself: the ideas views call
    // `container.className = ...` which would otherwise wipe the pane's
    // "inspector-pane" class and break the `[hidden]` hide-when-inactive rule
    // (making the panel bleed into every tab).
    const ideasPaneHost = document.createElement("div");
    inspector.paneEl("ideas").appendChild(ideasPaneHost);
    ideasCtl = createIdeasControllerV2({
      ideasClient: ideasClientV2,
      mount: ideasPaneHost,
      diagramId: () => docsFileId,
      processName: () => docsFileId.replace(/\.bpmn$/i, "").split("/").pop() ?? docsFileId,
      identity: () => me.name,
      today: () => new Date().toISOString().slice(0, 10),
      getSelected: () => {
        const sel = (modeler?.get("selection")?.get?.() ?? []) as Array<{ id: string; businessObject?: { name?: string; $type?: string } }>;
        return sel[0] ? toDiagramElement(sel[0]) : null;
      },
      clearSelection: () => (modeler?.get("selection") as any)?.select?.(null),
      selectElement: (elementId) => {
        const el = (modeler?.get("elementRegistry") as any)?.get?.(elementId);
        if (el) (modeler?.get("selection") as any)?.select?.(el);
      },
      aiAuthor: () => aiAuthorName(),
      // in-app modal — window.prompt is unsupported in Electron's renderer.
      promptMotivo: (estado: string) => promptText(`Motivo para marcar la idea como «${estado}»:`),
      onAnchoredCounts: (counts) => ideaMode?.setCounts(counts),
    });
    // In idea mode, selecting an element on the canvas focuses the ideas panel on
    // it (its ideas + anchored quick-add). syncSelection re-renders from the
    // in-memory list (no async reload) so it can't race with an in-flight write.
    docsSelectionCbs.push(() => { if (ideaMode?.isOn()) { ideasCtl?.syncSelection(); highlightIdeaElement(selectedId); } });

    // Open the Ideas tab (selecting it enables idea mode via the inspector onChange).
    function showIdeasTab(): void {
      inspector.setTab("ideas");
    }

    // ---- Idea mode ----
    // Strong, temporary highlight of the element an idea focus refers to (badge
    // click, canvas selection, or object-filter pick) — clearer than the thin
    // default selection outline.
    let ideaHighlightId: string | null = null;
    function highlightIdeaElement(id: string | null): void {
      const canvas = modeler?.get("canvas") as any;
      if (!canvas) return;
      if (ideaHighlightId && ideaHighlightId !== id) { try { canvas.removeMarker(ideaHighlightId, "idea-focused"); } catch { /* gone */ } }
      ideaHighlightId = id;
      if (id) { try { canvas.addMarker(id, "idea-focused"); } catch { /* not on canvas */ } }
    }
    const ideaOverlayHost = {
      add: (elementId: string, html: HTMLElement) =>
        // top-LEFT so the badge doesn't collide with the context pad (top-right on selection).
        (modeler.get("overlays") as any).add(elementId, "ideas", { position: { top: -14, left: -10 }, html }),
      remove: (id: string) => (modeler.get("overlays") as any).remove(id),
    };
    ideaMode = createIdeaMode({
      overlayHost: ideaOverlayHost,
      ideasClient: ideasClientV2,
      diagramId: () => docsFileId,
      processName: () => docsFileId.replace(/\.bpmn$/i, "").split("/").pop() ?? docsFileId,
      identity: () => me.name,
      today: () => new Date().toISOString().slice(0, 10),
      elementLabel: (id) => {
        const el = (modeler.get("elementRegistry") as any).get(id);
        return (el && el.businessObject && el.businessObject.name) || id;
      },
      clientRectFor: (id) => {
        const gfx = (modeler.get("elementRegistry") as any).getGraphics(id) as SVGElement | undefined;
        const r = gfx?.getBoundingClientRect();
        return r ? { left: r.right, top: r.top } : { left: 100, top: 100 };
      },
      openThreadInPanel: (ideaId) => {
        inspector.setTab("ideas");
        void ideasCtl?.openThread(ideaId);
      },
      focusElement: (elementId) => {
        // badge click → select the element (panel focuses on it) + surface the tab
        const el = (modeler?.get("elementRegistry") as any)?.get?.(elementId);
        if (el) (modeler?.get("selection") as any)?.select?.(el);
        inspector.setTab("ideas");
      },
      onPanelShouldRefresh: () => { void ideasCtl?.refresh(); },
      // Idea mode is now driven by the Ideas tab being active (see inspector
      // onChange), not a persisted toggle — so it's ephemeral.
      persistGet: () => false,
      persistSet: () => { /* no-op: tab-driven */ },
      onModeChange: (on) => { if (!on) highlightIdeaElement(null); },
    });

    const $ = (id: string) => document.getElementById(id)!;
    // Populated by the folder-label IIFE below; reused by both the chip's tooltip-free
    // label and openConfigModal's "Generales" pane (deps.folderLabel) so there's one
    // source of truth for "what folder am I in" text.
    let folderLabel = "carpeta";
    $("folderchip").innerHTML = `${icon("folder")} <span class="folder-path"></span>`;
    $("folderchip").style.cursor = "pointer";
    $("folderchip").addEventListener("click", () => openConfigModal("generales"));
    // Show the selected folder's path (Electron) or name (web). textContent — the
    // path/name is user data, never innerHTML.
    void (async () => {
      let label = "carpeta", full = "";
      const fsapi = (window as { fsapi?: { getRoot(): Promise<string | null> } }).fsapi;
      if (fsapi?.getRoot) {
        const root = await fsapi.getRoot().catch(() => null);
        if (root) {
          full = root;
          const sep = root.includes("\\") ? "\\" : "/";
          const segs = root.split(/[\\/]/).filter(Boolean);
          // Show the meaningful tail (…\parent\folder); full path is in the tooltip.
          label = segs.length <= 2 ? root : "…" + sep + segs.slice(-2).join(sep);
        }
      } else if (rootHandle) {
        label = rootHandle.name; full = rootHandle.name; // web (FSA) exposes only the folder name
      }
      folderLabel = label;
      const span = $("folderchip").querySelector(".folder-path");
      if (span) span.textContent = label;
      $("folderchip").title = full ? `${full} — clic para cambiar la carpeta` : "Cambiar carpeta de trabajo";
    })();
    const renderUserBtn = () => { $("userbtn").innerHTML = `${icon("user")} ${me.name}`; };
    renderUserBtn();
    const renderThemeBtn = () => { $("themebtn").innerHTML = icon(getTheme() === "dark" ? "sun" : "moon"); };
    renderThemeBtn();
    $("themebtn").addEventListener("click", () => { toggleTheme(); renderThemeBtn(); });
    $("helpbtn").addEventListener("click", () => showHelp());

    // Configuraciones modal factory: a dumb view (configModal.ts) driven by the app's real
    // closures — recreating the modeler on viz changes, reloading the folder, persisting the
    // name, syncing the header buttons. Deep-linked by #settings, #folderchip, #userbtn, and
    // the IA menu's "Administrar presets".
    function openConfigModal(section: ConfigSection): void {
      if (!api) return;
      showConfigModal({
        api,
        userName: getName(),
        onNameChange: (n) => { me = { name: n, email: n }; renderUserBtn(); }, // setName already done in configModal.ts
        folderLabel,
        onChangeFolder: changeFolder, // the modal closes itself first (reload re-renders the DOM)
        onThemeChange: () => { renderThemeBtn(); },
        onVizChange: applyVizSettings,
        onAutosaveChange: (on) => { render(); if (on) scheduleDraftSave(); }, // mirrors #autosave-toggle
        fetchLatestBpmnJs,
        hasLauncher: hasTermApi(),
        onClose: refreshQuickLaunch, // presets may have changed in Config->IA; ▶ could be stale
        onError,
        initialSection: section,
      });
    }

    // Unified IA entry point (always visible): operational-only anchored menu — choose a
    // preset and launch it, or open a terminal in the folder (both Electron-only, gated on
    // hasTermApi()); "Administrar presets" deep-links to Configuraciones -> IA, where preset
    // CRUD + personal instructions + the AGENTS.md viewer live. Toggle idiom mirrors #userbtn's.
    document.getElementById("ai-config")?.addEventListener("click", () => {
      const group = document.getElementById("ai-config")!.closest(".ia-group") as HTMLElement;
      const existing = group.querySelector(".menu-pop");
      if (existing) { existing.remove(); return; } // toggle closed
      const pop = document.createElement("div");
      pop.className = "menu-pop";
      // Dismiss on outside click or Escape (deferred attach so the opening click
      // doesn't immediately close it — mirrors ideaElementPopover.ts's idiom).
      function closePop(): void {
        document.removeEventListener("mousedown", onOutside, true);
        document.removeEventListener("keydown", onKey, true);
        pop.remove();
      }
      function onOutside(e: MouseEvent): void {
        if (!group.contains(e.target as Node)) closePop();
      }
      function onKey(e: KeyboardEvent): void {
        if (e.key === "Escape") closePop();
      }
      setTimeout(() => {
        document.addEventListener("mousedown", onOutside, true);
        document.addEventListener("keydown", onKey, true);
      }, 0);
      pop.appendChild(buildAiMenu({
        hasLauncher: hasTermApi(),
        getPresets,
        getLastPresetId,
        setLastPresetId,
        // refreshQuickLaunch (hoisted `function` below) keeps ▶'s title in sync with
        // whichever preset was just launched from this menu; .finally preserves the
        // promise's rejection so the menu's own .catch(onError) still fires.
        launch: (cmd) => openExternalTerminal(cmd).finally(() => refreshQuickLaunch()),
        onManagePresets: () => { closePop(); openConfigModal("ia"); },
        onError,
      }));
      group.appendChild(pop);
    });

    function refreshQuickLaunch(): void {
      const q = document.getElementById("ai-quicklaunch") as HTMLButtonElement | null;
      if (!q) return;
      const presets = getPresets();
      const last = getLastPresetId();
      const target = presets.find((p) => p.id === last) ?? presets[0];
      // Hidden on web (no launcher) or when there is no preset to launch.
      q.hidden = !hasTermApi() || !target;
      q.title = target ? `Lanzar: ${target.label}` : "Sin presets";
    }
    document.getElementById("ai-quicklaunch")?.addEventListener("click", () => {
      const presets = getPresets();
      const last = getLastPresetId();
      const target = presets.find((p) => p.id === last) ?? presets[0];
      if (target) { setLastPresetId(target.id); void openExternalTerminal(target.command).catch(onError); }
    });
    refreshQuickLaunch();

    // No file open: intercept the first interaction with the canvas and explain
    // that a diagram must be selected/created before editing.
    let noFileModalOpen = false;
    $("canvas").addEventListener("pointerdown", (e) => {
      if (state.kind === "editing") return;
      e.preventDefault();
      e.stopPropagation();
      if (noFileModalOpen) return;
      noFileModalOpen = true;
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
      overlay.innerHTML = `
        <div class="gate-card">
          <div class="gate-icon">${icon("folder")}</div>
          <h2>No hay ningún archivo abierto</h2>
          <p>Seleccioná un diagrama de la lista o creá uno nuevo para empezar a editar.</p>
          <div class="gate-actions">
            <button class="btn" id="nf-ok" type="button">Entendido</button>
            <button class="btn primary" id="nf-new" type="button">Nuevo diagrama</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const close = () => { overlay.remove(); noFileModalOpen = false; };
      overlay.querySelector("#nf-ok")!.addEventListener("click", close);
      overlay.addEventListener("mousedown", (ev) => { if (ev.target === overlay) close(); });
      overlay.querySelector("#nf-new")!.addEventListener("click", () => { close(); void newDiagram().catch(onError); });
    }, true);

    $("userbtn").addEventListener("click", () => openConfigModal("generales"));

    $("newfile").addEventListener("click", guard(newDiagram));
    // ---- inspector tabs + collapsible side panels (independent, persisted) ----
    const collKey = (id: string): string => `bpmn-compartida.collapse.${id}`;
    const getColl = (id: string, def: boolean): boolean => {
      try { const v = localStorage.getItem(collKey(id)); return v === null ? def : v === "1"; } catch { return def; }
    };
    const setColl = (id: string, on: boolean): void => {
      try { localStorage.setItem(collKey(id), on ? "1" : "0"); } catch { /* ignore */ }
    };
    const reflectInspectorToggle = (): void => {
      const vis = inspector.isVisible();
      $("toggle-inspector").classList.toggle("active", vis);
      $("toggle-inspector").title = vis ? "Ocultar panel lateral" : "Mostrar panel lateral";
      setColl("inspector", !vis);
    };
    $("toggle-inspector").addEventListener("click", () => {
      if (inspector.isVisible()) inspector.hide();
      else { inspector.setTab(inspector.activeTab() ?? "capas"); renderLayers(); void renderFuentes(); void renderDatos(); }
      reflectInspectorToggle();
    });
    const setFilesCollapsed = (on: boolean): void => {
      document.getElementById("files")!.classList.toggle("collapsed", on);
      $("toggle-files").classList.toggle("active", !on);
      $("toggle-files").title = on ? "Mostrar panel de archivos" : "Ocultar panel de archivos";
      setColl("files", on);
    };
    $("toggle-files").addEventListener("click", () =>
      setFilesCollapsed(!document.getElementById("files")!.classList.contains("collapsed")),
    );
    // Apply persisted state: files default expanded, inspector default collapsed.
    setFilesCollapsed(getColl("files", false));
    if (!getColl("inspector", true)) { inspector.setTab(inspector.activeTab() ?? "capas"); renderLayers(); void renderFuentes(); void renderDatos(); }
    else inspector.hide();
    reflectInspectorToggle();
    $("settings").addEventListener("click", () => openConfigModal("visualizacion"));
    $("more").addEventListener("click", () => { const p = document.getElementById("morepop"); if (p) p.hidden = !p.hidden; });
    $("exportSvg").addEventListener("click", guard(async () => {
      if (state.kind === "editing") await exportSvg(modeler, baseName(state.fileId));
    }));
    $("exportPng").addEventListener("click", guard(async () => {
      if (state.kind === "editing") await exportPng(modeler, baseName(state.fileId));
    }));

    function manualDeps(): import("./processDocs/manualController").ManualDeps {
      return {
        graph: () => graphFromModeler(modeler),
        processName: () => docsFileId.replace(/\.bpmn$/i, "").split("/").pop() ?? docsFileId,
        readProcessNote: () => docsClient.readProcessNote(docsFileId),
        readNote: (id) => docsClient.readNote(docsFileId, id),
        readAsset: (name) => docsClient.readAsset(docsFileId, name),
      };
    }

    function downloadHtml(filename: string, html: string): void {
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function showManualModal(renderedHtml: string): void {
      const overlay = document.createElement("div");
      overlay.className = "manual-overlay";

      const box = document.createElement("div");
      box.className = "manual-box";
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-modal", "true");
      box.setAttribute("aria-label", "Manual del proceso");

      const head = document.createElement("div");
      head.className = "manual-head";

      const printBtn = document.createElement("button");
      printBtn.className = "btn";
      printBtn.type = "button";
      printBtn.textContent = "Imprimir";

      const exportBtn = document.createElement("button");
      exportBtn.className = "btn";
      exportBtn.type = "button";
      exportBtn.textContent = "Exportar HTML";

      const closeBtn = document.createElement("button");
      closeBtn.className = "btn icon-only";
      closeBtn.type = "button";
      closeBtn.title = "Cerrar";
      closeBtn.innerHTML = icon("close"); // icon() returns trusted SVG literals from icons.ts

      head.appendChild(printBtn);
      head.appendChild(exportBtn);
      head.appendChild(closeBtn);

      const body = document.createElement("div");
      body.className = "manual-body markdown-body";
      // renderedHtml is the output of renderMarkdown(), which passes through
      // DOMPurify.sanitize() before being returned — safe to assign as innerHTML.
      body.innerHTML = renderedHtml;

      box.appendChild(head);
      box.appendChild(body);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      const close = (): void => {
        overlay.remove();
        document.removeEventListener("keydown", onKey);
      };
      function onKey(e: KeyboardEvent): void { if (e.key === "Escape") close(); }
      closeBtn.addEventListener("click", close);
      overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
      document.addEventListener("keydown", onKey);

      exportBtn.addEventListener("click", () => {
        void (async () => {
          const exportedHtml = await exportManualHtml(manualDeps());
          const name = (docsFileId.replace(/\.bpmn$/i, "").split("/").pop() ?? "manual") + "-manual.html";
          downloadHtml(name, exportedHtml);
        })().catch(onError);
      });

      printBtn.addEventListener("click", () => {
        void (async () => {
          const printHtml = await exportManualHtml(manualDeps());
          // Load via Blob URL into a new window — avoids document.write() and is
          // safe in both browser and Electron renderer. The standalone HTML is
          // self-contained (inlined images, no external deps), so the new window
          // can print without network access.
          const blob = new Blob([printHtml], { type: "text/html" });
          const url = URL.createObjectURL(blob);
          const win = window.open(url, "_blank");
          if (!win) { showToast("El navegador bloqueó la ventana emergente"); URL.revokeObjectURL(url); return; }
          // Revoke after a delay to give the browser time to load the blob.
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        })().catch(onError);
      });
    }

    $("manual").addEventListener("click", () => void (async () => {
      if (!docsFileId) { showToast("Abrí un diagrama primero"); return; }
      const { html } = await buildManual(manualDeps());
      showManualModal(html);
    })().catch(onError));
    $("undo").addEventListener("click", () => void (activePane() === "master" ? doUndoMaster() : doUndo()).catch(onError));
    $("redo").addEventListener("click", () => void (activePane() === "master" ? doRedoMaster() : doRedo()).catch(onError));
    // Primary "Auto-organizar" now runs elk (high quality); bpmn-auto-layout is a backup.
    $("autolayout").addEventListener("click", () => void doAutoLayout("elk").catch(onError));
    // "Opciones de organización" dropdown: reorganize-selection + backup engine.
    const elkPop = document.getElementById("autolayout-pop") as HTMLElement | null;
    function popItem(label: string, onClick: () => void): HTMLButtonElement {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => { if (elkPop) elkPop.hidden = true; onClick(); });
      return b;
    }
    function renderElkPop(): void {
      if (!elkPop) return;
      elkPop.innerHTML = "";
      elkPop.appendChild(popItem("Reorganizar solo la selección", () => void reorganizeSelection().catch(onError)));
      const sep = document.createElement("div"); sep.className = "menu-sep"; elkPop.appendChild(sep);
      elkPop.appendChild(popItem("Modo rápido (backup)", () => void doAutoLayout("auto").catch(onError)));
    }
    $("autolayout-caret").addEventListener("click", (e) => {
      e.stopPropagation();
      if (!elkPop) return;
      if (elkPop.hidden) { renderElkPop(); elkPop.hidden = false; } else { elkPop.hidden = true; }
    });
    document.addEventListener("click", (e) => {
      if (elkPop && !elkPop.hidden && !document.getElementById("autolayout-menu")?.contains(e.target as Node)) elkPop.hidden = true;
    });
    $("save").addEventListener("click", guard(async () => {
      if (activePane() === "master") { void publishMaster().catch(onError); return; }
      if (state.kind === "editing") await publish(state.fileId);
    }));
    // Local group: manual draft save + autosave on/off toggle. Targets the active pane.
    $("savedraft").addEventListener("click", guard(async () => {
      if (activePane() === "master") {
        await flushMasterDraft();
        masterDraftPending = false;
        render();
        showToast("Guardado local");
        return;
      }
      if (state.kind !== "editing") return;
      await flushDraft();
      render();
      showToast("Guardado local");
    }));
    $("autosave-toggle").addEventListener("click", () => {
      const on = !getAutosave();
      setAutosave(on);
      render();
      if (on) scheduleDraftSave(); // catch up any pending edits right away
    });
    // Reserva control: free → reservar (con duración); mine → liberar; theirs → solicitar turno.
    $("editmode").addEventListener("click", guard(async () => {
      if (state.kind !== "editing") return;
      if (state.lock === "mine") await releaseReserve(state.fileId);
      else if (state.lock === "theirs") await requestEdit(state.fileId, "edit");
      else await reserve(state.fileId);
    }));
    $("close").addEventListener("click", guard(async () => {
      if (state.kind === "editing") await closeFile(state.fileId);
    }));
    // Best-effort: drop our reservation if the window closes while we hold it. The
    // draft is already persisted by the debounced autosave (getXml is async, so it
    // cannot be snapshotted synchronously here).
    window.addEventListener("beforeunload", () => {
      if (state.kind === "editing" && state.lock === "mine") { void api.setLock(state.fileId, clearProps()).catch(() => {}); }
    });

    // Fast-switch: press "d" to blink between mine/theirs while a diff is shown.
    window.addEventListener("keydown", (ev) => {
      if (ev.key.toLowerCase() !== "d" || !diffView.isActive()) return;
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      void diffView.toggle().then((showing) =>
        showToast(showing === "mine" ? "Mostrando tu versión" : "Mostrando la versión externa"),
      );
    });

    // Only Ctrl/Cmd+S (save) is app-owned; undo/redo/copy/paste/tools/etc. are
    // handled natively by bpmn-js' keyboard (bound in createBpmnModeler), so we
    // must NOT also handle them here or they'd fire twice.
    window.addEventListener("keydown", (ev) => {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (!(ev.ctrlKey || ev.metaKey)) return;
      if (ev.key.toLowerCase() === "s") {
        ev.preventDefault();
        if (activePane() === "master") { void publishMaster().catch(onError); return; }
        if (state.kind === "editing") void publish(state.fileId).catch(onError);
      }
    });

    // Coarse undo/redo fallback for history-restore. bpmn-js handles Ctrl+Z/Y natively
    // while its command stack has entries; this CAPTURE-phase listener only steps in
    // when the native stack is exhausted AND a snapshot exists — pre-empting (and
    // stopping) the native keyboard so there's no double-fire. When the native stack
    // can still act, we don't touch the event and it flows to bpmn-js as usual.
    window.addEventListener("keydown", (ev) => {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (!(ev.ctrlKey || ev.metaKey)) return;
      const k = ev.key.toLowerCase();
      const isRedo = k === "y" || (k === "z" && ev.shiftKey);
      const isUndo = k === "z" && !ev.shiftKey;
      // Route by the active pane; each pane falls back to ITS coarse stack only once
      // its own native stack is exhausted (native Ctrl+Z reaches the focused canvas).
      if (activePane() === "master") {
        if (isUndo && !canNativeUndoMaster() && masterCoarseUndo.length) {
          ev.preventDefault(); ev.stopPropagation(); void doUndoMaster().catch(onError);
        } else if (isRedo && !canNativeRedoMaster() && masterCoarseRedo.length) {
          ev.preventDefault(); ev.stopPropagation(); void doRedoMaster().catch(onError);
        }
        return;
      }
      if (isUndo && !canNativeUndo() && coarseUndo.length) {
        ev.preventDefault(); ev.stopPropagation(); void doUndo().catch(onError);
      } else if (isRedo && !canNativeRedo() && coarseRedo.length) {
        ev.preventDefault(); ev.stopPropagation(); void doRedo().catch(onError);
      }
    }, true);

    dispatch({ type: "signedIn" });
    dispatch({ type: "folderSelected", folderId: "local" });
    await refreshFileList();
    pollTimer = window.setInterval(() => void pollChanges().catch(onError), 7000);
    void maybeShowUpdateBanner();
    // Keep the toolbar on a single row: collapse the lowest-priority groups into "⋯".
    reflowToolbar();
    try { new ResizeObserver(() => reflowToolbar()).observe(document.getElementById("toolbar")!); } catch { /* no RO */ }
  }

  // Single-row toolbar: while it overflows, move the highest-`data-prio` collapsible
  // group into the "⋯" (#morepop); when space frees up, return them to their anchors.
  // Media queries already dropped labels/rótulos first, so this only kicks in when very
  // narrow. Guard against re-entrancy (moving nodes can trigger the ResizeObserver).
  const tgAnchor = new Map<HTMLElement, Comment>();
  const tgDivider = new Map<HTMLElement, HTMLElement>();
  let reflowing = false;
  function reflowToolbar(): void {
    if (reflowing) return;
    reflowing = true;
    try {
      const bar = document.getElementById("toolbar");
      const menu = document.getElementById("moremenu");
      const pop = document.getElementById("morepop");
      if (!bar || !menu || !pop) return;
      // Restore everything to its anchor first (ascending prio → original order).
      for (const g of Array.from(pop.children) as HTMLElement[]) {
        const a = tgAnchor.get(g);
        if (a && a.parentElement) a.parentElement.insertBefore(g, a);
        const d = tgDivider.get(g);
        if (d) d.hidden = false;
      }
      menu.hidden = true;
      pop.hidden = true;
      // Collapse highest-prio first until it fits (or nothing left to collapse).
      let guard = 0;
      while (bar.scrollWidth > bar.clientWidth + 1 && guard++ < 30) {
        // Only groups still DIRECTLY in the toolbar — not ones already inside #morepop
        // (which lives within #toolbar), else we'd re-pick the same group forever.
        const groups = (Array.from(bar.querySelectorAll(":scope > .tgroup[data-prio]")) as HTMLElement[])
          .sort((a, b) => Number(b.dataset.prio || 0) - Number(a.dataset.prio || 0));
        const g = groups[0];
        if (!g) break;
        if (!tgAnchor.has(g)) { const c = document.createComment("tg"); g.parentElement?.insertBefore(c, g); tgAnchor.set(g, c); }
        const prev = g.previousElementSibling as HTMLElement | null;
        if (prev && prev.classList.contains("divider")) { tgDivider.set(g, prev); prev.hidden = true; }
        menu.hidden = false;
        pop.appendChild(g);
      }
      if (pop.children.length === 0) { menu.hidden = true; pop.hidden = true; }
    } finally {
      reflowing = false;
    }
  }

  function dispatch(event: Parameters<typeof reduce>[1]) {
    state = reduce(state, event);
    render();
  }

  // Short "hasta HH:MM" (or "· día HH:MM" for a far expiry) for a reservation.
  function untilLabel(lock: LockInfo): string {
    if (!lock.lockedUntil) return " · permanente";
    const d = new Date(lock.lockedUntil);
    const hhmm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const sameDay = new Date().toDateString() === d.toDateString();
    return sameDay ? ` hasta ${hhmm}` : ` hasta ${d.toLocaleDateString()} ${hhmm}`;
  }

  function render() {
    const st = state.kind === "editing" ? state : null;
    const editing = st !== null;
    const el = (id: string) => document.getElementById(id);
    // In the optimistic model the canvas is ALWAYS editable; `lock` is now the
    // optional advisory "Reserva", not a gate. `unpublished` drives Publicar.
    const mine = st?.lock === "mine";
    const theirs = st?.lock === "theirs";
    const previewing = stageHistory?.isPreviewing() ?? false;
    // Compare is pure visualization — both panes read-only, so editing/publishing is off.
    const compareRO = stageHistory?.isComparing() ?? false;
    const unpublished = st !== null && (st.dirty || hasDraft(folderId, st.fileId));
    // Editable master pane: the toolbar targets whichever pane was last clicked
    // (activePane) — full-screen OR in the split. App state may be "browsing" (master
    // only) while Publicar/Ctrl+S/undo/Guardar act on the master via its own paths.
    const masterActive = activePane() === "master";
    const masterUnpublished = masterActive
      && (!!masterHandle?.isDirty() || (currentMasterFile ? hasDraft(folderId, currentMasterFile) : false));
    // Notorious frame means "you hold a reservation" — suppressed while previewing or
    // comparing, where the indigo preview / teal compare frame takes over instead.
    document.body.classList.toggle("app-editing", mine && !previewing && !compareRO);
    document.body.classList.remove("app-readonly");
    const chip = el("filechip");
    if (chip) {
      if (masterActive && currentMasterFile) {
        // The chip follows the active pane: show the master file + its draft state.
        const draft = masterUnpublished ? "✏️ Borrador sin publicar" : "";
        chip.textContent = [`🗺 ${currentMasterFile}`, draft].filter(Boolean).join(" · ");
        chip.classList.remove("lock-mine", "lock-theirs");
      } else if (st) {
        const who = openLock.lockedByName || openLock.lockedByEmail || "otra persona";
        const reserva = mine ? `🔒 Reservado por vos${untilLabel(openLock)}`
          : theirs ? `🔒 Reservado por ${who}${untilLabel(openLock)}`
          : "";
        const draft = unpublished ? "✏️ Borrador sin publicar" : "";
        chip.textContent = [reserva || st.fileId, draft].filter(Boolean).join(" · ");
        chip.classList.toggle("lock-mine", mine);
        chip.classList.toggle("lock-theirs", theirs);
      } else {
        chip.textContent = "";
        chip.classList.remove("lock-mine", "lock-theirs");
      }
    }
    const em = el("editmode") as HTMLButtonElement | null;
    const cl = el("close");
    if (em) {
      em.hidden = !editing;
      em.classList.remove("primary", "btn-checkin");
      if (mine) { em.textContent = "🔓 Liberar reserva"; em.title = "Soltar tu reserva de este diagrama"; }
      else if (theirs) { em.textContent = "🔔 Solicitar turno"; em.title = "Avisar a quien lo reservó que querés editar/publicar"; }
      else { em.textContent = "🔒 Reservar"; em.title = "Avisar al equipo que estás editando esto (opcional)"; }
    }
    if (cl) (cl as HTMLElement).hidden = !editing;
    if (!editing) {
      if (el("history")) (el("history") as HTMLElement).hidden = true;
      if (el("conflict")) (el("conflict") as HTMLElement).innerHTML = "";
    }
    const saveBtn = document.getElementById("save") as HTMLButtonElement | null;
    // Never publish from a read-only preview / read-only compare (would push an old
    // version). The gate follows the ACTIVE pane — the stage comparing must not block
    // publishing the master, and vice versa.
    if (saveBtn) saveBtn.disabled = masterActive ? !masterUnpublished : (!unpublished || previewing || compareRO);
    const dot = document.getElementById("savedot");
    if (dot) (dot as HTMLElement).hidden = !unpublished && !masterUnpublished;
    const undo = document.getElementById("undo") as HTMLButtonElement | null;
    const redo = document.getElementById("redo") as HTMLButtonElement | null;
    const editable = editing && !previewing && !compareRO;
    if (masterActive) {
      if (undo) undo.disabled = !canNativeUndoMaster() && masterCoarseUndo.length === 0;
      if (redo) redo.disabled = !canNativeRedoMaster() && masterCoarseRedo.length === 0;
    } else {
      if (undo) undo.disabled = !editable || (!canNativeUndo() && coarseUndo.length === 0);
      if (redo) redo.disabled = !editable || (!canNativeRedo() && coarseRedo.length === 0);
    }
    // Auto-organizar works on the stage/plain editor OR the editable master pane.
    const canLayout = editable || masterActive;
    const autolayout = document.getElementById("autolayout") as HTMLButtonElement | null;
    const autolayoutCaret = document.getElementById("autolayout-caret") as HTMLButtonElement | null;
    if (autolayout) autolayout.disabled = !canLayout;
    if (autolayoutCaret) autolayoutCaret.disabled = !canLayout;
    // Local group: autosave toggle state, manual-save availability, saved status.
    const auto = document.getElementById("autosave-toggle") as HTMLButtonElement | null;
    if (auto) {
      const on = getAutosave();
      auto.classList.toggle("active", on);
      auto.setAttribute("aria-checked", on ? "true" : "false");
      auto.title = on ? "Autoguardado del borrador local: activado (clic para desactivar)"
                      : "Autoguardado del borrador local: desactivado (clic para activar)";
    }
    const savedraft = document.getElementById("savedraft") as HTMLButtonElement | null;
    if (savedraft) savedraft.disabled = masterActive ? false : !editable;
    updateLocalStatus();
    reflowToolbar(); // button visibility/label changes may alter the toolbar's width
    armIdle(); // (re)start the inactivity timer when we hold a reservation; clears otherwise
  }

  // Files currently open in an editor pane: the master (top pane, master mode) plus the
  // drilled-in stage (bottom pane), at most two. Display-only — mirrors mastersCache's
  // role for the 🗺 badge, feeding renderTree's "abierto" marker (see fileTree.ts).
  function openPathsNow(): Set<string> {
    const s = new Set<string>();
    if (currentMasterFile) s.add(currentMasterFile);
    if (state.kind === "editing") s.add(state.fileId);
    return s;
  }

  // Renders the file browser for the given tree using whatever `mastersCache` currently
  // holds (may lag one refresh cycle behind while refreshMastersCache is still running —
  // see refreshFileList).
  function renderTree(clean: TreeEntry[]): void {
    const selectedId = state.kind === "editing" ? state.fileId : null;
    renderFileTree(
      document.querySelector<HTMLElement>("#files .files-tree")!,
      clean,
      { expanded, selectedId, me, masters: mastersCache, openPaths: openPathsNow(), collapsedMasters },
      {
        onOpen: (id) => void openFile(id).catch(onError),
        onToggle: (path) => {
          if (mastersCache.has(path)) {
            if (collapsedMasters.has(path)) collapsedMasters.delete(path); else collapsedMasters.add(path);
          } else if (expanded.has(path)) { expanded.delete(path); } else { expanded.add(path); }
          void refreshFileList().catch(onError);
        },
        onNewFile: (parent) => void newDiagramIn(parent).catch(onError),
        onNewFolder: (parent) => void newFolderIn(parent).catch(onError),
        onMenu: (target, anchor) => openItemMenu(target, anchor),
      },
      masterSubs,
    );
  }

  async function refreshFileList() {
    const all = await api.listTree();
    const conflicts = all.filter((e) => e.kind === "file" && isSyncConflict(e.path));
    const clean = all.filter((e) => !(e.kind === "file" && isSyncConflict(e.path)));
    renderSyncWarning(document.getElementById("sync")!, conflicts.map((f) => f.path));
    lastTree = clean;
    folderIndex = null;
    // A.2: keep the process registry in step with the file tree (re-parses only
    // new/changed .bpmn; drops removed). Fire-and-forget — never blocks the UI.
    void registry.sync(
      clean.filter((e) => e.kind === "file" && e.path.endsWith(".bpmn"))
        .map((e) => ({ path: e.path, version: e.version ?? "" })),
    ).then(() => masterHandle?.refreshBadges()).catch(() => { /* registry is best-effort */ });
    renderTree(clean);
    treeVersions = new Map(clean.filter((e) => e.kind === "file" && e.version).map((e) => [e.path, e.version as string]));
    // File-tree 🗺 badges: best-effort, non-blocking — re-render once the (possibly
    // stale) masters cache has been refreshed with any new/changed files.
    void refreshMastersCache(clean).then(() => renderTree(clean)).catch(() => { /* best-effort */ });
  }

  // ---- Local draft autosave (private, per-machine — see draftStore.ts) ----
  // Every edit is captured to localStorage so nothing is lost before "Publicar".
  let draftTimer: number | null = null;
  // Tracks edits not yet written to the local draft (distinct from editor.isDirty(),
  // which is "changed since last load/publish"). Drives the "Local" status label.
  let draftPending = false;
  function scheduleDraftSave(): void {
    if (!getAutosave()) return; // autosave OFF → user saves the draft manually
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => void flushDraft().catch(onError), 800);
  }
  // Write the pending draft immediately (used before switching files / on close, and
  // by the manual "Guardar" button). Runs regardless of the autosave toggle.
  async function flushDraft(): Promise<void> {
    if (draftTimer) { clearTimeout(draftTimer); draftTimer = null; }
    if (state.kind === "editing" && editor.isDirty()) {
      saveDraft(folderId, state.fileId, await editor.getXml());
      draftPending = false;
      updateLocalStatus();
    }
  }
  // Refresh the small "Local" section status: ✓ Guardado local vs ● Sin guardar.
  // Follows the active pane (master or stage).
  function updateLocalStatus(): void {
    const s = document.getElementById("localstatus");
    if (!s) return;
    if (activePane() === "master") {
      s.textContent = masterDraftPending ? "● Sin guardar" : "✓ Guardado local";
      s.classList.toggle("dirty", masterDraftPending);
      return;
    }
    if (state.kind !== "editing") { s.textContent = ""; s.classList.remove("dirty"); return; }
    s.textContent = draftPending ? "● Sin guardar" : "✓ Guardado local";
    s.classList.toggle("dirty", draftPending);
  }

  // ---- Editable master pane: focus tracking + its own local-draft autosave + publish ----
  // Two editable modelers can be alive at once (master top pane + stage bottom pane). The
  // "focused" pane owns docsFileId and is the target of the toolbar. openStage() flips
  // focus to the stage; a pointerdown in either pane flips it (onFocus / focusStagePane).
  // Which pane the toolbar targets (Publicar/Ctrl+S, undo/redo, Guardar local,
  // Auto-organizar, filechip): the last-clicked one. With no master open it's always
  // the stage/plain editor.
  function activePane(): "master" | "stage" {
    return masterPaneFocused && currentMasterFile ? "master" : "stage";
  }
  // The master pane became the active editor: docsFileId + the toolbar target it. Unlike
  // the pre-dual-history behavior, this also applies while a stage is open (split view).
  function focusMasterPane(): void {
    if (!currentMasterFile) return;
    masterPaneFocused = true;
    void loadDocsSidecarsForFocus(currentMasterFile).catch(onError);
    render();
  }
  // Clicking into the stage pane flips the toolbar target back to the stage.
  function focusStagePane(): void {
    if (!masterPaneFocused) return;
    masterPaneFocused = false;
    if (state.kind === "editing") void loadDocsSidecarsForFocus(state.fileId).catch(onError);
    render();
  }
  // Point the docs/fuentes/datos panels at the focused file WITHOUT reloading the editor.
  async function loadDocsSidecarsForFocus(fileId: string): Promise<void> {
    docsFileId = fileId;
    await docsController?.refresh();
    void renderFuentes();
    void renderDatos();
  }
  function scheduleMasterDraftSave(): void {
    if (!getAutosave() || !masterHandle || !currentMasterFile) return;
    if (masterDraftTimer) clearTimeout(masterDraftTimer);
    masterDraftTimer = window.setTimeout(() => {
      void (async () => {
        if (masterHandle && currentMasterFile && masterHandle.isDirty()) {
          saveDraft(folderId, currentMasterFile, await masterHandle.getXml());
          masterDraftPending = false;
          updateLocalStatus();
        }
      })().catch(onError);
    }, 800);
  }
  async function flushMasterDraft(): Promise<void> {
    if (masterDraftTimer) { clearTimeout(masterDraftTimer); masterDraftTimer = null; }
    if (masterHandle && currentMasterFile && masterHandle.isDirty()) {
      saveDraft(folderId, currentMasterFile, await masterHandle.getXml());
      masterDraftPending = false;
      updateLocalStatus();
    }
  }
  // Publish the master pane's live edits. Mirrors save() (conflict guard + putXml + prune),
  // but reads from the master editor and re-syncs the registry/badges afterward.
  async function publishMaster(): Promise<void> {
    const fileId = currentMasterFile;
    if (!fileId || !masterHandle) return;
    if (masterHeadRevisionId !== null) {
      const meta = await api.getMeta(fileId);
      if (meta && meta.headRevisionId !== masterHeadRevisionId) { showToast("El mapa cambió en el equipo — reabrilo para integrar"); return; }
    }
    const xml = await masterHandle.getXml();
    const res = await api.putXml(fileId, xml, me.name);
    masterHeadRevisionId = res.headRevisionId ?? masterHeadRevisionId;
    masterHandle.markSaved();
    clearDraft(folderId, fileId);
    // Refresh the stage's history section (the master gets its own controller in the
    // dual-history phases — until then, publishing the master no longer clobbers it).
    await stageHistory?.loadHistory();
    // Re-sync registry so badges/masters reflect any new/removed links.
    await registry.sync(lastTree.filter((e) => e.kind === "file" && e.path.endsWith(".bpmn")).map((e) => ({ path: e.path, version: e.version ?? "" })));
    masterHandle.refreshBadges();
    render();
    showToast("Mapa publicado");
  }

  // ---- Coarse (snapshot) undo/redo, layered ON TOP of bpmn-js' native CommandStack ----
  // A history-restore replaces the whole diagram via importXML, which wipes the native
  // command stack — so restoring can't be undone natively. We keep XML snapshots of the
  // pre-restore working version here; native undo/redo handles the fine edits, and once
  // it's exhausted this layer reverts the restore itself. Scoped per open file.
  const coarseUndo: string[] = [];
  const coarseRedo: string[] = [];
  const canNativeUndo = (): boolean => { try { return !!modeler.get("commandStack").canUndo(); } catch { return false; } };
  const canNativeRedo = (): boolean => { try { return !!modeler.get("commandStack").canRedo(); } catch { return false; } };
  // Load a snapshot back into the editable canvas and persist it as the local draft.
  async function applyCoarseSnapshot(snap: string): Promise<void> {
    await loadIntoEditor(snap);
    editor.setReadOnly(false);
    if (state.kind === "editing") saveDraft(folderId, state.fileId, snap);
    draftPending = false;
    dispatch({ type: "dirtyChanged", dirty: true });
    updateLocalStatus();
    render();
  }
  async function doUndo(): Promise<void> {
    if (state.kind !== "editing" || (stageHistory?.isBusy() ?? false)) return;
    if (canNativeUndo()) { try { modeler.get("commandStack").undo(); } catch { /* noop */ } return; }
    if (!coarseUndo.length) return;
    coarseRedo.push(await editor.getXml());
    await applyCoarseSnapshot(coarseUndo.pop() as string);
    showToast("Se deshizo la restauración");
  }
  async function doRedo(): Promise<void> {
    if (state.kind !== "editing" || (stageHistory?.isBusy() ?? false)) return;
    if (canNativeRedo()) { try { modeler.get("commandStack").redo(); } catch { /* noop */ } return; }
    if (!coarseRedo.length) return;
    coarseUndo.push(await editor.getXml());
    await applyCoarseSnapshot(coarseRedo.pop() as string);
    showToast("Se rehizo la restauración");
  }
  // Auto-organizar (D): re-lay the current diagram. Two engines — "elk" (elkjs, the primary,
  // high quality, handles pools/lanes + preserves colors/groups) and "auto" (bpmn-auto-layout,
  // a fast backup). importXML wipes the native command stack, so — like a history-restore —
  // we make it a coarse-undo snapshot: Ctrl+Z / the Deshacer button revert the whole re-layout.
  type LayoutEngine = "auto" | "elk";
  const runLayout = (engine: LayoutEngine, xml: string): Promise<string> =>
    engine === "elk" ? layoutDiagramElk(xml) : layoutDiagram(xml);
  function toastLayoutError(e: unknown, engine: LayoutEngine): void {
    if (e instanceof UnsupportedLayoutError) {
      // Only the "auto" backup refuses pools now; elk handles them.
      showToast(engine === "auto"
        ? "El modo rápido no soporta carriles (pools) — usá Auto-organizar (alta calidad)"
        : "No se pudo reorganizar el diagrama");
    } else {
      showToast("No se pudo reorganizar el diagrama");
    }
  }
  async function doAutoLayout(engine: LayoutEngine): Promise<void> {
    // The editable master pane is a separate modeler — route there when it's the active one.
    if (activePane() === "master") { await doAutoLayoutMaster(engine); return; }
    if (state.kind !== "editing" || (stageHistory?.isBusy() ?? false)) return;
    const fileId = state.fileId;
    const current = await editor.getXml();
    let laidOut: string;
    try {
      laidOut = await runLayout(engine, current);
    } catch (e) {
      toastLayoutError(e, engine);
      return;
    }
    coarseUndo.push(current);
    coarseRedo.length = 0;
    await loadIntoEditor(laidOut);
    editor.setReadOnly(false);
    saveDraft(folderId, fileId, laidOut);
    draftPending = false;
    dispatch({ type: "dirtyChanged", dirty: true });
    updateLocalStatus();
    render();
    showToast(engine === "auto" ? "Diagrama reorganizado (modo rápido) · Ctrl+Z para deshacer" : "Diagrama reorganizado · Ctrl+Z para deshacer");
  }
  // ---- Master-pane coarse undo/redo: same snapshot layer as the stage's, on the master's
  // own modeler. Covers auto-organize, history-restore and copy-from-history (all wipe the
  // master's native command stack via importXML). ----
  const masterCoarseUndo: string[] = [];
  const masterCoarseRedo: string[] = [];
  const canNativeUndoMaster = (): boolean => { try { return !!masterHandle?.modeler.get("commandStack").canUndo(); } catch { return false; } };
  const canNativeRedoMaster = (): boolean => { try { return !!masterHandle?.modeler.get("commandStack").canRedo(); } catch { return false; } };
  async function applyCoarseSnapshotMaster(snap: string): Promise<void> {
    if (!masterHandle || !currentMasterFile) return;
    await masterHandle.load(snap); // reparses links + badges
    masterHandle.setReadOnly(false);
    saveDraft(folderId, currentMasterFile, snap);
    masterDraftPending = false;
    render();
  }
  async function doUndoMaster(): Promise<void> {
    if (!masterHandle || !currentMasterFile) return;
    if (canNativeUndoMaster()) { try { masterHandle.modeler.get("commandStack").undo(); } catch { /* noop */ } return; }
    if (!masterCoarseUndo.length) return;
    masterCoarseRedo.push(await masterHandle.getXml());
    await applyCoarseSnapshotMaster(masterCoarseUndo.pop() as string);
    showToast("Se deshizo el cambio del mapa");
  }
  async function doRedoMaster(): Promise<void> {
    if (!masterHandle || !currentMasterFile) return;
    if (canNativeRedoMaster()) { try { masterHandle.modeler.get("commandStack").redo(); } catch { /* noop */ } return; }
    if (!masterCoarseRedo.length) return;
    masterCoarseUndo.push(await masterHandle.getXml());
    await applyCoarseSnapshotMaster(masterCoarseRedo.pop() as string);
    showToast("Se rehizo el cambio del mapa");
  }
  async function doAutoLayoutMaster(engine: LayoutEngine): Promise<void> {
    if (!masterHandle || !currentMasterFile) return;
    const current = await masterHandle.getXml();
    let laidOut: string;
    try {
      laidOut = await runLayout(engine, current);
    } catch (e) {
      toastLayoutError(e, engine);
      return;
    }
    masterCoarseUndo.push(current);
    masterCoarseRedo.length = 0;
    await masterHandle.load(laidOut);
    masterPaneFocused = true;
    saveDraft(folderId, currentMasterFile, laidOut);
    scheduleMasterDraftSave();
    render();
    showToast(engine === "auto" ? "Mapa reorganizado (modo rápido) · Ctrl+Z para deshacer" : "Mapa reorganizado · Ctrl+Z para deshacer");
  }

  // "Reorganizar solo la selección": elk-layout the selected shapes + the edges among them,
  // then move only those (native + undoable) into the region they occupied — the rest of the
  // diagram (colors, groups, other nodes) is untouched.
  async function reorganizeSelection(): Promise<void> {
    if (state.kind !== "editing" || (stageHistory?.isBusy() ?? false)) return;
    let selection: any, registry: any, modeling: any;
    try {
      selection = modeler.get("selection").get();
      registry = modeler.get("elementRegistry");
      modeling = modeler.get("modeling");
    } catch { return; }
    const shapes = (selection ?? []).filter((el: any) => el.width && !el.waypoints && !el.labelTarget && !el.attachedToRef);
    if (shapes.length < 2) { showToast("Seleccioná al menos 2 elementos para reorganizar"); return; }
    const ids = new Set(shapes.map((s: any) => s.id));
    const edges = registry.filter((el: any) => el.waypoints && el.source && el.target && ids.has(el.source.id) && ids.has(el.target.id));
    const pos = await layoutSubgraphElk(
      shapes.map((s: any) => ({ id: s.id, width: s.width, height: s.height })),
      edges.map((e: any) => ({ id: e.id, source: e.source.id, target: e.target.id })),
    );
    // elk lays the subgraph out in 2-D, oblivious to swimlanes, so applying its Y would yank
    // each node into whatever lane its flow-layer landed in — scattering a laned diagram (the
    // "desordena los swimlanes" bug). When the diagram has lanes, keep every node's Y (its lane
    // band) and apply ONLY elk's horizontal reordering — the same hybrid rule the full
    // auto-layout uses (preserve Y, reorganize X by flow).
    const hasLanes = registry.filter((el: any) => el.type === "bpmn:Lane").length > 0;
    const minX0 = Math.min(...shapes.map((s: any) => s.x));
    const minY0 = Math.min(...shapes.map((s: any) => s.y));
    for (const s of shapes) {
      const p = pos.get(s.id);
      if (!p) continue;
      const dx = (minX0 + p.x) - s.x, dy = hasLanes ? 0 : (minY0 + p.y) - s.y;
      if (dx || dy) modeling.moveElements([s], { x: Math.round(dx), y: Math.round(dy) });
    }
    render();
    showToast("Selección reorganizada · Ctrl+Z para deshacer");
  }

  // The advisory reservation, considering expiry: an expired reservation is free.
  function effectiveLock(lock: LockInfo): LockState {
    return isExpired(lock, Date.now()) ? "free" : lockState(lock, me);
  }

  // Release the reservation we hold on the currently-open file (used when switching
  // files). Advisory only — never publishes; the draft stays local.
  async function releaseReserveIfMine(): Promise<void> {
    if (state.kind === "editing" && state.lock === "mine") {
      try { await api.setLock(state.fileId, clearProps()); } catch { /* best-effort */ }
    }
  }

  // ---- A.2 master mode helpers ----
  // A diagram is a "master" iff it has at least one call activity WITH a calledElement
  // (i.e. it links out to a subprocess). Plain diagrams have none → never enter master
  // mode → behave exactly as before.
  async function xmlIsMaster(xml: string): Promise<boolean> {
    try {
      const els = await parseCallLinks(xml);
      return callLinksFromEls(els).length >= 1;
    } catch {
      return false; // unparsable → treat as a normal file, don't regress
    }
  }

  const shortName = (id: string) => baseName(id).split("/").pop() ?? id;

  function renderBreadcrumb(stageName: string | null): void {
    const bar = document.getElementById("master-bar");
    if (!bar) return;
    const master = currentMasterFile ? shortName(currentMasterFile) : "";
    bar.innerHTML = "";
    const crumb = document.createElement("span");
    crumb.className = "master-crumb";
    crumb.textContent = stageName ? `Mapa: ${master} ▸ ${stageName}` : `Mapa: ${master}`;
    bar.append(crumb);
    // When a stage is open, offer to return to the full-screen master. The map itself is
    // now directly editable in place — no "Editar el mapa" round-trip needed anymore.
    if (stageName) {
      const back = document.createElement("button");
      back.className = "btn"; back.type = "button"; back.textContent = "Cerrar subproceso";
      back.title = "Volver al mapa a pantalla completa";
      back.addEventListener("click", () => closeStage());
      bar.append(back);
    }
    (bar as HTMLElement).hidden = false;
  }

  // Return to the full-screen editable master: hide the stage editor (via master-no-stage),
  // drop the stage overlays + current-stage highlight, and refocus the master pane. The
  // stage editor content is left mounted but hidden — reopening a stage reloads it.
  function closeStage(): void {
    stageOverlaysHandle?.clear(); stageOverlaysHandle = null;
    showStageHint(true); // hides #canvas, shows the hint, hides the split divider
    masterHandle?.setCurrentStage(null);
    renderBreadcrumb(null);
    focusMasterPane();
    renderTree(lastTree); // the drilled stage is no longer open — drop its "abierto" marker
  }

  // Toggle the "Doble-clic en una etapa para abrirla" floating hint pill that overlays
  // the master map while a master is open but no stage has been picked yet.
  function showStageHint(show: boolean): void {
    const hint = document.getElementById("stage-hint");
    if (hint) (hint as HTMLElement).hidden = !show;
    document.body.classList.toggle("master-no-stage", show);
    const split = document.getElementById("master-split-resizer");
    if (split) (split as HTMLElement).hidden = show || !document.body.classList.contains("master-mode");
  }

  async function enterMasterMode(fileId: string, masterXml: string): Promise<void> {
    currentMasterFile = fileId;
    masterCoarseUndo.length = 0; // coarse undo is per-master-open
    masterCoarseRedo.length = 0;
    masterDraftPending = false;
    // Same external-baseline capture as openFile — master maps can be AI-generated too.
    void api.snapshotExternal(fileId, me.name).catch(() => { /* best-effort */ });
    try { masterHeadRevisionId = (await api.getMeta(fileId))?.headRevisionId ?? null; }
    catch { masterHeadRevisionId = null; }
    closeLinkPopover();
    document.body.classList.add("master-mode");
    (document.getElementById("master-wrap") as HTMLElement | null)?.removeAttribute("hidden");
    const mc = document.getElementById("master-canvas") as HTMLElement | null;
    (document.getElementById("map-offer") as HTMLElement | null)?.setAttribute("hidden", "");
    renderBreadcrumb(null);
    showStageHint(true);
    if (masterHandle) { try { masterHandle.destroy(); } catch { /* gone */ } masterHandle = null; }
    masterNodeNames = new Map();
    masterNodeTypes = new Map();
    try {
      const els = await parseCallLinks(masterXml); // RawEl[] carry id + name + type
      for (const el of els) { masterNodeNames.set(el.id, el.name ?? ""); masterNodeTypes.set(el.id, el.type ?? ""); }
    } catch { /* names are best-effort */ }
    if (mc) {
      mc.innerHTML = "";
      masterHandle = await mountMasterPane(mc, {
        registry, openStage, onError, onElementClick: onMasterElementClick,
        onDrill: (info) => { const entry = registry.resolve(info.calledElement); if (entry) void openStage(entry.file).catch(onError); },
        onDirty: (d) => {
          masterPaneFocused = true;
          if (d) { masterCoarseRedo.length = 0; masterDraftPending = true; } // a fresh edit branches history
          scheduleMasterDraftSave();
          render();
        },
        onFocus: () => { focusMasterPane(); },
        resolveDestinationName: (id) => masterNodeNames.get(id) ?? "",
      });
      await masterHandle.load(masterXml);
      // Resume a private unpublished draft of the master, if one exists.
      if (hasDraft(folderId, fileId)) { try { await masterHandle.load(loadDraft(folderId, fileId) ?? masterXml); } catch { /* keep shared */ } }
      focusMasterPane();
    }
    // The map itself is not edited — leave "editing" until a stage is chosen below.
    dispatch({ type: "closedFile" });
    updateNavToggle();
    renderTree(lastTree); // the master file is now open — show its "abierto" marker
  }

  function exitMasterMode(): void {
    if (!document.body.classList.contains("master-mode") && !masterHandle) return;
    void flushMasterDraft().catch(() => {});
    if (masterDraftTimer) { clearTimeout(masterDraftTimer); masterDraftTimer = null; }
    masterPaneFocused = false;
    closeLinkPopover();
    if (masterHandle) { try { masterHandle.destroy(); } catch { /* gone */ } masterHandle = null; }
    stageOverlaysHandle?.clear(); stageOverlaysHandle = null;
    masterNodeNames = new Map(); masterNodeTypes = new Map();
    currentMasterFile = null;
    masterHeadRevisionId = null;
    masterCoarseUndo.length = 0;
    masterCoarseRedo.length = 0;
    masterDraftPending = false;
    document.body.classList.remove("master-mode");
    showStageHint(false);
    (document.getElementById("master-wrap") as HTMLElement | null)?.setAttribute("hidden", "");
    const mc = document.getElementById("master-canvas") as HTMLElement | null;
    if (mc) mc.innerHTML = "";
    const split = document.getElementById("master-split-resizer");
    if (split) (split as HTMLElement).hidden = true;
    const bar = document.getElementById("master-bar") as HTMLElement | null;
    if (bar) { bar.hidden = true; bar.innerHTML = ""; }
    updateNavToggle();
    renderTree(lastTree); // no master/stage open anymore — clear "abierto" markers
  }

  // Shared overlay host for the stage "◀ viene de / ▶ va a" pills (diagram-js overlays on
  // the bottom editor). Wiped by every importXML, so pills are (re)mounted per open.
  function navPillHost(): { add(id: string, html: HTMLElement): string; remove(id: string): void } {
    const overlays = modeler.get("overlays") as { add(id: string, o: any): string; remove(id: string): void };
    return {
      add: (elId: string, html: HTMLElement) => overlays.add(elId, { position: { top: -12, left: 0 }, html }),
      remove: (id: string) => overlays.remove(id),
    };
  }

  // Act on a pill's resolved navigation intent. "open" jumps to the target stage (drill
  // inside the split when a master pane is up; otherwise open it standalone). "highlight"
  // focuses the referencing master and marks the plain element there (entering the map first
  // if the stage was opened standalone). This is what makes the pills real links (bug #2).
  function actOnNavIntent(intent: NavIntent, masterFile: string): void {
    if (intent.kind === "none") return;
    if (intent.kind === "open") {
      if (masterHandle) void openStage(intent.file).catch(onError);
      else void openFile(intent.file).catch(onError);
      return;
    }
    if (masterHandle) { masterHandle.highlightElement(intent.masterElementId); return; }
    void (async () => {
      await enterMasterMode(masterFile, await api.getXml(masterFile));
      highlightInMaster(intent.masterElementId); // read masterHandle fresh (enterMasterMode set it)
    })().catch(onError);
  }

  // Highlight in its own function so callers don't fight TS's narrowing of the masterHandle
  // closure variable (enterMasterMode reassigns it out of band).
  function highlightInMaster(elementId: string): void { masterHandle?.highlightElement(elementId); }

  // (Re)mount the "viene de / va a" pills for an open stage, given the master that calls it.
  // Works both drilled (master pane up) and standalone (no pane, bug #1). Name/called maps
  // are built from THIS master so navigation resolves correctly in either context.
  async function mountNavPills(
    stageXml: string,
    master: { file: string; xml: string; callActivityId: string },
  ): Promise<void> {
    stageOverlaysHandle?.clear();
    stageOverlaysHandle = null;
    let names = new Map<string, string>();
    let called = new Map<string, string>();
    try {
      const els = await parseCallLinks(master.xml);
      names = new Map(els.map((e) => [e.id, e.name ?? ""]));
      called = new Map(callLinksFromEls(els).map((l) => [l.elementId, l.calledElement]));
    } catch { /* names are best-effort */ }
    const model = await buildStageOverlayModel({
      stageXml, masterXml: master.xml, callActivityId: master.callActivityId,
      resolveName: (id) => names.get(id) ?? "",
    }).catch(() => null);
    if (!model) return; // couldn't derive the link model — leave no pills
    stageOverlaysHandle = mountStageOverlays(navPillHost(), model, {
      goToSource: (s) => actOnNavIntent(resolveEntryNav(s, registry.resolve), master.file),
      goToExit: (exit) => actOnNavIntent(resolveExitNav(exit, called, registry.resolve), master.file),
    });
    updateNavToggle();
  }

  // The floating "🔗 Vínculos" toggle only matters when navigation pills exist — a master
  // map is open, or a standalone stage that belongs to some master. Otherwise it stays hidden.
  function updateNavToggle(): void {
    const btn = document.getElementById("navpills-toggle") as HTMLButtonElement | null;
    if (!btn) return;
    btn.hidden = !(document.body.classList.contains("master-mode") || !!stageOverlaysHandle);
    btn.setAttribute("aria-pressed", String(navPillsVisible));
    btn.classList.toggle("off", !navPillsVisible);
    btn.title = navPillsVisible ? "Ocultar vínculos de navegación" : "Mostrar vínculos de navegación";
  }

  // Apply the show/hide choice: one body class hides every navigation pill in BOTH panes at
  // once (they stay in the DOM; a display:none overlay can't be clicked). Persist + refresh.
  function applyNavPillsVisibility(): void {
    document.body.classList.toggle("nav-pills-hidden", !navPillsVisible);
    localStorage.setItem("navPillsVisible", navPillsVisible ? "1" : "0");
    updateNavToggle();
  }

  function toggleNavPills(): void {
    navPillsVisible = !navPillsVisible;
    applyNavPillsVisibility();
  }

  // Drill-down: load a stage (subprocess) into the bottom editor via the normal path
  // (asPlainEditor bypasses master detection; keepMaster keeps the map pane mounted).
  async function openStage(file: string): Promise<void> {
    await openFile(file, { asPlainEditor: true, keepMaster: true });
    renderBreadcrumb(shortName(file));
    let stageXml = "";
    let pid = "";
    try {
      stageXml = await api.getXml(file);
      pid = (await parseDiagramInfo(stageXml)).processId;
      masterHandle?.setCurrentStage(pid);
    } catch { /* highlight is best-effort */ }
    stageOverlaysHandle?.clear();
    stageOverlaysHandle = null;
    if (currentMasterFile && stageXml) {
      try {
        const masterXml = await api.getXml(currentMasterFile);
        const link = callLinksFromEls(await parseCallLinks(masterXml)).find((l) => l.calledElement === pid);
        if (link) await mountNavPills(stageXml, { file: currentMasterFile, xml: masterXml, callActivityId: link.elementId });
      } catch { /* overlays are best-effort */ }
    }
    // Type badges (A.3): label precise task/event types on the stage for non-technical
    // readers. Cleared automatically on the next importXML (editor reload wipes overlays).
    try {
      const overlays = modeler.get("overlays") as { add(id: string, o: any): string };
      const registry = modeler.get("elementRegistry") as { getAll(): any[] };
      for (const el of registry.getAll()) {
        const badge = typeBadgeFor({
          type: el.type,
          eventDefinitions: el.businessObject?.eventDefinitions,
          cancelActivity: el.businessObject?.cancelActivity,
          attachedToRef: el.businessObject?.attachedToRef,
        });
        if (!badge) continue;
        const html = document.createElement("div");
        html.className = "subproc-type-badge";
        html.textContent = `${badge.icon} ${badge.label}`;
        html.title = badge.label;
        try { overlays.add(el.id, { position: { bottom: 0, right: 0 }, html }); } catch { /* skip */ }
      }
    } catch { /* best-effort */ }
    masterPaneFocused = false; // the stage editor is now the active pane
    updateNavToggle();
    renderTree(lastTree); // the drilled stage is now open — show its "abierto" marker
  }

  // A directly-opened stage (not drilled from a master): find the master that references it,
  // then (a) render its "◀ viene de / ▶ va a" pills right here so they work standalone
  // (bug #1) and (b) offer "Ver en el mapa". One registry scan (findReferencingMaster) feeds
  // both. If several masters reference the stage, the first wins (same as before).
  async function onStandaloneStageOpened(fileId: string, xml: string): Promise<void> {
    const bar = document.getElementById("map-offer") as HTMLElement | null;
    if (bar) { bar.hidden = true; bar.innerHTML = ""; }
    if (document.body.classList.contains("master-mode")) return; // the drill flow owns the pills
    let hit: Awaited<ReturnType<typeof findReferencingMaster>> = null;
    try {
      const pid = (await parseDiagramInfo(xml)).processId;
      hit = pid
        ? await findReferencingMaster({ entries: registry.all(), readXml: (f) => api.readPath(f), stageFile: fileId, stageProcessId: pid })
        : null;
    } catch { /* best-effort */ }
    if (!hit) { updateNavToggle(); return; }
    // (a) pills — navigable even without the master pane.
    await mountNavPills(xml, { file: hit.masterFile, xml: hit.masterXml, callActivityId: hit.callActivityId });
    // (b) the "Ver en el mapa" affordance.
    if (bar) {
      const found = hit.masterFile;
      const label = document.createElement("span");
      label.textContent = "Esta etapa forma parte de un mapa.";
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.type = "button";
      btn.textContent = "Ver en el mapa";
      btn.addEventListener("click", () => {
        void (async () => {
          const mxml = await api.getXml(found);
          await enterMasterMode(found, mxml);
          await openStage(fileId);
        })().catch(onError);
      });
      bar.append(label, btn);
      bar.hidden = false;
    }
  }

  async function openFile(fileId: string, opts?: { asPlainEditor?: boolean; keepMaster?: boolean }) {
    // Optimistic model: opening a file is immediately editable (no lock needed).
    // Flush the previous file's draft and drop any reservation we still hold.
    stageOverlaysHandle?.clear(); stageOverlaysHandle = null;
    stageHistory?.clearPreviewUI(); // leaving any active revision preview
    stageHistory?.clearCompareUI(); // leaving any active compare
    syncHistoryBodyClasses();
    await flushDraft();
    coarseUndo.length = 0; coarseRedo.length = 0; // coarse undo is per-file
    draftPending = false; // fresh file: whatever we load is already the saved state
    await releaseReserveIfMine();
    let meta;
    try {
      meta = await api.getMeta(fileId);
    } catch {
      await refreshFileList();
      return;
    }
    openLock = readLock(meta);
    const lockKind = effectiveLock(openLock); // "mine" only if we hold a live reservation
    const shared = await api.getXml(fileId);
    // A.2: a master diagram opens as the read-only top map (not the bottom editor).
    if (!opts?.asPlainEditor && (await xmlIsMaster(shared))) {
      await enterMasterMode(fileId, shared);
      return;
    }
    if (!opts?.keepMaster) exitMasterMode(); // opening a normal file / editing the map leaves master mode
    showStageHint(false); // a real stage/diagram now occupies the editor
    await editor.load(shared);
    editor.setReadOnly(false); // canvas is always editable in the draft model
    openHeadRevisionId = meta.headRevisionId ?? null;
    forceOverwrite = false;
    dispatch({ type: "openedFile", fileId, lock: lockKind });
    // Resume a private unpublished draft if one exists for this file.
    if (hasDraft(folderId, fileId)) {
      const resume = await confirmModal(
        "Tenés un borrador sin publicar de este diagrama. ¿Seguir editándolo?",
        "Seguir con mi borrador",
      );
      if (resume) { await loadIntoEditor(loadDraft(folderId, fileId) ?? shared); showToast("Retomaste tu borrador — Publicá cuando quieras"); }
      else { clearDraft(folderId, fileId); }
      render(); // refresh the "borrador sin publicar" indicator
    }
    // Baseline for externally-created/edited files (AI agents, other tools): capture the
    // on-disk content as a revision BEFORE it can be overwritten by a publish, so the
    // history panel shows the original version from day one.
    try { await api.snapshotExternal(fileId, me.name); } catch { /* history capture is best-effort */ }
    await stageHistory?.loadHistory();
    await loadLayers(fileId);
    await loadDocs(fileId);
    void renderFuentes();
    await ideasClientV2.migrateIfNeeded(fileId);
    await ideasClientV2.writeIndex(fileId, fileId.replace(/\.bpmn$/i, "").split("/").pop() ?? fileId);
    // keep the element index (_index.md) fresh even after external structural edits
    try { await docsController?.regenerateIndex(); } catch { /* index is best-effort */ }
    void ideasCtl?.refresh();
    if (ideaMode?.isOn()) void ideaMode.refresh();
    // A.2: a plain-opened stage may belong to a master's map — render its navigation pills
    // here (so they work standalone) and offer to view it in that map.
    if (!opts) void onStandaloneStageOpened(fileId, shared).catch(onError);
    // T6: refresh the tree so this file's "abierto" marker shows immediately, not just
    // on the next incidental refresh (mirrors the renderTree(lastTree) calls the
    // master-mode transitions already make — see enterMasterMode/openStage/closeStage/
    // exitMasterMode). docsFileId and the "openedFile" dispatch are already set above,
    // so openPathsNow() reflects this file as open.
    renderTree(lastTree);
  }

  // Reserve the open file (optional advisory lock with a duration). Editing never
  // depends on this — it only tells the team "Ana is working on this until HH:MM".
  async function reserve(fileId: string) {
    const before = readLock(await api.getMeta(fileId));
    if (effectiveLock(before) === "theirs") {
      const who = before.lockedByName || before.lockedByEmail || "otra persona";
      const stale = isStale(before, Date.now());
      const ok = await confirmModal(
        `Lo reservó ${who}${stale ? " (parece vencida)" : ""}. ¿Reservarlo igual para vos?`,
        "Reservar igual",
      );
      if (!ok) return;
    }
    const until = await pickReservationDuration(Date.now());
    if (until === null) return; // cancelled
    await api.setLock(fileId, lockProps(me, new Date().toISOString(), until));
    const after = await api.getMeta(fileId);
    openLock = readLock(after);
    if (effectiveLock(openLock) !== "mine") { showToast("No se pudo reservar — otra persona lo reservó"); await refreshFileList(); return; }
    await clearMyRequest(fileId); // I'm on it now — drop any pending request of mine
    dispatch({ type: "lockChanged", lock: "mine" });
    await refreshFileList();
    showToast(`Reservado${untilLabel(openLock)} — el equipo lo verá`);
  }


  // Low-level write to the SHARED version (= "Publicar"). Reuses the version-check
  // + conflict bar; on success the private draft is cleared (it's now published).
  async function save(fileId: string) {
    if (!forceOverwrite && openHeadRevisionId !== null) {
      const meta = await api.getMeta(fileId);
      if (meta && meta.headRevisionId !== openHeadRevisionId) {
        dispatch({ type: "externalChange" });
        await showConflictBar(fileId);
        return;
      }
    }
    const xml = await editor.getXml();
    const res = await api.putXml(fileId, xml, me.name);
    openHeadRevisionId = res.headRevisionId ?? openHeadRevisionId;
    forceOverwrite = false;
    editor.markSaved();
    clearDraft(folderId, fileId); // published → the local draft is no longer needed
    dispatch({ type: "dirtyChanged", dirty: false });
    // Retention/prune runs inside fsClient.putXml (decay = deletion); nothing to do here.
    await stageHistory?.loadHistory();
    showToast("Publicado");
  }

  // "Publicar": share the current version with the team, with a confirmation. If
  // someone else reserved the file, warn and offer to notify them.
  async function publish(fileId: string) {
    if (state.kind !== "editing") return;
    if (state.lock === "theirs") {
      const who = openLock.lockedByName || openLock.lockedByEmail || "otra persona";
      const ok = await confirmModal(`Lo reservó ${who}. ¿Publicar igual y avisarle?`, "Publicar y avisar");
      if (!ok) return;
      await save(fileId);
      await requestEdit(fileId, "publish"); // courtesy notice to the holder
      return;
    }
    const ok = await confirmModal("¿Publicar tus cambios para el equipo?", "Publicar");
    if (!ok) return;
    await save(fileId);
  }

  // Release my reservation (advisory). Does NOT publish — the draft stays local.
  async function releaseReserve(fileId: string) {
    await api.setLock(fileId, clearProps());
    openLock = {};
    dispatch({ type: "lockChanged", lock: "free" });
    await refreshFileList();
    showToast("Reserva liberada");
  }

  // Close the file and go back to browsing. Flush the draft, release any reservation.
  async function closeFile(fileId: string) {
    // Drop any active preview/compare with the file (the pane bars live inside the
    // stage wrap now — render() no longer clears them globally).
    stageHistory?.clearPreviewUI();
    stageHistory?.clearCompareUI();
    syncHistoryBodyClasses();
    await flushDraft();
    if (state.kind === "editing" && state.lock === "mine") {
      try { await api.setLock(fileId, clearProps()); } catch { /* best-effort */ }
    }
    openLock = {};
    dispatch({ type: "closedFile" });
    await refreshFileList();
  }

  // ---- Request-to-edit (ask the current holder — human or LLM agent — to release) ----
  // A plain `<file>.req` JSON sidecar reuses the same synced-folder + watcher flow:
  // the requester writes it; the holder's poll surfaces it; releasing frees the file.
  let pendingRequestFile: string | null = null;
  let lastReqNotice = "";
  type ReqKind = "edit" | "publish";
  async function requestEdit(fileId: string, kind: ReqKind = "edit") {
    await api.writePath(`${fileId}.req`, JSON.stringify({ by: me.email, name: me.name, at: new Date().toISOString(), kind }));
    pendingRequestFile = fileId;
    if (kind === "edit") showToast("Aviso enviado — te aviso cuando libere la reserva");
  }
  async function clearMyRequest(fileId: string) {
    try { await api.deletePath(`${fileId}.req`); } catch { /* already gone */ }
    if (pendingRequestFile === fileId) pendingRequestFile = null;
  }
  // Called each poll: nudge the reservation holder if someone asked; notify the
  // requester once the reservation is freed.
  async function pollEditRequests() {
    if (state.kind !== "editing") return;
    const fileId = state.fileId;
    if (state.lock === "mine") {
      const raw = await api.readPath(`${fileId}.req`).catch(() => null);
      if (raw) {
        try {
          const req = JSON.parse(raw) as { by?: string; name?: string; kind?: ReqKind };
          if (req.by && req.by !== me.email) {
            const key = `${fileId}:${req.by}:${req.kind ?? "edit"}`;
            if (lastReqNotice !== key) {
              lastReqNotice = key;
              const msg = req.kind === "publish"
                ? `🔔 ${req.name || req.by} quiere publicar — revisá y liberá la reserva`
                : `🔔 ${req.name || req.by} quiere editar — ¿le cedés? (Liberar reserva)`;
              showToast(msg);
            }
          }
        } catch { /* ignore malformed */ }
      } else { lastReqNotice = ""; }
    } else if (pendingRequestFile === fileId && state.lock === "free") {
      // the holder released — my turn
      await clearMyRequest(fileId);
      showToast(`✅ ${fileId} quedó libre — ya podés editar/publicar`);
    }
  }

  // ---- Idle auto-release: drop the reservation after a while with no edits, so a
  // forgotten reservation doesn't linger. Reset whenever the file is edited.
  const IDLE_RELEASE_MS = 8 * 60 * 1000; // 8 minutes
  let idleTimer: number | null = null;
  function clearIdle(): void { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } }
  function armIdle(): void {
    clearIdle();
    if (!(state.kind === "editing" && state.lock === "mine")) return;
    idleTimer = window.setTimeout(() => void (async () => {
      if (state.kind === "editing" && state.lock === "mine") {
        await releaseReserve(state.fileId);
        showToast("Reserva liberada por inactividad (tu borrador sigue intacto)");
      }
    })().catch(onError), IDLE_RELEASE_MS);
  }

  // ---- Stage history controller (preview/compare) — flows live in src/historyPane.ts ----
  // Constructed in startApp() once the shell DOM exists. Phase 1 of the dual-history work:
  // one instance for the stage editor; a master-pane instance joins it later.
  function mountStageHistory(): void {
    stageHistory = createHistoryController({
      title: () => "", // untitled → classic "<h3>Historial</h3>" panel (dual sections come later)
      getFileId: () => (state.kind === "editing" ? state.fileId : null),
      api: () => api,
      editor: () => editor,
      modeler: () => modeler,
      els: {
        wrap: document.getElementById("stage-wrap")!,
        splitHost: document.getElementById("stage-split")!,
        canvas2: document.getElementById("canvas2")!,
        bar: document.getElementById("stage-pane-bar")!,
      },
      createViewer: async (c) => {
        const v = await createCompareModeler(c); // BpmnModeler: select + copyPaste + pan
        installViewSelectGuard(v as unknown as { get(n: string): any }); // no editing
        enableRubberBandSelect(v as unknown as { get(n: string): any }); // Shift+drag = box-select
        return v;
      },
      loadWorking: (xml) => loadIntoEditor(xml),
      flushWorking: () => flushDraft(),
      getWorkingFallback: async () =>
        state.kind === "editing" ? (loadDraft(folderId, state.fileId) ?? (await api.getXml(state.fileId))) : null,
      onWorkingReplaced: (xml) => {
        if (state.kind !== "editing") return;
        saveDraft(folderId, state.fileId, xml); // becomes your unpublished draft
        draftPending = false;
        dispatch({ type: "dirtyChanged", dirty: true });
        updateLocalStatus();
      },
      pushCoarseUndo: (xml) => {
        coarseUndo.push(xml);
        coarseRedo.length = 0;
      },
      me: () => me,
      orientationKey: "bpmn-compartida.compareOrientation",
      onChanged: () => {
        syncHistoryBodyClasses();
        render();
      },
      onError,
    });
    stageHistory.renderSection(document.getElementById("history")!);
  }

  // Body-class union across pane controllers: legacy CSS frames + the app-editing
  // suppression in render() key off these; with two controllers each class is ON when
  // ANY pane is in that mode.
  function syncHistoryBodyClasses(): void {
    document.body.classList.toggle("app-previewing", stageHistory?.isPreviewing() ?? false);
    document.body.classList.toggle("app-comparing", stageHistory?.isComparing() ?? false);
  }

  async function showConflictBar(fileId: string) {
    // Snapshot MY version now, before any diff fast-switch can swap the canvas to "theirs".
    const mineSnapshot = await editor.getXml();
    renderConflictBar(document.getElementById("conflict")!, {
      onDiff: () => void (async () => {
        const theirs = await api.getXml(fileId);
        const changes = await computeDiff(mineSnapshot, theirs);
        await diffView.show(mineSnapshot, theirs, changes);
        showToast("Diff: 🟢 nuevo 🔴 eliminado 🟡 cambiado — tecla 'd' alterna versiones");
      })().catch(onError),
      onDiscard: () => void (async () => {
        await diffView.close();
        const xml = await api.getXml(fileId);
        await loadIntoEditor(xml);
        editor.setReadOnly(false);
        clearDraft(folderId, fileId); // discarding my work drops the private draft too
        const fresh = await api.getMeta(fileId);
        openHeadRevisionId = fresh.headRevisionId ?? null;
        api.lastWrites.set(fileId, fresh.version); // mark seen so the watcher doesn't reload it again
        document.getElementById("conflict")!.innerHTML = "";
        dispatch({ type: "resolvedConflict", keepMine: false });
      })().catch(onError),
      onKeepMine: () => void (async () => {
        await diffView.close();
        // Restore MY snapshot in case fast-switch left "theirs" loaded — otherwise we'd save theirs.
        await loadIntoEditor(mineSnapshot);
        editor.setReadOnly(false);
        forceOverwrite = true;
        document.getElementById("conflict")!.innerHTML = "";
        dispatch({ type: "resolvedConflict", keepMine: true });
        await save(fileId);
      })().catch(onError),
    });
  }

  async function pollChanges() {
    if (state.kind === "signedOut") return;
    const all = await api.listTree();
    const clean = all.filter((e) => !(e.kind === "file" && isSyncConflict(e.path)));
    const openId = state.kind === "editing" ? state.fileId : null;
    // A.2: refresh the process registry on content changes too (cheap when unchanged —
    // sync skips files whose version matches), then re-badge the master map if open.
    void registry.sync(
      clean.filter((e) => e.kind === "file" && e.path.endsWith(".bpmn"))
        .map((e) => ({ path: e.path, version: e.version ?? "" })),
    ).then(() => masterHandle?.refreshBadges()).catch(() => { /* best-effort */ });
    const { reloadOpen, structureChanged } = diffTree(treeVersions, clean, openId, api.lastWrites);
    if (reloadOpen && openId) await handleExternalChange(openId);
    if (structureChanged) await refreshFileList();
    else treeVersions = new Map(clean.filter((e) => e.kind === "file" && e.version).map((e) => [e.path, e.version as string]));
    // Keep the reservation view current: auto-release my own expired reservation,
    // and reflect a peer's reservation change/expiry on the open file.
    if (openId && state.kind === "editing") {
      const entry = clean.find((e) => e.path === openId);
      if (entry) {
        openLock = readLock({ id: openId, name: openId, modifiedTime: "", version: "", headRevisionId: null, appProperties: entry.appProperties });
        const eff = effectiveLock(openLock);
        if (state.lock === "mine" && isExpired(openLock, Date.now())) {
          await releaseReserve(openId);
          showToast("Tu reserva venció — el diagrama quedó libre (tu borrador sigue intacto)");
        } else if (eff !== state.lock) {
          dispatch({ type: "lockChanged", lock: eff });
        }
      }
    }
    await pollEditRequests();
  }

  async function handleExternalChange(fileId: string) {
    if (state.kind !== "editing") return;
    // Version the external content the moment we see it — whatever happens next
    // (silent reload, keep-mine overwrite, discard) it stays restorable.
    try { await api.snapshotExternal(fileId, me.name); await stageHistory?.loadHistory(); } catch { /* best-effort */ }
    // Silent auto-reload is only safe when there is NO unpublished local work —
    // neither pending modeler edits nor a stored draft (which the canvas may be
    // showing). Otherwise raise the conflict bar so the user chooses.
    if (!state.dirty && !hasDraft(folderId, fileId)) {
      const xml = await api.getXml(fileId);
      await loadIntoEditor(xml);
      const fresh = await api.getMeta(fileId);
      openHeadRevisionId = fresh.headRevisionId ?? openHeadRevisionId;
      api.lastWrites.set(fileId, fresh.version); // mark this version as seen so we don't reload it again
      try { await docsController?.regenerateIndex(); } catch { /* index is best-effort */ }
      void ideasCtl?.refresh();
      dispatch({ type: "reloaded" });
      showToast("Recargado — actualizado externamente");
    } else {
      dispatch({ type: "externalChange" });
      await showConflictBar(fileId);
    }
  }

  const isValidName = (n: string) => !!n && !/[\\/]/.test(n);

  const joinPath = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);
  const baseFile = (p: string) => p.slice(p.lastIndexOf("/") + 1);
  const parentOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
  const withBpmn = (n: string) => (/\.bpmn$/i.test(n) ? n : `${n}.bpmn`);
  const pathExists = (p: string) => lastTree.some((e) => e.path === p);

  async function newDiagramIn(parent: string): Promise<void> {
    const name = await promptText("Nombre del nuevo diagrama (.bpmn)");
    if (!name) return;
    if (!isValidName(name)) { showToast("Nombre inválido (sin / ni \\)"); return; }
    const id = joinPath(parent, withBpmn(name));
    if (pathExists(id)) { showToast("Ya existe «" + withBpmn(name) + "» en esa carpeta"); return; }
    const file = await api.createFile(id, EMPTY_BPMN);
    if (parent) expanded.add(parent);
    await refreshFileList();
    await openFile(file.id); // opens editable immediately — no reservation needed
  }

  async function newFolderIn(parent: string): Promise<void> {
    const name = await promptText("Nombre de la carpeta");
    if (!name) return;
    if (!isValidName(name)) { showToast("Nombre inválido (sin / ni \\)"); return; }
    const fp = joinPath(parent, name);
    if (pathExists(fp)) { showToast("Ya existe «" + name + "» en esa carpeta"); return; }
    await api.createFolder(parent, name);
    expanded.add(fp);
    await refreshFileList();
  }

  async function newDiagram() { await newDiagramIn(""); }

  // True if the entry is checked out by someone other than me.
  function lockedByOther(path: string): boolean {
    const e = lastTree.find((x) => x.path === path);
    if (!e?.appProperties) return false;
    const kind = lockState(readLock({ appProperties: e.appProperties } as any), me);
    return kind === "theirs";
  }
  let lastTree: TreeEntry[] = [];

  function openItemMenu(target: { path: string; kind: "file" | "dir" }, anchor: DOMRect): void {
    if (target.kind === "file") {
      openContextMenu(anchor, [
        { label: "Abrir", onClick: () => void openFile(target.path).catch(onError) },
        { label: "Renombrar", onClick: () => void renameItem(target.path, "file").catch(onError) },
        { label: "Duplicar", onClick: () => void dupItem(target.path).catch(onError) },
        { label: "Mover a…", onClick: () => void moveItem(target.path, "file").catch(onError) },
        { label: "Copiar a…", onClick: () => void copyItem(target.path).catch(onError) },
        { label: "Borrar", danger: true, onClick: () => void deleteItem(target.path, "file").catch(onError) },
      ]);
    } else {
      openContextMenu(anchor, [
        { label: "Nuevo diagrama aquí", onClick: () => void newDiagramIn(target.path).catch(onError) },
        { label: "Nueva subcarpeta", onClick: () => void newFolderIn(target.path).catch(onError) },
        { label: "Renombrar", onClick: () => void renameItem(target.path, "dir").catch(onError) },
        { label: "Mover a…", onClick: () => void moveItem(target.path, "dir").catch(onError) },
        { label: "Borrar", danger: true, onClick: () => void deleteItem(target.path, "dir").catch(onError) },
      ]);
    }
  }

  function blockIfLocked(path: string): boolean {
    if (lockedByOther(path)) { showToast("Está tomado por otra persona"); return true; }
    return false;
  }
  function folderHasOthersLock(folder: string): boolean {
    return lastTree.some((e) => e.kind === "file" && (e.path === folder || e.path.startsWith(`${folder}/`)) && lockedByOther(e.path));
  }

  async function closeIfOpen(path: string): Promise<void> {
    if (state.kind === "editing" && (state.fileId === path || state.fileId.startsWith(`${path}/`))) {
      dispatch({ type: "closedFile" });
      render();
    }
  }

  async function renameItem(path: string, kind: "file" | "dir"): Promise<void> {
    if (kind === "file" && blockIfLocked(path)) return;
    const current = path.slice(path.lastIndexOf("/") + 1).replace(/\.bpmn$/i, "");
    const name = await promptText("Nuevo nombre", { initial: current });
    if (!name) return;
    if (!isValidName(name)) { showToast("Nombre inválido"); return; }
    const target = kind === "file" ? joinPath(parentOf(path), withBpmn(name)) : joinPath(parentOf(path), name);
    if (target !== path && pathExists(target)) { showToast("Ya existe «" + name + "» en esa carpeta"); return; }
    await closeIfOpen(path);
    if (kind === "file") await api.renameFile(path, name);
    else await api.renameFolder(path, name);
    await refreshFileList();
  }

  async function dupItem(path: string): Promise<void> {
    await api.duplicateFile(path);
    await refreshFileList();
  }

  async function moveItem(path: string, kind: "file" | "dir"): Promise<void> {
    if (kind === "file" && blockIfLocked(path)) return;
    if (kind === "dir" && folderHasOthersLock(path)) { showToast("Hay archivos tomados por otros dentro"); return; }
    const dest = await pickFolder(lastTree, { title: "Mover a…", disabledPath: kind === "dir" ? path : undefined });
    if (dest === null) return;
    const target = joinPath(dest, baseFile(path));
    if (target !== path && pathExists(target)) { showToast("Ya existe «" + baseFile(path) + "» en la carpeta destino"); return; }
    await closeIfOpen(path);
    if (kind === "file") await api.moveFile(path, dest);
    else await api.moveFolder(path, dest);
    if (dest) expanded.add(dest);
    await refreshFileList();
  }

  async function copyItem(path: string): Promise<void> {
    const dest = await pickFolder(lastTree, { title: "Copiar a…" });
    if (dest === null) return;
    await api.copyFile(path, dest);
    if (dest) expanded.add(dest);
    await refreshFileList();
  }

  async function deleteItem(path: string, kind: "file" | "dir"): Promise<void> {
    if (kind === "file" && blockIfLocked(path)) return;
    if (kind === "dir" && folderHasOthersLock(path)) { showToast("Hay archivos tomados por otros dentro"); return; }
    if (!confirm(`¿Borrar ${path}? No se puede deshacer.`)) return;
    await closeIfOpen(path);
    if (kind === "file") await api.deleteFile(path);
    else await api.deleteFolder(path);
    await refreshFileList();
  }

  // ---- entry ----
  const saved = await loadSavedDir();
  if (saved) {
    await useFolder(saved);
    await ensureNameThenApp();
  } else {
    showFolderGate();
  }
}

bootstrap();
