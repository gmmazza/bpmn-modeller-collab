export type FuenteEstado = "pendiente" | "procesada";
export interface FuenteEntry { name: string; estado: FuenteEstado; ext: string }

export interface FuentesFs {
  listDir(rel: string): Promise<{ name: string; kind: "file" | "directory" }[]>;
  writeBinary(rel: string, data: Uint8Array): Promise<void>;
  readBinary(rel: string): Promise<Uint8Array | null>;
  deletePath(rel: string): Promise<void>;
  movePath(from: string, to: string): Promise<void>;
}

export interface FuentesClient {
  fuentesDir: string;
  list(): Promise<FuenteEntry[]>;
  add(name: string, bytes: Uint8Array): Promise<string>;
  procesar(name: string): Promise<void>;
  restaurar(name: string): Promise<void>;
  remove(name: string, estado: FuenteEstado): Promise<void>;
  readBytes(name: string, estado: FuenteEstado): Promise<Uint8Array | null>;
  relFor(name: string, estado: FuenteEstado): string;
}

const PROCESADO = "procesado";
// OS/cruft files that must never appear as a source.
const NOISE = new Set(["desktop.ini", ".DS_Store", "Thumbs.db"]);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}
function assertPlainName(name: string): void {
  if (!name || name.includes("/") || name.includes("\\") || name === ".." || name.includes("\0")) {
    throw new Error(`invalid source name: ${name}`);
  }
}
function isNoise(name: string): boolean {
  return NOISE.has(name) || name.startsWith(".");
}

export function createFuentesClient(fs: FuentesFs, diagramId: string): FuentesClient {
  const fuentesDir = `${diagramId.replace(/\.bpmn$/i, "")}.fuentes`;
  const procesadoDir = `${fuentesDir}/${PROCESADO}`;
  const relFor = (name: string, estado: FuenteEstado) =>
    estado === "procesada" ? `${procesadoDir}/${name}` : `${fuentesDir}/${name}`;

  async function existing(estado: FuenteEstado): Promise<Set<string>> {
    const dir = estado === "procesada" ? procesadoDir : fuentesDir;
    // Kept tolerant (unlike list() below): this is only used to compute a dedup
    // name for add/procesar/restaurar. A real listDir failure here would abort
    // those mutations over what is, at worst, a stale/incomplete dedup set — not
    // worth surfacing as a hard error, so we keep swallowing to [] on any failure.
    const entries = await fs.listDir(dir).catch(() => []);
    return new Set(entries.filter((e) => e.kind === "file").map((e) => e.name));
  }
  function dedupe(name: string, taken: Set<string>): string {
    if (!taken.has(name)) return name;
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    for (let n = 2; ; n++) {
      const cand = `${base} (${n})${ext}`;
      if (!taken.has(cand)) return cand;
    }
  }

  return {
    fuentesDir,
    relFor,
    async list() {
      // NOTE (resolved): fsClient.ts's listDir (src/fsClient.ts ~L330-341, the
      // FuentesFs passed in from main.ts) now discriminates a missing directory
      // (NotFoundError -> []; `.fuentes/`/`.fuentes/procesado/` may legitimately not
      // exist yet) from a real enumeration/permission failure (rethrown). We
      // deliberately do NOT catch here: a real failure must reject this list()
      // call so the caller (fuentesPanel.ts) can render an error-state instead of
      // a false empty panel, rather than swallowing it as before.
      const [rootEntries, procEntries] = await Promise.all([
        fs.listDir(fuentesDir),
        fs.listDir(procesadoDir),
      ]);
      const out: FuenteEntry[] = [];
      for (const e of rootEntries) {
        if (e.kind !== "file" || isNoise(e.name)) continue;
        out.push({ name: e.name, estado: "pendiente", ext: extOf(e.name) });
      }
      for (const e of procEntries) {
        if (e.kind !== "file" || isNoise(e.name)) continue;
        out.push({ name: e.name, estado: "procesada", ext: extOf(e.name) });
      }
      return out;
    },
    async add(name, bytes) {
      assertPlainName(name);
      const finalName = dedupe(name, await existing("pendiente"));
      await fs.writeBinary(relFor(finalName, "pendiente"), bytes);
      return finalName;
    },
    async procesar(name) {
      assertPlainName(name);
      const dest = dedupe(name, await existing("procesada"));
      await fs.movePath(relFor(name, "pendiente"), relFor(dest, "procesada"));
    },
    async restaurar(name) {
      assertPlainName(name);
      const dest = dedupe(name, await existing("pendiente"));
      await fs.movePath(relFor(name, "procesada"), relFor(dest, "pendiente"));
    },
    async remove(name, estado) {
      assertPlainName(name);
      await fs.deletePath(relFor(name, estado));
    },
    async readBytes(name, estado) {
      assertPlainName(name);
      return fs.readBinary(relFor(name, estado));
    },
  };
}
