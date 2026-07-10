import { describe, it, expect, vi, beforeEach } from "vitest";
import { showConfigModal, type ConfigModalDeps } from "./configModal";
import { getPresets } from "./terminalPresets";
import { getName } from "./identity";
import { getTheme } from "./theme";

function fakeApi(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    readPath: async (p: string) => store.get(p) ?? null,
    writePath: async (p: string, t: string) => { store.set(p, t); },
    deletePath: async (p: string) => { store.delete(p); },
  };
}

function deps(over: Partial<ConfigModalDeps> = {}): ConfigModalDeps {
  return {
    api: fakeApi(),
    userName: "Ana",
    onNameChange: vi.fn(),
    folderLabel: "mi-carpeta",
    onChangeFolder: vi.fn(),
    onThemeChange: vi.fn(),
    onVizChange: vi.fn(async () => {}),
    onAutosaveChange: vi.fn(),
    fetchLatestBpmnJs: vi.fn(async () => "99.0.0"),
    hasLauncher: true,
    onClose: vi.fn(),
    onError: vi.fn(),
    ...over,
  };
}

describe("showConfigModal", () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as { appUpdate?: unknown }).appUpdate;
  });

  it("assembles all 4 panes and 4 nav buttons", () => {
    const overlay = showConfigModal(deps());
    expect(overlay.querySelectorAll(".config-nav button[data-section]")).toHaveLength(4);
    expect(overlay.querySelectorAll(".config-pane[data-pane]")).toHaveLength(4);
    for (const id of ["visualizacion", "ia", "generales", "version"]) {
      expect(overlay.querySelector(`.config-nav button[data-section="${id}"]`)).toBeTruthy();
      expect(overlay.querySelector(`.config-pane[data-pane="${id}"]`)).toBeTruthy();
    }
    overlay.remove();
  });

  it("section switching toggles hidden panes and the active nav button", () => {
    const overlay = showConfigModal(deps());
    const iaBtn = overlay.querySelector('.config-nav button[data-section="ia"]') as HTMLButtonElement;
    const vizPane = overlay.querySelector('.config-pane[data-pane="visualizacion"]') as HTMLElement;
    const iaPane = overlay.querySelector('.config-pane[data-pane="ia"]') as HTMLElement;
    expect(vizPane.hidden).toBe(false);
    expect(iaPane.hidden).toBe(true);

    iaBtn.click();
    expect(vizPane.hidden).toBe(true);
    expect(iaPane.hidden).toBe(false);
    expect(iaBtn.classList.contains("active")).toBe(true);
    overlay.remove();
  });

  it("deep-links to a section via initialSection", () => {
    const overlay = showConfigModal(deps({ initialSection: "generales" }));
    const generalesPane = overlay.querySelector('.config-pane[data-pane="generales"]') as HTMLElement;
    const vizPane = overlay.querySelector('.config-pane[data-pane="visualizacion"]') as HTMLElement;
    expect(generalesPane.hidden).toBe(false);
    expect(vizPane.hidden).toBe(true);
    overlay.remove();
  });

  it("adding an IA preset persists trimmed label/command via getPresets", () => {
    const overlay = showConfigModal(deps());
    (overlay.querySelector(".cfg-preset-add") as HTMLButtonElement).click();
    const row = overlay.querySelector(".cfg-preset-row") as HTMLElement;
    (row.querySelector(".cfg-preset-label") as HTMLInputElement).value = "  Mi preset  ";
    (row.querySelector(".cfg-preset-cmd") as HTMLInputElement).value = "  claude --review  ";
    row.dispatchEvent(new Event("change", { bubbles: true }));
    const stored = getPresets();
    expect(stored).toHaveLength(1);
    expect(stored[0].label).toBe("Mi preset");
    expect(stored[0].command).toBe("claude --review");
    overlay.remove();
  });

  it("'Ver AGENTS.md generado' loads the generated file into a read-only textarea", async () => {
    const api = fakeApi({ "AGENTS.md": "# generado\n" });
    const overlay = showConfigModal(deps({ api }));
    (overlay.querySelector(".cfg-view-agents") as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    const viewer = overlay.querySelector(".cfg-agents-viewer") as HTMLTextAreaElement;
    expect(viewer.value).toContain("# generado");
    expect(viewer.readOnly).toBe(true);
    overlay.remove();
  });

  it("'Cambiar' name fires onNameChange and persists via setName", () => {
    const onNameChange = vi.fn();
    const overlay = showConfigModal(deps({ userName: "Ana", onNameChange }));
    const input = overlay.querySelector(".cfg-name-input") as HTMLInputElement;
    input.value = "Beatriz";
    (overlay.querySelector(".cfg-name-save") as HTMLButtonElement).click();
    expect(onNameChange).toHaveBeenCalledWith("Beatriz");
    expect(getName()).toBe("Beatriz");
    overlay.remove();
  });

  it("'Cambiar carpeta' closes the modal and fires onChangeFolder", () => {
    const onChangeFolder = vi.fn();
    const onClose = vi.fn();
    const overlay = showConfigModal(deps({ onChangeFolder, onClose }));
    document.body.appendChild(overlay); // showConfigModal already appends, but keep the check honest
    (overlay.querySelector(".cfg-folder-change") as HTMLButtonElement).click();
    expect(document.body.contains(overlay)).toBe(false);
    expect(onClose).toHaveBeenCalled();
    expect(onChangeFolder).toHaveBeenCalled();
  });

  it("toggling the sketchy checkbox fires onVizChange with the new settings", () => {
    const onVizChange = vi.fn(async () => {});
    const overlay = showConfigModal(deps({ onVizChange }));
    const sketchy = overlay.querySelector(".cfg-sketchy") as HTMLInputElement;
    sketchy.checked = true;
    sketchy.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onVizChange).toHaveBeenCalledWith({ sketchy: true, heatmap: false });
    overlay.remove();
  });

  it("changing the theme fires onThemeChange and persists it", () => {
    const onThemeChange = vi.fn();
    const overlay = showConfigModal(deps({ onThemeChange }));
    const dark = overlay.querySelector('input[name="cfg-theme"][value="dark"]') as HTMLInputElement;
    dark.checked = true;
    dark.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onThemeChange).toHaveBeenCalledWith("dark");
    expect(getTheme()).toBe("dark");
    overlay.remove();
  });

  it("without window.appUpdate, the app-update block is absent but the bpmn-js version block is present", () => {
    const overlay = showConfigModal(deps());
    const versionPane = overlay.querySelector('.config-pane[data-pane="version"]') as HTMLElement;
    expect(versionPane.querySelector(".viz-version")).toBeTruthy();
    expect(versionPane.querySelector("#app-version")).toBeNull();
    expect(versionPane.querySelector("#app-upd")).toBeNull();
    expect(versionPane.querySelector(".viz-update")).toBeNull();
    overlay.remove();
  });
});
