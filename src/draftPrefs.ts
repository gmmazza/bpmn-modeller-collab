// Machine-local preference for the private-draft autosave (see draftStore.ts).
//
// When ON (default), every edit is debounced-autosaved to the local draft so work
// is never lost before "Publicar". When OFF, the periodic autosave is suspended and
// the user saves the draft manually with the "Guardar" button; the safety flushes on
// file-switch/close/preview still run so nothing is silently dropped. Persisted per
// machine in localStorage, mirroring the vizSettings.ts / identity.ts pattern.

const KEY = "bpmn-compartida.autosave";

export function getAutosave(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return true; // default ON
    return raw === "1";
  } catch {
    return true;
  }
}

export function setAutosave(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // Private-mode / quota failure is non-fatal — behaviour just falls back to the
    // in-session value the caller already holds.
  }
}
