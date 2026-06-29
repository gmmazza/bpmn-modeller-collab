import { makeIpcDir, type FsApi } from "./ipcFs";
import * as web from "./folderAccess";

function electronApi(): FsApi | null {
  return typeof window !== "undefined" && window.fsapi ? window.fsapi : null;
}

export async function loadSavedDir(): Promise<FileSystemDirectoryHandle | null> {
  const api = electronApi();
  if (api) {
    // The main process owns the authorized folder; ask it (not localStorage).
    const root = await api.getRoot();
    if (!root) return null;
    const s = await api.stat(root, "");
    if (!s || s.kind !== "directory") return null;
    return makeIpcDir(root, api);
  }
  const h = await web.loadSavedDir();
  if (h && (await web.ensurePermission(h))) return h;
  return null;
}

export async function pickDir(): Promise<FileSystemDirectoryHandle | null> {
  const api = electronApi();
  if (api) {
    // chooseFolder sets + persists the authorized root in the main process.
    const root = await api.chooseFolder();
    if (!root) return null;
    return makeIpcDir(root, api);
  }
  try {
    const h = await web.pickDir();
    return (await web.ensurePermission(h)) ? h : null;
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") return null; // user cancelled the picker
    throw e;
  }
}
