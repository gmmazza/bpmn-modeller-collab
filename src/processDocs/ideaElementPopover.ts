import type { IdeaNote } from "./ideaNote";
import { STATE_GLYPH } from "./ideasPanelView";

export interface ElementPopoverHandlers {
  onOpenThread(ideaId: string): void;
  onAddIdea(text: string): void;
  onClose(): void;
}

export function openIdeaElementPopover(
  anchor: { left: number; top: number },
  elementLabel: string,
  ideas: IdeaNote[],
  h: ElementPopoverHandlers,
): { close(): void } {
  const pop = document.createElement("div");
  pop.className = "menu-pop idea-element-pop";
  pop.style.position = "fixed";
  pop.style.left = `${anchor.left}px`;
  pop.style.top = `${anchor.top}px`;

  const title = document.createElement("div");
  title.className = "idea-pop-title";
  title.textContent = elementLabel;
  pop.append(title);

  if (ideas.length === 0) {
    const empty = document.createElement("div");
    empty.className = "idea-pop-empty";
    empty.textContent = "Sin ideas todavía.";
    pop.append(empty);
  } else {
    for (const idea of ideas) {
      const row = document.createElement("button");
      row.dataset.popIdea = "true";
      row.className = "idea-pop-row";
      row.textContent = `${STATE_GLYPH[idea.estado]} ${idea.description.split("\n")[0]}`;
      row.addEventListener("click", () => { close(); h.onOpenThread(idea.id); });
      pop.append(row);
    }
  }

  const addRow = document.createElement("div");
  addRow.className = "idea-pop-add";
  const input = document.createElement("input");
  input.dataset.popInput = "true";
  input.placeholder = "Nueva idea acá…";
  const addBtn = document.createElement("button");
  addBtn.dataset.popAdd = "true";
  addBtn.textContent = "Agregar";
  addBtn.addEventListener("click", () => {
    const t = input.value.trim();
    if (!t) return;
    input.value = "";
    h.onAddIdea(t);
  });
  addRow.append(input, addBtn);
  pop.append(addRow);

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
    if (!pop.contains(e.target as Node)) { close(); h.onClose(); }
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") { close(); h.onClose(); }
  }
  // Defer so the opening click doesn't immediately dismiss it.
  setTimeout(() => {
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);

  return { close };
}
