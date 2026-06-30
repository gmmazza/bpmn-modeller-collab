import { docsDir, notePath, processNotePath, indexPath } from "./docsPaths";

export interface DocsFsApi {
  readPath(rel: string): Promise<string | null>;
  writePath(rel: string, text: string): Promise<void>;
  deletePath(rel: string): Promise<void>;
  listDir(rel: string): Promise<{ name: string; kind: "file" | "directory" }[]>;
}

export function createDocsClient(api: DocsFsApi) {
  return {
    readNote(diagramId: string, elementId: string): Promise<string | null> {
      return api.readPath(notePath(diagramId, elementId));
    },
    writeNote(diagramId: string, elementId: string, text: string): Promise<void> {
      return api.writePath(notePath(diagramId, elementId), text);
    },
    deleteNote(diagramId: string, elementId: string): Promise<void> {
      return api.deletePath(notePath(diagramId, elementId));
    },
    readProcessNote(diagramId: string): Promise<string | null> {
      return api.readPath(processNotePath(diagramId));
    },
    writeProcessNote(diagramId: string, text: string): Promise<void> {
      return api.writePath(processNotePath(diagramId), text);
    },
    writeIndex(diagramId: string, text: string): Promise<void> {
      return api.writePath(indexPath(diagramId), text);
    },
    async listDocumentedIds(diagramId: string): Promise<string[]> {
      const entries = await api.listDir(docsDir(diagramId));
      return entries
        .filter((e) => e.kind === "file" && e.name.endsWith(".md") && !e.name.startsWith("_"))
        .map((e) => e.name.replace(/\.md$/, ""));
    },
  };
}

export type DocsClient = ReturnType<typeof createDocsClient>;
