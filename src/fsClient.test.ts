import { describe, it, expect, beforeEach } from "vitest";
import { createFsClient } from "./fsClient";
import { createFakeDir, seedFile } from "./testHelpers/fakeDir";

let dir: ReturnType<typeof createFakeDir>;
let fs: ReturnType<typeof createFsClient>;

// App-created files always carry a <definitions> tag (so createFile stamps the app
// exporter on them and later publishes don't mistake them for external content).
const APP_XML = `<bpmn:definitions xmlns:bpmn="http://x" id="D0"/>`;

beforeEach(async () => {
  dir = createFakeDir();
  fs = createFsClient(dir);
  await seedFile(dir, "proceso.bpmn", "<a/>");
});

describe("fsClient files/meta/locks", () => {
  it("lists only .bpmn files (not locks, not history)", async () => {
    await seedFile(dir, "proceso.bpmn.lock", "{}");
    const files = await fs.listFiles();
    expect(files.map((f) => f.id)).toEqual(["proceso.bpmn"]);
  });

  it("getXml returns contents; getMeta exposes mtime as version", async () => {
    expect(await fs.getXml("proceso.bpmn")).toBe("<a/>");
    const meta = await fs.getMeta("proceso.bpmn");
    expect(meta.version).toBe(meta.headRevisionId);
    expect(meta.version).toMatch(/^\d+$/);
  });

  it("setLock writes a .lock; listFiles surfaces it via appProperties", async () => {
    await fs.setLock("proceso.bpmn", {
      lockedBy: "Ana",
      lockedByEmail: "Ana",
      lockedByName: "Ana",
      lockedAt: "2026-06-26T00:00:00Z",
    });
    const files = await fs.listFiles();
    expect(files[0].appProperties?.lockedByName).toBe("Ana");
  });

  it("setLock with empty strings deletes the lock", async () => {
    await fs.setLock("proceso.bpmn", { lockedBy: "Ana", lockedByEmail: "Ana", lockedByName: "Ana", lockedAt: "t" });
    await fs.setLock("proceso.bpmn", { lockedBy: "", lockedByEmail: "", lockedByName: "", lockedAt: "" });
    const meta = await fs.getMeta("proceso.bpmn");
    expect(meta.appProperties?.lockedByEmail ?? "").toBe("");
  });

  it("putXml writes content and records lastWrite version", async () => {
    const res = await fs.putXml("proceso.bpmn", "<b/>", "Ana");
    expect(await fs.getXml("proceso.bpmn")).toBe("<b/>");
    expect(res.version).toBe(res.headRevisionId);
    expect(fs.lastWriteVersion("proceso.bpmn")).toBe(res.version);
  });

  it("createFile appends .bpmn when missing", async () => {
    const f = await fs.createFile("nuevo", "<c/>");
    expect(f.id).toBe("nuevo.bpmn");
    expect(await fs.getXml("nuevo.bpmn")).toBe("<c/>");
  });
});

