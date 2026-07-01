// src/processDocs/folderIndex.ts
import { parseDiagramInfo } from "./diagramInfo";
import type { DiagramInfo } from "./resolveTargets";

export interface IndexSource {
  listBpmnFiles(): Promise<string[]>;
  readXml(file: string): Promise<string | null>;
}

export function baseNameOf(file: string): string {
  const name = file.split("/").pop() ?? file;
  return name.replace(/\.bpmn$/i, "");
}

export async function buildFolderIndex(src: IndexSource): Promise<DiagramInfo[]> {
  const files = await src.listBpmnFiles();
  const out: DiagramInfo[] = [];
  for (const file of files) {
    const xml = await src.readXml(file);
    if (!xml) continue;
    try {
      const { processId, refs } = await parseDiagramInfo(xml);
      out.push({ file, processId, baseName: baseNameOf(file), refs });
    } catch {
      /* unparseable diagram — skip */
    }
  }
  return out;
}
