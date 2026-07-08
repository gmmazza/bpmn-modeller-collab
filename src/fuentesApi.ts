// Thin wrapper over the Electron-only shell:openPath IPC (mirrors src/termApi.ts).
// In the web build window.fsapi is absent → hasOpenPath() is false and callers fall
// back to preview/download.
interface FsApiOpen { openPath?(root: string | null, rel: string): Promise<{ ok: true }>; }
function api(): FsApiOpen | undefined {
  return (globalThis as any).fsapi as FsApiOpen | undefined;
}
export function hasOpenPath(): boolean {
  return typeof api()?.openPath === "function";
}
export async function openSourceExternal(rel: string): Promise<void> {
  const a = api();
  if (!a?.openPath) throw new Error("openPath no disponible en esta plataforma");
  await a.openPath(null, rel);
}
