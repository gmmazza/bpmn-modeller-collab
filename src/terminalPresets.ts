// Presets de comandos LLM (etiqueta + comando). Lista plana en localStorage; cada variante es una
// fila. Lógica pura + persistencia; la UI vive aparte (editor modal + selector de toolbar).
export interface Preset {
  id: string;
  label: string;
  command: string;
}

const KEY = "bpmn-compartida.llmPresets";
const LAST = "bpmn-compartida.llmPresetLast";

function isPreset(x: unknown): x is Preset {
  return (
    !!x && typeof x === "object" &&
    typeof (x as any).id === "string" &&
    typeof (x as any).label === "string" && (x as any).label.trim() !== "" &&
    typeof (x as any).command === "string" && (x as any).command.trim() !== ""
  );
}

export function getPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPreset).map((p) => ({ id: p.id, label: p.label, command: p.command })) : [];
  } catch {
    return [];
  }
}

export function setPresets(list: Preset[]): void {
  localStorage.setItem(KEY, JSON.stringify(list.filter(isPreset)));
}

function nextId(list: Preset[]): string {
  const used = new Set(list.map((p) => p.id));
  let n = 1;
  while (used.has(`p${n}`)) n++;
  return `p${n}`;
}

export function validatePreset(label: string, command: string): boolean {
  return label.trim() !== "" && command.trim() !== "";
}

export function addPreset(list: Preset[], label: string, command: string): Preset[] {
  if (!validatePreset(label, command)) return list;
  return [...list, { id: nextId(list), label: label.trim(), command: command.trim() }];
}

export function updatePreset(list: Preset[], id: string, patch: { label?: string; command?: string }): Preset[] {
  return list.map((p) => (p.id === id ? { ...p, ...trimPatch(patch) } : p));
}

function trimPatch(patch: { label?: string; command?: string }): { label?: string; command?: string } {
  const out: { label?: string; command?: string } = {};
  if (patch.label !== undefined) out.label = patch.label.trim();
  if (patch.command !== undefined) out.command = patch.command.trim();
  return out;
}

export function removePreset(list: Preset[], id: string): Preset[] {
  return list.filter((p) => p.id !== id);
}

export function getLastPresetId(): string | null {
  return localStorage.getItem(LAST);
}

export function setLastPresetId(id: string | null): void {
  if (id === null) localStorage.removeItem(LAST);
  else localStorage.setItem(LAST, id);
}
