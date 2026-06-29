import { describe, it, expect } from "vitest";
import { createInspector } from "./inspector";

const tabs = [
  { id: "capas", label: "Capas" },
  { id: "propiedades", label: "Propiedades" },
  { id: "historial", label: "Historial" },
];

describe("inspector", () => {
  it("renders tab buttons and starts on the first tab", () => {
    const el = document.createElement("div");
    const insp = createInspector(el, tabs);
    expect(el.querySelectorAll(".inspector-tab").length).toBe(3);
    expect(insp.activeTab()).toBe("capas");
    expect(insp.paneEl("capas").hidden).toBe(false);
    expect(insp.paneEl("propiedades").hidden).toBe(true);
  });
  it("setTab switches the visible pane", () => {
    const el = document.createElement("div");
    const insp = createInspector(el, tabs);
    insp.setTab("propiedades");
    expect(insp.activeTab()).toBe("propiedades");
    expect(insp.paneEl("capas").hidden).toBe(true);
    expect(insp.paneEl("propiedades").hidden).toBe(false);
  });
  it("paneEl returns a mountable element; show/hide toggle visibility", () => {
    const el = document.createElement("div");
    const insp = createInspector(el, tabs);
    insp.paneEl("historial").appendChild(document.createElement("span"));
    expect(insp.paneEl("historial").querySelector("span")).not.toBeNull();
    insp.hide();
    expect(insp.isVisible()).toBe(false);
    insp.show();
    expect(insp.isVisible()).toBe(true);
  });
});
