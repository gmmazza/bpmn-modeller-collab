// Operational IA menu: builds the toolbar "IA" button's anchored dropdown content.
// Launch-only — choose a preset and launch it, or open a terminal in the folder
// (both Electron-only, gated on hasLauncher), plus a deep-link to "Administrar presets"
// (Configuraciones -> IA). Preset CRUD lives in configModal now; this menu never edits
// presets. Decoupled from DOM anchoring so it's unit-testable: the caller appends the
// returned element into an already-positioned `.menu-pop`. UI strings in Spanish.
import type { Preset } from "./terminalPresets";

export interface AiMenuDeps {
  hasLauncher: boolean; // hasTermApi() — hides launch controls on web
  getPresets(): Preset[];
  getLastPresetId(): string | null;
  setLastPresetId(id: string | null): void;
  launch(command: string | null): Promise<unknown>; // openExternalTerminal; null = open terminal in folder
  onManagePresets(): void; // later: openConfigModal("ia")
  onError(e: unknown): void;
}

export function buildAiMenu(deps: AiMenuDeps): HTMLElement {
  const el = document.createElement("div");
  el.className = "ai-menu";

  if (deps.hasLauncher) {
    const presets = deps.getPresets();

    const sel = document.createElement("select");
    sel.className = "btn ai-menu-preset";
    sel.title = "Preset a lanzar";
    for (const p of presets) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.label; // textContent, not innerHTML: escapes markup automatically
      sel.appendChild(opt);
    }
    const last = deps.getLastPresetId();
    if (last && presets.some((p) => p.id === last)) sel.value = last;
    sel.disabled = presets.length === 0;
    el.appendChild(sel);

    const launchBtn = document.createElement("button");
    launchBtn.type = "button";
    launchBtn.className = "btn ai-menu-launch";
    launchBtn.textContent = "Lanzar";
    launchBtn.addEventListener("click", () => {
      const p = deps.getPresets().find((x) => x.id === sel.value);
      if (!p) return;
      deps.setLastPresetId(p.id);
      void deps.launch(p.command).catch(deps.onError);
    });
    el.appendChild(launchBtn);

    const terminalBtn = document.createElement("button");
    terminalBtn.type = "button";
    terminalBtn.className = "btn ai-menu-terminal";
    terminalBtn.textContent = "Abrir terminal en la carpeta";
    terminalBtn.addEventListener("click", () => {
      void deps.launch(null).catch(deps.onError);
    });
    el.appendChild(terminalBtn);
  } else {
    const hint = document.createElement("p");
    hint.className = "ai-menu-hint muted";
    hint.textContent = "Lanzar agentes requiere la app de escritorio.";
    el.appendChild(hint);
  }

  const manageBtn = document.createElement("button");
  manageBtn.type = "button";
  manageBtn.className = "btn ai-menu-manage";
  manageBtn.textContent = "Administrar presets";
  manageBtn.addEventListener("click", () => deps.onManagePresets());
  el.appendChild(manageBtn);

  return el;
}