describe("fsClient history + retention", () => {
  it("putXml creates a revision readable by listRevisions/getRevisionXml", async () => {
    const res = await fs.putXml("proceso.bpmn", "<v1/>", "Ana");
    const revs = await fs.listRevisions("proceso.bpmn");
    // 2 revisions: the seeded external content is captured as baseline + Ana's publish
    expect(revs).toHaveLength(2);
    const mine = revs.find((r) => r.lastModifyingUser?.displayName === "Ana");
    expect(mine).toBeDefined();
    expect(await fs.getRevisionXml("proceso.bpmn", mine!.id)).toBe("<v1/>");
    expect(res.version).toMatch(/^\d+$/);
  });

  it("setKeepForever toggles the keep flag (and survives renaming)", async () => {
    await fs.putXml("proceso.bpmn", "<v1/>", "Ana");
    const rev = (await fs.listRevisions("proceso.bpmn")).find((r) => r.lastModifyingUser?.displayName === "Ana")!;
    const flagOf = async (id: string) => (await fs.listRevisions("proceso.bpmn")).find((r) => r.id === id)?.keepForever;
    await fs.setKeepForever("proceso.bpmn", rev.id, true);
    expect(await flagOf(rev.id)).toBe(true);
    expect(await fs.getRevisionXml("proceso.bpmn", rev.id)).toBe("<v1/>");
    await fs.setKeepForever("proceso.bpmn", rev.id, false);
    expect(await flagOf(rev.id)).toBe(false);
  });

  it("prune deletes decayed revisions but keeps pinned and newest", async () => {
    // Fixed clock so retention is deterministic; seed old + recent rids by hand.
    const fixedNow = 10_000_000_000_000; // far future epoch ms
    const f2 = createFsClient(dir, () => fixedNow);
    const hdir = await dir.getDirectoryHandle(".history", { create: true });
    const sub = await hdir.getDirectoryHandle("proceso", { create: true });
    // three ancient revisions (will decay) + one pinned ancient
    for (const rid of ["1000", "2000", "3000"]) await seedFile(sub, `${rid}~Ana.bpmn`, "<old/>");
    await seedFile(sub, `500~Ana.keep.bpmn`, "<pinned/>");
    // a save triggers prune; the just-written rid (≈fixedNow) is newest and kept
    await f2.putXml("proceso.bpmn", "<new/>", "Ana");
    const ids = (await f2.listRevisions("proceso.bpmn")).map((r) => r.id).sort();
    expect(ids).toContain("500"); // pinned survives
    expect(ids).toContain(String(fixedNow)); // newest survives
    expect(ids).not.toContain("1000"); // decayed away
    expect(ids).not.toContain("2000");
  });

  // Regression (2026-07-23): real working session — publish several times a few
  // minutes apart. Every version must still be listed afterwards; prune used to
  // wipe all but the newest because none reached the 1h decay target.
  it("a session of publishes minutes apart keeps every version", async () => {
    let clock = 10_000_000_000_000;
    const f2 = createFsClient(dir, () => clock);
    for (let i = 1; i <= 4; i++) {
      await f2.putXml("proceso.bpmn", `<v${i}/>`, "Ana");
      clock += 7 * 60 * 1000; // 7 minutes between publishes
    }
    const revs = await f2.listRevisions("proceso.bpmn");
    // 4 publishes + the seeded external baseline captured on the first one
    expect(revs).toHaveLength(5);
    const xmls = await Promise.all(revs.map((r) => f2.getRevisionXml("proceso.bpmn", r.id)));
    for (const v of ["<v1/>", "<v2/>", "<v3/>", "<v4/>"]) expect(xmls).toContain(v);
  });
});

