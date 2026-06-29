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

export function createTemplatesClient(api: TemplatesApi) {
  return {
    async list(): Promise<{ slug: string; name: string }[]> {
      const entries = await api.listDir(DIR);
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
    },
    async load(slug: string): Promise<Template | null> {
      const txt = await api.readPath(`${DIR}/${slug}.json`);
      if (!txt) return null;
      try {
        const j = JSON.parse(txt);
        const name = typeof j.name === "string" && j.name.trim() ? j.name : slug;
        const dimensions = normalizeLayerFile({ version: 1, dimensions: j.dimensions }).dimensions;
        return { name, dimensions };
      } catch {
        return null;
      }
    },
    async save(name: string, dimensions: Dimension[]): Promise<void> {
      const body = { version: 1, name, dimensions: stripAssignments(dimensions) };
      await api.writePath(`${DIR}/${baseSlug(name)}.json`, JSON.stringify(body, null, 2));
    },
    async remove(slug: string): Promise<void> {
      await api.deletePath(`${DIR}/${slug}.json`);
    },
  };
}

export type TemplatesClient = ReturnType<typeof createTemplatesClient>;
