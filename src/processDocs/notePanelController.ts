// src/processDocs/notePanelController.ts
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter";
import { buildIndexMarkdown, type IndexElement } from "./docsIndex";
import { renderNotePanel, type NoteMode, type NoteTab, type NotePanelState } from "./notePanel";
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
        tab = t;
        mode = "read";
        await loadBody();
        render();
      },
      onModeChange: (m) => {
        mode = m;
        render();
      },
      onBodyInput: (b) => {
        body = b;
      },
      onSave: async () => {
        await save();
        mode = "read";
        render();
      },
      onCreateNote: async () => {
        hasNote = true;
        mode = "edit";
        body = tab === "process" ? PROCESS_TEMPLATE : "";
        render();
      },
    });
  }

  async function save(): Promise<void> {
    if (tab === "process") {
      await api.docs.writeProcessNote(api.diagramId(), body);
      hasNote = true;
      return;
    }
    const sel = api.getSelected();
    if (!sel) return;
    const text = serializeFrontmatter(
      { element: sel.id, name: sel.name, type: sel.type, diagram: api.diagramId() },
      body,
    );
    await api.docs.writeNote(api.diagramId(), sel.id, text);
    hasNote = true;
    await regenerateIndex();
  }

  api.onSelectionChange(async () => {
    if (tab !== "step") return;
    mode = "read";
    await loadBody();
    render();
  });

  async function refresh(): Promise<void> {
    await loadBody();
    render();
  }

  return { refresh, setSelected: refresh };
}
