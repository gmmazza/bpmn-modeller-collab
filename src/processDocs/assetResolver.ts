// src/processDocs/assetResolver.ts
export interface AssetResolver {
  resolve(ref: string): Promise<string | null>;
  dispose(): void;
}

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
};

function assetName(ref: string): string | null {
  // Only local asset refs: "assets/x.png" or a bare "x.png"; reject anything with a scheme or absolute path.
  if (/^[a-z]+:/i.test(ref) || ref.startsWith("/")) return null;
  const m = ref.match(/^(?:assets\/)?([^/]+)$/);
  return m ? m[1] : null;
}

export function createAssetResolver(deps: {
  readAsset(name: string): Promise<Uint8Array | null>;
}): AssetResolver {
  const cache = new Map<string, string>();
  return {
    async resolve(ref: string): Promise<string | null> {
      const name = assetName(ref);
      if (!name) return null;
      const hit = cache.get(name);
      if (hit) return hit;
      const bytes = await deps.readAsset(name);
      if (!bytes) return null;
      const ext = name.split(".").pop()?.toLowerCase() ?? "png";
      const url = URL.createObjectURL(new Blob([bytes.slice()], { type: MIME[ext] ?? "application/octet-stream" }));
      cache.set(name, url);
      return url;
    },
    dispose(): void {
      for (const url of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
    },
  };
}
