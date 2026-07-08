import { describe, it, expect } from "vitest";
import { createFuentesClient, type FuentesFs } from "./fuentesClient";

// In-memory fake of the FS subset. Keys are relative paths; values are byte arrays.
function fakeFs(seed: Record<string, number[]> = {}): FuentesFs {
  const files = new Map<string, Uint8Array>();
  for (const [k, v] of Object.entries(seed)) files.set(k, new Uint8Array(v));
  const childrenOf = (rel: string) => {
    const prefix = rel === "" ? "" : rel + "/";
    const names = new Set<string>();
    const out: { name: string; kind: "file" | "directory" }[] = [];
    for (const key of files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash < 0) { out.push({ name: rest, kind: "file" }); }
      else { names.add(rest.slice(0, slash)); }
    }
    for (const d of names) out.push({ name: d, kind: "directory" });
    return out;
  };
  return {
    async listDir(rel) { return childrenOf(rel); },
    async writeBinary(rel, data) { files.set(rel, data); },
    async readBinary(rel) { return files.get(rel) ?? null; },
    async deletePath(rel) { files.delete(rel); },
    async movePath(from, to) {
      const b = files.get(from);
      if (b == null) throw new Error("nf");
      files.set(to, b);
      files.delete(from);
    },
  };
}

const DIR = "d.fuentes";

describe("fuentesClient.list", () => {
  it("derives estado from location and filters OS noise + the procesado dir", async () => {
    const fs = fakeFs({
      [`${DIR}/a.docx`]: [1],
      [`${DIR}/img.png`]: [2],
      [`${DIR}/desktop.ini`]: [9],
      [`${DIR}/.DS_Store`]: [9],
      [`${DIR}/procesado/old.pdf`]: [3],
    });
    const c = createFuentesClient(fs, "d.bpmn");
    const list = await c.list();
    const byName = Object.fromEntries(list.map((e) => [e.name, e.estado]));
    expect(byName).toEqual({ "a.docx": "pendiente", "img.png": "pendiente", "old.pdf": "procesada" });
    expect(list.find((e) => e.name === "a.docx")!.ext).toBe("docx");
  });
});

describe("fuentesClient.procesar / restaurar", () => {
  it("moves between root and procesado/", async () => {
    const fs = fakeFs({ [`${DIR}/a.docx`]: [1] });
    const c = createFuentesClient(fs, "d.bpmn");
    await c.procesar("a.docx");
    expect((await c.list()).map((e) => [e.name, e.estado])).toEqual([["a.docx", "procesada"]]);
    await c.restaurar("a.docx");
    expect((await c.list()).map((e) => [e.name, e.estado])).toEqual([["a.docx", "pendiente"]]);
  });
});

describe("fuentesClient.add", () => {
  it("suffixes on name collision instead of overwriting", async () => {
    const fs = fakeFs({ [`${DIR}/a.pdf`]: [1] });
    const c = createFuentesClient(fs, "d.bpmn");
    const finalName = await c.add("a.pdf", new Uint8Array([2]));
    expect(finalName).toBe("a (2).pdf");
    expect((await c.list()).map((e) => e.name).sort()).toEqual(["a (2).pdf", "a.pdf"]);
  });
});

describe("fuentesClient safety", () => {
  it("rejects names with path separators", async () => {
    const c = createFuentesClient(fakeFs(), "d.bpmn");
    await expect(c.add("../evil.pdf", new Uint8Array([1]))).rejects.toThrow();
    await expect(c.procesar("sub/x.pdf")).rejects.toThrow();
  });
});
