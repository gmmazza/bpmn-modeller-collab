import { anchoredCounts, type Idea } from "./ideasModel";

export interface OverlayHost {
  add(elementId: string, html: HTMLElement): string;
  remove(id: string): void;
}

export function ideaBadge(count: number): HTMLElement {
  const el = document.createElement("div");
  el.className = "idea-badge";
  el.title = `${count} idea(s) pendiente(s)`;
  el.textContent = `💡 ${count}`;
  return el;
}

export function createIdeaOverlays(host: OverlayHost) {
  let ids: string[] = [];
  function clear(): void {
    for (const id of ids) host.remove(id);
    ids = [];
  }
  return {
    clear,
    render(ideas: Idea[]): void {
      clear();
      for (const { elementId, count } of anchoredCounts(ideas)) {
        try {
          ids.push(host.add(elementId, ideaBadge(count)));
        } catch {
          /* element not on canvas (e.g. deleted) — skip */
        }
      }
    },
  };
}
