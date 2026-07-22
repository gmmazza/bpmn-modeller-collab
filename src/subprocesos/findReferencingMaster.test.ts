import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { findReferencingMaster } from "./findReferencingMaster";
import { parseDiagramInfo } from "../processDocs/diagramInfo";
import { createProcessRegistry, type ProcessEntry } from "./processRegistry";

const fx = (name: string) => `src/__fixtures__/${name}`;
const read = (name: string) => readFileSync(fx(name), "utf8");
const readXml = async (file: string) => read(file.replace("src/__fixtures__/", ""));

// Real registry entries for every committed master + stage fixture.
const FILES = [
  "master-chained-stages.bpmn", // proc_mapa: s_diag→proc_rep_2, s_rep→proc_rep_4
  "master-escalation-boundaries.bpmn", // proc_mapa: s2b→proc_rep_2b
  "rep-lanes-diagnostico.bpmn", // proc_rep_2 (a stage, no call links)
  "rep-lanes-reparacion.bpmn", // proc_rep_4
  "rep-lanes-motor-donante.bpmn", // proc_rep_2b
];

describe("findReferencingMaster — over real fixtures", () => {
  let entries: ProcessEntry[];

  beforeAll(async () => {
    const registry = createProcessRegistry({
      readXml,
      parseProcessId: async (xml) => (await parseDiagramInfo(xml)).processId,
    });
    await registry.sync(FILES.map((n) => ({ path: fx(n), version: "1" })));
    entries = registry.all();
  });

  it("finds the master that references a stage, with the linking Call Activity id (bug #1)", async () => {
    const hit = await findReferencingMaster({
      entries,
      readXml,
      stageFile: fx("rep-lanes-reparacion.bpmn"),
      stageProcessId: "proc_rep_4",
    });
    expect(hit).toEqual({
      masterFile: fx("master-chained-stages.bpmn"),
      masterXml: expect.stringContaining('calledElement="proc_rep_4"'),
      callActivityId: "s_rep",
    });
  });

  it("finds a different master for a stage only that master references", async () => {
    const hit = await findReferencingMaster({
      entries,
      readXml,
      stageFile: fx("rep-lanes-motor-donante.bpmn"),
      stageProcessId: "proc_rep_2b",
    });
    expect(hit?.masterFile).toBe(fx("master-escalation-boundaries.bpmn"));
    expect(hit?.callActivityId).toBe("s2b");
  });

  it("returns null when no master references the stage", async () => {
    const hit = await findReferencingMaster({
      entries,
      readXml,
      stageFile: fx("rep-lanes-diagnostico.bpmn"),
      stageProcessId: "proc_rep_999",
    });
    expect(hit).toBeNull();
  });

  it("finds the master for the '◀ viene de' side too (stage that is a mid-chain callee)", async () => {
    // proc_rep_2 is called by s_diag in the chained master — opening it standalone must
    // still discover that master so its pills can render.
    const hit = await findReferencingMaster({
      entries,
      readXml,
      stageFile: fx("rep-lanes-diagnostico.bpmn"),
      stageProcessId: "proc_rep_2",
    });
    expect(hit?.masterFile).toBe(fx("master-chained-stages.bpmn"));
    expect(hit?.callActivityId).toBe("s_diag");
  });
});
