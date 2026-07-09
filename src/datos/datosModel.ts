export type ToolKind = "jotform" | "clickup" | "otro";
export type DatosCategory = "formularios" | "almacenamiento" | "herramientas";

export interface DatosEntry {
  id: string;
  tool: ToolKind;
  nombre: string;
  url: string;
  // id of the standard bpmn:DataObjectReference/bpmn:DataStoreReference this entry was
  // anchored to via "Mostrar en el diagrama" (Task 6/7/9), if any. Presence hides the
  // "Mostrar en el diagrama" action for this entry in the panel.
  anchoredId?: string;
}
export interface ElementoDatos {
  formularios: DatosEntry[];
  almacenamiento: DatosEntry[];
  herramientas: DatosEntry[];
}
export interface DatosFile {
  version: 1;
  elementos: Record<string, ElementoDatos>;
}

const TOOL_KINDS: ReadonlySet<string> = new Set(["jotform", "clickup", "otro"]);
const CATEGORIES: readonly DatosCategory[] = ["formularios", "almacenamiento", "herramientas"];

export function defaultDatosFile(): DatosFile {
  return { version: 1, elementos: {} };
}
export function emptyElementoDatos(): ElementoDatos {
  return { formularios: [], almacenamiento: [], herramientas: [] };
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}
function isToolKind(v: unknown): v is ToolKind {
  return isStr(v) && TOOL_KINDS.has(v);
}
function isElementoEmpty(e: ElementoDatos): boolean {
  return !e.formularios.length && !e.almacenamiento.length && !e.herramientas.length;
}

function normEntry(raw: unknown): DatosEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (!isStr(e.id) || !isToolKind(e.tool) || !isStr(e.nombre) || e.nombre.trim() === "") return null;
  const entry: DatosEntry = { id: e.id, tool: e.tool, nombre: e.nombre, url: isStr(e.url) ? e.url : "" };
  if (isStr(e.anchoredId)) entry.anchoredId = e.anchoredId;
  return entry;
}
function normEntries(raw: unknown): DatosEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normEntry).filter((e): e is DatosEntry => e !== null);
}
function normElemento(raw: unknown): ElementoDatos {
  if (!raw || typeof raw !== "object") return emptyElementoDatos();
  const e = raw as Record<string, unknown>;
  return {
    formularios: normEntries(e.formularios),
    almacenamiento: normEntries(e.almacenamiento),
    herramientas: normEntries(e.herramientas),
  };
}

export function normalizeDatosFile(raw: unknown): DatosFile {
  if (!raw || typeof raw !== "object" || typeof (raw as Record<string, unknown>).elementos !== "object" || (raw as Record<string, unknown>).elementos === null) {
    return defaultDatosFile();
  }
  const rawElementos = (raw as Record<string, unknown>).elementos as Record<string, unknown>;
  const elementos: Record<string, ElementoDatos> = {};
  for (const [id, v] of Object.entries(rawElementos)) {
    const el = normElemento(v);
    if (!isElementoEmpty(el)) elementos[id] = el;
  }
  return { version: 1, elementos };
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}
function dedupeId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const cand = `${base}-${n}`;
    if (!taken.has(cand)) return cand;
  }
}

export function addEntry(
  file: DatosFile,
  elementId: string,
  category: DatosCategory,
  input: { tool: ToolKind; nombre: string; url: string },
): { file: DatosFile; entry: DatosEntry } {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("el nombre es obligatorio");
  const current = file.elementos[elementId] ?? emptyElementoDatos();
  const list = current[category];
  const normalizedExisting = new Set(list.map((e) => e.nombre.trim().toLowerCase()));
  if (normalizedExisting.has(nombre.toLowerCase())) {
    throw new Error(`ya existe «${nombre}» en esta sección`);
  }
  const id = dedupeId(slug(nombre), new Set(list.map((e) => e.id)));
  const entry: DatosEntry = { id, tool: input.tool, nombre, url: input.url.trim() };
  const nextElemento: ElementoDatos = { ...current, [category]: [...list, entry] };
  return { file: { ...file, elementos: { ...file.elementos, [elementId]: nextElemento } }, entry };
}

export function removeEntry(file: DatosFile, elementId: string, category: DatosCategory, entryId: string): DatosFile {
  const current = file.elementos[elementId];
  if (!current) return file;
  const nextElemento: ElementoDatos = { ...current, [category]: current[category].filter((e) => e.id !== entryId) };
  const elementos = { ...file.elementos };
  if (isElementoEmpty(nextElemento)) delete elementos[elementId];
  else elementos[elementId] = nextElemento;
  return { ...file, elementos };
}

export function setAnchoredId(
  file: DatosFile,
  elementId: string,
  category: DatosCategory,
  entryId: string,
  anchoredId: string,
): DatosFile {
  const current = file.elementos[elementId];
  if (!current) return file;
  const nextList = current[category].map((e) => (e.id === entryId ? { ...e, anchoredId } : e));
  return { ...file, elementos: { ...file.elementos, [elementId]: { ...current, [category]: nextList } } };
}

// Exported for callers that need to iterate every category generically (e.g. badges).
export function categories(): readonly DatosCategory[] {
  return CATEGORIES;
}
