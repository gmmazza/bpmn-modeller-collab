export interface InspectorTab {
  id: string;
  label: string;
}

export function createInspector(container: HTMLElement, tabs: InspectorTab[], onChange?: (id: string) => void) {
  container.innerHTML = "";
  container.classList.add("inspector");
  const tabbar = document.createElement("div");
  tabbar.className = "inspector-tabs";
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
  // Visibility is a slide (a `.collapsed` class animated via CSS margin) rather
  // than display:none, so the panel slides out/in and the canvas reclaims space.
  function show(): void {
    container.classList.remove("collapsed");
  }
  function hide(): void {
    container.classList.add("collapsed");
  }

  for (const t of tabs) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "inspector-tab";
    b.textContent = t.label;
    b.dataset.tab = t.id;
    b.addEventListener("click", () => setTab(t.id));
    tabbar.appendChild(b);
    buttons[t.id] = b;

    const p = document.createElement("div");
    p.className = "inspector-pane";
    p.dataset.pane = t.id;
    p.hidden = true;
    panesWrap.appendChild(p);
    panes[t.id] = p;
  }

  container.appendChild(tabbar);
  container.appendChild(panesWrap);
  if (tabs.length) setTab(tabs[0].id);

  return {
    setTab,
    setTabVisible,
    activeTab: (): string | null => active,
    paneEl: (id: string): HTMLElement => panes[id],
    show,
    hide,
    isVisible: (): boolean => !container.classList.contains("collapsed"),
  };
}

export type Inspector = ReturnType<typeof createInspector>;
