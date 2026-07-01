import { docsDir, notePath, processNotePath, indexPath, assetsDir, ideasPath } from "./docsPaths";

export interface DocsFsApi {
  readPath(rel: string): Promise<string | null>;
  writePath(rel: string, text: string): Promise<void>;
  deletePath(rel: string): Promise<void>;
  listDir(rel: string): Promise<{ name: string; kind: "file" | "directory" }[]>;
  writeBinary(rel: string, data: Uint8Array): Promise<void>;
  readBinary(rel: string): Promise<Uint8Array | null>;
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
    readIdeas(diagramId: string): Promise<string | null> {
      return api.readPath(ideasPath(diagramId));
    },
    writeIdeas(diagramId: string, md: string): Promise<void> {
      return api.writePath(ideasPath(diagramId), md);
    },
    async listDocumentedIds(diagramId: string): Promise<string[]> {
      const entries = await api.listDir(docsDir(diagramId));
      return entries
        .filter((e) => e.kind === "file" && e.name.endsWith(".md") && !e.name.startsWith("_"))
        .map((e) => e.name.replace(/\.md$/, ""));
    },
    writeAsset(diagramId: string, name: string, bytes: Uint8Array): Promise<void> {
      return api.writeBinary(`${assetsDir(diagramId)}/${name}`, bytes);
    },
    readAsset(diagramId: string, name: string): Promise<Uint8Array | null> {
      return api.readBinary(`${assetsDir(diagramId)}/${name}`);
    },
    async listAssets(diagramId: string): Promise<string[]> {
      const entries = await api.listDir(assetsDir(diagramId));
      return entries.filter((e) => e.kind === "file").map((e) => e.name);
    },
  };
}

export type DocsClient = ReturnType<typeof createDocsClient>;
