import { renderMarkdown } from "./markdownRender";

export type NoteTab = "step" | "process";
export type NoteMode = "read" | "edit";

export interface NotePanelState {
  tab: NoteTab;
  mode: NoteMode;
  stepLabel: string | null;
  body: string;
  hasNote: boolean;
}

export interface NotePanelHandlers {
  onTabChange(tab: NoteTab): void;
  onModeChange(mode: NoteMode): void;
  onBodyInput(body: string): void;
  onSave(): void;
  onCreateNote(): void;
  onEditHostReady?(host: HTMLElement): void;
  onReadHostReady?(readEl: HTMLElement): void;
}

function tabButton(tab: NoteTab, active: NoteTab, label: string, on: (t: NoteTab) => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.dataset.tab = tab;
  b.textContent = label;
  b.className = tab === active ? "active" : "";
  b.addEventListener("click", () => on(tab));
  return b;
}

function modeButton(mode: NoteMode, active: NoteMode, label: string, on: (m: NoteMode) => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.dataset.mode = mode;
  b.textContent = label;
  b.className = mode === active ? "active" : "";
  b.addEventListener("click", () => on(mode));
  return b;
}

export function renderNotePanel(container: HTMLElement, state: NotePanelState, h: NotePanelHandlers): void {
  container.innerHTML = "";
  // Use classList (not className=) so the host's "inspector-pane" class — which
  // carries the [hidden] hide-when-inactive rule — is preserved on the pane.
  container.classList.add("note-panel");

  const tabs = document.createElement("div");
  tabs.className = "note-tabs";
  tabs.append(
    tabButton("step", state.tab, "Paso", h.onTabChange),
    tabButton("process", state.tab, "Proceso", h.onTabChange),
  );
  const header = document.createElement("div");
  header.className = "note-header";
  header.append(tabs);
  const modes = document.createElement("div");
  modes.className = "note-modes";
  modes.append(
    modeButton("read", state.mode, "Leer", h.onModeChange),
    modeButton("edit", state.mode, "Editar", h.onModeChange),
  );
  header.append(modes);
  container.append(header);

  if (state.tab === "step" && state.stepLabel === null) {
    const empty = document.createElement("p");
    empty.className = "note-empty";
    empty.textContent = "Seleccioná un paso en el diagrama para ver o escribir su documentación.";
    container.append(empty);
    return;
  }

  if (state.tab === "step" && state.stepLabel) {
    const title = document.createElement("h3");
    title.className = "note-step-title";
    title.textContent = state.stepLabel;
    container.append(title);
  }

  if (!state.hasNote && state.mode === "read") {
    const create = document.createElement("button");
    create.dataset.noteCreate = "true";
    create.textContent = state.tab === "process" ? "Crear página del proceso" : "Documentar este paso";
    create.addEventListener("click", h.onCreateNote);
    container.append(create);
    return;
  }

  if (state.mode === "read") {
    const view = document.createElement("div");
    view.dataset.noteRead = "true";
    view.className = "note-read markdown-body";
    view.innerHTML = renderMarkdown(state.body);
    container.append(view);
    h.onReadHostReady?.(view);
    return;
  }

  // edit mode
  const host = document.createElement("div");
  host.dataset.noteEditHost = "true";
  host.className = "note-edit-host";
  const save = document.createElement("button");
  save.dataset.noteSave = "true";
  save.textContent = "Guardar";
  save.addEventListener("click", h.onSave);
  container.append(host, save);
  // Let the controller mount the CM6 editor into the host after render.
  h.onEditHostReady?.(host);
}
