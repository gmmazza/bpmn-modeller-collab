// src/processDocs/ideasPanel.ts
import type { Idea } from "./ideasModel";

export interface IdeasPanelState {
  ideas: Idea[];
  showOnDiagram: boolean;
  filterPending: boolean;
  selectedLabel: string | null;
}
export interface IdeasPanelHandlers {
  onAdd(text: string, anchorToSelection: boolean): void;
  onToggle(index: number): void;
  onToggleShow(on: boolean): void;
  onToggleFilter(pending: boolean): void;
}

export function renderIdeasPanel(container: HTMLElement, state: IdeasPanelState, h: IdeasPanelHandlers): void {
  container.innerHTML = "";
  container.className = "ideas-panel";

  // Quick-add
  const add = document.createElement("div");
  add.className = "ideas-add";
  const input = document.createElement("input");
  input.dataset.ideaInput = "true";
  input.placeholder = "Nueva idea…";
  const anchorLabel = document.createElement("label");
  anchorLabel.className = "ideas-anchor";
  const anchor = document.createElement("input");
  anchor.type = "checkbox";
  anchor.dataset.ideaAnchor = "true";
  anchor.disabled = !state.selectedLabel;
  if (state.selectedLabel) anchor.checked = true;
  anchorLabel.append(anchor, document.createTextNode(state.selectedLabel ? `Anclar a: ${state.selectedLabel}` : "Sin paso seleccionado"));
  const addBtn = document.createElement("button");
  addBtn.dataset.ideaAdd = "true";
  addBtn.textContent = "Agregar";
  addBtn.addEventListener("click", () => {
    const text = input.value.trim();
    if (text) h.onAdd(text, anchor.checked && !anchor.disabled);
  });
  add.append(input, anchorLabel, addBtn);

  // Controls
  const controls = document.createElement("div");
  controls.className = "ideas-controls";
  const show = document.createElement("input");
  show.type = "checkbox";
  show.dataset.ideaShow = "true";
  show.checked = state.showOnDiagram;
  show.addEventListener("change", () => h.onToggleShow(show.checked));
  const showL = document.createElement("label");
  showL.append(show, document.createTextNode("Mostrar en el diagrama"));
  const filter = document.createElement("input");
  filter.type = "checkbox";
  filter.dataset.ideaFilter = "true";
  filter.checked = state.filterPending;
  filter.addEventListener("change", () => h.onToggleFilter(filter.checked));
  const filterL = document.createElement("label");
  filterL.append(filter, document.createTextNode("Solo pendientes"));
  controls.append(showL, filterL);

  // List
  const list = document.createElement("ul");
  list.className = "ideas-list";
  state.ideas.forEach((idea, index) => {
    if (state.filterPending && idea.done) return;
    const li = document.createElement("li");
    li.className = idea.done ? "idea done" : "idea";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.dataset.ideaCheck = "true";
    check.checked = idea.done;
    check.addEventListener("change", () => h.onToggle(index));
    const body = document.createElement("span");
    body.className = "idea-body";
    const where = idea.anchor ? `${idea.anchorLabel || idea.anchor}` : "general";
    body.textContent = `${idea.text}  ·  ${where}  ·  ${idea.author}, ${idea.date}`;
    li.append(check, body);
    list.append(li);
  });

  container.append(add, controls, list);
}
