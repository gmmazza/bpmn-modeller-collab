import type { FuentesClient, FuenteEntry, FuenteEstado } from "./fuentesClient";
import { previewModeFor } from "./fuentesPreview";

export interface FuentesPanelDeps {
  client: FuentesClient;
  canOpenExternal: boolean;
  openExternal(rel: string): Promise<void>;
  download(name: string, bytes: Uint8Array): void;
  confirmOpen(): Promise<boolean>;
  onError(e: unknown): void;
}

function row(entry: FuenteEntry, deps: FuentesPanelDeps, refresh: () => void): HTMLElement {
  const { client } = deps;
  const el = document.createElement("div");
  el.className = "fuente-row";
  el.dataset.name = entry.name;

  const name = document.createElement("span");
  name.className = "fuente-name";
  name.textContent = entry.name;
  el.appendChild(name);

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

  const mode = previewModeFor(entry.ext);

  act("Abrir", "abrir", async () => {
    if (deps.canOpenExternal && mode.kind !== "download") {
      if (!(await deps.confirmOpen())) return;
      await deps.openExternal(client.relFor(entry.name, entry.estado));
    } else {
      const bytes = await client.readBytes(entry.name, entry.estado);
      if (bytes) deps.download(entry.name, bytes);
    }
  });

  if (entry.estado === "pendiente") {
    act("Procesar", "procesar", async () => { await client.procesar(entry.name); refresh(); });
  } else {
    act("Restaurar", "restaurar", async () => { await client.restaurar(entry.name); refresh(); });
  }
  act("Quitar", "quitar", async () => { await client.remove(entry.name, entry.estado); refresh(); });

  return el;
}

function section(estado: FuenteEstado, title: string, entries: FuenteEntry[], deps: FuentesPanelDeps, refresh: () => void): HTMLElement {
  const sec = document.createElement("section");
  sec.dataset.estado = estado;
  const h = document.createElement("h3");
  h.textContent = `${title} (${entries.length})`;
  sec.appendChild(h);
  for (const e of entries) sec.appendChild(row(e, deps, refresh));
  return sec;
}

export async function renderFuentesPanel(host: HTMLElement, deps: FuentesPanelDeps): Promise<void> {
  const refresh = () => { void renderFuentesPanel(host, deps); };
  host.innerHTML = "";

  const drop = document.createElement("div");
  drop.className = "fuente-dropzone";
  drop.textContent = "Arrastrá archivos acá para agregarlos como fuentes";
  const addBytes = async (name: string, bytes: Uint8Array) => {
    try { await deps.client.add(name, bytes); refresh(); } catch (e) { deps.onError(e); }
  };
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", async (e) => {
    e.preventDefault(); drop.classList.remove("over");
    for (const f of Array.from(e.dataTransfer?.files ?? [])) {
      await addBytes(f.name, new Uint8Array(await f.arrayBuffer()));
    }
  });
  host.appendChild(drop);

  const input = document.createElement("input");
  input.type = "file"; input.multiple = true; input.className = "fuente-add-input";
  input.addEventListener("change", async () => {
    for (const f of Array.from(input.files ?? [])) {
      await addBytes(f.name, new Uint8Array(await f.arrayBuffer()));
    }
  });
  host.appendChild(input);

  let list: FuenteEntry[] = [];
  try { list = await deps.client.list(); } catch (e) { deps.onError(e); }

  const pendientes = list.filter((e) => e.estado === "pendiente");
  const procesadas = list.filter((e) => e.estado === "procesada");

  if (list.length === 0) {
    const empty = document.createElement("p");
    empty.className = "fuente-empty";
    empty.textContent = "Sin fuentes todavía. Las fuentes son el material de origen (documentos, imágenes) desde el que se modela este diagrama. Al reflejarlas en el diagrama, marcalas como procesadas.";
    host.appendChild(empty);
  }
  host.appendChild(section("pendiente", "Pendientes", pendientes, deps, refresh));
  host.appendChild(section("procesada", "Procesadas", procesadas, deps, refresh));
}
