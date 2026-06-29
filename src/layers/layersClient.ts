import { defaultLayerFile, normalizeLayerFile, type LayerFile } from "./layerModel";

export interface SidecarApi {
  readSidecar(id: string, suffix: string): Promise<string | null>;
  writeSidecar(id: string, suffix: string, text: string): Promise<void>;
}

const SUFFIX = "layers.json";

export function createLayersClient(api: SidecarApi) {
  return {
    async load(fileId: string): Promise<LayerFile> {
      const txt = await api.readSidecar(fileId, SUFFIX);
      if (!txt) return defaultLayerFile();
      try {
        return normalizeLayerFile(JSON.parse(txt));
      } catch {
        return defaultLayerFile();
      }
    },
    async save(fileId: string, layers: LayerFile): Promise<void> {
      await api.writeSidecar(fileId, SUFFIX, JSON.stringify(layers, null, 2));
    },
  };
}

export type LayersClient = ReturnType<typeof createLayersClient>;
