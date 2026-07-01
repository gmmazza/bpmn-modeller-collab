const EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg",
  "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg",
};

export function extFromType(mime: string): string {
  return EXT[mime] ?? "png";
}

export function uniqueAssetName(existing: string[], ext: string): string {
  const set = new Set(existing);
  let n = 1;
  while (set.has(`imagen-${n}.${ext}`)) n++;
  return `imagen-${n}.${ext}`;
}

export function imageMarkdown(name: string): string {
  return `![](assets/${name})`;
}
