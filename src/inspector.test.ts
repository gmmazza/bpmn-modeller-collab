import { describe, it, expect, vi } from "vitest";
import { createInspector } from "./inspector";

const TABS = [
  { id: "a", label: "Alpha", icon: "layers" as const },
  { id: "b", label: "Beta", icon: "properties" as const },
  { id: "c", label: "Gamma", icon: "database" as const },
];

describe("createInspector (icon rail)", () => {
  it("renders one rail button per tab with an svg icon and a title/aria-label", () => {
    const el = document.createElement("div");
    createInspector(el, TABS);
    const btns = el.querySelectorAll(".inspector-tab");
    expect(btns.length).toBe(3);
    expect(btns[0].querySelector("svg")).toBeTruthy();
    expect(btns[0].getAttribute("title")).toBe("Alpha");
    expect(btns[0].getAttribute("aria-label")).toBe("Alpha");
  });

  it("setTab switches the active pane and marks the active button", () => {
    const el = document.createElement("div");
    const insp = createInspector(el, TABS);
    insp.setTab("b");
    expect(insp.activeTab()).toBe("b");
    expect(el.querySelector('.inspector-tab[data-tab="b"]')!.classList.contains("active")).toBe(true);
    expect((el.querySelector('.inspector-pane[data-pane="b"]') as HTMLElement).hidden).toBe(false);
    expect((el.querySelector('.inspector-pane[data-pane="a"]') as HTMLElement).hidden).toBe(true);
  });

  it("clicking the active tab while visible collapses the panes; the rail stays present", () => {
    const el = document.createElement("div");
    const insp = createInspector(el, TABS);
    insp.setTab("a");
    insp.show();
    expect(insp.isVisible()).toBe(true);
    (el.querySelector('.inspector-tab[data-tab="a"]') as HTMLButtonElement).click();
    expect(insp.isVisible()).toBe(false);          // panes collapsed
    expect(el.querySelectorAll(".inspector-tab").length).toBe(3); // rail still there
  });

  it("clicking a non-active tab while collapsed opens that pane", () => {
    const el = document.createElement("div");
    const insp = createInspector(el, TABS);
    insp.hide();
    (el.querySelector('.inspector-tab[data-tab="c"]') as HTMLButtonElement).click();
    expect(insp.isVisible()).toBe(true);
    expect(insp.activeTab()).toBe("c");
  });

  it("setTabVisible hides a rail button", () => {
    const el = document.createElement("div");
    const insp = createInspector(el, TABS);
    insp.setTabVisible("c", false);
    expect((el.querySelector('.inspector-tab[data-tab="c"]') as HTMLButtonElement).hidden).toBe(true);
  });

  it("onChange fires on tab change", () => {
    const el = document.createElement("div");
    const onChange = vi.fn();
    const insp = createInspector(el, TABS, onChange);
    insp.setTab("b");
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
