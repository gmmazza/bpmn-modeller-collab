import { getPresets, setPresets, addPreset, removePreset, type Preset } from "./terminalPresets";

// Modal simple para definir presets LLM (etiqueta + comando). Lista editable con filas add/remove.
// DOM-only; la lógica pura vive en terminalPresets.ts (testeada).
export function showPresetsModal(onSaved?: () => void): void {
  let draft: Preset[] = getPresets();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  function rowsHtml(): string {
    return draft
      .map(
        (p) => `
        <div class="preset-row" data-id="${p.id}">
          <input class="preset-label" value="${escapeAttr(p.label)}" placeholder="Etiqueta" />
          <input class="preset-cmd" value="${escapeAttr(p.command)}" placeholder="Comando" />
          <button class="btn preset-del" type="button" title="Borrar">🗑</button>
        </div>`,
      )
      .join("");
  }

  function render(): void {
    overlay.innerHTML = `
      <div class="gate-card">
        <h2>Terminal LLM — presets</h2>
        <p>Definí los comandos que querés lanzar en la carpeta (ej. <code>claude</code>, <code>claude --review</code>).</p>
        <div id="preset-rows">${rowsHtml()}</div>
        <button class="btn" id="preset-add" type="button">+ Agregar preset</button>
        <div class="gate-actions">
          <button class="btn" id="preset-cancel" type="button">Cancelar</button>
          <button class="btn primary" id="preset-save" type="button">Guardar</button>
        </div>
      </div>`;
    wire();
  }

  function syncFromInputs(): void {
    const rows = Array.from(overlay.querySelectorAll(".preset-row")) as HTMLElement[];
    draft = rows.map((r) => ({
      id: r.dataset.id!,
      label: (r.querySelector(".preset-label") as HTMLInputElement).value,
      command: (r.querySelector(".preset-cmd") as HTMLInputElement).value,
    }));
  }

  function wire(): void {
    overlay.querySelector("#preset-add")!.addEventListener("click", () => {
      syncFromInputs();
      draft = addPreset(draft, "Nuevo", "comando");
      render();
    });
    overlay.querySelectorAll(".preset-del").forEach((b) =>
      b.addEventListener("click", (e) => {
        syncFromInputs();
        const id = (e.currentTarget as HTMLElement).closest(".preset-row")!.getAttribute("data-id")!;
        draft = removePreset(draft, id);
        render();
      }),
    );
    overlay.querySelector("#preset-cancel")!.addEventListener("click", () => overlay.remove());
    overlay.querySelector("#preset-save")!.addEventListener("click", () => {
      syncFromInputs();
      setPresets(
        draft
          .filter((p) => p.label.trim() && p.command.trim())
          .map((p) => ({ id: p.id, label: p.label.trim(), command: p.command.trim() }))
      );
      overlay.remove();
      onSaved?.();
    });
  }

  document.body.appendChild(overlay);
  render();
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