// Content that appeared on disk WITHOUT going through Publicar (AI agent, another tool,
// a teammate's copy) must never be silently lost — it gets captured as an external
// revision, attributed via the BPMN `exporter` signature when present.
describe("fsClient external versions + provenance", () => {
  const DEFS = (body: string) =>
    `<?xml version="1.0"?>\n<bpmn:definitions xmlns:bpmn="http://x" id="D1">${body}</bpmn:definitions>`;

  it("publishing over an externally-written file preserves the original as an (externo) revision", async () => {
    // proceso.bpmn was seeded externally (never published) — like rep_4_reparacion.bpmn
    await fs.putXml("proceso.bpmn", DEFS("<mine/>"), "Ana");
    const revs = await fs.listRevisions("proceso.bpmn");
    expect(revs).toHaveLength(2);
    const ext = revs.find((r) => r.lastModifyingUser?.displayName === "externo");
    expect(ext).toBeDefined();
    expect(await fs.getRevisionXml("proceso.bpmn", ext!.id)).toBe("<a/>"); // the original survives
  });

  it("snapshotExternal creates a baseline dated with the file's mtime, and is idempotent", async () => {
    const mtime = (await fs.getMeta("proceso.bpmn")).version;
    await fs.snapshotExternal("proceso.bpmn");
    await fs.snapshotExternal("proceso.bpmn"); // unchanged content → no duplicate
    const revs = await fs.listRevisions("proceso.bpmn");
    expect(revs).toHaveLength(1);
    expect(revs[0].id).toBe(mtime); // panel date = the file's real modification date
    expect(revs[0].lastModifyingUser?.displayName).toBe("externo");
  });

  it("attributes the external snapshot to the exporter signature when the writer signed it", async () => {
    await seedFile(dir, "firmado.bpmn", `<bpmn:definitions xmlns:bpmn="http://x" exporter="IA — Claude" id="D2"/>`);
    await fs.snapshotExternal("firmado.bpmn");
    const revs = await fs.listRevisions("firmado.bpmn");
    expect(revs[0].lastModifyingUser?.displayName).toBe("IA — Claude");
  });

  it("captures an external edit made between two publishes", async () => {
    await fs.putXml("proceso.bpmn", DEFS("<v1/>"), "Ana");
    await seedFile(dir, "proceso.bpmn", DEFS("<hacked/>")); // external overwrite
    await fs.putXml("proceso.bpmn", DEFS("<v2/>"), "Ana");
    const revs = await fs.listRevisions("proceso.bpmn");
    const xmls = await Promise.all(revs.map((r) => fs.getRevisionXml("proceso.bpmn", r.id)));
    expect(xmls.some((x) => x.includes("<hacked/>"))).toBe(true);
  });

  it("putXml stamps the app exporter so published files self-describe their writer", async () => {
    await fs.putXml("proceso.bpmn", DEFS("<v1/>"), "Ana");
    expect(await fs.getXml("proceso.bpmn")).toContain(`exporter="BPMN compartida"`);
  });

  it("an app-created file does NOT get a spurious 'externo' baseline on first publish", async () => {
    await fs.createFile("nuevo.bpmn", DEFS("<empty/>"));
    await fs.putXml("nuevo.bpmn", DEFS("<work/>"), "Ana");
    const revs = await fs.listRevisions("nuevo.bpmn");
    expect(revs).toHaveLength(1);
    expect(revs[0].lastModifyingUser?.displayName).toBe("Ana");
  });
});

describe("fsClient sidecars", () => {
  it("readSidecar returns null when absent, then round-trips after write", async () => {
    expect(await fs.readSidecar("proceso.bpmn", "layers.json")).toBeNull();
    await fs.writeSidecar("proceso.bpmn", "layers.json", '{"version":1}');
    expect(await fs.readSidecar("proceso.bpmn", "layers.json")).toBe('{"version":1}');
  });

  it("sidecar name strips .bpmn and is not listed by listFiles", async () => {
    await fs.writeSidecar("proceso.bpmn", "layers.json", "{}");
    // stored as proceso.layers.json (not a .bpmn), so listFiles ignores it
    expect((await fs.listFiles()).map((f) => f.id)).toEqual(["proceso.bpmn"]);
  });
});

describe("fsClient nested paths", () => {
  it("writes and reads a file inside a subfolder", async () => {
    await fs.createFile("Ventas/B2B.bpmn", "<b/>");
    expect(await fs.getXml("Ventas/B2B.bpmn")).toBe("<b/>");
    const meta = await fs.getMeta("Ventas/B2B.bpmn");
    expect(meta.id).toBe("Ventas/B2B.bpmn");
    expect(meta.version).toMatch(/^\d+$/);
  });
});

describe("fsClient nested history", () => {
  it("stores history under .history/<dirs>/<base>", async () => {
    await fs.createFile("Ventas/B2B.bpmn", APP_XML);
    await fs.putXml("Ventas/B2B.bpmn", "<b2/>", "Ana");
    const revs = await fs.listRevisions("Ventas/B2B.bpmn");
    expect(revs.length).toBe(1);
    const xml = await fs.getRevisionXml("Ventas/B2B.bpmn", revs[0].id);
    expect(xml).toBe("<b2/>");
  });
});

