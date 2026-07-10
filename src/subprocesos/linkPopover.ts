// Link popover for a call-activity box on the master pane: offers "Vincular" (pick an
// existing process) + "Crear" when unlinked, or "Desvincular" when already linked.
// Drilling into the linked subprocess is double-click only (see masterPane.ts's
// onDrill), so this popover no longer offers a redundant "Ir al subproceso" action.
// Mirrors processDocs/ideaElementPopover.ts's container/positioning/dismiss pattern;
// unlike it, this returns the raw HTMLElement (not a {close()} handle) so pure
// render/behavior can be asserted directly in tests.
export interface LinkPopoverElement {
  id: string;
  name: string;
  calledElement?: string;
}

export interface LinkPopoverProcess {
  processId: string;
  file: string;
}

export interface LinkPopoverDeps {
  element: LinkPopoverElement;
  processes: LinkPopoverProcess[];
  onLinkExisting(processId: string): void | Promise<void>;
  onCreateNew(): void | Promise<void>;
  onUnlink(): void | Promise<void>;
}

export function renderLinkPopover(anchor: DOMRect, deps: LinkPopoverDeps): HTMLElement {
  const pop = document.createElement("div");
  pop.className = "menu-pop idea-element-pop link-pop";
  pop.style.position = "fixed";
  pop.style.left = `${anchor.left}px`;
  pop.style.top = `${anchor.bottom}px`;

  const title = document.createElement("div");
  title.className = "idea-pop-title";
  title.textContent = deps.element.name || deps.element.id;
  pop.append(title);

  if (deps.element.calledElement) {
    const unlinkBtn = document.createElement("button");
    unlinkBtn.dataset.act = "desvincular";
    unlinkBtn.className = "idea-pop-row";
    unlinkBtn.type = "button";
    unlinkBtn.textContent = "Desvincular";
    unlinkBtn.addEventListener("click", () => { close(); void deps.onUnlink(); });
    pop.append(unlinkBtn);
  } else {
    const linkRow = document.createElement("div");
    linkRow.className = "link-pop-vincular";

    const select = document.createElement("select");
    select.dataset.linkSelect = "true";
    for (const p of deps.processes) {
      const opt = document.createElement("option");
      opt.value = p.processId;
      opt.textContent = `${p.processId} (${p.file})`;
      select.append(opt);
    }

    const linkBtn = document.createElement("button");
    linkBtn.dataset.act = "vincular";
    linkBtn.className = "idea-pop-row";
    linkBtn.type = "button";
    linkBtn.textContent = "Vincular subproceso…";
    linkBtn.addEventListener("click", () => {
      const processId = select.value;
      if (!processId) return;
      close();
      void deps.onLinkExisting(processId);
    });

    linkRow.append(select, linkBtn);
    pop.append(linkRow);

    const createBtn = document.createElement("button");
    createBtn.dataset.act = "crear";
    createBtn.className = "idea-pop-row";
    createBtn.type = "button";
    createBtn.textContent = "Crear subproceso nuevo";
    createBtn.addEventListener("click", () => { close(); void deps.onCreateNew(); });
    pop.append(createBtn);
  }

  document.body.append(pop);

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
    pop.remove();
  }
  function onOutside(e: MouseEvent): void {
    if (!pop.contains(e.target as Node)) close();
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
  }
  // Defer so the opening click/selection-change doesn't immediately dismiss it.
  setTimeout(() => {
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);

  return pop;
}
