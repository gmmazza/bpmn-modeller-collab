import type { LayerFile, ColorDimension, AnnotationDimension } from "./layerModel";

export interface LayersPanelState {
  layers: LayerFile;
  activeColorId: string | null;
  annotationsOn: string[];
  selectedId: string | null;
}
export interface LayersPanelHandlers {
  onPickColor(dimId: string | null): void;
  onToggleAnnotation(dimId: string, on: boolean): void;
  onAssign(dimId: string, elementId: string, value: string | null): void;
}

function colorDims(lf: LayerFile): ColorDimension[] {
  return lf.dimensions.filter((d): d is ColorDimension => d.type === "color");
}
function annotationDims(lf: LayerFile): AnnotationDimension[] {
  return lf.dimensions.filter((d): d is AnnotationDimension => d.type === "annotation");
}

export function renderLayersPanel(
  container: HTMLElement,
  state: LayersPanelState,
  handlers: LayersPanelHandlers,
): void {
  container.innerHTML = "";
  const h = document.createElement("h3");
  h.textContent = "Capas";
  container.appendChild(h);

  // --- color layer radios ---
  const colorH = document.createElement("h4");
  colorH.textContent = "Capa de color";
  container.appendChild(colorH);

  const addRadio = (value: string | null, label: string) => {
    const wrap = document.createElement("label");
    const r = document.createElement("input");
    r.type = "radio";
    r.name = "layer-color";
    r.value = value ?? "";
    if (value !== null) r.dataset.color = value;
    r.checked = state.activeColorId === value;
    r.addEventListener("change", () => {
      if (r.checked) handlers.onPickColor(value);
    });
    wrap.appendChild(r);
    wrap.appendChild(document.createTextNode(" " + label));
    container.appendChild(wrap);
  };
  addRadio(null, "Original");
  for (const d of colorDims(state.layers)) addRadio(d.id, d.label);

  // --- legend for the active color dim ---
  const active = colorDims(state.layers).find((d) => d.id === state.activeColorId) ?? null;
  if (active) {
    const legend = document.createElement("div");
    legend.className = "legend";
    for (const c of active.categories) {
      const row = document.createElement("div");
      row.className = "row";
      const sw = document.createElement("span");
      sw.className = "sw";
      sw.style.background = c.fill;
      row.appendChild(sw);
      row.appendChild(document.createTextNode(" " + c.label));
      legend.appendChild(row);
    }
    container.appendChild(legend);
  }

  // --- annotation toggles ---
  const annDimsList = annotationDims(state.layers);
  if (annDimsList.length) {
    const annH = document.createElement("h4");
    annH.textContent = "Anotación";
    container.appendChild(annH);
    for (const d of annDimsList) {
      const wrap = document.createElement("label");
      const c = document.createElement("input");
      c.type = "checkbox";
      c.dataset.annot = d.id;
      c.checked = state.annotationsOn.includes(d.id);
      c.addEventListener("change", () => handlers.onToggleAnnotation(d.id, c.checked));
      wrap.appendChild(c);
      wrap.appendChild(document.createTextNode(" " + d.label));
      container.appendChild(wrap);
    }
  }

  // --- assign (needs a selected element) ---
  if (state.selectedId) {
    const assignH = document.createElement("h4");
    assignH.textContent = "Asignar al elemento";
    container.appendChild(assignH);

    if (active) {
      const sel = document.createElement("select");
      sel.className = "assign-color";
      const none = document.createElement("option");
      none.value = "";
      none.textContent = `— ${active.label} —`;
      sel.appendChild(none);
      for (const c of active.categories) {
        const o = document.createElement("option");
        o.value = c.id;
        o.textContent = c.label;
        sel.appendChild(o);
      }
      sel.value = active.assignments[state.selectedId] ?? "";
      sel.addEventListener("change", () =>
        handlers.onAssign(active.id, state.selectedId!, sel.value || null),
      );
      container.appendChild(sel);
    }

    for (const d of annDimsList) {
      if (!state.annotationsOn.includes(d.id)) continue;
      const inp = document.createElement("input");
      inp.type = "text";
      inp.className = "assign-annot";
      inp.dataset.annot = d.id;
      inp.placeholder = d.label;
      inp.value = d.assignments[state.selectedId] ?? "";
      inp.addEventListener("change", () =>
        handlers.onAssign(d.id, state.selectedId!, inp.value || null),
      );
      container.appendChild(inp);
    }
  }
}