describe("fsClient listTree", () => {
  it("returns folders and .bpmn recursively, excluding history/sidecars", async () => {
    await fs.createFile("RRHH.bpmn", "<r/>");
    await fs.createFile("Ventas/B2B.bpmn", "<b/>");
    await fs.writeSidecar("Ventas/B2B.bpmn", "layers.json", "{}");
    await fs.setLock("Ventas/B2B.bpmn", { lockedBy: "Ana", lockedByEmail: "Ana", lockedByName: "Ana", lockedAt: "t" });
    await fs.putXml("Ventas/B2B.bpmn", "<b2/>", "Ana"); // creates .history/Ventas/B2B
    const tree = await fs.listTree();
    const paths = tree.map((e) => `${e.kind}:${e.path}`).sort();
    expect(paths).toContain("file:RRHH.bpmn");
    expect(paths).toContain("dir:Ventas");
    expect(paths).toContain("file:Ventas/B2B.bpmn");
    expect(paths.some((p) => p.includes(".history"))).toBe(false);
    expect(paths.some((p) => p.includes("layers.json"))).toBe(false);
    expect(paths.some((p) => p.includes(".lock"))).toBe(false);
    const b2b = tree.find((e) => e.path === "Ventas/B2B.bpmn");
    expect(b2b?.appProperties?.lockedByName).toBe("Ana");
  });

  it("hides the _bpmn-design meta folder from the tree", async () => {
    const fs2 = createFsClient(createFakeDir());
    await fs2.writePath("_bpmn-design/SKILL.md", "x");
    await fs2.createFile("proceso", "<x/>");
    const tree = await fs2.listTree();
    expect(tree.some((e) => e.path === "_bpmn-design")).toBe(false);
    expect(tree.some((e) => e.path === "proceso.bpmn")).toBe(true);
  });
});

describe("fsClient delete + createFolder", () => {
  it("createFolder makes a subfolder", async () => {
    await fs.createFolder("", "Ventas");
    const tree = await fs.listTree();
    expect(tree).toContainEqual(expect.objectContaining({ path: "Ventas", kind: "dir" }));
  });
  it("deleteFile removes the bpmn, its sidecar, lock and history", async () => {
    await fs.createFile("Ventas/B2B.bpmn", "<b/>");
    await fs.writeSidecar("Ventas/B2B.bpmn", "layers.json", "{}");
    await fs.setLock("Ventas/B2B.bpmn", { lockedBy: "A", lockedByEmail: "A", lockedByName: "A", lockedAt: "t" });
    await fs.putXml("Ventas/B2B.bpmn", "<b2/>", "A");
    await fs.deleteFile("Ventas/B2B.bpmn");
    const tree = await fs.listTree();
    expect(tree.some((e) => e.path === "Ventas/B2B.bpmn")).toBe(false);
    expect(await fs.readSidecar("Ventas/B2B.bpmn", "layers.json")).toBeNull();
    expect(await fs.listRevisions("Ventas/B2B.bpmn")).toEqual([]);
  });
});

