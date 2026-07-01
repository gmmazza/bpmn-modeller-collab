import type { OverlayHost } from "./ideasOverlays";

export interface BadgeCount {
  elementId: string;
  count: number;
}

export function createIdeaBadges(host: OverlayHost, onBadgeClick: (elementId: string) => void) {
  let ids: string[] = [];

  function clear(): void {
    for (const id of ids) host.remove(id);
    ids = [];
  }

  function render(counts: BadgeCount[]): void {
    clear();
    for (const { elementId, count } of counts) {
      if (count <= 0) continue;
      const el = badgeEl(count);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onBadgeClick(elementId);
      });
      ids.push(host.add(elementId, el));
    }
  }

  return { render, clear };
}

function badgeEl(count: number): HTMLElement {
  const b = document.createElement("div");
  b.className = "idea-badge idea-badge-clickable";
  b.title = `${count} idea(s) activa(s) — abrir`;
  b.textContent = `💡 ${count}`;
  return b;
}
