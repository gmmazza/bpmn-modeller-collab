// Popover for an end event in the subprocess editor: "Marcar como resultado alternativo"
// (with a destination picker of master stages/ends) when it is a plain end, or "Volver a
// resultado normal" when it is already an escalation. Mirrors linkPopover.ts.
export interface OutcomeEnd { id: string; name: string; isEscalation: boolean }
export interface OutcomeDestination { id: string; label: string }
export interface OutcomePopoverDeps {
  end: OutcomeEnd;
  destinations: OutcomeDestination[];
  onMarkAlternative(destinationId: string): void | Promise<void>;
  onRevertNormal(): void | Promise<void>;
}

export function renderOutcomePopover(anchor: DOMRect, deps: OutcomePopoverDeps): HTMLElement {
  const pop = document.createElement("div");
  pop.className = "menu-pop idea-element-pop outcome-pop";
  pop.style.position = "fixed";
  pop.style.left = `${anchor.left}px`;
  pop.style.top = `${anchor.bottom}px`;

  const title = document.createElement("div");
  title.className = "idea-pop-title";
  title.textContent = deps.end.name || deps.end.id;
  pop.append(title);

  if (deps.end.isEscalation) {
    const revert = document.createElement("button");
    revert.dataset.act = "volver";
    revert.className = "idea-pop-row";
    revert.type = "button";
    revert.textContent = "Volver a resultado normal";
    revert.addEventListener("click", () => { close(); void deps.onRevertNormal(); });
    pop.append(revert);
  } else {
    const select = document.createElement("select");
    select.dataset.destSelect = "true";
    for (const d of deps.destinations) {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.label;
      select.append(opt);
    }
    const mark = document.createElement("button");
    mark.dataset.act = "marcar";
    mark.className = "idea-pop-row";
    mark.type = "button";
    mark.textContent = "Marcar como resultado alternativo";
    mark.addEventListener("click", () => { const dest = select.value; if (!dest) return; close(); void deps.onMarkAlternative(dest); });
    pop.append(select, mark);
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
  function onOutside(e: MouseEvent): void { if (!pop.contains(e.target as Node)) close(); }
  function onKey(e: KeyboardEvent): void { if (e.key === "Escape") close(); }
  setTimeout(() => {
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);

  return pop;
}
