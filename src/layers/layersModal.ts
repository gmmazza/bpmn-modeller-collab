import type { LayerFile, ColorDimension } from "./layerModel";

export interface LayersModalState {
  layers: LayerFile;
  templates: { slug: string; name: string }[];
}

export interface LayersModalHandlers {
  onAddColorDim(): void;
  onAddAnnotationDim(): void;
  onRenameDim(id: string, label: string): void;
  onDeleteDim(id: string): void;
  onAddCategory(dimId: string): void;
  onUpdateCategory(dimId: string, catId: string, patch: { label?: string; fill?: string }): void;
  onDeleteCategory(dimId: string, catId: string): void;
  onReorderCategory(dimId: string, fromIndex: number, toIndex: number): void;
  onApplyTemplate(slug: string): void;
  onSaveTemplate(name: string): void;
  onDeleteTemplate(slug: string): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function renderLayersModal(
  container: HTMLElement,
  state: LayersModalState,
  handlers: LayersModalHandlers,
): void {
  container.innerHTML = "";

  // Tracks the category being dragged during a reorder. Lives for the lifetime of
  // this render (a drag starts and ends without a re-render), so a plain closure
  // var is enough and avoids dataTransfer quirks across browsers.
  let dragFrom: { dimId: string; index: number } | null = null;

  // ---- Templates ----
  const tplH = el("h3", undefined, "Plantillas");
  container.appendChild(tplH);
  const tplList = el("div", "lm-templates");
  for (const t of state.templates) {
    const row = el("div", "lm-template-row");
    row.appendChild(el("span", "lm-template-name", t.name));
    const apply = el("button", "btn lm-apply", "Aplicar");
    apply.type = "button";
    apply.addEventListener("click", () => handlers.onApplyTemplate(t.slug));
    const del = el("button", "btn icon-only lm-del-template", "🗑");
    del.type = "button";
    del.title = "Borrar plantilla";
    del.addEventListener("click", () => handlers.onDeleteTemplate(t.slug));
    row.append(apply, del);
    tplList.appendChild(row);
  }
  container.appendChild(tplList);

  const saveRow = el("div", "lm-save-row");
  const saveName = el("input", "lm-save-name");
  saveName.type = "text";
  saveName.placeholder = "Nombre de plantilla";
  const saveBtn = el("button", "btn lm-save-btn", "Guardar actual como plantilla");
  saveBtn.type = "button";
  saveBtn.addEventListener("click", () => {
    const name = saveName.value.trim();
    if (name) handlers.onSaveTemplate(name);
  });
  saveRow.append(saveName, saveBtn);
  container.appendChild(saveRow);

  // ---- Dimensions ----
  container.appendChild(el("h3", undefined, "Capas"));
  for (const dim of state.layers.dimensions) {
    const block = el("div", "lm-dim");
    const head = el("div", "lm-dim-head");
    const name = el("input", "lm-dim-name");
    name.type = "text";
    name.value = dim.label;
    name.addEventListener("change", () => handlers.onRenameDim(dim.id, name.value.trim() || dim.label));
    const badge = el("span", "lm-badge", dim.type === "color" ? "color" : "anotación");
    const del = el("button", "btn icon-only lm-del-dim", "🗑");
    del.type = "button";
    del.title = "Borrar capa";
    del.addEventListener("click", () => handlers.onDeleteDim(dim.id));
    head.append(name, badge, del);
    block.appendChild(head);

    if (dim.type === "color") {
      const cd = dim as ColorDimension;
      cd.categories.forEach((cat, index) => {
        const row = el("div", "lm-cat");
        row.draggable = true;
        const grip = el("span", "lm-grip", "⠿");
        grip.title = "Arrastrar para reordenar";
        const color = el("input", "lm-cat-color");
        color.type = "color";
        color.value = cat.fill;
        color.addEventListener("change", () => handlers.onUpdateCategory(dim.id, cat.id, { fill: color.value }));
        const label = el("input", "lm-cat-name");
        label.type = "text";
        label.value = cat.label;
        label.addEventListener("change", () => handlers.onUpdateCategory(dim.id, cat.id, { label: label.value.trim() || cat.label }));
        const cdel = el("button", "btn icon-only lm-del-cat", "🗑");
        cdel.type = "button";
        cdel.title = "Borrar categoría";
        cdel.addEventListener("click", () => handlers.onDeleteCategory(dim.id, cat.id));
        // --- drag to reorder within this dimension ---
        row.addEventListener("dragstart", (e) => {
          dragFrom = { dimId: dim.id, index };
          row.classList.add("lm-dragging");
          e.dataTransfer?.setData("text/plain", String(index));
        });
        row.addEventListener("dragend", () => row.classList.remove("lm-dragging"));
        row.addEventListener("dragover", (e) => {
          if (dragFrom && dragFrom.dimId === dim.id) e.preventDefault(); // allow drop within same layer
        });
        row.addEventListener("drop", (e) => {
          e.preventDefault();
          if (dragFrom && dragFrom.dimId === dim.id && dragFrom.index !== index) {
            handlers.onReorderCategory(dim.id, dragFrom.index, index);
          }
          dragFrom = null;
        });
        row.append(grip, color, label, cdel);
        block.appendChild(row);
      });
      const addCat = el("button", "btn lm-add-cat", "+ categoría");
      addCat.type = "button";
      addCat.addEventListener("click", () => handlers.onAddCategory(dim.id));
      block.appendChild(addCat);
    }
    container.appendChild(block);
  }

  // ---- Add dimension actions ----
  const actions = el("div", "lm-actions");
  const addColor = el("button", "btn lm-add-color", "+ capa de color");
  addColor.type = "button";
  addColor.addEventListener("click", () => handlers.onAddColorDim());
  const addAnnot = el("button", "btn lm-add-annot", "+ anotación");
  addAnnot.type = "button";
  addAnnot.addEventListener("click", () => handlers.onAddAnnotationDim());
  actions.append(addColor, addAnnot);
  container.appendChild(actions);
}
