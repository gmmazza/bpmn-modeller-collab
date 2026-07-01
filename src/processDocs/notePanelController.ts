// src/processDocs/notePanelController.ts
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter";
import { buildIndexMarkdown, type IndexElement } from "./docsIndex";
import { renderNotePanel, type NoteMode, type NoteTab, type NotePanelState } from "./notePanel";
import { createMarkdownEditor, type MarkdownEditor } from "./cmEditor";
import { createAssetResolver, type AssetResolver } from "./assetResolver";
import type { DocsClient } from "./docsClient";
import { wikiCandidates } from "./wikiComplete";
import { parseWikilinkTarget, type WikiTarget } from "./wikilinks";
import { renderIdeasPanel } from "./ideasPanel";
import { createIdeaOverlays, type OverlayHost } from "./ideasOverlays";
import { parseIdeas, mergeIdeas, addIdea, toggleIdea, type Idea } from "./ideasModel";
import { createIdeasControllerV2 } from "./ideasControllerV2";

export interface DiagramElement {
  id: string;
  name: string;
  type: string;
}

export interface NoteControllerApi {
  docs: DocsClient;
  mount: HTMLElement;
  diagramId(): string;
  processName(): string;
  listElements(): DiagramElement[];
  getSelected(): DiagramElement | null;
  onSelectionChange(cb: () => void): void;
  wikiProcesses?(): string[];
  navigateWiki?(target: WikiTarget, raw: string): void;
  ideasOverlays?: OverlayHost;
  identity?(): string;
  today?(): string;
  ideasClient?: import("./ideasClient").IdeasClient;
  promptMotivo?(estado: string): string | null;
}

const PROCESS_TEMPLATE = "# Proceso\n\n_Describí para qué sirve este proceso, quién es el dueño y su alcance._\n";

