import { describe, it, expect, vi } from "vitest";

// mountMasterPane's viewer is a real bpmn-js Modeler (via createCompareModeler) — too
// heavy/brittle to drive end-to-end here, so fake just the eventBus surface needed to
// verify the "element.click" → onElementClick wiring. vi.hoisted lets the mock factory
// (hoisted above the import below) close over these without a TDZ error.
const { fakeViewer, clickHandlers } = vi.hoisted(() => {
  const clickHandlers: Record<string, (e: any) => void> = {};
  const eventBus = {
    on: (evt: string, fn: (e: any) => void) => {
      clickHandlers[evt] = fn;
    },
  };
  const canvasStub = { getRootElement: () => ({ id: "__root__" }), addMarker: () => {}, removeMarker: () => {} };
  const overlaysStub = { add: () => "ov1", remove: () => {} };
  const fakeViewer = {
    importXML: async () => {},
    get: (name: string) => (name === "eventBus" ? eventBus : name === "canvas" ? canvasStub : name === "overlays" ? overlaysStub : undefined),
    destroy: () => {},
  };
  return { fakeViewer, clickHandlers };
});

vi.mock("../compareView", () => ({
  createCompareModeler: vi.fn(async () => fakeViewer),
  installViewSelectGuard: vi.fn(),
}));

import { badgeLabel, mountMasterPane } from "./masterPane";

describe("badgeLabel", () => {
  it("maps link states to badge glyphs", () => {
    expect(badgeLabel("resolved")).toBe("🗺");
    expect(badgeLabel("unresolved")).toBe("⚠");
    expect(badgeLabel("ambiguous")).toBe("⚠");
  });
});

describe("mountMasterPane onElementClick hook", () => {
  const registry = { all: () => [], resolve: () => null, clear: () => {}, sync: async () => {} } as any;
  const anchorFor = () => ({ getBoundingClientRect: () => new DOMRect(1, 2, 3, 4) });

  it("forwards a click on a linkable box (live businessObject, no XML re-parse)", async () => {
    const onElementClick = vi.fn();
    await mountMasterPane(document.createElement("div"), {
      registry, openStage: async () => {}, onError: () => {}, onElementClick,
    });
    const handler = clickHandlers["element.click"];
    expect(handler).toBeTypeOf("function");

    handler({
      element: { id: "Task_1", type: "bpmn:Task", businessObject: { name: "Facturar", calledElement: "Process_2" } },
      gfx: anchorFor(),
    });

    expect(onElementClick).toHaveBeenCalledTimes(1);
    expect(onElementClick).toHaveBeenCalledWith({
      elementId: "Task_1",
      name: "Facturar",
      calledElement: "Process_2",
      anchor: expect.any(DOMRect),
    });
  });

  it("skips the root, the process, labels, and non-box types (gateways/events)", async () => {
    const onElementClick = vi.fn();
    await mountMasterPane(document.createElement("div"), {
      registry, openStage: async () => {}, onError: () => {}, onElementClick,
    });
    const handler = clickHandlers["element.click"];

    handler({ element: { id: "__root__", type: "bpmn:Process" }, gfx: anchorFor() });
    handler({ element: { id: "Label_1", type: "label" }, gfx: anchorFor() });
    handler({ element: { id: "Gateway_1", type: "bpmn:ExclusiveGateway", businessObject: {} }, gfx: anchorFor() });
    handler({ element: { id: "Start_1", type: "bpmn:StartEvent", businessObject: {} }, gfx: anchorFor() });
    handler({ element: null, gfx: anchorFor() });

    expect(onElementClick).not.toHaveBeenCalled();
  });

  it("is safe to call without an onElementClick dep (optional hook)", async () => {
    await mountMasterPane(document.createElement("div"), { registry, openStage: async () => {}, onError: () => {} });
    const handler = clickHandlers["element.click"];
    expect(() => handler({ element: { id: "Task_1", type: "bpmn:Task", businessObject: {} }, gfx: anchorFor() })).not.toThrow();
  });
});
