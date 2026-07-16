import { baseSlug, normalizeLayerFile, type Dimension } from "./layerModel";

const DIR = ".layer-templates";

export interface TemplatesApi {
  listDir(rel: string): Promise<{ name: string; kind: "file" | "directory" }[]>;
  readPath(rel: string): Promise<string | null>;
  writePath(rel: string, text: string): Promise<void>;
  deletePath(rel: string): Promise<void>;
}

export interface Template {
  name: string;
  dimensions: Dimension[];
}

function stripAssignments(dims: Dimension[]): Dimension[] {
  return dims.map((d) => ({ ...d, assignments: {} as Record<string, string> }));
}

async function listEntries(api: TemplatesApi): Promise<{ slug: string; name: string }[]> {
  // tolerate any listDir failure here (missing dir or read error) — non-critical listing
  const entries = await api.listDir(DIR).catch(() => []);
  const out: { slug: string; name: string }[] = [];
  for (const e of entries) {
    if (e.kind !== "file" || !e.name.endsWith(".json")) continue;
    const slug = e.name.replace(/\.json$/i, "");
    let name = slug;
    const txt = await api.readPath(`${DIR}/${e.name}`);
    if (txt) {
      try {
        const j = JSON.parse(txt);
        if (typeof j.name === "string" && j.name.trim()) name = j.name;
      } catch {
        /* keep slug as name */
      }
    }
    out.push({ slug, name });
  }
  return out;
}

export function createTemplatesClient(api: TemplatesApi) {
  return {
    async list(): Promise<{ slug: string; name: string }[]> {
      return listEntries(api);
    },
    async load(slug: string): Promise<Template | null> {
      const txt = await api.readPath(`${DIR}/${slug}.json`);
      if (!txt) return null;
      try {
        const j = JSON.parse(txt);
        const name = typeof j.name === "string" && j.name.trim() ? j.name : slug;
        const dimensions = stripAssignments(normalizeLayerFile({ version: 1, dimensions: j.dimensions }).dimensions);
        return { name, dimensions };
      } catch {
        return null;
      }
    },
    async save(name: string, dimensions: Dimension[]): Promise<void> {
      const existing = await listEntries(api);
      let slug = existing.find((t) => t.name === name)?.slug;
      if (!slug) {
        const taken = new Set(existing.map((t) => t.slug));
        const base = baseSlug(name);
        slug = base;
        let n = 2;
        while (taken.has(slug)) slug = `${base}-${n++}`;
      }
      const body = { version: 1, name, dimensions: stripAssignments(dimensions) };
      await api.writePath(`${DIR}/${slug}.json`, JSON.stringify(body, null, 2));
    },
    async remove(slug: string): Promise<void> {
      await api.deletePath(`${DIR}/${slug}.json`);
    },
  };
}

export type TemplatesClient = ReturnType<typeof createTemplatesClient>;
