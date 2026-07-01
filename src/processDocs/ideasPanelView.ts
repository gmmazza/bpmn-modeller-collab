import type { IdeaNote } from "./ideaNote";
import { IDEA_STATES, type IdeaState } from "./ideaState";
import type { EstadoFilter, ScopeFilter } from "./ideaFilters";

export const STATE_GLYPH: Record<IdeaState, string> = {
  pendiente: "○", haciendo: "◑", pausado: "⏸", hecho: "●", rechazado: "✕",
};

export interface IdeasPanelState {
  ideas: IdeaNote[];
  estado: EstadoFilter;
  scope: ScopeFilter;
  selectedLabel: string | null;
}
export interface IdeasPanelHandlers {
  onAdd(text: string, anchorToSelection: boolean): void;
  onEstado(e: EstadoFilter): void;
  onScope(s: ScopeFilter): void;
  onOpen(id: string): void;
  onSetState(id: string, estado: IdeaState): void;
}

const ESTADO_OPTS: EstadoFilter[] = ["todas", "activas", "cerradas", ...IDEA_STATES];
const SCOPE_OPTS: ScopeFilter[] = ["todas", "generales", "ancladas"];

function select(current: string, opts: string[], data: string, on: (v: string) => void): HTMLSelectElement {
  const sel = document.createElement("select");
  sel.dataset[data] = "true";
  for (const o of opts) {
    const opt = document.createElement("option");
    opt.value = o; opt.textContent = o;
    if (o === current) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => on(sel.value));
  return sel;
}

export function renderIdeasPanelV2(container: HTMLElement, state: IdeasPanelState, h: IdeasPanelHandlers): void {
  container.innerHTML = "";
  container.className = "ideas-panel";

  // quick-add
  const add = document.createElement("div");
  add.className = "ideas-add";
  const input = document.createElement("input");
  input.dataset.ideaInput = "true";
  input.placeholder = "Nueva idea…";
  const anchor = document.createElement("input");
  anchor.type = "checkbox"; anchor.dataset.ideaAnchor = "true"; anchor.disabled = !state.selectedLabel;
  const anchorL = document.createElement("label");
  anchorL.className = "ideas-anchor";
  anchorL.append(anchor, document.createTextNode(state.selectedLabel ? `Anclar a: ${state.selectedLabel}` : "Sin paso seleccionado"));
  const addBtn = document.createElement("button");
  addBtn.dataset.ideaAdd = "true"; addBtn.textContent = "Agregar";
  addBtn.addEventListener("click", () => { const t = input.value.trim(); if (t) h.onAdd(t, anchor.checked && !anchor.disabled); });
  add.append(input, anchorL, addBtn);

  // filters
  const filters = document.createElement("div");
  filters.className = "ideas-filters";
  filters.append(
    select(state.estado, ESTADO_OPTS as string[], "filterEstado", (v) => h.onEstado(v as EstadoFilter)),
    select(state.scope, SCOPE_OPTS as string[], "filterScope", (v) => h.onScope(v as ScopeFilter)),
  );

  // list
  const list = document.createElement("ul");
  list.className = "ideas-list";
  for (const idea of state.ideas) {
    const li = document.createElement("li");
    li.className = "idea-row";
    li.dataset.ideaRow = "true";
    // state chip (select)
    const chip = select(idea.estado, IDEA_STATES as string[], "ideaState", (v) => h.onSetState(idea.id, v as IdeaState));
    chip.classList.add("idea-state-chip");
    // body (click to open)
    const body = document.createElement("button");
    body.dataset.ideaOpen = "true";
    body.className = "idea-open";
    const where = idea.anchor ? (idea.anchorLabel || idea.anchor) : "general";
    const cN = idea.comments.length ? ` · 💬${idea.comments.length}` : "";
    const mej = idea.mejora ? ` · → ${idea.mejora}` : "";
    body.textContent = `${STATE_GLYPH[idea.estado]} ${idea.description.split("\n")[0]}  ·  ${where} · ${idea.autor}${cN}${mej}`;
    body.addEventListener("click", () => h.onOpen(idea.id));
    li.append(chip, body);
    list.append(li);
  }

  container.append(add, filters, list);
}
