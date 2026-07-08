// src/processDocs/ideaMode.ts
import type { IdeasClient } from "./ideasClient";
import type { IdeaNote } from "./ideaNote";
import { activeAnchoredCounts } from "./ideaFilters";
import { createIdeaBadges, type BadgeCount } from "./ideaBadges";
import { openIdeaElementPopover } from "./ideaElementPopover";
import type { OverlayHost } from "./ideasOverlays";

export interface IdeaModeDeps {
  overlayHost: OverlayHost;
  ideasClient: IdeasClient;
  diagramId(): string;
  processName(): string;
  identity(): string;
  today(): string;
  elementLabel(elementId: string): string;
  clientRectFor(elementId: string): { left: number; top: number };
  openThreadInPanel(ideaId: string): void;
  focusElement(elementId: string): void;
  onPanelShouldRefresh(): void;
  persistGet(): boolean;
  persistSet(on: boolean): void;
  onModeChange(on: boolean): void;
}

export function createIdeaMode(deps: IdeaModeDeps) {
  let on = deps.persistGet();
  let counts: BadgeCount[] = [];
  let popover: { close(): void } | null = null;
  const badges = createIdeaBadges(deps.overlayHost, (elementId) => void onBadgeClick(elementId));

  function draw(): void {
    if (on) badges.render(counts);
    else badges.clear();
  }

  function setCounts(next: BadgeCount[]): void {
    counts = next;
    draw();
  }

  async function loadCounts(): Promise<void> {
    const ideas = await deps.ideasClient.listIdeas(deps.diagramId());
    counts = activeAnchoredCounts(ideas);
    draw();
  }

  function closePopover(): void {
    popover?.close();
    popover = null;
  }

  async function setEnabled(next: boolean): Promise<void> {
    if (on === next) return;
    on = next;
    deps.persistSet(on);
    deps.onModeChange(on);
    closePopover();
    if (on) await loadCounts();
    else badges.clear();
  }

  async function toggle(): Promise<void> {
    await setEnabled(!on);
  }

  async function onElementClick(elementId: string): Promise<void> {
    if (!on) return;
    closePopover();
    const all = await deps.ideasClient.listIdeas(deps.diagramId());
    const forEl = all.filter((i) => i.anchor === elementId);
    popover = openIdeaElementPopover(deps.clientRectFor(elementId), deps.elementLabel(elementId), forEl, {
      onOpenThread: (id) => { closePopover(); deps.openThreadInPanel(id); },
      onAddIdea: (text) => void addIdea(elementId, text),
      onClose: () => { popover = null; },
    });
  }

  // Clicking a badge focuses the panel on that element (its filtered idea list),
  // rather than jumping into one specific thread.
  function onBadgeClick(elementId: string): void {
    if (!on) return;
    deps.focusElement(elementId);
  }

  async function addIdea(elementId: string, text: string): Promise<void> {
    const id = await deps.ideasClient.nextIdeaId(deps.diagramId());
    const note: IdeaNote = {
      id, estado: "pendiente", anchor: elementId, anchorLabel: deps.elementLabel(elementId),
      autor: deps.identity(), fecha: deps.today(), motivo: "", mejora: "", fuente: null, description: text, comments: [],
    };
    await deps.ideasClient.writeIdea(deps.diagramId(), note);
    await deps.ideasClient.writeIndex(deps.diagramId(), deps.processName());
    closePopover();
    deps.onPanelShouldRefresh();
    await loadCounts();
  }

  return {
    isOn: () => on,
    toggle,
    setEnabled,
    setCounts,
    refresh: loadCounts,
    onElementClick,
    closePopover,
  };
}
