// src/processDocs/ideasClient.ts
import { docsDir, ideasPath } from "./docsPaths";
import { parseIdeaNote, serializeIdeaNote, type IdeaNote } from "./ideaNote";
import { parseMejoraNote, serializeMejoraNote, type MejoraNote } from "./mejoraNote";
import { buildIdeasIndex } from "./ideasIndex";
import { migrateV1ToNotes } from "./ideasMigrate";

export interface IdeasFsApi {
  readPath(rel: string): Promise<string | null>;
  writePath(rel: string, text: string): Promise<void>;
  listDir(rel: string): Promise<{ name: string; kind: "file" | "directory" }[]>;
}

function ideasDir(diagramId: string): string { return `${docsDir(diagramId)}/ideas`; }
function mejorasDir(diagramId: string): string { return `${docsDir(diagramId)}/mejoras`; }
function idNum(id: string): number { const m = id.match(/-(\d+)$/); return m ? Number(m[1]) : 0; }

export function createIdeasClient(api: IdeasFsApi) {
  async function listIds(dir: string): Promise<string[]> {
    const entries = await api.listDir(dir);
    return entries.filter((e) => e.kind === "file" && e.name.endsWith(".md")).map((e) => e.name.replace(/\.md$/, ""));
  }
  async function nextId(dir: string, prefix: string): Promise<string> {
    const nums = new Set((await listIds(dir)).map(idNum));
    let n = 1;
    while (nums.has(n)) n++;
    return `${prefix}-${n}`;
  }

  const self = {
    async listIdeas(diagramId: string): Promise<IdeaNote[]> {
      const ids = (await listIds(ideasDir(diagramId))).sort((a, b) => idNum(a) - idNum(b));
      const out: IdeaNote[] = [];
      for (const id of ids) {
        const md = await api.readPath(`${ideasDir(diagramId)}/${id}.md`);
        if (md !== null) out.push(parseIdeaNote(md));
      }
      return out;
    },
    readIdea(diagramId: string, id: string): Promise<IdeaNote | null> {
      return api.readPath(`${ideasDir(diagramId)}/${id}.md`).then((md) => (md === null ? null : parseIdeaNote(md)));
    },
    writeIdea(diagramId: string, note: IdeaNote): Promise<void> {
      return api.writePath(`${ideasDir(diagramId)}/${note.id}.md`, serializeIdeaNote(note));
    },
    nextIdeaId(diagramId: string): Promise<string> {
      return nextId(ideasDir(diagramId), "idea");
    },
    readMejora(diagramId: string, id: string): Promise<MejoraNote | null> {
      return api.readPath(`${mejorasDir(diagramId)}/${id}.md`).then((md) => (md === null ? null : parseMejoraNote(md)));
    },
    writeMejora(diagramId: string, note: MejoraNote): Promise<void> {
      return api.writePath(`${mejorasDir(diagramId)}/${note.id}.md`, serializeMejoraNote(note));
    },
    nextMejoraId(diagramId: string): Promise<string> {
      return nextId(mejorasDir(diagramId), "mejora");
    },
    async writeIndex(diagramId: string, processName: string): Promise<void> {
      const ideas = await self.listIdeas(diagramId);
      await api.writePath(ideasPath(diagramId), buildIdeasIndex(diagramId, processName, ideas));
    },
    async migrateIfNeeded(diagramId: string): Promise<boolean> {
      const existing = await listIds(ideasDir(diagramId));
      if (existing.length > 0) return false;
      const v1 = await api.readPath(ideasPath(diagramId));
      if (!v1) return false;
      const notes = migrateV1ToNotes(v1);
      if (notes.length === 0) return false;
      for (const n of notes) await self.writeIdea(diagramId, n);
      return true;
    },
  };
  return self;
}

export type IdeasClient = ReturnType<typeof createIdeasClient>;
