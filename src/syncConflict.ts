// Heuristic detection of filenames produced by sync tools when two edits collide.
const PATTERNS = [
  /\s\(\d+\)\.bpmn$/i,            // "proceso (1).bpmn"  (Drive, OS copies)
  /\.sync-conflict-/i,            // Syncthing
  /-DESKTOP-[A-Z0-9]+\.bpmn$/i,   // OneDrive "-DESKTOP-XXXX"
  /-conflicto?\.bpmn$/i,          // "-conflict" / "-conflicto"
  /-conflicted\s/i,               // Dropbox "(... conflicted copy ...)"
];

export function isSyncConflict(name: string): boolean {
  return PATTERNS.some((re) => re.test(name));
}
