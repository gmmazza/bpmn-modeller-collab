import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHistoryController, type HistoryPaneDeps } from "./historyPane";
import type { Revision } from "./types";

// BpmnModeler doesn't boot in happy-dom — everything the controller touches is faked
// (same style as masterPane.test.ts). The controller is pure orchestration.

function rev(id: string, author = "Ana"): Revision {
  return {
    id,
    modifiedTime: new Date(Number(id)).toISOString(),
    keepForever: false,
    lastModifyingUser: { displayName: author, emailAddress: author },
  };
}

function makeCanvasStub() {
  return {
    zoom: vi.fn(),
    viewbox: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 100 })),
    addMarker: vi.fn(),
    removeMarker: vi.fn(),
    getRootElement: vi.fn(() => ({ id: "root" })),
  };
}

function makeModelerStub() {
  const canvas = makeCanvasStub();
  const pasted: unknown[] = [{ id: "p1" }];
  return {
    canvas,
    stub: {
      get(name: string): any {
        if (name === "canvas") return canvas;
        if (name === "clipboard") return { set: vi.fn() };
        if (name === "copyPaste") return { paste: vi.fn(() => pasted) };
        if (name === "selection") return { select: vi.fn(), get: vi.fn(() => []) };
        if (name === "eventBus") return { on: vi.fn(), off: vi.fn() };
        return {};
      },
    },
  };
}

function makeViewerStub(selected: unknown[] = []) {
  const canvas = makeCanvasStub();
  return {
    importXML: vi.fn(async () => ({})),
    get(name: string): any {
      if (name === "canvas") return canvas;
      if (name === "eventBus") return { on: vi.fn(), off: vi.fn() };
      if (name === "selection") return { get: vi.fn(() => selected) };
      if (name === "copyPaste") return { copy: vi.fn(() => ({ tree: true })) };
      return {};
    },
    destroy: vi.fn(),
  };
}

function makeDeps(overrides: Partial<HistoryPaneDeps> = {}) {
  const wrap = document.createElement("div");
  const splitHost = document.createElement("div");
  const canvas2 = document.createElement("div");
  canvas2.hidden = true;
  const bar = document.createElement("div");
  const section = document.createElement("div");
  document.body.append(wrap, splitHost, canvas2, bar, section);

  let workingXml = "<working/>";
  const editorStub = {
    load: vi.fn(async (x: string) => { workingXml = x; }),
    getXml: vi.fn(async () => workingXml),
    setReadOnly: vi.fn(),
  };
  const { stub: modelerStub } = makeModelerStub();
  const viewer = makeViewerStub([{ id: "el1" }]);
  const revisions = [rev("2000", "Ana"), rev("1000", "Beto")];

  const deps: HistoryPaneDeps = {
    title: () => "Subproceso: p1",
    getFileId: () => "p1.bpmn",
    api: () => ({
      listRevisions: vi.fn(async () => revisions),
      getRevisionXml: vi.fn(async (_id: string, rid: string) => `<rev-${rid}/>`),
      getXml: vi.fn(async () => "<shared/>"),
    }),
    editor: () => editorStub,
    modeler: () => modelerStub,
    els: { wrap, splitHost, canvas2, bar },
    createViewer: vi.fn(async () => viewer),
    loadWorking: vi.fn(async (x: string) => { workingXml = x; }),
    flushWorking: vi.fn(async () => {}),
    getWorkingFallback: vi.fn(async () => "<fallback/>"),
    onWorkingReplaced: vi.fn(),
    pushCoarseUndo: vi.fn(),
    me: () => ({ name: "Ana", email: "ana@x.com" }),
    orientationKey: "test.orientation",
    onChanged: vi.fn(),
    onError: (e) => { throw e; },
    toast: vi.fn(),
    diff: {
      compute: vi.fn(async () => ({ added: [], removed: [], changed: [], layoutChanged: [] })),
      apply: vi.fn(() => []),
      clear: vi.fn(),
    },
    ...overrides,
  };
  return { deps, editorStub, viewer, section, wrap, splitHost, canvas2, bar };
}

beforeEach(() => { document.body.innerHTML = ""; localStorage.clear(); });

describe("historyPane: selection & preview", () => {
  it("keeps at most 2 checked ids (FIFO)", async () => {
    const { deps } = makeDeps();
    const c = createHistoryController(deps);
    await c.loadHistory();
    await c.toggleSel("actual", true);
    await c.toggleSel("2000", true);
    await c.toggleSel("1000", true); // FIFO: "actual" drops out
    expect(c.getSelection()).toEqual(["2000", "1000"]);
  });

  it("1 revision checked → preview: flush + snapshot once, read-only, bar + wrap class", async () => {
    const { deps, editorStub, wrap, bar } = makeDeps();
    const c = createHistoryController(deps);
    await c.loadHistory();
    await c.toggleSel("2000", true);
    expect(deps.flushWorking).toHaveBeenCalledTimes(1);
    expect(deps.loadWorking).toHaveBeenCalledWith("<rev-2000/>");
    expect(editorStub.setReadOnly).toHaveBeenCalledWith(true);
    expect(c.isPreviewing()).toBe(true);
    expect(wrap.classList.contains("pane-previewing")).toBe(true);
    expect(bar.querySelector(".preview-bar")).toBeTruthy();
  });

  it("unticking the previewed revision restores the pre-preview snapshot", async () => {
    const { deps, editorStub } = makeDeps();
    const c = createHistoryController(deps);
    await c.loadHistory();
    await c.toggleSel("2000", true);
    (deps.loadWorking as any).mockClear();
    await c.toggleSel("2000", false);
    expect(deps.loadWorking).toHaveBeenCalledWith("<working/>"); // the snapshot
    expect(editorStub.setReadOnly).toHaveBeenLastCalledWith(false);
    expect(c.isPreviewing()).toBe(false);
  });

  it("is inert when getFileId() returns null", async () => {
    const { deps } = makeDeps({ getFileId: () => null });
    const c = createHistoryController(deps);
    await c.toggleSel("2000", true);
    expect(c.isPreviewing()).toBe(false);
    expect(deps.loadWorking).not.toHaveBeenCalled();
  });
});