export function createNotePanelController(api: NoteControllerApi) {
  let tab: NoteTab = "step";
  let mode: NoteMode = "read";
  let body = "";
  let hasNote = false;
  let editor: MarkdownEditor | null = null;
  let resolver: AssetResolver | null = null;
  let ideas: Idea[] = [];
  let ideasRaw = "";
  let showIdeas = localStorage.getItem("ideasShow") === "1";
  let filterPending = false;
  let overlays: ReturnType<typeof createIdeaOverlays> | null = null;
  let ideasCtl: ReturnType<typeof createIdeasControllerV2> | null = null;

  function destroyEditor(): void { editor?.destroy(); editor = null; }

  function refreshOverlays(): void {
    if (api.ideasOverlays && (tab === "ideas" || showIdeas)) {
      overlays ??= createIdeaOverlays(api.ideasOverlays);
      overlays.render(ideas);
    } else {
      overlays?.clear();
    }
  }

  async function saveIdeas(): Promise<void> {
    const merged = mergeIdeas(ideasRaw, api.processName(), ideas);
    await api.docs.writeIdeas(api.diagramId(), merged);
    ideasRaw = merged;
  }

  function rerenderIdeas(): void {
    render();
  }

  const ideasHandlers = {
    onAdd(text: string, anchorToSelection: boolean): void {
      const sel = anchorToSelection ? api.getSelected() : null;
      const idea: Idea = {
        done: false,
        anchor: sel ? sel.id : null,
        anchorLabel: sel ? sel.name : "",
        text,
        author: api.identity?.() ?? "",
        date: api.today?.() ?? "",
      };
      ideas = addIdea(ideas, idea);
      void saveIdeas().then(() => { rerenderIdeas(); refreshOverlays(); });
    },
    onToggle(i: number): void {
      ideas = toggleIdea(ideas, i);
      void saveIdeas().then(() => { rerenderIdeas(); refreshOverlays(); });
    },
    onToggleShow(on: boolean): void {
      showIdeas = on;
      try { localStorage.setItem("ideasShow", on ? "1" : "0"); } catch { /* ignore */ }
      refreshOverlays();
    },
    onToggleFilter(p: boolean): void {
      filterPending = p;
      rerenderIdeas();
    },
  };

  function rebuildResolver(): void {
    resolver?.dispose();
    resolver = createAssetResolver({ readAsset: (n) => api.docs.readAsset(api.diagramId(), n) });
  }

  async function regenerateIndex(): Promise<void> {
    const documented = new Set(await api.docs.listDocumentedIds(api.diagramId()));
    const elements: IndexElement[] = api.listElements().map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      hasNote: documented.has(e.id),
    }));
    await api.docs.writeIndex(api.diagramId(), buildIndexMarkdown(api.diagramId(), api.processName(), elements));
  }

  async function loadBody(): Promise<void> {
    const md = await api.docs.readIdeas(api.diagramId());
    ideasRaw = md ?? "";
    ideas = md ? parseIdeas(md) : [];
    refreshOverlays();

    if (tab === "process") {
      const raw = await api.docs.readProcessNote(api.diagramId());
      hasNote = raw !== null;
      body = raw === null ? "" : parseFrontmatter(raw).body;
      return;
    }
    if (tab === "ideas") {
      hasNote = false;
      body = "";
      return;
    }
    const sel = api.getSelected();
    if (!sel) {
      hasNote = false;
      body = "";
      return;
    }
    const raw = await api.docs.readNote(api.diagramId(), sel.id);
    hasNote = raw !== null;
    body = raw === null ? "" : parseFrontmatter(raw).body;
  }

  function state(): NotePanelState {
    const sel = api.getSelected();
    return {
      tab,
      mode,
      stepLabel: tab === "process" ? "Proceso" : sel ? sel.name : null,
      body,
      hasNote,
    };
  }

  function render(): void {
    renderNotePanel(api.mount, state(), {
      onTabChange: async (t) => {
        destroyEditor();
        tab = t;
        mode = "read";
        await loadBody();
        refreshOverlays();
        render();
      },
      onModeChange: (m) => {
        if (m !== "edit") destroyEditor();
        mode = m;
        render();
      },
      onBodyInput: (b) => {
        body = b;
      },
      onSave: async () => {
        await save();
        destroyEditor();
        mode = "read";
        render();
      },
      onCreateNote: async () => {
        hasNote = true;
        mode = "edit";
        body = tab === "process" ? PROCESS_TEMPLATE : "";
        render();
      },
      onEditHostReady: (host) => {
        destroyEditor();
        rebuildResolver();
        const media = {
          listAssets: () => api.docs.listAssets(api.diagramId()),
          writeAsset: (n: string, b: Uint8Array) => api.docs.writeAsset(api.diagramId(), n, b),
        };
        editor = createMarkdownEditor(host, {
          doc: body,
          onChange: (d) => { body = d; },
          media,
          resolveAsset: (ref) => resolver!.resolve(ref),
          wiki: api.navigateWiki
            ? {
                candidates: (q: string) => wikiCandidates(q, {
                  processes: api.wikiProcesses ? api.wikiProcesses() : [],
                  elements: api.listElements().map((e) => ({ id: e.id, name: e.name })),
                }),
                navigate: (raw: string) => api.navigateWiki!(parseWikilinkTarget(raw), raw),
              }
            : undefined,
        });
        editor.focus();
      },
      onReadHostReady: (readEl) => {
        rebuildResolver();
        const imgs = Array.from(readEl.querySelectorAll<HTMLImageElement>('img[src^="assets/"]'));
        for (const img of imgs) {
          const ref = img.getAttribute("src")!;
          resolver!.resolve(ref).then((url) => { if (url) img.src = url; });
        }
      },
      onIdeasHostReady: (host) => {
        if (api.ideasClient) {
          ideasCtl = createIdeasControllerV2({
            ideasClient: api.ideasClient,
            mount: host,
            diagramId: () => api.diagramId(),
            processName: () => api.processName(),
            identity: () => api.identity?.() ?? "",
            today: () => api.today?.() ?? "",
            getSelected: () => { const s = api.getSelected(); return s ? { id: s.id, name: s.name } : null; },
            promptMotivo: (e) => api.promptMotivo?.(e) ?? null,
            onAnchoredCounts: (_counts) => { /* overlays wired in Plan 3 */ },
          });
          void ideasCtl.refresh();
          return;
        }
        // fallback (no v2 client) keeps the old panel — remove once main.ts always provides it
        renderIdeasPanel(
          host,
          { ideas, showOnDiagram: showIdeas, filterPending, selectedLabel: api.getSelected()?.name ?? null },
          ideasHandlers,
        );
      },
    });
  }

  async function save(): Promise<void> {
    const text = editor ? editor.getDoc() : body;
    if (tab === "process") {
      await api.docs.writeProcessNote(api.diagramId(), text);
      hasNote = true;
      return;
    }
    const sel = api.getSelected();
    if (!sel) return;
    const serialized = serializeFrontmatter(
      { element: sel.id, name: sel.name, type: sel.type, diagram: api.diagramId() },
      text,
    );
    await api.docs.writeNote(api.diagramId(), sel.id, serialized);
    hasNote = true;
    await regenerateIndex();
  }

  api.onSelectionChange(async () => {
    if (tab !== "step") return;
    destroyEditor();
    mode = "read";
    await loadBody();
    render();
  });

  async function refresh(): Promise<void> {
    await loadBody();
    render();
  }

  function _setEditorDocForTest(s: string): void {
    if (editor) editor.setDoc(s); else body = s;
  }

  let _disposedForTest = false;

  function destroy(): void {
    destroyEditor();
    resolver?.dispose();
    resolver = null;
    overlays?.clear();
    overlays = null;
    _disposedForTest = true;
  }

  function openIdeasTab(): void {
    destroyEditor();
    tab = "ideas";
    mode = "read";
    refreshOverlays();
    render();
    void ideasCtl?.refresh();
  }

  return { refresh, setSelected: refresh, _setEditorDocForTest, destroy, _isDisposedForTest: () => _disposedForTest, openIdeasTab };
}
