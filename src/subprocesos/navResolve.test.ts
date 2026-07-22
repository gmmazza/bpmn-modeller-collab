import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveEntryNav, resolveExitNav } from "./navResolve";
import { buildStageOverlayModel, type StageExit } from "./stageOverlays";
import { parseCallLinks, parseDiagramInfo } from "../processDocs/diagramInfo";
import { callLinksFromEls } from "./callActivityLinks";
import { createProcessRegistry, type ProcessRegistry } from "./processRegistry";

const fx = (name: string) => `src/__fixtures__/${name}`;
const read = (name: string) => readFileSync(fx(name), "utf8");

// A master that chains two Call Activities: proc_rep_2 → proc_rep_4 → plain end.
const MASTER = read("master-chained-stages.bpmn");
// Real committed stages the chain calls.
const STAGE_DIAG = read("rep-lanes-diagnostico.bpmn"); // proc_rep_2, called by s_diag
const STAGE_REP = read("rep-lanes-reparacion.bpmn"); // proc_rep_4, called by s_rep

// Build resolveName / masterNodeCalled the way main.ts does, from the real master parse.
async function masterContext() {
  const els = await parseCallLinks(MASTER);
  const namesById = new Map(els.map((e) => [e.id, e.name ?? ""]));
  const masterNodeCalled = new Map(callLinksFromEls(els).map((l) => [l.elementId, l.calledElement]));
  return { resolveName: (id: string) => namesById.get(id) ?? "", masterNodeCalled };
}

// A real registry synced to the committed stage fixtures (real processIds parsed from disk).
async function syncedRegistry(): Promise<ProcessRegistry> {
  const registry = createProcessRegistry({
    readXml: async (file) => read(file.replace("src/__fixtures__/", "")),
    parseProcessId: async (xml) => (await parseDiagramInfo(xml)).processId,
  });
  await registry.sync(
    ["rep-lanes-diagnostico.bpmn", "rep-lanes-reparacion.bpmn", "rep-lanes-motor-donante.bpmn"].map((n) => ({
      path: fx(n),
      version: "1",
    })),
  );
  return registry;
}

describe("navResolve — over real master/stage fixtures", () => {
  let registry: ProcessRegistry;
  let resolveName: (id: string) => string;
  let masterNodeCalled: Map<string, string>;

  beforeAll(async () => {
    registry = await syncedRegistry();
    ({ resolveName, masterNodeCalled } = await masterContext());
  });

  it("resolves '▶ va a' to OPEN when the successor is another stage (bug #2)", async () => {
    const model = await buildStageOverlayModel({
      stageXml: STAGE_DIAG,
      masterXml: MASTER,
      callActivityId: "s_diag",
      resolveName,
    });
    const normalExit = model.exits.find((e) => e.kind === "normal")!;
    expect(normalExit.targetMasterId).toBe("s_rep"); // successor is the next Call Activity
    expect(resolveExitNav(normalExit, masterNodeCalled, registry.resolve)).toEqual({
      kind: "open",
      file: fx("rep-lanes-reparacion.bpmn"),
      processId: "proc_rep_4",
    });
  });

  it("resolves '◀ viene de' to OPEN when the source is another stage", async () => {
    const model = await buildStageOverlayModel({
      stageXml: STAGE_REP,
      masterXml: MASTER,
      callActivityId: "s_rep",
      resolveName,
    });
    const source = model.entry!.sources[0];
    expect(source.processId).toBe("proc_rep_2");
    expect(resolveEntryNav(source, registry.resolve)).toEqual({
      kind: "open",
      file: fx("rep-lanes-diagnostico.bpmn"),
      processId: "proc_rep_2",
    });
  });

  it("resolves '▶ va a' to HIGHLIGHT when the successor is a plain master node (end event)", async () => {
    const model = await buildStageOverlayModel({
      stageXml: STAGE_REP,
      masterXml: MASTER,
      callActivityId: "s_rep",
      resolveName,
    });
    const normalExit = model.exits.find((e) => e.kind === "normal")!;
    expect(normalExit.targetMasterId).toBe("e_fin"); // successor is a plain end, not a Call Activity
    expect(resolveExitNav(normalExit, masterNodeCalled, registry.resolve)).toEqual({
      kind: "highlight",
      masterElementId: "e_fin",
    });
  });

  it("resolves '◀ viene de' to HIGHLIGHT when the source is the master start", async () => {
    const model = await buildStageOverlayModel({
      stageXml: STAGE_DIAG,
      masterXml: MASTER,
      callActivityId: "s_diag",
      resolveName,
    });
    const source = model.entry!.sources[0];
    expect(source.kind).toBe("start");
    expect(resolveEntryNav(source, registry.resolve)).toEqual({
      kind: "highlight",
      masterElementId: "start",
    });
  });

  it("resolves an exit with no destination to NONE", () => {
    const orphan: StageExit = { endId: "e", label: "▶ va a: (sin destino)", targetMasterId: null, kind: "normal" };
    expect(resolveExitNav(orphan, masterNodeCalled, registry.resolve)).toEqual({ kind: "none" });
  });

  it("HIGHLIGHTs an exit whose successor stage is absent/ambiguous in the registry", () => {
    const ghost: StageExit = { endId: "e", label: "▶ va a: X", targetMasterId: "s_ghost", kind: "normal" };
    const called = new Map([["s_ghost", "proc_missing"]]);
    expect(resolveExitNav(ghost, called, registry.resolve)).toEqual({
      kind: "highlight",
      masterElementId: "s_ghost",
    });
  });
});
