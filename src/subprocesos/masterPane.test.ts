import { describe, it, expect, vi } from "vitest";

// The editable master pane mounts a REAL bpmn-js Modeler via createBpmnModeler — far too
// heavy/brittle for happy-dom — so we stub the `../editor` factory. The fake modeler's
// eventBus captures the handlers mountMasterPane registers (element.click / dblclick), and
// the fake editor lets us drive dirty state. vi.hoisted lets the mock factories (hoisted
// above the import below) close over these without a TDZ error.
const { fakeModeler, handlers, dirtyCbs } = vi.hoisted(() => {
  const handlers: Record<string, (e: any) => any> = {};
  const dirtyCbs: Array<(d: boolean) => void> = [];
  // eventBus.on is called both as on(evt, fn) and on(evt, priority, fn) — grab the fn.
  const eventBus = { on: (evt: string, a: any, b?: any) => { handlers[evt] = typeof b === "function" ? b : a; } };
  const canvasStub = { getRootElement: () => ({ id: "__root__" }), addMarker: () => {}, removeMarker: () => {} };
  const overlaysStub = { add: () => "ov1", remove: () => {} };
  const fakeModeler = {
    importXML: async () => ({}),
    saveXML: async () => ({ xml: "<xml/>" }),
    on: () => {},
    get: (name: string) => (name === "eventBus" ? eventBus : name === "canvas" ? canvasStub : name === "overlays" ? overlaysStub : {}),
    destroy: () => {},
  };
  return { fakeModeler, handlers, dirtyCbs };
});

vi.mock("../editor", () => ({
  createBpmnModeler: vi.fn(async () => fakeModeler),
  createEditor: vi.fn(() => ({
    load: vi.fn(async () => {}),
    getXml: vi.fn(async () => "<xml/>"),
    isDirty: vi.fn(() => false),
    isLoading: vi.fn(() => false),
    markSaved: vi.fn(),
    setReadOnly: vi.fn(),
    onDirtyChange: (cb: (d: boolean) => void) => { dirtyCbs.push(cb); },
  })),
}));
// installViewSelectGuard / createCompareModeler must NOT be used anymore — the master pane
// is editable. Blow up loudly if the retired read-only path is ever reintroduced.
vi.mock("../compareView", () => ({
  installViewSelectGuard: () => { throw new Error("read-only guard must not be used on the editable master"); },
  createCompareModeler: () => { throw new Error("compare viewer must not be used on the editable master"); },
}));

import { badgeLabel, mountMasterPane, outcomeBadgeText } from "./masterPane";

const registry = { all: () => [], resolve: () => null, ambiguities: () => [], clear: () => {}, sync: async () => {} } as any;

describe("badgeLabel", () => {
  it("maps link states to badge glyphs", () => {
    expect(badgeLabel("resolved")).toBe("🗺");
    expect(badgeLabel("unresolved")).toBe("⚠");
    expect(badgeLabel("ambiguous")).toBe("⚠");
  });
});

describe("outcomeBadgeText", () => {
  it("prefixes the destination name with an arrow", () => {
    expect(outcomeBadgeText("Devuelto sin reparar")).toBe("→ Devuelto sin reparar");
  });
  it("falls back to a dash when the destination is unnamed", () => {
    expect(outcomeBadgeText("")).toBe("→ (sin destino)");
  });
});

describe("mountMasterPane (editable)", () => {
  it("mounts an editable modeler and forwards dirty state to onDirty", async () => {
    const host = document.createElement("div");
    const onDirty = vi.fn();
    const handle = await mountMasterPane(host, { registry, openStage: async () => {}, onError: () => {}, onDirty });
    expect(handle).toBeTruthy();
    // Simulate the editor going dirty.
    dirtyCbs.forEach((cb) => cb(true));
    expect(onDirty).toHaveBeenCalledWith(true);
    expect(await handle.getXml()).toBe("<xml/>");
  });
});

