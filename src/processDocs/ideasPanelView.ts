import type { IdeaNote } from "./ideaNote";
import { IDEA_STATES, STATE_GLYPH, type IdeaState } from "./ideaState";
import { distinctFuentes, type EstadoFilter, type ScopeFilter, type FuenteFilter } from "./ideaFilters";
import { createStateChip } from "./stateChip";

// Re-exported for consumers that import it from here historically.
export { STATE_GLYPH };

export interface IdeasPanelState {
  ideas: IdeaNote[];
  estado: EstadoFilter;
  scope: ScopeFilter;
  fuente: FuenteFilter;
  // When an element is selected on the canvas the panel focuses on it: the list
  // is filtered to its ideas and the quick-add anchors new ideas to it.
  focus: { id: string; label: string } | null;
  // Elements that have anchored ideas (for the object filter shown when scope="ancladas").
  objectOptions: { id: string; label: string }[];
  objectFilter: string | null;
}
export interface IdeasPanelHandlers {
  onAdd(text: string): void;
  onEstado(e: EstadoFilter): void;
  onScope(s: ScopeFilter): void;
  onFuente(f: FuenteFilter): void;
  onOpen(id: string): void;
  onSetState(id: string, estado: IdeaState): void;
  onClearFocus(): void;
  onObjectFilter(id: string | null): void;
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

  // focus header — shown when an element is selected
  if (state.focus) {
    const header = document.createElement("div");
    header.className = "ideas-focus";
    const label = document.createElement("span");
    label.className = "ideas-focus-label";
    label.textContent = `Ideas de: ${state.focus.label}`;
    const clear = document.createElement("button");
    clear.dataset.ideaClearFocus = "true";
    clear.className = "ideas-focus-clear";
    clear.textContent = "ver todas";
    clear.addEventListener("click", () => h.onClearFocus());
    header.append(label, clear);
    container.append(header);
  }

  // quick-add
  const add = document.createElement("div");
  add.className = "ideas-add";
  const input = document.createElement("input");
  input.dataset.ideaInput = "true";
  input.placeholder = state.focus ? `Nueva idea para ${state.focus.label}…` : "Nueva idea…";
  const submit = (): void => { const t = input.value.trim(); if (t) { input.value = ""; h.onAdd(t); } };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
  const addBtn = document.createElement("button");
  addBtn.dataset.ideaAdd = "true"; addBtn.textContent = "Agregar";
  addBtn.addEventListener("click", submit);
  add.append(input, addBtn);

  // filters
  const filters = document.createElement("div");
  filters.className = "ideas-filters";
  const fuenteOpts: FuenteFilter[] = ["todas", ...distinctFuentes(state.ideas)];
  filters.append(
    select(state.estado, ESTADO_OPTS as string[], "filterEstado", (v) => h.onEstado(v as EstadoFilter)),
    select(state.scope, SCOPE_OPTS as string[], "filterScope", (v) => h.onScope(v as ScopeFilter)),
    select(state.fuente, fuenteOpts as string[], "filterFuente", (v) => h.onFuente(v as FuenteFilter)),
  );
  // object filter — only when scoping to anchored ideas
  if (state.scope === "ancladas" && !state.focus) {
    const objSel = document.createElement("select");
    objSel.dataset.filterObject = "true";
    const all = document.createElement("option");
    all.value = ""; all.textContent = "todos los objetos";
    objSel.appendChild(all);
    for (const o of state.objectOptions) {
      const opt = document.createElement("option");
      opt.value = o.id; opt.textContent = o.label;
      if (o.id === state.objectFilter) opt.selected = true;
      objSel.appendChild(opt);
    }
    objSel.addEventListener("change", () => h.onObjectFilter(objSel.value || null));
    filters.append(objSel);
  }

  // list
  const list = document.createElement("ul");
  list.className = "ideas-list";
  for (const idea of state.ideas) {
    const li = document.createElement("li");
    li.className = "idea-row";
    li.dataset.ideaRow = "true";
    const chip = createStateChip(idea.estado, (s) => h.onSetState(idea.id, s));
    // body (click to open) — differentiates anchored vs general visually
    const body = document.createElement("button");
    body.dataset.ideaOpen = "true";
    body.className = "idea-open";
    const tag = document.createElement("span");
    if (idea.anchor) {
      tag.className = "idea-tag anchored";
      tag.textContent = `📌 ${idea.anchorLabel || idea.anchor}`;
    } else {
      tag.className = "idea-tag general";
      tag.textContent = "general";
    }
    const desc = document.createElement("span");
    desc.className = "idea-desc";
    desc.textContent = idea.description.split("\n")[0];
    const cN = idea.comments.length ? ` 💬${idea.comments.length}` : "";
    const mej = idea.mejora ? ` → ${idea.mejora}` : "";
    const meta = document.createElement("span");
    meta.className = "idea-meta";
    meta.textContent = ` · ${idea.autor}${cN}${mej}`;
    body.append(tag, desc, meta);
    body.addEventListener("click", () => h.onOpen(idea.id));
    li.append(chip, body);
    if (idea.fuente) {
      const badge = document.createElement("button");
      badge.type = "button";
      badge.className = "idea-fuente-badge";
      badge.dataset.fuente = idea.fuente;
      badge.title = `Fuente: ${idea.fuente}`;
      badge.textContent = `📎 ${idea.fuente}`;
      badge.addEventListener("click", () => h.onFuente(idea.fuente!));
      li.append(badge);
    }
    list.append(li);
  }
  if (state.ideas.length === 0) {
    const empty = document.createElement("li");
    empty.className = "ideas-empty";
    empty.textContent = state.focus ? "Este elemento no tiene ideas todavía." : "Sin ideas todavía.";
    list.append(empty);
  }

  container.append(add, filters, list);
}
