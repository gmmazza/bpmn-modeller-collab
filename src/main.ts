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
import { showHelp } from "./help";
import { createInspector, type Inspector } from "./inspector";

import { BUNDLED_BPMN_JS_VERSION, checkLatestBpmnJs } from "./version";
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
import { showPersonalInstructionsModal } from "./processDocs/personalInstructions";
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
import { showPresetsModal } from "./terminalPresetsModal";
import { openExternalTerminal, hasTermApi } from "./termApi";
import type { User, TreeEntry, LockInfo, LockState, RestorePoint } from "./types";
import { renderFileTree } from "./fileTree";
import { openContextMenu } from "./contextMenu";
import { pickFolder } from "./folderPicker";
import {
  renderHistoryPanel,
  renderConflictBar,
  renderSyncWarning,
  toRestorePoint,
  showToast,
  promptText,
  confirmModal,
  pickReservationDuration,
  renderPreviewBar,
  renderCompareBar,
} from "./ui";
import { createCompareModeler, syncViewport, installViewSelectGuard, enableRubberBandSelect, type ViewerLike } from "./compareView";
import { applyDiffMarkers, clearDiffMarkers } from "./diffMarkers";
// A.2 master mode (subprocesos): process registry + read-only master map pane.
import { parseDiagramInfo, parseCallLinks } from "./processDocs/diagramInfo";
import { callLinksFromEls, linkBox, unlinkBox, newSubprocessSkeleton } from "./subprocesos/callActivityLinks";
import { createProcessRegistry } from "./subprocesos/processRegistry";
import { mountMasterPane, type MasterPaneHandle } from "./subprocesos/masterPane";
import { renderLinkPopover } from "./subprocesos/linkPopover";

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
  let forceOverwrite = false;
  let pollTimer: number | null = null;
  let openLock: LockInfo = {}; // reservation info for the currently-open file (display + expiry)
  let folderId = "default"; // stable id of the current shared folder; namespaces local drafts
  let previewingRid: string | null = null; // revision id being previewed (read-only), or null
  let prePreviewXml: string | null = null; // working state snapshot to restore on exit-preview
  // ---- compare mode (side-by-side version diff, driven by History checkboxes) ----
  let comparing = false;
  let compareSel: string[] = []; // up to 2 checked ids: "actual" or a revision id
  let compareLeft = "actual"; // derived: the NEWER of the two (left/top pane)
  let compareRight: string | null = null; // derived: the OLDER of the two (a revision id)
  let compareOrientation: "h" | "v" = (localStorage.getItem("bpmn-compartida.compareOrientation") as "h" | "v") || "h";
  let compareViewer: ViewerLike | null = null; // right pane read-only viewer
  let compareUnsync: (() => void) | null = null; // viewport-sync teardown
  let compareMarkedLeft: string[] = [];
  let compareMarkedRight: string[] = [];
  let preCompareXml: string | null = null; // working version snapshot (restored on exit; updated on paste)
  let compareEdited = false; // did we paste historical elements into the working version this compare session?
  let comparePoints: Array<{ id: string; label: string }> = []; // revisions (for labels)
  let historyPoints: RestorePoint[] = []; // cached so the History panel re-renders on checkbox toggle
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
  let masterHandle: MasterPaneHandle | null = null; // read-only master map viewer, when in master mode
  let currentMasterFile: string | null = null; // the master .bpmn currently mapped (null = not in master mode)
  let linkPopoverEl: HTMLElement | null = null; // currently open link popover (Vincular/Crear/Ir/Desvincular), if any

  // File-tree 🗺 "maestro" badges (Task 7): which .bpmn paths are masters, mirroring the
  // registry's re-parse-only-what-changed pattern so a large folder doesn't re-read every
  // file's XML on each refresh. Best-effort — never blocks rendering the tree.
  const mastersCache = new Set<string>();
  const masterFileVersions = new Map<string, string>(); // path -> version already checked
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
      }
    }
    for (const f of bpmn) {
      const version = f.version ?? "";
      if (masterFileVersions.get(f.path) === version) continue; // unchanged, keep cached verdict
      masterFileVersions.set(f.path, version);
      const xml = await api.readPath(f.path).catch(() => null);
      if (xml && (await xmlIsMaster(xml))) mastersCache.add(f.path);
      else mastersCache.delete(f.path);
    }
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
      onGoToSubprocess: async () => {
        const entry = info.calledElement ? registry.resolve(info.calledElement) : null;
        if (entry) await openStage(entry.file);
        else showToast("No se pudo resolver el subproceso vinculado");
      },
      onUnlink: () => unlinkMasterBox(masterFile, info.elementId),
    });
  }

  // Apply a calledElement change to a box on the master via a transient "Editar el
  // mapa" round-trip: open the master in the normal editor (same path as the
  // breadcrumb's "Editar el mapa" button — this exits master mode), mutate with the
  // modeler-touching helper, publish directly (this is a programmatic action from the
  // popover, not the toolbar Publicar button, so it skips the confirm dialog), then
  // re-enter master mode so the badges/registry reflect the new link.
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
  }

  function renderVizSettings(): void {
    const panel = document.getElementById("vizsettings") as HTMLElement;
    if (!panel.hidden) {
      panel.hidden = true;
      return;
    }
    const s = getVizSettings();
    panel.innerHTML = `
      <label><input type="checkbox" id="set-sketchy" ${s.sketchy ? "checked" : ""}/> Estilo sketchy (dibujado a mano)</label>
      <label><input type="checkbox" id="set-heatmap" ${s.heatmap ? "checked" : ""}/> Heatmap de simulación (beta)</label>
      <p class="hint">Se aplica recreando el editor; si tenés cambios sin guardar, se guardan primero.</p>
      <hr/>
      <div class="viz-version">
        bpmn-js <b>${BUNDLED_BPMN_JS_VERSION}</b>
        <button id="check-bpmnjs" type="button">Buscar actualización</button>
        <span id="bpmnjs-status"></span>
      </div>
      ${window.appUpdate ? `<hr/>
      <div class="viz-update">
        <div>App <b id="app-version">…</b> <button id="check-app" type="button">Buscar actualización</button></div>
        <div id="app-upd" class="app-upd"></div>
      </div>` : ""}
      <p class="hint">Build: ${__APP_BUILD__}</p>`;
    panel.hidden = false;
    const onToggle = () => {
      const next: VizSettings = {
        sketchy: (document.getElementById("set-sketchy") as HTMLInputElement).checked,
        heatmap: (document.getElementById("set-heatmap") as HTMLInputElement).checked,
      };
      void applyVizSettings(next).catch(onError);
    };
    (document.getElementById("set-sketchy") as HTMLInputElement).addEventListener("change", onToggle);
    (document.getElementById("set-heatmap") as HTMLInputElement).addEventListener("change", onToggle);
    document.getElementById("check-bpmnjs")?.addEventListener("click", () => {
      const status = document.getElementById("bpmnjs-status")!;
      status.textContent = "Buscando…";
      void checkLatestBpmnJs(fetchLatestBpmnJs)
        .then((r) => {
          status.textContent = r.isOutdated
            ? `${r.latest} disponible — corré "npm run update:bpmn" y regenerá el .exe`
            : `${r.latest} es la última ✓`;
        })
        .catch(() => {
          status.textContent = "No se pudo verificar (offline o sin acceso)";
        });
    });
    wireAppUpdateSection();
  }

  // App self-update UI (Electron only): shows the current version and, when a newer
  // release exists, a button that downloads the portable .zip and swaps it in place.
  function wireAppUpdateSection(): void {
    if (!window.appUpdate) return;
    const verEl = document.getElementById("app-version");
    void window.appUpdate.currentVersion().then((v) => { if (verEl) verEl.textContent = "v" + v; }).catch(() => {});

    const box = document.getElementById("app-upd");
    document.getElementById("check-app")?.addEventListener("click", () => {
      if (!box) return;
      box.textContent = "Buscando…";
      void (async () => {
        try {
          const [current, feed] = await Promise.all([window.appUpdate!.currentVersion(), window.appUpdate!.checkFeed()]);
          const r = evaluateUpdate(current, feed);
          if (!r.updateAvailable) { box.textContent = `Estás en la última versión (v${current}) ✓`; return; }
          renderUpdateAvailable(box, r.latest, r.asset, r.url);
        } catch {
          box.textContent = "No se pudo verificar (offline o sin acceso)";
        }
      })();
    });
  }

  // Render the "vX available" state: an install button (in-place self-update) when the
  // release has a .zip asset, otherwise a fallback that opens the release page. `asset` is
  // only used to DECIDE which button to show — the actual download URL is re-derived in the
  // main process (the renderer must not choose what gets downloaded + run).
  function renderUpdateAvailable(box: HTMLElement, latest: string, asset: string, releaseUrl: string): void {
    box.textContent = "";
    const line = document.createElement("div");
    line.textContent = `Versión ${latest} disponible. `;
    box.appendChild(line);

    if (!asset) {
      const open = document.createElement("button");
      open.type = "button";
      open.textContent = "Ver release";
      open.addEventListener("click", () => window.appUpdate!.openDownload(releaseUrl));
      line.appendChild(open);
      return;
    }

    const install = document.createElement("button");
    install.type = "button";
    install.textContent = "Descargar e instalar";
    const status = document.createElement("span");
    status.className = "app-upd-status";
    line.appendChild(install);
    line.appendChild(status);

    install.addEventListener("click", () => {
      install.disabled = true;
      status.textContent = " Preparando…";
      const off = window.appUpdate!.onProgress((p) => {
        if (p.phase === "download") {
          const pct = p.total ? Math.round(((p.received ?? 0) / p.total) * 100) : 0;
          status.textContent = ` Descargando… ${pct}%`;
        } else if (p.phase === "extract") {
          status.textContent = " Descomprimiendo…";
        } else if (p.phase === "swap") {
          status.textContent = " Instalando y reiniciando…";
        }
      });
      void window.appUpdate!.downloadAndInstall().catch((err: unknown) => {
        off();
        install.disabled = false;
        status.textContent = " Error: " + (err instanceof Error ? err.message : String(err));
      });
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
  }

  // Drag the inspector's left edge to resize its width (persisted). Width drives
  // both the panel and its collapsed offset via the --inspector-width CSS var.
  function setupInspectorResize(): void {
    const insp = document.getElementById("inspector");
    if (!insp || insp.querySelector(".inspector-resizer")) return;
    const MIN = 220, MAX = 760;
    const saved = Number(localStorage.getItem("inspectorWidth"));
    if (saved >= MIN && saved <= MAX) insp.style.setProperty("--inspector-width", `${saved}px`);
    const resizer = document.createElement("div");
    resizer.className = "inspector-resizer";
    resizer.title = "Arrastrá para ajustar el ancho";
    insp.appendChild(resizer);
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
      try { localStorage.setItem("inspectorWidth", String(Math.round(insp.getBoundingClientRect().width))); } catch { /* ignore */ }
    };
    resizer.addEventListener("mousedown", (e) => {
      dragging = true;
      startX = e.clientX;
      startW = insp.getBoundingClientRect().width;
      document.body.classList.add("col-resizing");
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      e.preventDefault();
    });
  }

  // Draggable separator between the two compare panes. Sets --split (a %) on the area;
  // the axis follows the orientation (row → width, column → height). Clamped 15–85%.
  function setupCanvasSplitResize(): void {
    const area = document.getElementById("canvasarea");
    const resizer = document.getElementById("canvassplit");
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
        <div class="menu" id="usermenu">
          <button class="btn" id="userbtn" type="button"></button>
        </div>
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
          <button class="btn icon-only" id="tab-capas" type="button" title="Capas">${icon("layers")}</button>
          <button class="btn icon-only" id="tab-props" type="button" title="Propiedades">${icon("properties")}</button>
          <button class="btn icon-only" id="tab-docs" type="button" title="Documentación">${icon("fileText")}</button>
          <button class="btn icon-only" id="tab-fuentes" type="button" title="Fuentes">${icon("paperclip")}</button>
          <div class="menu" id="settingsmenu">
            <button class="btn icon-only" id="settings" type="button" title="Ajustes">${icon("settings")}</button>
            <div id="vizsettings" class="popover" hidden></div>
          </div>
        </div>
        <span class="divider"></span>
        <div class="tgroup" data-prio="2">
          <button class="btn icon-only" id="exportSvg" type="button" title="Exportar SVG">${icon("download")}<span style="font-size:11px">SVG</span></button>
          <button class="btn icon-only" id="exportPng" type="button" title="Exportar PNG">${icon("download")}<span style="font-size:11px">PNG</span></button>
          <button class="btn icon-only" id="manual" type="button" title="Manual del proceso">${icon("book")}<span style="font-size:11px">Manual</span></button>
          <button class="btn icon-only" id="ai-instructions" type="button" title="Instrucciones personales para la IA">${icon("settings")}<span style="font-size:11px">IA</span></button>
          <span class="tgroup terminal-group" id="terminal-group" hidden>
            <select id="llm-preset" class="btn" title="Preset de comando LLM"></select>
            <button class="btn icon-only" id="llm-run" type="button" title="Lanzar en terminal">▶</button>
            <button class="btn icon-only" id="llm-term" type="button" title="Abrir terminal en la carpeta">⌨</button>
            <button class="btn icon-only" id="llm-presets" type="button" title="Gestionar presets">${icon("settings")}</button>
          </span>
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
      <div id="preview"></div>
      <div id="compare"></div>
      <div id="master-bar" hidden></div>
      <div id="map-offer" hidden></div>
      <div id="appupdate"></div>
      <main class="app">
        <aside id="files"></aside>
        <section id="canvasarea">
          <section id="master-canvas" hidden></section>
          <section id="canvas"></section>
          <div id="stage-hint" hidden>Elegí una etapa en el mapa</div>
          <div class="canvas-resizer" id="canvassplit" title="Arrastrá para ajustar el split"></div>
          <section id="canvas2" hidden></section>
        </section>
        <div id="inspector"></div>
      </main>`;

    inspector = createInspector(document.getElementById("inspector")!, [
      { id: "capas", label: "Capas" },
      { id: "propiedades", label: "Propiedades" },
      { id: "historial", label: "Historial" },
      { id: "documentacion", label: "Documentación" },
      { id: "fuentes", label: "Fuentes" },
      { id: "ideas", label: "Ideas" },
    ], (tabId) => {
      // Selecting the Ideas tab IS "idea mode": badges + selection-focus on; off elsewhere.
      const on = tabId === "ideas";
      void ideaMode?.setEnabled(on);
      if (on) void ideasCtl?.refresh();
    });
    // Reuse existing render targets so mountModeler/renderLayers/loadHistory are unchanged.
    inspector.paneEl("propiedades").id = "propspanel";
    inspector.paneEl("capas").id = "layerspanel";
    inspector.paneEl("capas").classList.add("layers-panel");
    inspector.paneEl("historial").id = "history";
    inspector.hide();
    setupInspectorResize();
    setupCanvasSplitResize();

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
    $("folderchip").innerHTML = `${icon("folder")} <span class="folder-path"></span>`;
    $("folderchip").style.cursor = "pointer";
    $("folderchip").addEventListener("click", () => changeFolder());
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
      const span = $("folderchip").querySelector(".folder-path");
      if (span) span.textContent = label;
      $("folderchip").title = full ? `${full} — clic para cambiar la carpeta` : "Cambiar carpeta de trabajo";
    })();
    const renderUserBtn = () => { $("userbtn").innerHTML = `${icon("user")} ${me.name} ${icon("chevron")}`; };
    renderUserBtn();
    const renderThemeBtn = () => { $("themebtn").innerHTML = icon(getTheme() === "dark" ? "sun" : "moon"); };
    renderThemeBtn();
    $("themebtn").addEventListener("click", () => { toggleTheme(); renderThemeBtn(); });
    $("helpbtn").addEventListener("click", () => showHelp());
    document.getElementById("ai-instructions")?.addEventListener("click", () => {
      if (api) showPersonalInstructionsModal(api, getName());
    });

    function refreshLlmPresets(): void {
      const sel = document.getElementById("llm-preset") as HTMLSelectElement | null;
      if (!sel) return;
      const presets = getPresets();
      sel.innerHTML = "";
      for (const p of presets) {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.label;
        sel.appendChild(opt);
      }
      const last = getLastPresetId();
      if (last && presets.some((p) => p.id === last)) sel.value = last;
      sel.disabled = presets.length === 0;
      (document.getElementById("llm-run") as HTMLButtonElement).disabled = presets.length === 0;
    }
    if (hasTermApi()) {
      (document.getElementById("terminal-group") as HTMLElement).hidden = false;
      refreshLlmPresets();
      document.getElementById("llm-preset")?.addEventListener("change", (e) => {
        setLastPresetId((e.target as HTMLSelectElement).value || null);
      });
      document.getElementById("llm-run")?.addEventListener("click", () => {
        const id = (document.getElementById("llm-preset") as HTMLSelectElement).value;
        const p = getPresets().find((x) => x.id === id);
        if (p) void openExternalTerminal(p.command).catch(onError);
      });
      document.getElementById("llm-term")?.addEventListener("click", () => {
        void openExternalTerminal(null).catch(onError);
      });
      document.getElementById("llm-presets")?.addEventListener("click", () => {
        showPresetsModal(refreshLlmPresets);
      });
    }

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

    $("userbtn").addEventListener("click", () => {
      const menu = $("usermenu");
      let pop = menu.querySelector(".menu-pop");
      if (pop) { pop.remove(); return; }
      pop = document.createElement("div");
      pop.className = "menu-pop";
      pop.innerHTML = `<button id="um-name" type="button">Cambiar nombre</button><button id="um-folder" type="button">Cambiar carpeta</button>`;
      menu.appendChild(pop);
      document.getElementById("um-name")!.addEventListener("click", () => {
        pop!.remove();
        void (async () => {
          const n = await promptText("¿Tu nombre?", { initial: me.name });
          if (n) { setName(n); me = { name: n, email: n }; renderUserBtn(); }
        })().catch(onError);
      });
      document.getElementById("um-folder")!.addEventListener("click", () => { pop!.remove(); changeFolder(); });
    });

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
    const openInspector = (tab: string): void => {
      inspector.setTab(tab);
      if (tab === "capas") renderLayers();
      reflectInspectorToggle();
    };
    $("tab-capas").addEventListener("click", () => openInspector("capas"));
    $("tab-props").addEventListener("click", () => openInspector("propiedades"));
    $("tab-docs").addEventListener("click", () => { inspector.setTab("documentacion"); void docsController?.refresh(); reflectInspectorToggle(); });
    $("tab-fuentes").addEventListener("click", () => { inspector.setTab("fuentes"); void renderFuentes(); reflectInspectorToggle(); });
    $("toggle-inspector").addEventListener("click", () => {
      if (inspector.isVisible()) inspector.hide();
      else { inspector.setTab(inspector.activeTab() ?? "capas"); renderLayers(); void renderFuentes(); }
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
    if (!getColl("inspector", true)) { inspector.setTab(inspector.activeTab() ?? "capas"); renderLayers(); void renderFuentes(); }
    else inspector.hide();
    reflectInspectorToggle();
    $("settings").addEventListener("click", () => renderVizSettings());
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
    $("undo").addEventListener("click", () => void doUndo().catch(onError));
    $("redo").addEventListener("click", () => void doRedo().catch(onError));
    $("save").addEventListener("click", guard(async () => { if (state.kind === "editing") await publish(state.fileId); }));
    // Local group: manual draft save + autosave on/off toggle.
    $("savedraft").addEventListener("click", guard(async () => {
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
    const previewing = previewingRid !== null;
    // Compare is pure visualization — both panes read-only, so editing/publishing is off.
    const compareRO = comparing;
    const unpublished = st !== null && (st.dirty || hasDraft(folderId, st.fileId));
    // Notorious frame means "you hold a reservation" — suppressed while previewing or
    // comparing, where the indigo preview / teal compare frame takes over instead.
    document.body.classList.toggle("app-editing", mine && !previewing && !comparing);
    document.body.classList.remove("app-readonly");
    const chip = el("filechip");
    if (chip) {
      if (st) {
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
      if (el("preview")) (el("preview") as HTMLElement).innerHTML = "";
      if (el("compare")) (el("compare") as HTMLElement).innerHTML = "";
    }
    const saveBtn = document.getElementById("save") as HTMLButtonElement | null;
    // Never publish from a read-only preview / read-only compare (would push an old version).
    if (saveBtn) saveBtn.disabled = !unpublished || previewing || compareRO;
    const dot = document.getElementById("savedot");
    if (dot) (dot as HTMLElement).hidden = !unpublished;
    const undo = document.getElementById("undo") as HTMLButtonElement | null;
    const redo = document.getElementById("redo") as HTMLButtonElement | null;
    const editable = editing && !previewing && !compareRO;
    if (undo) undo.disabled = !editable || (!canNativeUndo() && coarseUndo.length === 0);
    if (redo) redo.disabled = !editable || (!canNativeRedo() && coarseRedo.length === 0);
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
    if (savedraft) savedraft.disabled = !editable;
    updateLocalStatus();
    reflowToolbar(); // button visibility/label changes may alter the toolbar's width
    armIdle(); // (re)start the inactivity timer when we hold a reservation; clears otherwise
  }

  // Renders the file browser for the given tree using whatever `mastersCache` currently
  // holds (may lag one refresh cycle behind while refreshMastersCache is still running —
  // see refreshFileList).
  function renderTree(clean: TreeEntry[]): void {
    const selectedId = state.kind === "editing" ? state.fileId : null;
    renderFileTree(
      document.getElementById("files")!,
      clean,
      { expanded, selectedId, me, masters: mastersCache },
      {
        onOpen: (id) => void openFile(id).catch(onError),
        onToggle: (path) => { if (expanded.has(path)) expanded.delete(path); else expanded.add(path); void refreshFileList().catch(onError); },
        onNewFile: (parent) => void newDiagramIn(parent).catch(onError),
        onNewFolder: (parent) => void newFolderIn(parent).catch(onError),
        onMenu: (target, anchor) => openItemMenu(target, anchor),
      },
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
  function updateLocalStatus(): void {
    const s = document.getElementById("localstatus");
    if (!s) return;
    if (state.kind !== "editing") { s.textContent = ""; s.classList.remove("dirty"); return; }
    s.textContent = draftPending ? "● Sin guardar" : "✓ Guardado local";
    s.classList.toggle("dirty", draftPending);
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
    if (state.kind !== "editing" || previewingRid !== null || comparing) return;
    if (canNativeUndo()) { try { modeler.get("commandStack").undo(); } catch { /* noop */ } return; }
    if (!coarseUndo.length) return;
    coarseRedo.push(await editor.getXml());
    await applyCoarseSnapshot(coarseUndo.pop() as string);
    showToast("Se deshizo la restauración");
  }
  async function doRedo(): Promise<void> {
    if (state.kind !== "editing" || previewingRid !== null || comparing) return;
    if (canNativeRedo()) { try { modeler.get("commandStack").redo(); } catch { /* noop */ } return; }
    if (!coarseRedo.length) return;
    coarseUndo.push(await editor.getXml());
    await applyCoarseSnapshot(coarseRedo.pop() as string);
    showToast("Se rehizo la restauración");
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
    const edit = document.createElement("button");
    edit.className = "btn";
    edit.type = "button";
    edit.textContent = "Editar el mapa";
    edit.title = "Abrir el mapa en el editor normal";
    edit.addEventListener("click", () => {
      const f = currentMasterFile;
      if (f) void openFile(f, { asPlainEditor: true }).catch(onError);
    });
    bar.append(crumb, edit);
    (bar as HTMLElement).hidden = false;
  }

  // Toggle the "Elegí una etapa en el mapa" placeholder that stands in for the bottom
  // editor while a master is open but no stage has been picked yet.
  function showStageHint(show: boolean): void {
    const hint = document.getElementById("stage-hint");
    if (hint) (hint as HTMLElement).hidden = !show;
    document.body.classList.toggle("master-no-stage", show);
  }

  async function enterMasterMode(fileId: string, masterXml: string): Promise<void> {
    currentMasterFile = fileId;
    closeLinkPopover();
    document.body.classList.add("master-mode");
    const mc = document.getElementById("master-canvas") as HTMLElement | null;
    if (mc) mc.hidden = false;
    (document.getElementById("map-offer") as HTMLElement | null)?.setAttribute("hidden", "");
    renderBreadcrumb(null);
    showStageHint(true);
    if (masterHandle) { try { masterHandle.destroy(); } catch { /* gone */ } masterHandle = null; }
    if (mc) {
      mc.innerHTML = "";
      masterHandle = await mountMasterPane(mc, { registry, openStage, onError, onElementClick: onMasterElementClick });
      await masterHandle.load(masterXml);
    }
    // The map itself is not edited — leave "editing" until a stage is chosen below.
    dispatch({ type: "closedFile" });
  }

  function exitMasterMode(): void {
    if (!document.body.classList.contains("master-mode") && !masterHandle) return;
    closeLinkPopover();
    if (masterHandle) { try { masterHandle.destroy(); } catch { /* gone */ } masterHandle = null; }
    currentMasterFile = null;
    document.body.classList.remove("master-mode");
    showStageHint(false);
    const mc = document.getElementById("master-canvas") as HTMLElement | null;
    if (mc) { mc.hidden = true; mc.innerHTML = ""; }
    const bar = document.getElementById("master-bar") as HTMLElement | null;
    if (bar) { bar.hidden = true; bar.innerHTML = ""; }
  }

  // Drill-down: load a stage (subprocess) into the bottom editor via the normal path
  // (asPlainEditor bypasses master detection; keepMaster keeps the map pane mounted).
  async function openStage(file: string): Promise<void> {
    await openFile(file, { asPlainEditor: true, keepMaster: true });
    renderBreadcrumb(shortName(file));
    try {
      const xml = await api.getXml(file);
      masterHandle?.setCurrentStage((await parseDiagramInfo(xml)).processId);
    } catch { /* highlight is best-effort */ }
  }

  // Best-effort: if a directly-opened stage is referenced by some master in the folder,
  // offer to view it inside that master's map. Scans registry.all() (cheap for a folder).
  async function maybeOfferOpenInMap(fileId: string, xml: string): Promise<void> {
    const bar = document.getElementById("map-offer") as HTMLElement | null;
    if (!bar) return;
    bar.hidden = true;
    bar.innerHTML = "";
    if (document.body.classList.contains("master-mode")) return; // already in a map
    let masterFile: string | null = null;
    try {
      const pid = (await parseDiagramInfo(xml)).processId;
      if (pid) {
        for (const entry of registry.all()) {
          if (entry.file === fileId) continue;
          const mxml = await api.readPath(entry.file);
          if (!mxml) continue;
          const links = callLinksFromEls(await parseCallLinks(mxml));
          if (links.some((l) => l.calledElement === pid)) { masterFile = entry.file; break; }
        }
      }
    } catch { /* best-effort */ }
    if (!masterFile) return;
    const found = masterFile;
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

  async function openFile(fileId: string, opts?: { asPlainEditor?: boolean; keepMaster?: boolean }) {
    // Optimistic model: opening a file is immediately editable (no lock needed).
    // Flush the previous file's draft and drop any reservation we still hold.
    clearPreviewUI(); // leaving any active revision preview
    clearCompareUI(); // leaving any active compare
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
    await loadHistory(fileId);
    await loadLayers(fileId);
    await loadDocs(fileId);
    void renderFuentes();
    await ideasClientV2.migrateIfNeeded(fileId);
    await ideasClientV2.writeIndex(fileId, fileId.replace(/\.bpmn$/i, "").split("/").pop() ?? fileId);
    // keep the element index (_index.md) fresh even after external structural edits
    try { await docsController?.regenerateIndex(); } catch { /* index is best-effort */ }
    void ideasCtl?.refresh();
    if (ideaMode?.isOn()) void ideaMode.refresh();
    // A.2: a plain-opened stage may belong to a master's map — offer to view it there.
    if (!opts) void maybeOfferOpenInMap(fileId, shared).catch(onError);
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
    await loadHistory(fileId);
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

  // ---- Revision preview (read-only, with a notorious banner + canvas frame) ----
  // Enter loads a past revision read-only; exit restores the working version you had
  // before (your draft if any, else the shared latest). Publicar/undo/redo are
  // disabled while previewing so you can't accidentally publish an old version.
  async function enterPreview(fileId: string, rid: string, label: string): Promise<void> {
    if (state.kind !== "editing") return;
    if (previewingRid === null) {
      await flushDraft(); // persist any pending edits before the canvas shows the revision
      prePreviewXml = await editor.getXml(); // snapshot the working version once
    }
    const xml = await api.getRevisionXml(fileId, rid);
    await loadIntoEditor(xml);
    editor.setReadOnly(true);
    previewingRid = rid;
    document.body.classList.add("app-previewing");
    renderPreviewBar(document.getElementById("preview")!, label, {
      onExit: () => void exitPreview(fileId).catch(onError),
      onRestore: () => void restoreRevisionToDraft(fileId, rid).catch(onError),
    });
    render();
  }
  // Silently return the editor to the working version (draft/shared) and drop the preview
  // banner, WITHOUT touching the selection or toasting. Used by mode transitions
  // (preview→compare, preview→working). Callers own the checkbox state and any toast.
  async function restoreWorking(): Promise<void> {
    if (previewingRid === null) return;
    const fileId = state.kind === "editing" ? state.fileId : null;
    const xml = prePreviewXml ?? (fileId ? (loadDraft(folderId, fileId) ?? (await api.getXml(fileId))) : null);
    clearPreviewUI(); // drops banner/frame + nulls previewingRid/prePreviewXml
    if (xml != null) { await loadIntoEditor(xml); editor.setReadOnly(false); }
  }
  // "Volver a la versión actual" (preview bar): restore working, untick the checkbox, toast.
  async function exitPreview(_fileId: string): Promise<void> {
    if (previewingRid === null) return;
    await restoreWorking();
    compareSel = [];
    renderHistoryPanelNow();
    render();
    showToast("Volviste a la versión actual");
  }
  // "↩ Restaurar esta versión" (preview bar): bring the previewed revision into your draft
  // (replacing the working version), then leave preview.
  async function restoreRevisionToDraft(fileId: string, rid: string): Promise<void> {
    const xml = await api.getRevisionXml(fileId, rid);
    // Snapshot the working version you had BEFORE going into history, so Ctrl+Z / the
    // Deshacer button can revert this restore even though importXML wipes the native
    // command stack. prePreviewXml holds it (read it before clearPreviewUI nulls it).
    const preRestore = prePreviewXml ?? loadDraft(folderId, fileId) ?? (await api.getXml(fileId));
    coarseUndo.push(preRestore);
    coarseRedo.length = 0;
    clearPreviewUI(); // leaving preview WITHOUT restoring the old working — we replace it
    compareSel = [];
    await loadIntoEditor(xml);
    editor.setReadOnly(false);
    saveDraft(folderId, fileId, xml); // becomes your unpublished draft
    draftPending = false;
    dispatch({ type: "dirtyChanged", dirty: true });
    updateLocalStatus();
    renderHistoryPanelNow();
    render();
    showToast("Restaurado en tu borrador — Ctrl+Z para deshacer, o Publicá para compartir");
  }
  // Drop the preview banner/frame WITHOUT restoring (used by restoreWorking + file switch).
  function clearPreviewUI(): void {
    previewingRid = null;
    prePreviewXml = null;
    document.body.classList.remove("app-previewing");
    const pv = document.getElementById("preview");
    if (pv) pv.innerHTML = "";
  }

  // ---- Compare mode: side-by-side revision diff (left = actual/latest, right = a
  // revision), viewport-synced, coloured on both panes; the "actual" left is editable. ----
  const $el = (id: string): HTMLElement | null => document.getElementById(id);
  // Ordering: "actual" is the newest; revision ids are numeric timestamps.
  const recencyOf = (id: string): number => (id === "actual" ? Infinity : Number(id) || 0);
  const compareLabelOf = (id: string): string =>
    id === "actual" ? "Actual (editable)" : (comparePoints.find((p) => p.id === id)?.label ?? id);
  function applyCompareOrientation(): void {
    $el("canvasarea")?.classList.toggle("vertical", compareOrientation === "v");
  }
  function toggleCompareOrientation(): void {
    compareOrientation = compareOrientation === "h" ? "v" : "h";
    try { localStorage.setItem("bpmn-compartida.compareOrientation", compareOrientation); } catch { /* ignore */ }
    applyCompareOrientation();
    renderCompareBarNow();
    renderHistoryPanelNow(); // badges follow orientation (izq/der ↔ arriba/abajo)
  }
  // History checkbox toggled: keep at most 2 (FIFO), then compare (2) or exit (<2).
  function toggleCompareSel(id: string, checked: boolean): void {
    if (checked) {
      if (!compareSel.includes(id)) compareSel.push(id);
      while (compareSel.length > 2) compareSel.shift();
    } else {
      compareSel = compareSel.filter((x) => x !== id);
    }
    renderHistoryPanelNow();
    void applyCompareSelection().catch(onError);
  }
  // The single dispatcher for the checkbox selection. It routes to one of three modes by
  // how many rows are checked: 2 → compare, 1 revision → preview, 0/only-"Actual" → working.
  async function applyCompareSelection(): Promise<void> {
    if (state.kind !== "editing") return;
    const fileId = state.fileId;

    // --- 2 checked → compare ---
    if (compareSel.length === 2) {
      // Coming from preview? Restore the working version first, so the "Actual" left pane
      // and the exit-restore use the real working version — not the previewed revision.
      if (previewingRid !== null) await restoreWorking();
      const [a, b] = [...compareSel].sort((x, y) => recencyOf(y) - recencyOf(x)); // a newer, b older
      compareLeft = a;
      compareRight = b; // always a revision id ("actual" is newest → always left)
      if (!comparing) {
        await flushDraft();
        preCompareXml = await editor.getXml();
        compareEdited = false;
        comparing = true;
        const c2 = $el("canvas2")!;
        c2.hidden = false;
        $el("canvasarea")?.classList.add("split");
        applyCompareOrientation();
        document.body.classList.add("app-comparing");
        if (!compareViewer) {
          compareViewer = await createCompareModeler(c2); // BpmnModeler: select + copyPaste + pan
          installViewSelectGuard(compareViewer as unknown as { get(n: string): any }); // no editing
          enableRubberBandSelect(compareViewer as unknown as { get(n: string): any }); // Shift+drag = box-select
          compareViewer.get("eventBus").on("selection.changed", () => renderCompareBarNow()); // live copy count
        }
      }
      await renderCompare();
      renderCompareBarNow();
      render();
      return;
    }

    // --- <2 checked → not comparing (restores the working version, keeps the checks) ---
    if (comparing) await exitCompare({ clearChecks: false });

    // --- 1 revision checked → preview it (works from working OR just-exited compare) ---
    const singleRev = compareSel.length === 1 && compareSel[0] !== "actual" ? compareSel[0] : null;
    if (singleRev) {
      await enterPreview(fileId, singleRev, compareLabelOf(singleRev));
      return;
    }
    // --- 0 checked, or only "Actual" → back to the editable working version ---
    if (previewingRid !== null) { await restoreWorking(); render(); showToast("Volviste a la versión actual"); }
  }
  async function renderCompare(): Promise<void> {
    if (!comparing || state.kind !== "editing" || !compareRight || !compareViewer) return;
    const fileId = state.fileId;
    const rightXml = await api.getRevisionXml(fileId, compareRight);
    const leftXml = compareLeft === "actual" ? (preCompareXml ?? (await api.getXml(fileId))) : (await api.getRevisionXml(fileId, compareLeft));
    await editor.load(leftXml);
    editor.setReadOnly(true); // compare is pure visualization — the left pane is read-only too
    try { modeler.get("canvas").zoom("fit-viewport"); } catch { /* ok */ }
    await compareViewer.importXML(rightXml);
    try { compareViewer.get("canvas").zoom("fit-viewport"); } catch { /* ok */ }
    await applyCompareDiff(rightXml, leftXml);
    if (compareUnsync) compareUnsync();
    compareUnsync = syncViewport(modeler, compareViewer as unknown as { get(n: string): any });
  }
  async function applyCompareDiff(oldXml: string, newXml: string): Promise<void> {
    if (!compareViewer) return;
    const changes = await computeDiff(oldXml, newXml); // old = right (older), new = left (newer)
    const leftCanvas = modeler.get("canvas");
    const rightCanvas = compareViewer.get("canvas");
    clearDiffMarkers(leftCanvas, compareMarkedLeft);
    clearDiffMarkers(rightCanvas, compareMarkedRight);
    compareMarkedLeft = applyDiffMarkers(leftCanvas, changes, "new"); // left = newer
    compareMarkedRight = applyDiffMarkers(rightCanvas, changes, "old"); // right = older
  }
  function renderCompareBarNow(): void {
    if (!comparing || !compareRight) return;
    let copyCount = 0;
    try { copyCount = compareViewer ? compareViewer.get("selection").get().length : 0; } catch { copyCount = 0; }
    renderCompareBar($el("compare")!, {
      leftLabel: compareLabelOf(compareLeft),
      rightLabel: compareLabelOf(compareRight),
      orientation: compareOrientation,
      copyCount,
      canCopy: compareLeft === "actual", // paste only into the editable "Actual" pane
      onOrientation: toggleCompareOrientation,
      onCopy: () => void copySelectionToActual().catch(onError),
      onExit: () => void exitCompare().catch(onError),
    });
  }
  // Copy the elements selected in the historical (right) pane into the current working
  // diagram, with all their properties — reusing bpmn-js copyPaste. Valid only when the
  // left pane is "Actual" (= the working version underlies the main modeler). The paste is
  // a native command (undoable while comparing); on the FIRST paste we also push a coarse
  // snapshot so it stays undoable AFTER exit (importXML on exit wipes the native stack).
  async function copySelectionToActual(): Promise<void> {
    if (state.kind !== "editing" || !compareViewer || compareLeft !== "actual") return;
    const selected = compareViewer.get("selection").get();
    if (!selected.length) return;
    if (!compareEdited) { coarseUndo.push(preCompareXml ?? (await editor.getXml())); coarseRedo.length = 0; }
    const tree = compareViewer.get("copyPaste").copy(selected); // serializable descriptor
    const targetCanvas = modeler.get("canvas");
    modeler.get("clipboard").set(tree);
    const vb = targetCanvas.viewbox();
    const pasted = modeler.get("copyPaste").paste({ element: targetCanvas.getRootElement(), point: { x: vb.x + vb.width / 2, y: vb.y + vb.height / 2 } });
    try { if (Array.isArray(pasted) && pasted.length) modeler.get("selection").select(pasted); } catch { /* ok */ }
    compareEdited = true;
    preCompareXml = await editor.getXml(); // exit keeps the paste
    saveDraft(folderId, state.fileId, preCompareXml); // unpublished draft survives exit (drives Publicar)
    draftPending = false;
    dispatch({ type: "dirtyChanged", dirty: true });
    updateLocalStatus();
    renderCompareBarNow();
    showToast(`${selected.length} elemento(s) copiados a tu versión actual — Publicá para compartir`);
  }
  function teardownCompare(): void {
    comparing = false;
    if (compareUnsync) { compareUnsync(); compareUnsync = null; }
    try { clearDiffMarkers(modeler.get("canvas"), compareMarkedLeft); } catch { /* ok */ }
    compareMarkedLeft = [];
    compareMarkedRight = [];
    if (compareViewer) { try { compareViewer.destroy(); } catch { /* ok */ } compareViewer = null; }
    const c2 = $el("canvas2");
    if (c2) { c2.hidden = true; c2.innerHTML = ""; }
    $el("canvasarea")?.classList.remove("split");
    document.body.classList.remove("app-comparing");
    const bar = $el("compare");
    if (bar) bar.innerHTML = "";
  }
  async function exitCompare(opts: { clearChecks?: boolean } = {}): Promise<void> {
    if (!comparing) return;
    const fileId = state.kind === "editing" ? state.fileId : null;
    // Bring back the working version. preCompareXml carries any elements copied from the
    // historical pane (copySelectionToActual updates it), so those survive exit; the draft
    // was already persisted at copy time so Publicar stays enabled afterwards.
    const restore = preCompareXml ?? (fileId ? (loadDraft(folderId, fileId) ?? (await api.getXml(fileId))) : null);
    teardownCompare();
    preCompareXml = null;
    compareEdited = false;
    compareRight = null;
    if (opts.clearChecks !== false) compareSel = []; // "Salir" clears checks; unchecking keeps them
    if (restore != null) { await loadIntoEditor(restore); editor.setReadOnly(false); }
    renderHistoryPanelNow(); // reflect cleared/kept checkboxes
    render();
    showToast("Saliste de la comparación");
  }
  // Drop compare state without restoring (used on file switch).
  function clearCompareUI(): void {
    if (!comparing) return;
    teardownCompare();
    preCompareXml = null;
    compareEdited = false;
    compareRight = null;
    compareSel = [];
  }

  // Render the History panel from the cached points + current checkbox state. The
  // checkbox IS the version picker: toggleCompareSel routes to preview (1) / compare (2).
  // Per-version actions (Restaurar) live in the preview bar, not the rows.
  function renderHistoryPanelNow(): void {
    const panel = document.getElementById("history");
    if (!panel) return;
    renderHistoryPanel(panel, historyPoints, {
      compare: { selected: compareSel, onToggle: toggleCompareSel, orientation: compareOrientation },
    });
  }

  async function loadHistory(fileId: string) {
    const revs = await api.listRevisions(fileId);
    historyPoints = revs
      .map((r) => toRestorePoint(r, me))
      .sort((a, b) => Date.parse(b.modifiedTime) - Date.parse(a.modifiedTime));
    comparePoints = historyPoints.map((p) => ({
      id: p.id,
      label: `${new Date(p.modifiedTime).toLocaleString()} — ${p.authorName}${p.isExternal ? " (externo)" : ""}`,
    }));
    // Don't force the pane visible — the inspector owns tab visibility (setTab).
    renderHistoryPanelNow();
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
