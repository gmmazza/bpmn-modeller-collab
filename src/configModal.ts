// "Configuraciones" modal: a single sectioned settings window (Visualización, IA,
// Generales, Versión y actualizaciones) that replaces the scattered "Ajustes" popover +
// "Configuración de IA" modal + header name/folder dropdown. Reuses the .gate-card shell
// with a local vertical section switcher (NOT createInspector — its horizontal tabs and
// .collapsed/slide coupling to the side panel are hostile inside a modal).
//
// The heavy behaviors (recreating the modeler on viz-setting change, reloading the
// folder) live in the caller's closure and are handed in as callbacks — this module is a
// dumb view. See src/main.ts's future openConfigModal() factory (a later task) for how
// deps get wired to the app.
import { getTheme, setTheme, applyTheme, type Theme } from "./theme";
import { getVizSettings, type VizSettings } from "./vizSettings";
import { getAutosave, setAutosave } from "./draftPrefs";
import { setName } from "./identity";
import { getPresets, setPresets, addPreset, removePreset, type Preset } from "./terminalPresets";
import { readPersonalInstructions, savePersonalInstructions } from "./processDocs/personalInstructions";
import { personalOverlayPath } from "./processDocs/agentsFile";
import { BUNDLED_BPMN_JS_VERSION, checkLatestBpmnJs } from "./version";
import { wireAppUpdateSection } from "./updateSectionUi";

export type ConfigSection = "visualizacion" | "ia" | "generales" | "version";

export interface ConfigModalApi {
  readPath(p: string): Promise<string | null>;
  writePath(p: string, t: string): Promise<void>;
  deletePath(p: string): Promise<void>;
}

export interface ConfigModalDeps {
  api: ConfigModalApi;
  userName: string | null;
  onNameChange(name: string): void; // main re-renders #userbtn
  folderLabel: string;
  onChangeFolder(): void; // = changeFolder(); the modal closes first
  onThemeChange(theme: Theme): void; // main re-renders #themebtn
  onVizChange(next: VizSettings): Promise<void>; // = applyVizSettings (recreates the modeler)
  onAutosaveChange(on: boolean): void; // main calls render() to reflect the toolbar toggle
  fetchLatestBpmnJs(): Promise<string>;
  hasLauncher: boolean; // hints "curate only" on web
  onClose(): void; // = refreshQuickLaunch (▶ could go stale)
  onError(e: unknown): void;
  initialSection?: ConfigSection; // deep-link (default "visualizacion")
}

