// Unified "Configuración de IA" modal: (1) personal AI instructions + a read-only viewer for
// the generated AGENTS.md, and (2) an Electron-only "Lanzar agente" section (terminal presets +
// launch). Absorbs terminalPresetsModal + the personal-instructions editor into one surface so
// the toolbar exposes a single always-reachable "IA" entry point. UI strings in Spanish.
import { readPersonalInstructions, savePersonalInstructions } from "./processDocs/personalInstructions";
import { personalOverlayPath } from "./processDocs/agentsFile";
import { getPresets, setPresets, addPreset, removePreset, getLastPresetId, setLastPresetId, type Preset } from "./terminalPresets";

export interface AiConfigModalDeps {
  api: { readPath(p: string): Promise<string | null>; writePath(p: string, t: string): Promise<void>; deletePath(p: string): Promise<void> };
  userName: string | null;
  hasLauncher: boolean;
  launch(command: string | null): Promise<unknown>;
  onError(e: unknown): void;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function showAiConfigModal(deps: AiConfigModalDeps): HTMLElement {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay ai-config-modal";
  const overlayPath = personalOverlayPath(deps.userName);
  const disabled = overlayPath ? "" : "disabled";

  overlay.innerHTML = `
    <div class="gate-card ai-config-card">
      <h2>Configuración de IA</h2>

      <section class="ai-section-instructions">
        <h3>Instrucciones para la IA</h3>
        <p>Tuyas, para este proyecto. Se guardan en <code>${esc(overlayPath ?? "(configurá tu nombre primero)")}</code>.
           Tienen precedencia sobre tu skill BPMN personal, no sobre el canon del proyecto.</p>
        <textarea class="ai-instructions-text" rows="8" style="width:100%" ${disabled}></textarea>
        <div class="ai-row">
          <button class="btn ai-view-agents" type="button">Ver AGENTS.md generado</button>
          <button class="btn primary ai-save-instructions" type="button" ${disabled}>Guardar instrucciones</button>
        </div>
        <textarea class="ai-agents-viewer" rows="8" style="width:100%" readonly hidden></textarea>
      </section>

      ${deps.hasLauncher ? `
      <section class="ai-section-launcher">
        <h3>Lanzar agente</h3>
        <p>Definí comandos para lanzar en la carpeta (ej. <code>claude</code>, <code>claude --review</code>).</p>
        <div class="ai-preset-rows"></div>
        <button class="btn ai-preset-add" type="button">+ Agregar preset</button>
        <div class="ai-row">
          <select class="btn ai-preset-select" title="Preset a lanzar"></select>
          <button class="btn ai-launch-preset" type="button">Lanzar en terminal</button>
          <button class="btn ai-launch-folder" type="button">Abrir terminal en la carpeta</button>
        </div>
      </section>` : ``}

      <div class="gate-actions">
        <button class="btn ai-close" type="button">Cerrar</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const $ = <T extends HTMLElement>(sel: string) => overlay.querySelector(sel) as T;

  // --- Instructions ---
  const ta = $<HTMLTextAreaElement>(".ai-instructions-text");
  void readPersonalInstructions(deps.api, deps.userName).then((t) => { ta.value = t; }).catch(deps.onError);
  $(".ai-save-instructions").addEventListener("click", () => {
    void savePersonalInstructions(deps.api, deps.userName, ta.value).catch(deps.onError);
  });
  const agentsViewer = $<HTMLTextAreaElement>(".ai-agents-viewer");
  $(".ai-view-agents").addEventListener("click", () => {
    void deps.api.readPath("AGENTS.md").then((txt) => {
      agentsViewer.value = txt ?? "(todavía no se generó AGENTS.md en esta carpeta)";
      agentsViewer.hidden = false;
    }).catch(deps.onError);
  });

  // --- Launcher (Electron only) ---
  if (deps.hasLauncher) {
    let draft: Preset[] = getPresets();
    const rows = $(".ai-preset-rows");
    const sel = $<HTMLSelectElement>(".ai-preset-select");
    const renderRows = (): void => {
      rows.innerHTML = "";
      for (const p of draft) {
        const r = document.createElement("div");
        r.className = "ai-preset-row"; r.dataset.id = p.id;
        r.innerHTML = `<input class="ai-preset-label" value="${esc(p.label)}" placeholder="Etiqueta" />
          <input class="ai-preset-cmd" value="${esc(p.command)}" placeholder="Comando" />
          <button class="btn ai-preset-del" type="button" title="Borrar">🗑</button>`;
        rows.appendChild(r);
      }
      rows.querySelectorAll(".ai-preset-del").forEach((b) => b.addEventListener("click", (e) => {
        syncFromInputs();
        draft = removePreset(draft, (e.currentTarget as HTMLElement).closest(".ai-preset-row")!.getAttribute("data-id")!);
        persist(); renderRows(); renderSelect();
      }));
    };
    const syncFromInputs = (): void => {
      draft = (Array.from(rows.querySelectorAll(".ai-preset-row")) as HTMLElement[]).map((r) => ({
        id: r.dataset.id!,
        label: (r.querySelector(".ai-preset-label") as HTMLInputElement).value,
        command: (r.querySelector(".ai-preset-cmd") as HTMLInputElement).value,
      }));
    };
    const persist = (): void => setPresets(draft.filter((p) => p.label.trim() && p.command.trim()));
    const renderSelect = (): void => {
      const presets = getPresets();
      sel.innerHTML = "";
      for (const p of presets) { const o = document.createElement("option"); o.value = p.id; o.textContent = p.label; sel.appendChild(o); }
      const last = getLastPresetId();
      if (last && presets.some((p) => p.id === last)) sel.value = last;
      sel.disabled = presets.length === 0;
    };
    $(".ai-preset-add").addEventListener("click", () => { syncFromInputs(); draft = addPreset(draft, "Nuevo", "comando"); persist(); renderRows(); renderSelect(); });
    rows.addEventListener("change", () => { syncFromInputs(); persist(); renderSelect(); });
    sel.addEventListener("change", () => setLastPresetId(sel.value || null));
    $(".ai-launch-preset").addEventListener("click", () => {
      const p = getPresets().find((x) => x.id === sel.value);
      if (p) { setLastPresetId(p.id); void deps.launch(p.command).catch(deps.onError); }
    });
    $(".ai-launch-folder").addEventListener("click", () => { void deps.launch(null).catch(deps.onError); });
    renderRows(); renderSelect();
  }

  const close = () => overlay.remove();
  $(".ai-close").addEventListener("click", close);
  return overlay;
}