describe("historyPane: restore to draft", () => {
  it("pushes a coarse snapshot and replaces the working version", async () => {
    const { deps } = makeDeps();
    const c = createHistoryController(deps);
    await c.loadHistory();
    await c.restoreToDraft("1000");
    expect(deps.pushCoarseUndo).toHaveBeenCalledWith("<fallback/>");
    expect(deps.loadWorking).toHaveBeenCalledWith("<rev-1000/>");
    expect(deps.onWorkingReplaced).toHaveBeenCalledWith("<rev-1000/>");
  });
});

describe("historyPane: compare", () => {
  it("2 checked → compare: viewer created once into canvas2, split class, bar", async () => {
    const { deps, splitHost, canvas2, bar, wrap } = makeDeps();
    const c = createHistoryController(deps);
    await c.loadHistory();
    await c.toggleSel("actual", true);
    await c.toggleSel("1000", true);
    expect(c.isComparing()).toBe(true);
    expect(deps.createViewer).toHaveBeenCalledTimes(1);
    expect((deps.createViewer as any).mock.calls[0][0]).toBe(canvas2);
    expect(canvas2.hidden).toBe(false);
    expect(splitHost.classList.contains("split")).toBe(true);
    expect(wrap.classList.contains("pane-comparing")).toBe(true);
    expect(bar.querySelector(".compare-bar")).toBeTruthy();
    // unticking down to 1 exits compare (destroys the viewer); a new pair recreates it
    await c.toggleSel("1000", false);
    await c.toggleSel("2000", true);
    expect(deps.createViewer).toHaveBeenCalledTimes(2);
  });

  it("exit compare restores the pre-compare snapshot and tears down", async () => {
    const { deps, viewer, splitHost, canvas2 } = makeDeps();
    const c = createHistoryController(deps);
    await c.loadHistory();
    await c.toggleSel("actual", true);
    await c.toggleSel("1000", true);
    (deps.loadWorking as any).mockClear();
    await c.exitCompare();
    expect(deps.loadWorking).toHaveBeenCalledWith("<working/>"); // preCompareXml snapshot
    expect(viewer.destroy).toHaveBeenCalled();
    expect(canvas2.hidden).toBe(true);
    expect(splitHost.classList.contains("split")).toBe(false);
    expect(c.isComparing()).toBe(false);
    expect(c.getSelection()).toEqual([]);
  });

  it("copy pushes coarse only on the FIRST paste and updates the snapshot", async () => {
    const { deps } = makeDeps();
    const c = createHistoryController(deps);
    await c.loadHistory();
    await c.toggleSel("actual", true);
    await c.toggleSel("1000", true);
    await c.copySelectionToWorking();
    await c.copySelectionToWorking();
    expect(deps.pushCoarseUndo).toHaveBeenCalledTimes(1);
    expect(deps.onWorkingReplaced).toHaveBeenCalledTimes(2);
  });
});

describe("historyPane: independence", () => {
  it("two controllers share no state", async () => {
    const a = makeDeps();
    const b = makeDeps();
    const ca = createHistoryController(a.deps);
    const cb = createHistoryController(b.deps);
    await ca.loadHistory();
    await cb.loadHistory();
    await ca.toggleSel("2000", true); // a previews
    await cb.toggleSel("actual", true);
    await cb.toggleSel("1000", true); // b compares
    expect(ca.isPreviewing()).toBe(true);
    expect(ca.isComparing()).toBe(false);
    expect(cb.isComparing()).toBe(true);
    expect(cb.isPreviewing()).toBe(false);
    await ca.exitPreview();
    expect(cb.isComparing()).toBe(true); // untouched
  });
});

describe("historyPane: section rendering", () => {
  it("renders a titled collapsible section with its own Actual row", async () => {
    const { deps, section } = makeDeps();
    const c = createHistoryController(deps);
    await c.loadHistory();
    c.renderSection(section);
    expect(section.querySelector("details")).toBeTruthy();
    expect(section.textContent).toContain("Subproceso: p1");
    expect(section.textContent).toContain("Actual (editable)");
    expect(section.querySelectorAll(".history-check")).toHaveLength(3); // actual + 2 revs
  });
});
