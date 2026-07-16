// Pure forward index: for each master .bpmn, the subprocess files it calls that live in
// the SAME folder (the tree nests subs under their master only within a folder — A.6).
// Resolution (processId or baseName -> file) and the master's outgoing call links are
// injected so this stays DOM-free and unit-testable.

export function folderOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

export function buildMasterSubs(
  masters: string[],
  linksOf: (master: string) => string[],
  resolve: (calledElement: string) => string | null,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const master of masters) {
    const folder = folderOf(master);
    const subs: string[] = [];
    const seen = new Set<string>();
    for (const called of linksOf(master)) {
      const file = resolve(called);
      if (!file || file === master) continue;          // unresolved/ambiguous, or self
      if (folderOf(file) !== folder) continue;          // same-folder only
      if (seen.has(file)) continue;                     // de-dupe
      seen.add(file);
      subs.push(file);
    }
    if (subs.length) out.set(master, subs);
  }
  return out;
}
