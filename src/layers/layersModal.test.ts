import { describe, it, expect, vi } from "vitest";
import { renderLayersModal, type LayersModalHandlers } from "./layersModal";
import { addColorDimension, addAnnotationDimension, type LayerFile } from "./layerModel";

function sampleState() {
  let lf: LayerFile = { version: 1, dimensions: [] };
  lf = addColorDimension(lf, "Madurez").lf; // dim "madurez" with category "categoria-1"
  lf = addAnnotationDimension(lf, "Docs").lf; // dim "docs"
  return { layers: lf, templates: [{ slug: "base", name: "Base" }] };
}

function noopHandlers(): LayersModalHandlers {
  return {
    onAddColorDim: vi.fn(), onAddAnnotationDim: vi.fn(), onRenameDim: vi.fn(),
    onDeleteDim: vi.fn(), onAddCategory: vi.fn(), onUpdateCategory: vi.fn(),
    onDeleteCategory: vi.fn(), onApplyTemplate: vi.fn(), onSaveTemplate: vi.fn(),
    onDeleteTemplate: vi.fn(),
  };
}

describe("renderLayersModal", () => {
  it("renders a row per dimension and a color input per category", () => {
    const c = document.createElement("div");
    renderLayersModal(c, sampleState(), noopHandlers());
    expect(c.querySelectorAll(".lm-dim")).toHaveLength(2);
    expect(c.querySelectorAll('.lm-cat input[type="color"]')).toHaveLength(1);
    expect(c.querySelectorAll(".lm-template-row")).toHaveLength(1);
  });

  it("uses textContent for user data (no innerHTML injection)", () => {
    const c = document.createElement("div");
    const state = sampleState();
    state.templates = [{ slug: "x", name: "<img src=x onerror=alert(1)>" }];
    renderLayersModal(c, state, noopHandlers());
    expect(c.querySelector("img")).toBeNull();
  });

  it("wires add-dimension buttons", () => {
    const c = document.createElement("div");
    const h = noopHandlers();
    renderLayersModal(c, sampleState(), h);
    (c.querySelector(".lm-add-color") as HTMLButtonElement).click();
    (c.querySelector(".lm-add-annot") as HTMLButtonElement).click();
    expect(h.onAddColorDim).toHaveBeenCalledOnce();
    expect(h.onAddAnnotationDim).toHaveBeenCalledOnce();
  });

  it("emits onUpdateCategory with the new fill", () => {
    const c = document.createElement("div");
    const h = noopHandlers();
    renderLayersModal(c, sampleState(), h);
    const color = c.querySelector('.lm-cat input[type="color"]') as HTMLInputElement;
    color.value = "#123456";
    color.dispatchEvent(new Event("change"));
    expect(h.onUpdateCategory).toHaveBeenCalledWith("madurez", "categoria-1", { fill: "#123456" });
  });

  it("emits onDeleteCategory", () => {
    const c = document.createElement("div");
    const h = noopHandlers();
    renderLayersModal(c, sampleState(), h);
    (c.querySelector(".lm-cat .lm-del-cat") as HTMLButtonElement).click();
    expect(h.onDeleteCategory).toHaveBeenCalledWith("madurez", "categoria-1");
  });

  it("emits onApplyTemplate and onSaveTemplate", () => {
    const c = document.createElement("div");
    const h = noopHandlers();
    renderLayersModal(c, sampleState(), h);
    (c.querySelector(".lm-template-row .lm-apply") as HTMLButtonElement).click();
    expect(h.onApplyTemplate).toHaveBeenCalledWith("base");
    const input = c.querySelector(".lm-save-name") as HTMLInputElement;
    input.value = "Nueva";
    (c.querySelector(".lm-save-btn") as HTMLButtonElement).click();
    expect(h.onSaveTemplate).toHaveBeenCalledWith("Nueva");
  });

  it("emits onDeleteTemplate with the template slug", () => {
    const c = document.createElement("div");
    const h = noopHandlers();
    renderLayersModal(c, sampleState(), h);
    (c.querySelector(".lm-template-row .lm-del-template") as HTMLButtonElement).click();
    expect(h.onDeleteTemplate).toHaveBeenCalledWith("base");
  });

  it("emits onAddCategory with the dimension id", () => {
    const c = document.createElement("div");
    const h = noopHandlers();
    renderLayersModal(c, sampleState(), h);
    (c.querySelector(".lm-add-cat") as HTMLButtonElement).click();
    expect(h.onAddCategory).toHaveBeenCalledWith("madurez");
  });
});
