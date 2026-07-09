import { describe, it, expect, vi } from "vitest";
import { datoBadge, elementsWithDatos, createDatosOverlays } from "./datosBadges";
import type { DatosFile } from "./datosModel";

describe("datoBadge", () => {
  it("shows 📄 for forms and 🗄 for storage, and fires onClick", () => {
    const onClick = vi.fn();
    const el = datoBadge(true, true, onClick);
    expect(el.textContent).toContain("📄");
    expect(el.textContent).toContain("🗄");
    el.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("shows only the relevant icon when only one kind is present", () => {
    expect(datoBadge(true, false, () => {}).textContent).not.toContain("🗄");
    expect(datoBadge(false, true, () => {}).textContent).not.toContain("📄");
  });
});

describe("elementsWithDatos", () => {
  it("flags forms/stores presence per element (herramientas counts as stores-ish 'other')", () => {
    const file: DatosFile = {
      version: 1,
      elementos: {
        t1: { formularios: [{ id: "a", tool: "jotform", nombre: "x", url: "" }], almacenamiento: [], herramientas: [] },
        t2: { formularios: [], almacenamiento: [{ id: "b", tool: "clickup", nombre: "y", url: "" }], herramientas: [] },
        t3: { formularios: [], almacenamiento: [], herramientas: [{ id: "c", tool: "otro", nombre: "z", url: "" }] },
      },
    };
    expect(elementsWithDatos(file)).toEqual(
      expect.arrayContaining([
        { elementId: "t1", forms: true, stores: false },
        { elementId: "t2", forms: false, stores: true },
        { elementId: "t3", forms: false, stores: true },
      ]),
    );
  });
});

describe("createDatosOverlays", () => {
  it("adds one overlay per documented element and clears previous ones on re-render", () => {
    const added: string[] = [];
    let n = 0;
    const host = {
      add: vi.fn((elementId: string) => { added.push(elementId); return `o${n++}`; }),
      remove: vi.fn(),
    };
    const ov = createDatosOverlays(host);
    const file: DatosFile = {
      version: 1,
      elementos: { t1: { formularios: [{ id: "a", tool: "jotform", nombre: "x", url: "" }], almacenamiento: [], herramientas: [] } },
    };
    ov.render(file, () => {});
    expect(host.add).toHaveBeenCalledTimes(1);
    ov.render({ version: 1, elementos: {} }, () => {});
    expect(host.remove).toHaveBeenCalledTimes(1);
  });

  it("skips an element whose graphics are gone (host.add throws) without crashing", () => {
    const host = { add: vi.fn(() => { throw new Error("not on canvas"); }), remove: vi.fn() };
    const ov = createDatosOverlays(host);
    const file: DatosFile = {
      version: 1,
      elementos: { ghost: { formularios: [{ id: "a", tool: "jotform", nombre: "x", url: "" }], almacenamiento: [], herramientas: [] } },
    };
    expect(() => ov.render(file, () => {})).not.toThrow();
  });

  it("the badge click focuses the clicked element's id", () => {
    const host = { add: vi.fn((_id: string, html: HTMLElement) => { document.body.appendChild(html); return "o1"; }), remove: vi.fn() };
    const ov = createDatosOverlays(host);
    const onFocus = vi.fn();
    const file: DatosFile = {
      version: 1,
      elementos: { t1: { formularios: [{ id: "a", tool: "jotform", nombre: "x", url: "" }], almacenamiento: [], herramientas: [] } },
    };
    ov.render(file, onFocus);
    (document.querySelector(".dato-badge") as HTMLElement).click();
    expect(onFocus).toHaveBeenCalledWith("t1");
  });
});
