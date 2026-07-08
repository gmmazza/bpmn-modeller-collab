import { describe, it, expect } from "vitest";
import { createProcessRegistry } from "./processRegistry";

// Fake corpus: file path -> { xml, version, processId }
function makeDeps(corpus: Record<string, { processId: string; version: string }>) {
  return {
    async readXml(file: string) {
      return corpus[file] ? `<xml id="${corpus[file].processId}"/>` : null;
    },
    async parseProcessId(xml: string) {
      const m = xml.match(/id="([^"]*)"/);
      return m ? m[1] : "";
    },
    corpus,
  };
}
const filesOf = (c: Record<string, { version: string }>) =>
  Object.entries(c).map(([path, v]) => ({ path, version: v.version }));

describe("processRegistry", () => {
  it("indexes processId -> file and resolves", async () => {
    const d = makeDeps({ "a.bpmn": { processId: "P_a", version: "1" }, "b.bpmn": { processId: "P_b", version: "1" } });
    const r = createProcessRegistry(d);
    await r.sync(filesOf(d.corpus));
    expect(r.resolve("P_a")).toEqual({ processId: "P_a", file: "a.bpmn" });
    expect(r.resolve("nope")).toBeNull();
    expect(r.all().map((e) => e.file).sort()).toEqual(["a.bpmn", "b.bpmn"]);
  });

  it("sync only re-parses changed files (version-aware)", async () => {
    let parses = 0;
    const corpus = { "a.bpmn": { processId: "P_a", version: "1" } };
    const r = createProcessRegistry({
      async readXml() { return `<xml id="P_a"/>`; },
      async parseProcessId(xml) { parses++; return xml.match(/id="([^"]*)"/)![1]; },
    });
    await r.sync(filesOf(corpus));            // parses -> 1
    await r.sync(filesOf(corpus));            // same version -> no re-parse
    expect(parses).toBe(1);
    await r.sync([{ path: "a.bpmn", version: "2" }]); // version changed -> re-parse
    expect(parses).toBe(2);
  });

  it("drops removed files and only .bpmn are considered", async () => {
    const d = makeDeps({ "a.bpmn": { processId: "P_a", version: "1" } });
    const r = createProcessRegistry(d);
    await r.sync(filesOf(d.corpus));
    await r.sync([]); // a.bpmn removed
    expect(r.resolve("P_a")).toBeNull();
    await r.sync([{ path: "note.md", version: "1" }]); // non-bpmn ignored
    expect(r.all()).toEqual([]);
  });

  it("flags ambiguous processIds and resolve() returns null for them", async () => {
    const r = createProcessRegistry({
      async readXml() { return `<xml id="DUP"/>`; },
      async parseProcessId(xml) { return xml.match(/id="([^"]*)"/)![1]; },
    });
    await r.sync([{ path: "x.bpmn", version: "1" }, { path: "y.bpmn", version: "1" }]);
    expect(r.ambiguities()).toEqual(["DUP"]);
    expect(r.resolve("DUP")).toBeNull();
  });
});
