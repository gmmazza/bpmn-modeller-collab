import { describe, it, expect, vi, afterEach } from "vitest";
import { createIdeaMode, type IdeaModeDeps } from "./ideaMode";
import { createIdeasClient } from "./ideasClient";
import { createFsClient } from "../fsClient";
import { createFakeDir } from "../testHelpers/fakeDir";
import type { OverlayHost } from "./ideasOverlays";

function fakeHost() {
  const live = new Map<string, { elementId: string; html: HTMLElement }>();
  let n = 0;
  const host: OverlayHost = {
    add(elementId, html) { const id = `ov-${n++}`; live.set(id, { elementId, html }); return id; },
    remove(id) { live.delete(id); },
  };
  return { host, live };
}
function setup(persisted = false) {
  const { host, live } = fakeHost();
  const ideasClient = createIdeasClient(createFsClient(createFakeDir()));
  let stored = persisted;
  const deps: IdeaModeDeps = {
    overlayHost: host, ideasClient,
    diagramId: () => "x.bpmn", processName: () => "Proc",
    identity: () => "Ana", today: () => "2026-07-05",
    elementLabel: () => "Validar", clientRectFor: () => ({ left: 5, top: 5 }),
    openThreadInPanel: vi.fn(), focusElement: vi.fn(), onPanelShouldRefresh: vi.fn(),
    persistGet: () => stored, persistSet: (on) => { stored = on; },
    onModeChange: vi.fn(),
  };
  return { deps, host, live, ideasClient, mode: createIdeaMode(deps) };
}
const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
afterEach(() => { document.body.innerHTML = ""; });

describe("ideaMode", () => {
  it("starts from persisted state", () => {
    expect(setup(false).mode.isOn()).toBe(false);
    expect(setup(true).mode.isOn()).toBe(true);
  });

  it("toggling on persists, notifies, and draws badges for active anchored ideas", async () => {
    const { mode, ideasClient, live, deps } = setup(false);
    await ideasClient.writeIdea("x.bpmn", { id: "idea-1", estado: "pendiente", anchor: "A", anchorLabel: "Val", autor: "Ana", fecha: "2026-07-01", motivo: "", mejora: "", fuente: null, description: "d", comments: [] });
    await mode.toggle();
    await flush();
    expect(mode.isOn()).toBe(true);
    expect(deps.onModeChange).toHaveBeenCalledWith(true);
    expect([...live.values()].some((o) => o.elementId === "A")).toBe(true);
  });

  it("toggling off clears badges", async () => {
    const { mode, ideasClient, live } = setup(false);
    await ideasClient.writeIdea("x.bpmn", { id: "idea-1", estado: "haciendo", anchor: "A", anchorLabel: "Val", autor: "Ana", fecha: "2026-07-01", motivo: "", mejora: "", fuente: null, description: "d", comments: [] });
    await mode.toggle(); await flush();
    await mode.toggle(); await flush();
    expect(live.size).toBe(0);
  });

  it("clicking an element opens a popover listing its ideas", async () => {
    const { mode, ideasClient } = setup(true);
    await ideasClient.writeIdea("x.bpmn", { id: "idea-1", estado: "pendiente", anchor: "A", anchorLabel: "Val", autor: "Ana", fecha: "2026-07-01", motivo: "", mejora: "", fuente: null, description: "idea de A", comments: [] });
    await mode.onElementClick("A");
    await flush();
    expect(document.querySelector(".idea-element-pop")).not.toBeNull();
    expect(document.body.textContent).toContain("idea de A");
  });

  it("adding an idea from the popover persists it anchored to the element", async () => {
    const { mode, ideasClient, deps } = setup(true);
    await mode.onElementClick("A");
    await flush();
    (document.querySelector<HTMLInputElement>("[data-pop-input]")!).value = "nueva acá";
    (document.querySelector("[data-pop-add]") as HTMLButtonElement).click();
    await flush();
    const all = await ideasClient.listIdeas("x.bpmn");
    expect(all).toHaveLength(1);
    expect(all[0].anchor).toBe("A");
    expect(all[0].description).toBe("nueva acá");
    expect(deps.onPanelShouldRefresh).toHaveBeenCalled();
  });

  it("does not open a popover when mode is off", async () => {
    const { mode } = setup(false);
    await mode.onElementClick("A");
    await flush();
    expect(document.querySelector(".idea-element-pop")).toBeNull();
  });
});
