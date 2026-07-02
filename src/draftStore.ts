// Machine-local private drafts for the optimistic "Borrador → Publicar" model.
//
// Every edit is autosaved here (debounced) so work is never lost, yet nothing is
// shared until the user hits "Publicar". localStorage is deliberately chosen over
// the working folder: the folder is synced (Drive/OneDrive) and would leak the
// draft to the team, whereas localStorage is per-machine and private. A BPMN XML
// is a few tens of KB — far within the quota — and this mirrors the existing
// preference-store pattern in identity.ts / vizSettings.ts.
//
// Drafts are namespaced by the SHARED FOLDER they belong to (its absolute path in
// Electron, its name on the web) so that switching between projects/teams — which
// may hold files at the same relative path — never resumes the wrong project's
// draft.

const PREFIX = "bpmn-compartida.draft.";

const keyFor = (folderId: string, fileId: string): string =>
  `${PREFIX}${encodeURIComponent(folderId)}::${fileId}`;

export function saveDraft(folderId: string, fileId: string, xml: string): void {
  try {
    localStorage.setItem(keyFor(folderId, fileId), xml);
  } catch {
    // Quota or private-mode failures are non-fatal: the shared file is still the
    // source of truth, we just lose the local safety net for this edit.
  }
}

export function loadDraft(folderId: string, fileId: string): string | null {
  return localStorage.getItem(keyFor(folderId, fileId));
}

export function hasDraft(folderId: string, fileId: string): boolean {
  return localStorage.getItem(keyFor(folderId, fileId)) !== null;
}

export function clearDraft(folderId: string, fileId: string): void {
  localStorage.removeItem(keyFor(folderId, fileId));
}
