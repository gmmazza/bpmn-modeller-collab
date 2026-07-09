// Thin wrapper to open an external https:// URL (JotForm forms, ClickUp lists), distinct
// from fuentesApi.ts's shell:openPath (which opens LOCAL files with the OS default app).
// Web: window.open. Electron: window.urlapi.openExternal IPC (see electron/preload.cjs +
// electron/main.cjs's shell:openExternalUrl handler), which re-validates https:// on the
// main-process side too (defense in depth — the sidecar is shared-folder data, so a
// malicious collaborator could otherwise plant a javascript:/file: URL for a victim to click).
interface UrlApi {
  openExternal?(url: string): Promise<void>;
}
function api(): UrlApi | undefined {
  return (globalThis as any).urlapi as UrlApi | undefined;
}

// MUST mirror the guard in electron/main.cjs's shell:openExternalUrl handler.
export function isHttpsUrl(url: string): boolean {
  return /^https:\/\//.test(url);
}

export function hasExternalUrlIpc(): boolean {
  return typeof api()?.openExternal === "function";
}

export async function openExternalUrl(url: string): Promise<void> {
  if (!isHttpsUrl(url)) throw new Error("solo se permiten URLs https://");
  const a = api();
  if (a?.openExternal) {
    await a.openExternal(url);
    return;
  }
  const win = window.open(url, "_blank", "noopener");
  if (!win) throw new Error("el navegador bloqueó la ventana emergente");
}
