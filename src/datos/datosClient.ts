import type { SidecarApi } from "../layers/layersClient";
import {
  defaultDatosFile,
  normalizeDatosFile,
  emptyElementoDatos,
  addEntry,
  removeEntry,
  setAnchoredId,
  type DatosFile,
  type DatosEntry,
  type ElementoDatos,
  type DatosCategory,
  type ToolKind,
} from "./datosModel";

const SUFFIX = "datos.json";

export function createDatosClient(api: SidecarApi, diagramId: string) {
  async function load(): Promise<DatosFile> {
    const txt = await api.readSidecar(diagramId, SUFFIX);
    if (!txt) return defaultDatosFile();
    try {
      return normalizeDatosFile(JSON.parse(txt));
    } catch {
      return defaultDatosFile();
    }
  }
  async function save(file: DatosFile): Promise<void> {
    await api.writeSidecar(diagramId, SUFFIX, JSON.stringify(file, null, 2));
  }

  return {
    load,
    save,
    async list(elementId: string): Promise<ElementoDatos> {
      const file = await load();
      return file.elementos[elementId] ?? emptyElementoDatos();
    },
    async add(
      elementId: string,
      category: DatosCategory,
      input: { tool: ToolKind; nombre: string; url: string },
    ): Promise<DatosEntry> {
      const file = await load();
      const { file: next, entry } = addEntry(file, elementId, category, input);
      await save(next);
      return entry;
    },
    async remove(elementId: string, category: DatosCategory, entryId: string): Promise<void> {
      const file = await load();
      await save(removeEntry(file, elementId, category, entryId));
    },
    async markAnchored(elementId: string, category: DatosCategory, entryId: string, anchoredId: string): Promise<void> {
      const file = await load();
      await save(setAnchoredId(file, elementId, category, entryId, anchoredId));
    },
  };
}

export type DatosClient = ReturnType<typeof createDatosClient>;
