import { personalOverlayPath } from "./agentsFile";

type Api = {
  readPath(rel: string): Promise<string | null>;
  writePath(rel: string, text: string): Promise<void>;
  deletePath(rel: string): Promise<void>;
};

const HEADER = `# Instrucciones personales para la IA
<!-- Tuyas, para este proyecto. La app no las comparte como convención de equipo; viven junto al
     proyecto (visibles para quien abra la carpeta). Editalas desde "Instrucciones personales para la
     IA" en la app. Ver precedencia en AGENTS.md. -->

`;

export async function readPersonalInstructions(api: Api, name: string | null): Promise<string> {
  const path = personalOverlayPath(name);
  if (!path) return "";
  const raw = await api.readPath(path);
  if (raw === null) return "";
  return raw.startsWith(HEADER) ? raw.slice(HEADER.length) : raw;
}

export async function savePersonalInstructions(
  api: Api,
  name: string | null,
  text: string,
): Promise<"saved" | "deleted" | "no-name"> {
  const path = personalOverlayPath(name);
  if (!path) return "no-name";
  if (text.trim() === "") {
    await api.deletePath(path);
    return "deleted";
  }
  await api.writePath(path, HEADER + text.trim() + "\n");
  return "saved";
}

// Modal simple (modelado sobre changeFolder()/showHelp()). Efecto DOM; no se testea con Vitest.
export function showPersonalInstructionsModal(api: Api, name: string | null): void {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const disabled = personalOverlayPath(name) ? "" : "disabled";
  overlay.innerHTML = `
    <div class="gate-card">
      <h2>Instrucciones personales para la IA</h2>
      <p>Se guardan en <code>${personalOverlayPath(name) ?? "(configurá tu nombre primero)"}</code>.
         Tienen precedencia sobre tu skill BPMN personal, no sobre el canon del proyecto.</p>
      <textarea id="pi-text" rows="10" style="width:100%" ${disabled}></textarea>
      <div class="gate-actions">
        <button class="btn" id="pi-cancel" type="button">Cancelar</button>
        <button class="btn primary" id="pi-save" type="button" ${disabled}>Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  const ta = overlay.querySelector("#pi-text") as HTMLTextAreaElement;
  void readPersonalInstructions(api, name).then((t) => { ta.value = t; });
  overlay.querySelector("#pi-cancel")!.addEventListener("click", close);
  overlay.querySelector("#pi-save")!.addEventListener("click", () => {
    void savePersonalInstructions(api, name, ta.value).then(close);
  });
}