describe("mountMasterPane read-only + exposed internals (dual history)", () => {
  it("exposes the inner editor and modeler for the history controller", async () => {
    const host = document.createElement("div");
    const handle = await mountMasterPane(host, { registry, openStage: async () => {}, onError: () => {} });
    expect(handle.editor).toBeTruthy();
    expect(typeof handle.editor.setReadOnly).toBe("function");
    expect(handle.modeler).toBe(fakeModeler);
  });

  it("setReadOnly suppresses the link popover and the drill while previewing", async () => {
    const host = document.createElement("div");
    const onElementClick = vi.fn();
    const onDrill = vi.fn();
    const handle = await mountMasterPane(host, { registry, openStage: async () => {}, onError: () => {}, onElementClick, onDrill });
    const clickEvt = { element: { id: "A", type: "bpmn:CallActivity", businessObject: { calledElement: "p1", name: "Etapa" } }, gfx: { getBoundingClientRect: () => new DOMRect() } };
    handle.setReadOnly(true);
    expect(handle.editor.setReadOnly).toHaveBeenCalledWith(true);
    handlers["element.click"](clickEvt);
    handlers["element.dblclick"](clickEvt);
    expect(onElementClick).not.toHaveBeenCalled();
    expect(onDrill).not.toHaveBeenCalled();
    handle.setReadOnly(false);
    handlers["element.dblclick"](clickEvt);
    expect(onDrill).toHaveBeenCalledWith({ elementId: "A", calledElement: "p1" });
  });
});

describe("mountMasterPane onElementClick hook", () => {
  const anchorFor = () => ({ getBoundingClientRect: () => new DOMRect(1, 2, 3, 4) });

  it("forwards a click on a linkable box (live businessObject, no XML re-parse)", async () => {
    const onElementClick = vi.fn();
    await mountMasterPane(document.createElement("div"), {
      registry, openStage: async () => {}, onError: () => {}, onElementClick,
    });
    const handler = handlers["element.click"];
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
    const handler = handlers["element.click"];

    handler({ element: { id: "__root__", type: "bpmn:Process" }, gfx: anchorFor() });
    handler({ element: { id: "Label_1", type: "label" }, gfx: anchorFor() });
    handler({ element: { id: "Gateway_1", type: "bpmn:ExclusiveGateway", businessObject: {} }, gfx: anchorFor() });
    handler({ element: { id: "Start_1", type: "bpmn:StartEvent", businessObject: {} }, gfx: anchorFor() });
    handler({ element: null, gfx: anchorFor() });

    expect(onElementClick).not.toHaveBeenCalled();
  });
});

describe("mountMasterPane onDrill hook", () => {
  it("drills (and vetoes native rename) on double-clicking a linked call activity", async () => {
    const onDrill = vi.fn();
    await mountMasterPane(document.createElement("div"), {
      registry, openStage: async () => {}, onError: () => {}, onDrill,
    });
    const dbl = handlers["element.dblclick"];
    expect(dbl).toBeTypeOf("function");

    const veto = dbl({ element: { id: "Call_1", type: "bpmn:CallActivity", businessObject: { calledElement: "P_sub" } } });
    expect(onDrill).toHaveBeenCalledWith({ elementId: "Call_1", calledElement: "P_sub" });
    expect(veto).toBe(false); // vetoes bpmn-js native direct-edit for a linked call activity
  });

  it("does NOT drill on a call activity without calledElement (falls through to native rename)", async () => {
    const onDrill = vi.fn();
    await mountMasterPane(document.createElement("div"), {
      registry, openStage: async () => {}, onError: () => {}, onDrill,
    });
    const dbl = handlers["element.dblclick"];
    const veto = dbl({ element: { id: "Call_2", type: "bpmn:CallActivity", businessObject: {} } });
    expect(onDrill).not.toHaveBeenCalled();
    expect(veto).toBeUndefined();
  });
});
