// Puente al proceso main para acciones de terminal. Electron-only: en el build web `window.termapi`
// no existe → hasTermApi() es false y la UI de terminal se oculta.
export interface TermApi {
  openExternal(command?: string | null): Promise<{ ok: boolean; launched: string }>;
}

declare global {
  interface Window {
    termapi?: TermApi;
  }
}

export function hasTermApi(): boolean {
  return typeof window !== "undefined" && !!window.termapi;
}

export function openExternalTerminal(command?: string | null): Promise<{ ok: boolean; launched: string }> {
  if (!window.termapi) return Promise.reject(new Error("terminal no disponible (web)"));
  return window.termapi.openExternal(command ?? null);
}