describe("fsClient move/rename/copy/duplicate", () => {
  beforeEach(async () => {
    await fs.createFile("A.bpmn", APP_XML);
    await fs.writeSidecar("A.bpmn", "layers.json", "{\"v\":1}");
    await fs.putXml("A.bpmn", "<a2/>", "Ana"); // 1 revision
    await fs.createFolder("", "Sub");
  });
  it("moveFile carries sidecar + history, frees lock, removes source", async () => {
    await fs.setLock("A.bpmn", { lockedBy: "Ana", lockedByEmail: "Ana", lockedByName: "Ana", lockedAt: "t" });
    const newId = await fs.moveFile("A.bpmn", "Sub");
    expect(newId).toBe("Sub/A.bpmn");
    expect(await fs.getXml("Sub/A.bpmn")).toBe("<a2/>");
    expect(await fs.readSidecar("Sub/A.bpmn", "layers.json")).toBe("{\"v\":1}");
    expect((await fs.listRevisions("Sub/A.bpmn")).length).toBe(1);
    expect(await fs.listRevisions("A.bpmn")).toEqual([]);
    const tree = await fs.listTree();
    expect(tree.some((e) => e.path === "A.bpmn")).toBe(false);
    expect((await fs.getMeta("Sub/A.bpmn")).appProperties?.lockedByName ?? "").toBe("");
  });
  it("renameFile keeps folder, carries bundle", async () => {
    const newId = await fs.renameFile("A.bpmn", "Renombrado");
    expect(newId).toBe("Renombrado.bpmn");
    expect(await fs.getXml("Renombrado.bpmn")).toBe("<a2/>");
    expect((await fs.listRevisions("Renombrado.bpmn")).length).toBe(1);
  });
  it("copyFile carries sidecar but not history/lock", async () => {
    const newId = await fs.copyFile("A.bpmn", "Sub");
    expect(newId).toBe("Sub/A.bpmn");
    expect(await fs.getXml("Sub/A.bpmn")).toBe("<a2/>");
    expect(await fs.readSidecar("Sub/A.bpmn", "layers.json")).toBe("{\"v\":1}");
    expect(await fs.listRevisions("Sub/A.bpmn")).toEqual([]);
    expect(await fs.getXml("A.bpmn")).toBe("<a2/>"); // original kept
  });
  it("duplicateFile makes ' copia' in same folder", async () => {
    const newId = await fs.duplicateFile("A.bpmn");
    expect(newId).toBe("A copia.bpmn");
    expect(await fs.getXml("A copia.bpmn")).toBe("<a2/>");
  });
});

describe("fsClient folder ops", () => {
  beforeEach(async () => {
    await fs.createFile("Grupo/X.bpmn", APP_XML);
    await fs.putXml("Grupo/X.bpmn", "<x2/>", "Ana"); // history at .history/Grupo/X
    await fs.createFolder("", "Destino");
  });
  it("moveFolder relocates files and their history", async () => {
    const np = await fs.moveFolder("Grupo", "Destino");
    expect(np).toBe("Destino/Grupo");
    expect(await fs.getXml("Destino/Grupo/X.bpmn")).toBe("<x2/>");
    expect((await fs.listRevisions("Destino/Grupo/X.bpmn")).length).toBe(1);
    const tree = await fs.listTree();
    expect(tree.some((e) => e.path === "Grupo")).toBe(false);
  });
  it("deleteFolder removes the folder and its history", async () => {
    await fs.deleteFolder("Grupo");
    const tree = await fs.listTree();
    expect(tree.some((e) => e.path.startsWith("Grupo"))).toBe(false);
    expect(await fs.listRevisions("Grupo/X.bpmn")).toEqual([]);
  });
  it("copyFolder copies files (no history)", async () => {
    const np = await fs.copyFolder("Grupo", "Destino");
    expect(np).toBe("Destino/Grupo");
    expect(await fs.getXml("Destino/Grupo/X.bpmn")).toBe("<x2/>");
    expect(await fs.listRevisions("Destino/Grupo/X.bpmn")).toEqual([]);
    expect(await fs.getXml("Grupo/X.bpmn")).toBe("<x2/>"); // original kept
  });
  it("renameFolder keeps parent, carries history, removes source", async () => {
    const np = await fs.renameFolder("Grupo", "GrupoRenombrado");
    expect(np).toBe("GrupoRenombrado");
    expect(await fs.getXml("GrupoRenombrado/X.bpmn")).toBe("<x2/>");
    expect((await fs.listRevisions("GrupoRenombrado/X.bpmn")).length).toBe(1);
    const tree = await fs.listTree();
    expect(tree.some((e) => e.path === "Grupo" || e.path.startsWith("Grupo/"))).toBe(false);
    expect(tree.some((e) => e.path === "GrupoRenombrado")).toBe(true);
  });
  it("renameFolder nested keeps parent dir, carries history", async () => {
    await fs.createFile("Destino/Sub/Y.bpmn", APP_XML);
    await fs.putXml("Destino/Sub/Y.bpmn", "<y2/>", "Ana");
    const np = await fs.renameFolder("Destino/Sub", "SubRen");
    expect(np).toBe("Destino/SubRen");
    expect(await fs.getXml("Destino/SubRen/Y.bpmn")).toBe("<y2/>");
    expect((await fs.listRevisions("Destino/SubRen/Y.bpmn")).length).toBe(1);
    const tree = await fs.listTree();
    expect(tree.some((e) => e.path === "Destino/Sub" || e.path.startsWith("Destino/Sub/"))).toBe(false);
  });
});

