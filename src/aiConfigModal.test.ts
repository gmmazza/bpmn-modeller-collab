import { describe, it, expect, vi } from "vitest";
import { showAiConfigModal } from "./aiConfigModal";

function fakeApi(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    readPath: async (p: string) => store.get(p) ?? null,
    writePath: async (p: string, t: string) => { store.set(p, t); },
    deletePath: async (p: string) => { store.delete(p); },
  };
}

describe("showAiConfigModal", () => {
  it("renders the instructions section always and the launcher section only when hasLauncher", () => {
    const web = showAiConfigModal({ api: fakeApi(), userName: "Ana", hasLauncher: false, launch: vi.fn(), onError: vi.fn() });
    expect(web.querySelector(".ai-section-instructions")).toBeTruthy();
    expect(web.querySelector(".ai-section-launcher")).toBeNull();
    web.remove();

    const desktop = showAiConfigModal({ api: fakeApi(), userName: "Ana", hasLauncher: true, launch: vi.fn(), onError: vi.fn() });
    expect(desktop.querySelector(".ai-section-instructions")).toBeTruthy();
    expect(desktop.querySelector(".ai-section-launcher")).toBeTruthy();
    desktop.remove();
  });

  it("has a 'Ver AGENTS.md' control that reads (not edits) the generated file", async () => {
    const api = fakeApi({ "AGENTS.md": "# generado\n" });
    const overlay = showAiConfigModal({ api, userName: "Ana", hasLauncher: false, launch: vi.fn(), onError: vi.fn() });
    (overlay.querySelector(".ai-view-agents") as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    const viewer = overlay.querySelector(".ai-agents-viewer") as HTMLTextAreaElement;
    expect(viewer.value).toContain("# generado");
    expect(viewer.readOnly).toBe(true);
    overlay.remove();
  });
});
