import { icon, type IconName } from "./icons";

export interface InspectorTab {
  id: string;
  label: string;   // tooltip + accessible name
  icon: IconName;  // rail glyph
}

export function createInspector(container: HTMLElement, tabs: InspectorTab[], onChange?: (id: string) => void) {
  container.innerHTML = "";
  container.classList.add("inspector");
  // Vertical icon rail (always visible) + the pane area (collapses independently).
  const rail = document.createElement("div");
  rail.className = "inspector-rail";
  const panesWrap = document.createElement("div");
  panesWrap.className = "inspector-panes";

  const panes: Record<string, HTMLElement> = {};
  const buttons: Record<string, HTMLButtonElement> = {};
  let active: string | null = null;

  function setTab(id: string): void {
    if (!panes[id]) return;
    const changed = active !== id;
    active = id;
    for (const t of tabs) {
      panes[t.id].hidden = t.id !== id;
      buttons[t.id].classList.toggle("active", t.id === id);
    }
    show();
    if (changed) onChange?.(id);
  }
  // Hide/show a tab BUTTON (its pane visibility is still driven by setTab). Used
  // for tabs that only exist in a specific mode (e.g. Ideas under idea mode).
  function setTabVisible(id: string, visible: boolean): void {
    if (buttons[id]) buttons[id].hidden = !visible;
  }
  // Collapse is now on the PANES only — the rail stays visible (activity-bar style).
  function show(): void { container.classList.remove("collapsed"); }
  function hide(): void { container.classList.add("collapsed"); }
  function isVisible(): boolean { return !container.classList.contains("collapsed"); }

  for (const t of tabs) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "inspector-tab";
    b.innerHTML = icon(t.icon);
    b.title = t.label;
    b.setAttribute("aria-label", t.label);
    b.dataset.tab = t.id;
    // Clicking the active tab while panes are open collapses them; otherwise open+switch.
    b.addEventListener("click", () => {
      if (active === t.id && isVisible()) hide();
      else setTab(t.id);
    });
    rail.appendChild(b);
    buttons[t.id] = b;

    const p = document.createElement("div");
    p.className = "inspector-pane";
    p.dataset.pane = t.id;
    p.hidden = true;
    panesWrap.appendChild(p);
    panes[t.id] = p;
  }

  container.appendChild(rail);
  container.appendChild(panesWrap);
  if (tabs.length) setTab(tabs[0].id);

  return {
    setTab,
    setTabVisible,
    activeTab: (): string | null => active,
    paneEl: (id: string): HTMLElement => panes[id],
    show,
    hide,
    isVisible,
  };
}

export type Inspector = ReturnType<typeof createInspector>;
