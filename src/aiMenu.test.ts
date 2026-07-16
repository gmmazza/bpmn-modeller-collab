import { describe, it, expect, vi } from "vitest";
import { buildAiMenu, type AiMenuDeps } from "./aiMenu";
import type { Preset } from "./terminalPresets";

const PRESETS: Preset[] = [
  { id: "p1", label: "Claude", command: "claude" },
  { id: "p2", label: "Claude review", command: "claude --review" },
];

function fakeDeps(overrides: Partial<AiMenuDeps> = {}): AiMenuDeps {
  let last: string | null = null;
  return {
    hasLauncher: true,
    getPresets: () => PRESETS,
    getLastPresetId: () => last,
    setLastPresetId: vi.fn((id: string | null) => { last = id; }),
    launch: vi.fn(async () => undefined),
    onManagePresets: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

describe("buildAiMenu", () => {
  it("with hasLauncher renders a preset select, Lanzar, Abrir terminal and Administrar presets", () => {
    const deps = fakeDeps({ getLastPresetId: () => "p2" });
    const el = buildAiMenu(deps);
    const sel = el.querySelector(".ai-menu-preset") as HTMLSelectElement;
    expect(sel).toBeTruthy();
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(["p1", "p2"]);
    expect(sel.value).toBe("p2"); // pre-selects getLastPresetId()
    expect(el.querySelector(".ai-menu-launch")).toBeTruthy();
    expect(el.querySelector(".ai-menu-terminal")).toBeTruthy();
    expect(el.querySelector(".ai-menu-manage")).toBeTruthy();
  });

  it("pre-selects the first preset when there is no last preset id", () => {
    const deps = fakeDeps({ getLastPresetId: () => null });
    const el = buildAiMenu(deps);
    const sel = el.querySelector(".ai-menu-preset") as HTMLSelectElement;
    expect(sel.value).toBe("p1");
  });

  it("disables the select when there are no presets", () => {
    const deps = fakeDeps({ getPresets: () => [], getLastPresetId: () => null });
    const el = buildAiMenu(deps);
    const sel = el.querySelector(".ai-menu-preset") as HTMLSelectElement;
    expect(sel.disabled).toBe(true);
  });

  it("clicking Lanzar launches the SELECTED preset's command and persists its id", () => {
    const deps = fakeDeps({ getLastPresetId: () => "p1" });
    const el = buildAiMenu(deps);
    const sel = el.querySelector(".ai-menu-preset") as HTMLSelectElement;
    sel.value = "p2";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    (el.querySelector(".ai-menu-launch") as HTMLButtonElement).click();
    expect(deps.launch).toHaveBeenCalledWith("claude --review");
    expect(deps.setLastPresetId).toHaveBeenCalledWith("p2");
  });

  it("clicking Abrir terminal en la carpeta launches with null (open terminal, no command)", () => {
    const deps = fakeDeps();
    const el = buildAiMenu(deps);
    (el.querySelector(".ai-menu-terminal") as HTMLButtonElement).click();
    expect(deps.launch).toHaveBeenCalledWith(null);
  });

  it("clicking Administrar presets calls onManagePresets", () => {
    const deps = fakeDeps();
    const el = buildAiMenu(deps);
    (el.querySelector(".ai-menu-manage") as HTMLButtonElement).click();
    expect(deps.onManagePresets).toHaveBeenCalledTimes(1);
  });

  it("with hasLauncher:false hides the select/Lanzar/open-terminal controls, keeps only Administrar presets", () => {
    const deps = fakeDeps({ hasLauncher: false });
    const el = buildAiMenu(deps);
    expect(el.querySelector(".ai-menu-preset")).toBeNull();
    expect(el.querySelector(".ai-menu-launch")).toBeNull();
    expect(el.querySelector(".ai-menu-terminal")).toBeNull();
    expect(el.querySelector(".ai-menu-manage")).toBeTruthy();
  });

  it("does not call launch/setLastPresetId when hasLauncher is false (no launch controls to click)", () => {
    const deps = fakeDeps({ hasLauncher: false });
    buildAiMenu(deps);
    expect(deps.launch).not.toHaveBeenCalled();
    expect(deps.setLastPresetId).not.toHaveBeenCalled();
  });

  it("renders a preset label with <, & and \" as text, not parsed markup", () => {
    const dangerous: Preset[] = [{ id: "p1", label: '<img src=x onerror=alert(1)>&"quote"', command: "cmd" }];
    const deps = fakeDeps({ getPresets: () => dangerous, getLastPresetId: () => "p1" });
    const el = buildAiMenu(deps);
    const sel = el.querySelector(".ai-menu-preset") as HTMLSelectElement;
    expect(sel.options).toHaveLength(1);
    expect(sel.options[0].textContent).toBe('<img src=x onerror=alert(1)>&"quote"');
    expect(el.querySelector("img")).toBeNull();
  });
});
