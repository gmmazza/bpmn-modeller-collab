// src/processDocs/ideasControllerV2.ts
import type { IdeasClient } from "./ideasClient";
import type { IdeaNote } from "./ideaNote";
import { filterIdeas, activeAnchoredCounts, type EstadoFilter, type ScopeFilter } from "./ideaFilters";
import { buildMejora } from "./promoteToMejora";
import { renderIdeasPanelV2 } from "./ideasPanelView";
import { renderIdeaThread } from "./ideaThreadView";
import { requiresMotivo, type IdeaState } from "./ideaState";
import { addComment } from "./ideaComments";

export interface IdeasV2Deps {
  ideasClient: IdeasClient;
  mount: HTMLElement;
  diagramId(): string;
  processName(): string;
  identity(): string;
  today(): string;
  getSelected(): { id: string; name: string } | null;
  clearSelection?(): void;
  promptMotivo(estado: string): string | null;
  onAnchoredCounts?(counts: Array<{ elementId: string; count: number }>): void;
}

export function createIdeasControllerV2(deps: IdeasV2Deps) {
  let ideas: IdeaNote[] = [];
  let estado: EstadoFilter = "todas";
  let scope: ScopeFilter = "todas";
  let objectFilter: string | null = null;
  let openId: string | null = null;

  function anchoredObjects(): { id: string; label: string }[] {
    const seen = new Map<string, string>();
    for (const i of ideas) if (i.anchor && !seen.has(i.anchor)) seen.set(i.anchor, i.anchorLabel || i.anchor);
    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  }

  async function reload(): Promise<void> {
    ideas = await deps.ideasClient.listIdeas(deps.diagramId());
    deps.onAnchoredCounts?.(activeAnchoredCounts(ideas));
  }
  async function persist(note: IdeaNote): Promise<void> {
    await deps.ideasClient.writeIdea(deps.diagramId(), note);
    await deps.ideasClient.writeIndex(deps.diagramId(), deps.processName());
    await reload();
  }

  function render(): void {
    if (openId) {
      const idea = ideas.find((i) => i.id === openId);
      if (!idea) { openId = null; render(); return; }
      renderIdeaThread(deps.mount, idea, {
        onBack: () => { openId = null; render(); },
        onSaveDescription: (text) => void persist({ ...idea, description: text }).then(render),
        onComment: (text) => void persist({ ...idea, comments: addComment(idea.comments, { author: deps.identity(), date: deps.today(), text }) }).then(render),
        onSetState: (e) => void setState(idea, e),
        onPromote: () => void promote(idea),
      });
      return;
    }
    // When an element is selected the panel focuses on it: the list is filtered
    // to its ideas and the quick-add anchors new ideas to it.
    const sel = deps.getSelected();
    const focus = sel ? { id: sel.id, label: sel.name } : null;
    let shown = filterIdeas(ideas, { estado, scope });
    if (focus) shown = shown.filter((i) => i.anchor === focus.id);
    else if (scope === "ancladas" && objectFilter) shown = shown.filter((i) => i.anchor === objectFilter);
    renderIdeasPanelV2(deps.mount, { ideas: shown, estado, scope, focus, objectOptions: anchoredObjects(), objectFilter }, {
      onAdd: (text) => void add(text),
      onEstado: (e) => { estado = e; render(); },
      onScope: (s) => { scope = s; if (s !== "ancladas") objectFilter = null; render(); },
      onOpen: (id) => { openId = id; render(); },
      onSetState: (id, e) => { const idea = ideas.find((i) => i.id === id); if (idea) void setState(idea, e); },
      onClearFocus: () => { deps.clearSelection?.(); render(); },
      onObjectFilter: (id) => { objectFilter = id; render(); },
    });
  }

  async function add(text: string): Promise<void> {
    const sel = deps.getSelected(); // anchor to the focused element, if any
    const id = await deps.ideasClient.nextIdeaId(deps.diagramId());
    const note: IdeaNote = { id, estado: "pendiente", anchor: sel ? sel.id : null, anchorLabel: sel ? sel.name : "", autor: deps.identity(), fecha: deps.today(), motivo: "", mejora: "", description: text, comments: [] };
    await persist(note);
    render();
  }

  async function setState(idea: IdeaNote, e: IdeaState): Promise<void> {
    let motivo = idea.motivo;
    let comments = idea.comments;
    if (requiresMotivo(e)) {
      const m = deps.promptMotivo(e);
      if (m === null || m.trim() === "") return; // cancelled — no change
      motivo = m.trim().replace(/\n/g, " "); // single line (frontmatter safe)
      comments = addComment(comments, { author: deps.identity(), date: deps.today(), text: `[${e}] ${motivo}` });
    }
    await persist({ ...idea, estado: e, motivo, comments });
    render();
  }

  async function promote(idea: IdeaNote): Promise<void> {
    const mejoraId = await deps.ideasClient.nextMejoraId(deps.diagramId());
    const { mejora, idea: updated } = buildMejora(idea, mejoraId, deps.today());
    await deps.ideasClient.writeMejora(deps.diagramId(), mejora);
    await persist(updated);
    render();
  }

  return {
    async refresh(): Promise<void> { await reload(); render(); },
    async openThread(id: string): Promise<void> { await reload(); openId = id; render(); },
    // Re-render for a canvas selection change (no reload); skipped while a thread
    // is open so it doesn't disrupt the thread view.
    syncSelection(): void { if (!openId) render(); },
  };
}