describe("fsClient data-safety fixes", () => {
  beforeEach(async () => {
    await fs.createFolder("", "Grupo");
    await fs.createFolder("", "Destino");
  });

  it("copyFolder does NOT copy .lock sidecars", async () => {
    await fs.createFile("Grupo/X.bpmn", "<x/>");
    await fs.setLock("Grupo/X.bpmn", {
      lockedBy: "Ana",
      lockedByEmail: "ana@example.com",
      lockedByName: "Ana",
      lockedAt: "2026-06-29T00:00:00Z",
    });
    await fs.copyFolder("Grupo", "Destino");
    // copied file exists with correct content
    expect(await fs.getXml("Destino/Grupo/X.bpmn")).toBe("<x/>");
    // lock was NOT carried to the copy
    const meta = await fs.getMeta("Destino/Grupo/X.bpmn");
    expect(meta.appProperties?.lockedByName ?? "").toBe("");
    // original lock still present
    const origMeta = await fs.getMeta("Grupo/X.bpmn");
    expect(origMeta.appProperties?.lockedByName).toBe("Ana");
  });

  it("moveFile throws on existing target and does NOT overwrite victim", async () => {
    await fs.createFile("A.bpmn", "<a/>");
    await fs.createFile("Sub/A.bpmn", "<keep/>");
    await expect(fs.moveFile("A.bpmn", "Sub")).rejects.toThrow();
    // victim intact
    expect(await fs.getXml("Sub/A.bpmn")).toBe("<keep/>");
    // source still exists
    expect(await fs.getXml("A.bpmn")).toBe("<a/>");
  });

  it("renameFile throws on existing target and does NOT overwrite victim", async () => {
    await fs.createFile("A.bpmn", "<a/>");
    await fs.createFile("B.bpmn", "<keep/>");
    await expect(fs.renameFile("A.bpmn", "B")).rejects.toThrow();
    expect(await fs.getXml("B.bpmn")).toBe("<keep/>");
  });
});

describe("movePath", () => {
  it("moves a file to a new (auto-created) subfolder, preserving bytes", async () => {
    const fs_test = fs; // existing test helper in this file
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await fs_test.writeBinary("d.fuentes/a.bin", bytes);

    await fs_test.movePath("d.fuentes/a.bin", "d.fuentes/procesado/a.bin");

    expect(await fs_test.readBinary("d.fuentes/a.bin")).toBeNull();
    expect(Array.from((await fs_test.readBinary("d.fuentes/procesado/a.bin"))!)).toEqual([1, 2, 3, 4]);
  });
});

describe("listDir error discrimination", () => {
  it("returns [] when the target directory does not exist (NotFoundError)", async () => {
    expect(await fs.listDir("does-not-exist")).toEqual([]);
  });

  it("rethrows on a real enumeration failure (not a missing-dir NotFoundError)", async () => {
    // Create the dir first so getDirectoryHandle succeeds, then make its
    // entries() blow up with a generic error — simulating a real read/permission
    // failure distinct from "the directory doesn't exist yet".
    const sub = await dir.getDirectoryHandle("sub", { create: true });
    (sub as any).entries = async function* () {
      throw new Error("disk read error");
    };
    await expect(fs.listDir("sub")).rejects.toThrow("disk read error");
  });
});
