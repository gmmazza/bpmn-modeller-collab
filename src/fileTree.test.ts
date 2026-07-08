import { describe, it, expect } from "vitest";
import { buildTree, renderFileTree, visibleEntries } from "./fileTree";
import type { TreeEntry } from "./types";

describe("renderFileTree", () => {
  const me = { name: "Ana", email: "Ana" };
  const entries: TreeEntry[] = [
    { path: "Ventas", kind: "dir" },
    { path: "Ventas/B2B.bpmn", kind: "file", appProperties: {} },
    { path: "RRHH.bpmn", kind: "file", appProperties: {} },
  ];
  it("renders folders collapsed by default; expands when in expanded set", () => {
    const el = document.createElement("div");
    renderFileTree(el, entries, { expanded: new Set(), selectedId: null, me }, {
      onOpen() {}, onMenu() {}, onToggle() {}, onNewFile() {}, onNewFolder() {},
    });
    // collapsed: child file not rendered
    expect(el.querySelector('[data-path="Ventas/B2B.bpmn"]')).toBeNull();
    expect(el.querySelector('[data-path="Ventas"]')).not.toBeNull();
    expect(el.querySelector('[data-path="RRHH.bpmn"]')).not.toBeNull();

    const el2 = document.createElement("div");
    renderFileTree(el2, entries, { expanded: new Set(["Ventas"]), selectedId: null, me }, {
      onOpen() {}, onMenu() {}, onToggle() {}, onNewFile() {}, onNewFolder() {},
    });
    expect(el2.querySelector('[data-path="Ventas/B2B.bpmn"]')).not.toBeNull();
  });
  it("clicking a file row calls onOpen; ⋯ calls onMenu", () => {
    const el = document.createElement("div");
    let opened = ""; let menued = "";
    renderFileTree(el, entries, { expanded: new Set(), selectedId: null, me }, {
      onOpen: (id) => { opened = id; }, onMenu: (t) => { menued = t.path; },
      onToggle() {}, onNewFile() {}, onNewFolder() {},
    });
    (el.querySelector('[data-path="RRHH.bpmn"] .ft-name') as HTMLElement).click();
    expect(opened).toBe("RRHH.bpmn");
    (el.querySelector('[data-path="RRHH.bpmn"] .ft-menu') as HTMLElement).click();
    expect(menued).toBe("RRHH.bpmn");
  });
  it("shows a .file-master-chip on rows whose path is in the masters set, none otherwise", () => {
    const handlers = { onOpen() {}, onMenu() {}, onToggle() {}, onNewFile() {}, onNewFolder() {} };
    const el = document.createElement("div");
    renderFileTree(el, entries, { expanded: new Set(), selectedId: null, me, masters: new Set(["RRHH.bpmn"]) }, handlers);
    expect(el.querySelector('[data-path="RRHH.bpmn"] .file-master-chip')).not.toBeNull();

    const el2 = document.createElement("div");
    renderFileTree(el2, entries, { expanded: new Set(), selectedId: null, me }, handlers);
    expect(el2.querySelector('[data-path="RRHH.bpmn"] .file-master-chip')).toBeNull();
  });
});

describe("visibleEntries", () => {
  it("hides .docs sidecars and dot-folders, keeps .bpmn files and independent folders", () => {
    const entries: TreeEntry[] = [
      { path: "Ventas", kind: "dir" },
      { path: "Ventas/B2B.bpmn", kind: "file" },
      { path: "Ventas/B2B.docs", kind: "dir" },
      { path: "Ventas/B2B.docs/assets", kind: "dir" },
      { path: "RRHH.bpmn", kind: "file" },
      { path: "RRHH.docs", kind: "dir" },
      { path: ".history", kind: "dir" },
      { path: ".history/RRHH", kind: "dir" },
    ];
    expect(visibleEntries(entries).map((e) => e.path)).toEqual([
      "Ventas",
      "Ventas/B2B.bpmn",
      "RRHH.bpmn",
    ]);
  });

  it("does not render hidden sidecar folders in the tree", () => {
    const me = { name: "Ana", email: "Ana" };
    const el = document.createElement("div");
    renderFileTree(el, [
      { path: "P.bpmn", kind: "file", appProperties: {} },
      { path: "P.docs", kind: "dir" },
    ], { expanded: new Set(), selectedId: null, me }, {
      onOpen() {}, onMenu() {}, onToggle() {}, onNewFile() {}, onNewFolder() {},
    });
    expect(el.querySelector('[data-path="P.docs"]')).toBeNull();
    expect(el.querySelector('[data-path="P.bpmn"]')).not.toBeNull();
  });
});

describe("buildTree", () => {
  it("nests by path, folders first then alphabetical", () => {
    const entries: TreeEntry[] = [
      { path: "RRHH.bpmn", kind: "file" },
      { path: "Ventas", kind: "dir" },
      { path: "Ventas/B2C.bpmn", kind: "file" },
      { path: "Ventas/B2B.bpmn", kind: "file" },
      { path: "Compras", kind: "dir" },
    ];
    const roots = buildTree(entries);
    expect(roots.map((n) => n.name)).toEqual(["Compras", "Ventas", "RRHH.bpmn"]);
    const ventas = roots.find((n) => n.name === "Ventas")!;
    expect(ventas.children.map((c) => c.name)).toEqual(["B2B.bpmn", "B2C.bpmn"]);
    expect(ventas.children[0].path).toBe("Ventas/B2B.bpmn");
  });
});
