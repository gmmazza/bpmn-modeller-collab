import { describe, it, expect } from "vitest";
import { makeIpcDir, type FsApi } from "./ipcFs";
import { createFsClient } from "./fsClient";

// In-memory FsApi: files keyed by normalized rel path; dirs tracked in a set.
function fakeApi(): FsApi & { _seed(rel: string, data: string): void } {
  const files = new Map<string, { data: string; mtime: number }>();
  const dirs = new Set<string>();
  let clock = 1;
  const norm = (rel: string) => rel.replace(/^\/+|\/+$/g, "");
  return {
    _seed(rel, data) { files.set(norm(rel), { data, mtime: ++clock }); },
    async chooseFolder() { return "root"; },
    async getRoot() { return "root"; },
    async listDir(_root, rel) {
      const base = norm(rel);
      const prefix = base ? base + "/" : "";
      const out = new Map<string, "file" | "directory">();
      for (const k of files.keys()) {
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length);
        if (rest.includes("/")) out.set(rest.split("/")[0], "directory");
        else out.set(rest, "file");
      }
      for (const d of dirs) {
        if (!d.startsWith(prefix)) continue;
        const rest = d.slice(prefix.length);
        if (rest && !rest.includes("/")) out.set(rest, "directory");
      }
      return [...out].map(([name, kind]) => ({ name, kind }));
    },
    async readFile(_root, rel) {
      const f = files.get(norm(rel));
      if (!f) throw new Error("ENOENT");
      return f.data;
    },
    async writeFile(_root, rel, data) { files.set(norm(rel), { data, mtime: ++clock }); },
    async removeEntry(_root, rel) { files.delete(norm(rel)); },
    async stat(_root, rel) {
      const r = norm(rel);
      if (r === "") return { mtimeMs: 0, size: 0, kind: "directory" };
      const f = files.get(r);
      if (f) return { mtimeMs: f.mtime, size: f.data.length, kind: "file" };
      if (dirs.has(r)) return { mtimeMs: 0, size: 0, kind: "directory" };
      for (const k of files.keys()) if (k.startsWith(r + "/")) return { mtimeMs: 0, size: 0, kind: "directory" };
      return null;
    },
    async mkdir(_root, rel) { dirs.add(norm(rel)); },
    async rename(_root, from, to) { const f = files.get(norm(from)); if (f) { files.set(norm(to), f); files.delete(norm(from)); } },
    async copyFile(_root, from, to) { const f = files.get(norm(from)); if (f) { files.set(norm(to), { ...f }); } },
    async writeFileBinary(_root, rel, base64) { files.set(norm(rel), { data: base64, mtime: ++clock }); },
    async readFileBinary(_root, rel) { const f = files.get(norm(rel)); return f ? f.data : null; },
  };
}

describe("ipcFs adapter", () => {
  it("getFile reads content and exposes mtime as lastModified", async () => {
    const api = fakeApi();
    api._seed("a.bpmn", "<x/>");
    const dir = makeIpcDir("root", api);
    const fh = await dir.getFileHandle("a.bpmn");
    const f = await fh.getFile();
    expect(await f.text()).toBe("<x/>");
    expect(typeof f.lastModified).toBe("number");
  });

  it("getFile throws NotFoundError for a missing file", async () => {
    const api = fakeApi();
    const dir = makeIpcDir("root", api);
    const fh = await dir.getFileHandle("missing.lock");
    await expect(fh.getFile()).rejects.toMatchObject({ name: "NotFoundError" });
  });

  it("createWritable writes through the api", async () => {
    const api = fakeApi();
    const dir = makeIpcDir("root", api);
    const fh = await dir.getFileHandle("new.bpmn", { create: true });
    const w = await fh.createWritable();
    await w.write("<y/>");
    await w.close();
    expect(await api.readFile("root", "new.bpmn")).toBe("<y/>");
  });

  it("entries lists files and subdirectories", async () => {
    const api = fakeApi();
    api._seed("a.bpmn", "1");
    await api.mkdir("root", ".history");
    const dir = makeIpcDir("root", api);
    const names: string[] = [];
    for await (const [name] of (dir as any).entries()) names.push(name);
    expect(names).toEqual(expect.arrayContaining(["a.bpmn", ".history"]));
  });

  it("getDirectoryHandle(create) makes the dir; non-create throws if absent", async () => {
    const api = fakeApi();
    const dir = makeIpcDir("root", api);
    await expect(dir.getDirectoryHandle("nope")).rejects.toMatchObject({ name: "NotFoundError" });
    const sub = await dir.getDirectoryHandle(".history", { create: true });
    expect((sub as any).kind).toBe("directory");
  });

  it("exposes __native bound to root that calls api.rename/copyFile", async () => {
    const calls: string[] = [];
    const api: any = {
      rename: async (_r: string, f: string, t: string) => { calls.push(`rename ${f}->${t}`); },
      copyFile: async (_r: string, f: string, t: string) => { calls.push(`copy ${f}->${t}`); },
      listDir: async () => [],
    };
    const handle: any = makeIpcDir("/root", api);
    await handle.__native.rename("a.bpmn", "sub/a.bpmn");
    await handle.__native.copyFile("a.bpmn", "b.bpmn");
    expect(calls).toEqual(["rename a.bpmn->sub/a.bpmn", "copy a.bpmn->b.bpmn"]);
  });

  it("works as a real fsClient backend (putXml + history round-trip)", async () => {
    const api = fakeApi();
    api._seed("proceso.bpmn", "<a/>");
    const fs = createFsClient(makeIpcDir("root", api), () => 1000);
    await fs.putXml("proceso.bpmn", "<b/>", "Ana");
    expect(await fs.getXml("proceso.bpmn")).toBe("<b/>");
    const revs = await fs.listRevisions("proceso.bpmn");
    // 2: the seeded external content is captured as a baseline + Ana's publish
    expect(revs).toHaveLength(2);
    const mine = revs.find((r) => r.lastModifyingUser?.displayName === "Ana")!;
    expect(await fs.getRevisionXml("proceso.bpmn", mine.id)).toBe("<b/>");
  });
});