const SECTIONS: { id: ConfigSection; label: string }[] = [
  { id: "visualizacion", label: "Visualización" },
  { id: "ia", label: "IA" },
  { id: "generales", label: "Generales" },
  { id: "version", label: "Versión y actualizaciones" },
];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function showConfigModal(deps: ConfigModalDeps): HTMLElement {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay config-modal";
  overlay.innerHTML = `
    <div class="gate-card config-card">
      <h2>Configuraciones</h2>
      <div class="config-body">
        <nav class="config-nav">
          ${SECTIONS.map((s) => `<button type="button" data-section="${s.id}">${s.label}</button>`).join("")}
        </nav>
        <div class="config-panes">
          ${paneVisualizacion()}
          ${paneIa(deps)}
          ${paneGenerales(deps)}
          ${paneVersion()}
        </div>
      </div>
      <div class="gate-actions">
        <button class="btn config-close" type="button">Cerrar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = <T extends HTMLElement>(sel: string) => overlay.querySelector(sel) as T;

  // --- Dismissal: every path calls deps.onClose() ---
  function close(): void {
    overlay.remove();
    document.removeEventListener("keydown", onKey, true);
    deps.onClose();
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onKey, true);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  $(".config-close").addEventListener("click", close);

  // --- Local vertical section switcher ---
  function showSection(id: ConfigSection): void {
    overlay.querySelectorAll<HTMLElement>(".config-pane").forEach((p) => { p.hidden = p.dataset.pane !== id; });
    overlay.querySelectorAll<HTMLButtonElement>(".config-nav button").forEach((b) => {
      b.classList.toggle("active", b.dataset.section === id);
    });
  }
  overlay.querySelectorAll<HTMLButtonElement>(".config-nav button").forEach((b) => {
    b.addEventListener("click", () => showSection(b.dataset.section as ConfigSection));
  });

  // Name snapshot, kept live: the Generales pane can change the name within the same
  // modal session, and the IA pane's save/overlay-path must follow it — not the stale
  // deps.userName captured at open time.
  let currentName: string | null = deps.userName;
  wireVisualizacion($, deps);
  const refreshIaForName = wireIa($, deps, () => currentName);
  wireGenerales($, deps, close, (v) => {
    currentName = v;
    refreshIaForName(v);
  });
  wireVersion($, deps, overlay);

  showSection(deps.initialSection ?? "visualizacion");
  return overlay;
}

// ---- Visualización: theme + sketchy/heatmap (lifted from main.ts's renderVizSettings) ----
function paneVisualizacion(): string {
  const theme = getTheme();
  const s = getVizSettings();
  return `
    <section class="config-pane" data-pane="visualizacion" hidden>
      <h3>Visualización</h3>
      <div class="cfg-theme">
        <label><input type="radio" name="cfg-theme" value="light" ${theme === "light" ? "checked" : ""}/> Claro</label>
        <label><input type="radio" name="cfg-theme" value="dark" ${theme === "dark" ? "checked" : ""}/> Oscuro</label>
      </div>
      <label><input type="checkbox" class="cfg-sketchy" ${s.sketchy ? "checked" : ""}/> Estilo sketchy (dibujado a mano)</label><br/>
      <label><input type="checkbox" class="cfg-heatmap" ${s.heatmap ? "checked" : ""}/> Heatmap de simulación (beta)</label>
      <p class="hint">Se aplica recreando el editor; si tenés cambios sin guardar, se guardan primero.</p>
    </section>`;
}

function wireVisualizacion($: <T extends HTMLElement>(sel: string) => T, deps: ConfigModalDeps): void {
  $<HTMLElement>('[data-pane="visualizacion"]').querySelectorAll<HTMLInputElement>('input[name="cfg-theme"]').forEach((r) => {
    r.addEventListener("change", () => {
      if (!r.checked) return;
      const t = r.value as Theme;
      setTheme(t);
      applyTheme(t);
      deps.onThemeChange(t);
    });
  });
  const onVizToggle = () => {
    const next: VizSettings = {
      sketchy: $<HTMLInputElement>(".cfg-sketchy").checked,
      heatmap: $<HTMLInputElement>(".cfg-heatmap").checked,
    };
    void deps.onVizChange(next).catch(deps.onError);
  };
  $<HTMLInputElement>(".cfg-sketchy").addEventListener("change", onVizToggle);
  $<HTMLInputElement>(".cfg-heatmap").addEventListener("change", onVizToggle);
}

// ---- IA: personal instructions + read-only AGENTS.md viewer + preset editing
//       (lifted from aiConfigModal.ts, minus the select/launch/open-terminal controls) ----
function paneIa(deps: ConfigModalDeps): string {
  const overlayPath = personalOverlayPath(deps.userName);
  const disabled = overlayPath ? "" : "disabled";
  return `
    <section class="config-pane" data-pane="ia" hidden>
      <h3>Instrucciones para la IA</h3>
      <p>Tuyas, para este proyecto. Se guardan en <code class="cfg-overlay-path">${esc(overlayPath ?? "(configurá tu nombre primero)")}</code>.
         Tienen precedencia sobre tu skill BPMN personal, no sobre el canon del proyecto.</p>
      <textarea class="cfg-instructions-text" rows="8" style="width:100%" ${disabled}></textarea>
      <div class="cfg-row">
        <button class="btn cfg-view-agents" type="button">Ver AGENTS.md generado</button>
        <button class="btn primary cfg-save-instructions" type="button" ${disabled}>Guardar instrucciones</button>
      </div>
      <textarea class="cfg-agents-viewer" rows="8" style="width:100%" readonly hidden></textarea>

      <h3>Presets para lanzar agentes</h3>
      ${deps.hasLauncher ? "" : `<p class="hint">Se curan acá; para lanzarlos, usá el menú "IA" de la barra de herramientas en la app de escritorio.</p>`}
      <div class="cfg-preset-rows"></div>
      <button class="btn cfg-preset-add" type="button">+ Agregar preset</button>
    </section>`;
}

// Returns a callback the caller invokes whenever the live name changes (Generales pane),
// so the overlay-path text and the enabled state of the textarea/save button stay in sync
// with the name actually used for reads/saves — not the name captured when the modal opened.
function wireIa($: <T extends HTMLElement>(sel: string) => T, deps: ConfigModalDeps, getCurrentName: () => string | null): (name: string) => void {
  const ta = $<HTMLTextAreaElement>(".cfg-instructions-text");
  const saveBtn = $<HTMLButtonElement>(".cfg-save-instructions");
  const overlayCode = $<HTMLElement>(".cfg-overlay-path");
  void readPersonalInstructions(deps.api, getCurrentName()).then((t) => { ta.value = t; }).catch(deps.onError);
  saveBtn.addEventListener("click", () => {
    void savePersonalInstructions(deps.api, getCurrentName(), ta.value).catch(deps.onError);
  });
  const agentsViewer = $<HTMLTextAreaElement>(".cfg-agents-viewer");
  $(".cfg-view-agents").addEventListener("click", () => {
    void deps.api.readPath("AGENTS.md").then((txt) => {
      agentsViewer.value = txt ?? "(todavía no se generó AGENTS.md en esta carpeta)";
      agentsViewer.hidden = false;
    }).catch(deps.onError);
  });

  let draft: Preset[] = getPresets();
  const rows = $(".cfg-preset-rows");
  const renderRows = (): void => {
    rows.innerHTML = "";
    for (const p of draft) {
      const r = document.createElement("div");
      r.className = "cfg-preset-row";
      r.dataset.id = p.id;
      r.innerHTML = `<input class="cfg-preset-label" value="${esc(p.label)}" placeholder="Etiqueta" />
        <input class="cfg-preset-cmd" value="${esc(p.command)}" placeholder="Comando" />
        <button class="btn cfg-preset-del" type="button" title="Borrar">🗑</button>`;
      rows.appendChild(r);
    }
    rows.querySelectorAll(".cfg-preset-del").forEach((b) => b.addEventListener("click", (e) => {
      syncFromInputs();
      draft = removePreset(draft, (e.currentTarget as HTMLElement).closest(".cfg-preset-row")!.getAttribute("data-id")!);
      persist();
      renderRows();
    }));
  };
  const syncFromInputs = (): void => {
    draft = (Array.from(rows.querySelectorAll(".cfg-preset-row")) as HTMLElement[]).map((r) => ({
      id: r.dataset.id!,
      label: (r.querySelector(".cfg-preset-label") as HTMLInputElement).value,
      command: (r.querySelector(".cfg-preset-cmd") as HTMLInputElement).value,
    }));
  };
  const persist = (): void =>
    setPresets(
      draft
        .filter((p) => p.label.trim() && p.command.trim())
        .map((p) => ({ ...p, label: p.label.trim(), command: p.command.trim() })),
    );
  $(".cfg-preset-add").addEventListener("click", () => {
    syncFromInputs();
    draft = addPreset(draft, "Nuevo", "comando");
    persist();
    renderRows();
  });
  rows.addEventListener("change", () => { syncFromInputs(); persist(); });
  renderRows();

  const refreshOverlay = (name: string | null): void => {
    const overlayPath = personalOverlayPath(name);
    overlayCode.textContent = overlayPath ?? "(configurá tu nombre primero)";
    ta.disabled = !overlayPath;
    saveBtn.disabled = !overlayPath;
  };
  return refreshOverlay;
}

// ---- Generales: name, folder, autosave ----
function paneGenerales(deps: ConfigModalDeps): string {
  const autosaveOn = getAutosave();
  return `
    <section class="config-pane" data-pane="generales" hidden>
      <h3>Generales</h3>
      <div class="cfg-row">
        <label>Nombre <input class="cfg-name-input" value="${esc(deps.userName ?? "")}" placeholder="Tu nombre" /></label>
        <button class="btn cfg-name-save" type="button">Cambiar</button>
      </div>
      <div class="cfg-row">
        <span>Carpeta: <b class="cfg-folder-label">${esc(deps.folderLabel)}</b></span>
        <button class="btn cfg-folder-change" type="button">Cambiar carpeta</button>
      </div>
      <div class="cfg-row">
        <button class="btn toggle-btn cfg-autosave-toggle${autosaveOn ? " active" : ""}" type="button" role="switch" aria-checked="${autosaveOn}"><span class="switch" aria-hidden="true"><span class="switch-knob"></span></span><span class="btn-label">Autoguardado</span></button>
      </div>
    </section>`;
}

// onNameSet: internal hook (distinct from deps.onNameChange) that updates the modal's live
// `currentName` closure — so the IA pane's overlay path follows a name change made here,
// within the same modal session.
function wireGenerales($: <T extends HTMLElement>(sel: string) => T, deps: ConfigModalDeps, close: () => void, onNameSet: (name: string) => void): void {
  $(".cfg-name-save").addEventListener("click", () => {
    const v = $<HTMLInputElement>(".cfg-name-input").value.trim();
    if (!v) return;
    setName(v); // single write; main.ts's deps.onNameChange must NOT call setName again
    onNameSet(v);
    deps.onNameChange(v);
  });
  $(".cfg-folder-change").addEventListener("click", () => {
    // Close FIRST — changeFolder()/the reload that follows re-renders the whole DOM and
    // would otherwise orphan this overlay.
    close();
    deps.onChangeFolder();
  });
  const autosaveBtn = $<HTMLButtonElement>(".cfg-autosave-toggle");
  autosaveBtn.addEventListener("click", () => {
    const on = !getAutosave();
    setAutosave(on);
    autosaveBtn.classList.toggle("active", on);
    autosaveBtn.setAttribute("aria-checked", String(on));
    deps.onAutosaveChange(on);
  });
}

// ---- Versión y actualizaciones: bpmn-js version + app self-update (Electron only) ----
function paneVersion(): string {
  return `
    <section class="config-pane" data-pane="version" hidden>
      <h3>Versión y actualizaciones</h3>
      <div class="viz-version">
        bpmn-js <b>${BUNDLED_BPMN_JS_VERSION}</b>
        <button class="cfg-check-bpmnjs" type="button">Buscar</button>
        <span class="cfg-bpmnjs-status"></span>
      </div>
      ${window.appUpdate ? `<hr/>
      <div class="viz-update">
        <div>App <b id="app-version">…</b> <button id="check-app" type="button">Buscar</button></div>
        <div id="app-upd" class="app-upd"></div>
      </div>` : ""}
      <p class="hint">Build: ${__APP_BUILD__}</p>
    </section>`;
}

function wireVersion($: <T extends HTMLElement>(sel: string) => T, deps: ConfigModalDeps, overlay: HTMLElement): void {
  $(".cfg-check-bpmnjs").addEventListener("click", () => {
    const status = $<HTMLElement>(".cfg-bpmnjs-status");
    status.textContent = "Buscando…";
    void checkLatestBpmnJs(deps.fetchLatestBpmnJs)
      .then((r) => {
        status.textContent = r.isOutdated
          ? `${r.latest} disponible — corré "npm run update:bpmn" y regenerá el .exe`
          : `${r.latest} es la última ✓`;
      })
      .catch(() => {
        status.textContent = "No se pudo verificar (offline o sin acceso)";
      });
  });
  if (window.appUpdate) {
    // Scoped to the pane so ids like #app-version/#check-app/#app-upd don't collide with
    // the legacy toolbar "Ajustes" popover if both happen to be present in the DOM.
    const pane = overlay.querySelector('[data-pane="version"]') as HTMLElement;
    wireAppUpdateSection(pane);
  }
}
