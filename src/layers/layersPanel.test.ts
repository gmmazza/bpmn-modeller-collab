import { describe, it, expect, vi } from "vitest";
import { renderLayersPanel } from "./layersPanel";
import { defaultLayerFile } from "./layerModel";

function baseState(over: Partial<Parameters<typeof renderLayersPanel>[1]> = {}) {
  return { layers: defaultLayerFile(), activeColorId: null, annotationsOn: [], selectedId: null, ...over };
}

describe("renderLayersPanel", () => {
  it("renders Original + a radio per color dimension", () => {
    const el = document.createElement("div");
    renderLayersPanel(el, baseState(), { onPickColor: vi.fn(), onToggleAnnotation: vi.fn(), onAssign: vi.fn(), onManage: vi.fn() });
    const radios = el.querySelectorAll<HTMLInputElement>('input[name="layer-color"]');
    // Original + madurez + actores = 3
    expect(radios.length).toBe(3);
  });

  it("picking a color radio fires onPickColor with the dim id", () => {
    const el = document.createElement("div");
    const onPickColor = vi.fn();
    renderLayersPanel(el, baseState(), { onPickColor, onToggleAnnotation: vi.fn(), onAssign: vi.fn(), onManage: vi.fn() });
    const madurez = el.querySelector<HTMLInputElement>('input[name="layer-color"][value="madurez"]')!;
    madurez.checked = true;
    madurez.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onPickColor).toHaveBeenCalledWith("madurez");
  });

  it("assign select fires onAssign for the selected element on the active color dim", () => {
    const el = document.createElement("div");
    const onAssign = vi.fn();
    renderLayersPanel(el, baseState({ activeColorId: "madurez", selectedId: "t1" }), {
      onPickColor: vi.fn(), onToggleAnnotation: vi.fn(), onAssign, onManage: vi.fn(),
    });
    const sel = el.querySelector<HTMLSelectElement>("select.assign-color")!;
    sel.value = "manual";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onAssign).toHaveBeenCalledWith("madurez", "t1", "manual");
  });

  it("toggling an annotation checkbox fires onToggleAnnotation", () => {
    const el = document.createElement("div");
    const onToggleAnnotation = vi.fn();
    renderLayersPanel(el, baseState(), { onPickColor: vi.fn(), onToggleAnnotation, onAssign: vi.fn(), onManage: vi.fn() });
    const docs = el.querySelector<HTMLInputElement>('input[data-annot="docs"]')!;
    docs.checked = true;
    docs.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onToggleAnnotation).toHaveBeenCalledWith("docs", true);
  });

  it("renders a 'Gestionar capas' button wired to onManage", () => {
    const c = document.createElement("div");
    const onManage = vi.fn();
    renderLayersPanel(
      c,
      { layers: { version: 1, dimensions: [] }, activeColorId: null, annotationsOn: [], selectedId: null },
      { onPickColor: vi.fn(), onToggleAnnotation: vi.fn(), onAssign: vi.fn(), onManage },
    );
    const btn = c.querySelector(".lm-open") as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(onManage).toHaveBeenCalledOnce();
  });
});
