import type { TreeEntry } from "./types";

export interface ChangeRecord {
  fileId: string;
  version?: string;
  removed?: boolean;
}

export function isOwnWrite(
  change: ChangeRecord,
  lastWrites: Map<string, string>,
): boolean {
  const v = lastWrites.get(change.fileId);
  return v !== undefined && change.version !== undefined && v === change.version;
}

export function classifyChange(
  change: ChangeRecord,
  openFileId: string | null,
  lastWrites: Map<string, string>,
): "ignore" | "reload-open" | "list-changed" {
  if (change.fileId === openFileId && !change.removed) {
    return isOwnWrite(change, lastWrites) ? "ignore" : "reload-open";
  }
  return "list-changed";
}

export function diffTree(
  prev: Map<string, string>,
  next: TreeEntry[],
  openId: string | null,
  lastWrites: Map<string, string>,
): { reloadOpen: boolean; structureChanged: boolean; nextVersions: Map<string, string> } {
  const nextVersions = new Map<string, string>();
  for (const e of next) if (e.kind === "file" && e.version) nextVersions.set(e.path, e.version);

  let reloadOpen = false;
  let structureChanged = false;

  // additions / version changes
  for (const [path, version] of nextVersions) {
    const before = prev.get(path);
    if (before === undefined) { structureChanged = true; continue; }
    if (before !== version) {
      if (path === openId) {
        if (lastWrites.get(path) !== version) reloadOpen = true;
      } else {
        structureChanged = true;
      }
    }
  }
  // removals
  for (const path of prev.keys()) if (!nextVersions.has(path)) structureChanged = true;

  return { reloadOpen, structureChanged, nextVersions };
}
