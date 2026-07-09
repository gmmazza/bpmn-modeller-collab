import type { DatosClient } from "./datosClient";
import { emptyElementoDatos, type DatosEntry, type DatosCategory, type ElementoDatos, type ToolKind } from "./datosModel";

const TOOL_LABEL: Record<ToolKind, string> = { jotform: "JotForm", clickup: "ClickUp", otro: "Otro" };
const CATEGORY_LABEL: Record<DatosCategory, string> = {
  formularios: "Formularios",
  almacenamiento: "Almacenamiento",
  herramientas: "Herramientas",
};
// Only these two categories get a standard-BPMN anchor (Data Object / Data Store — see
// the design spec §3.1). "herramientas" is documentation-only, no diagram element for it.
const ANCHORABLE: ReadonlySet<DatosCategory> = new Set(["formularios", "almacenamiento"]);

export interface DatosPanelDeps {
  client: DatosClient;
  elementId: string | null;
  elementLabel: string;
  openExternalUrl(url: string): Promise<void>;
  onError(e: unknown): void;
  onMostrarEnDiagrama(category: DatosCategory, entry: DatosEntry): Promise<void>;
}

function row(category: DatosCategory, entry: DatosEntry, deps: DatosPanelDeps, elementId: string, refresh: () => void): HTMLElement {
  const el = document.createElement("div");
  el.className = "dato-row";
  el.dataset.category = category;
  el.dataset.entryId = entry.id;

  const name = document.createElement("span");
  name.className = "dato-name";
  name.textContent = entry.nombre;
  el.appendChild(name);

  const tag = document.createElement("span");
  tag.className = "dato-tool-tag";
  tag.textContent = TOOL_LABEL[entry.tool];
  el.appendChild(tag);

  const act = (label: string, key: string, fn: () => void | Promise<void>) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn icon-only";
    b.dataset.act = key;
    b.title = label;
    b.textContent = label;
    b.addEventListener("click", () => Promise.resolve(fn()).catch(deps.onError));
    el.appendChild(b);
  };

  if (entry.url) {
    act("Abrir", "abrir", () => deps.openExternalUrl(entry.url));
  }

  if (ANCHORABLE.has(category) && !entry.anchoredId) {
    act("Mostrar en el diagrama", "mostrar", async () => {
      await deps.onMostrarEnDiagrama(category, entry);
      refresh();
    });
  }

  act("Quitar", "quitar", async () => {
    await deps.client.remove(elementId, category, entry.id);
    refresh();
  });

  return el;
}

function addForm(category: DatosCategory, deps: DatosPanelDeps, elementId: string, refresh: () => void): HTMLElement {
  const form = document.createElement("form");
  form.className = "dato-add-form";
  form.dataset.category = category;

  const nombre = document.createElement("input");
  nombre.type = "text";
  nombre.placeholder = "Nombre";
  nombre.className = "dato-add-nombre";

  const tool = document.createElement("select");
  tool.className = "dato-add-tool";
  for (const [value, label] of Object.entries(TOOL_LABEL)) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    tool.appendChild(opt);
  }

  const url = document.createElement("input");
  url.type = "text";
  url.placeholder = "URL (opcional)";
  url.className = "dato-add-url";

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "btn";
  submit.textContent = "Agregar";

  form.append(nombre, tool, url, submit);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void deps.client
      .add(elementId, category, { tool: tool.value as ToolKind, nombre: nombre.value, url: url.value })
      .then(refresh)
      .catch(deps.onError);
  });
  return form;
}

function section(
  category: DatosCategory,
  entries: DatosEntry[],
  deps: DatosPanelDeps,
  elementId: string,
  refresh: () => void,
): HTMLElement {
  const sec = document.createElement("section");
  sec.dataset.category = category;
  const h = document.createElement("h4");
  h.textContent = `${CATEGORY_LABEL[category]} (${entries.length})`;
  sec.appendChild(h);
  for (const e of entries) sec.appendChild(row(category, e, deps, elementId, refresh));
  sec.appendChild(addForm(category, deps, elementId, refresh));
  return sec;
}

export async function renderDatosPanel(host: HTMLElement, deps: DatosPanelDeps): Promise<void> {
  const refresh = () => { void renderDatosPanel(host, deps); };
  host.innerHTML = "";

  if (!deps.elementId) {
    delete host.dataset.elementId;
    const empty = document.createElement("p");
    empty.className = "dato-empty";
    empty.textContent = "Seleccioná un elemento del diagrama para ver o documentar sus formularios, almacenamiento y herramientas.";
    host.appendChild(empty);
    return;
  }
  const elementId = deps.elementId;
  host.dataset.elementId = elementId;

  const title = document.createElement("h3");
  title.className = "dato-title";
  title.textContent = deps.elementLabel;
  host.appendChild(title);

  let datos: ElementoDatos;
  try {
    datos = await deps.client.list(elementId);
  } catch (e) {
    deps.onError(e);
    datos = emptyElementoDatos();
  }
  // The user could have re-selected a different element while `list` was in flight.
  if (host.dataset.elementId !== elementId) return;

  host.appendChild(section("formularios", datos.formularios, deps, elementId, refresh));
  host.appendChild(section("almacenamiento", datos.almacenamiento, deps, elementId, refresh));
  host.appendChild(section("herramientas", datos.herramientas, deps, elementId, refresh));
}
