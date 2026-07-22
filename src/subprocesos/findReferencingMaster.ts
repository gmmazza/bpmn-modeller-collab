// Scan the folder's diagrams for the first master whose map references a given stage's
// process (via a Call Activity's calledElement). Used to (a) offer "Ver en el mapa" and
// (b) render the stage's "◀ viene de / ▶ va a" pills even when the stage is opened
// standalone — not only when drilled from an already-open master. Pure + backend-agnostic
// (reads XML through the injected reader), so it is testable against real fixtures.
import { parseCallLinks } from "../processDocs/diagramInfo";
import { callLinksFromEls } from "./callActivityLinks";
import type { ProcessEntry } from "./processRegistry";

export interface ReferencingMaster {
  masterFile: string;
  masterXml: string;
  callActivityId: string; // the Call Activity in the master that calls the stage
}

export async function findReferencingMaster(deps: {
  entries: ProcessEntry[]; // registry.all() — every parsed .bpmn (masters and stages)
  readXml(file: string): Promise<string | null>;
  stageFile: string; // skip the stage's own file
  stageProcessId: string;
}): Promise<ReferencingMaster | null> {
  const { entries, readXml, stageFile, stageProcessId } = deps;
  if (!stageProcessId) return null;
  for (const entry of entries) {
    if (entry.file === stageFile) continue;
    const xml = await readXml(entry.file);
    if (!xml) continue;
    const link = callLinksFromEls(await parseCallLinks(xml)).find((l) => l.calledElement === stageProcessId);
    if (link) return { masterFile: entry.file, masterXml: xml, callActivityId: link.elementId };
  }
  return null;
}
