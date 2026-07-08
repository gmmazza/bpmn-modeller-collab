export interface ProcessEntry { processId: string; file: string }
export interface TreeFile { path: string; version: string }

export interface ProcessRegistry {
  sync(files: TreeFile[]): Promise<void>;
  resolve(processId: string): ProcessEntry | null;
  all(): ProcessEntry[];
  ambiguities(): string[];
  clear(): void;
}

interface Cached { version: string; processId: string }

export function createProcessRegistry(deps: {
  readXml(file: string): Promise<string | null>;
  parseProcessId(xml: string): Promise<string>;
}): ProcessRegistry {
  // file -> { version, processId } for every .bpmn we have parsed
  const byFile = new Map<string, Cached>();

  function index(): { byId: Map<string, string[]> } {
    const byId = new Map<string, string[]>();
    for (const [file, c] of byFile) {
      if (!c.processId) continue;
      const arr = byId.get(c.processId) ?? [];
      arr.push(file);
      byId.set(c.processId, arr);
    }
    return { byId };
  }

  return {
    async sync(files) {
      const bpmn = files.filter((f) => f.path.toLowerCase().endsWith(".bpmn"));
      const seen = new Set(bpmn.map((f) => f.path));
      // drop removed
      for (const file of [...byFile.keys()]) if (!seen.has(file)) byFile.delete(file);
      // (re)parse new or version-changed
      for (const f of bpmn) {
        const prev = byFile.get(f.path);
        if (prev && prev.version === f.version) continue;
        const xml = await deps.readXml(f.path);
        const processId = xml ? await deps.parseProcessId(xml) : "";
        byFile.set(f.path, { version: f.version, processId });
      }
    },
    resolve(processId) {
      const { byId } = index();
      const files = byId.get(processId);
      if (!files || files.length !== 1) return null; // absent or ambiguous
      return { processId, file: files[0] };
    },
    all() {
      const out: ProcessEntry[] = [];
      for (const [file, c] of byFile) if (c.processId) out.push({ processId: c.processId, file });
      return out;
    },
    ambiguities() {
      const { byId } = index();
      return [...byId.entries()].filter(([, files]) => files.length > 1).map(([id]) => id);
    },
    clear() { byFile.clear(); },
  };
}
