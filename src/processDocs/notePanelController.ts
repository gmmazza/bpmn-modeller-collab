// src/processDocs/notePanelController.ts
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter";
import { buildIndexMarkdown, type IndexElement } from "./docsIndex";
import { renderNotePanel, type NoteMode, type NoteTab, type NotePanelState } from "./notePanel";
import { createMarkdownEditor, type MarkdownEditor } from "./cmEditor";
import { createAssetResolver, type AssetResolver } from "./assetResolver";
import type { DocsClient } from "./docsClient";

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
}

const PROCESS_TEMPLATE = "# Proceso\n\n_Describí para qué sirve este proceso, quién es el dueño y su alcance._\n";

export function createNotePanelController(api: NoteControllerApi) {
  let tab: NoteTab = "step";
  let mode: NoteMode = "read";
  let body = "";
  let hasNote = false;
  let editor: MarkdownEditor | null = null;
  let resolver: AssetResolver | null = null;

  function destroyEditor(): void { editor?.destroy(); editor = null; }

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
    if (tab === "process") {
      const raw = await api.docs.readProcessNote(api.diagramId());
      hasNote = raw !== null;
      body = raw === null ? "" : parseFrontmatter(raw).body;
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
    _disposedForTest = true;
  }

  return { refresh, setSelected: refresh, _setEditorDocForTest, destroy, _isDisposedForTest: () => _disposedForTest };
}
