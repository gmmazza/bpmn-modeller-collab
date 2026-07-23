import type { DriveFile, Revision, TreeEntry } from "./types";
import { keepSet } from "./history";
import { stampExporter, readExporter, externalAuthorOf, APP_EXPORTER } from "./provenance";

const HISTORY_DIR = ".history";

function baseName(id: string): string {
  return id.replace(/\.bpmn$/i, "");
}

export function createFsClient(dir: FileSystemDirectoryHandle, now: () => number = () => Date.now()) {
  const lastWrites = new Map<string, string>();

  function parts(rel: string): string[] {
    return rel.split("/").filter(Boolean);
  }
  async function resolveParent(rel: string, create: boolean): Promise<{ parent: FileSystemDirectoryHandle; name: string }> {
    const p = parts(rel);
    const name = p.pop();
    if (!name) throw new Error(`invalid path: ${rel}`);
    let cur = dir;
    for (const seg of p) cur = await cur.getDirectoryHandle(seg, { create });
    return { parent: cur, name };
  }
  async function statAt(rel: string): Promise<File> {
    const { parent, name } = await resolveParent(rel, false);
    return (await parent.getFileHandle(name)).getFile();
  }
  async function readTextAt(rel: string): Promise<string> {
    return (await statAt(rel)).text();
  }
  async function writeTextAt(rel: string, data: string): Promise<number> {
    const { parent, name } = await resolveParent(rel, true);
    const fh = await parent.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(data);
    await w.close();
    return (await fh.getFile()).lastModified;
  }
  async function removeFileAt(rel: string): Promise<void> {
    try {
      const { parent, name } = await resolveParent(rel, false);
      await parent.removeEntry(name);
    } catch {
      /* already absent */
    }
  }
  async function removeDirAt(rel: string): Promise<void> {
    try {
      const { parent, name } = await resolveParent(rel, false);
      await (parent as any).removeEntry(name, { recursive: true });
    } catch {
      /* already absent */
    }
  }
  async function readLockProps(id: string): Promise<Record<string, string>> {
    try {
      const j = JSON.parse(await readTextAt(`${id}.lock`));
      return {
        lockedBy: j.lockedBy ?? "",
        lockedByEmail: j.lockedByEmail ?? "",
        lockedByName: j.lockedByName ?? "",
        lockedAt: j.lockedAt ?? "",
        lockedUntil: j.lockedUntil ?? "",
      };
    } catch {
      return {};
    }
  }
  async function toEntry(rel: string): Promise<TreeEntry> {
    const f = await statAt(rel);
    const version = String(f.lastModified);
    return {
      path: rel,
      kind: "file",
      modifiedTime: new Date(f.lastModified).toISOString(),
      version,
      appProperties: await readLockProps(rel),
    };
  }
  async function toDriveFile(id: string): Promise<DriveFile> {
    const f = await statAt(id);
    const version = String(f.lastModified);
    return {
      id,
      name: id,
      modifiedTime: new Date(f.lastModified).toISOString(),
      version,
      headRevisionId: version,
      appProperties: await readLockProps(id),
    };
  }

  // ---- history helpers (used by Task 5 methods) ----
  async function historyDir(id: string, create: boolean): Promise<FileSystemDirectoryHandle> {
    let cur = await dir.getDirectoryHandle(HISTORY_DIR, { create });
    for (const seg of parts(baseName(id))) cur = await cur.getDirectoryHandle(seg, { create });
    return cur;
  }
  function parseRev(name: string): { rid: string; author: string; keep: boolean } | null {
    let b = name.replace(/\.bpmn$/i, "");
    let keep = false;
    if (b.endsWith(".keep")) {
      keep = true;
      b = b.slice(0, -5);
    }
    const i = b.indexOf("~");
    if (i < 0) return null;
    const rid = b.slice(0, i);
    if (!/^\d+$/.test(rid)) return null;
    return { rid, author: decodeURIComponent(b.slice(i + 1)), keep };
  }
  async function findRev(hdir: FileSystemDirectoryHandle, rid: string): Promise<{ name: string; parsed: { rid: string; author: string; keep: boolean } } | null> {
    for await (const [name, handle] of (hdir as any).entries()) {
      if ((handle as any).kind !== "file") continue;
      const parsed = parseRev(name);
      if (parsed && parsed.rid === rid) return { name, parsed };
    }
    return null;
  }
  async function appendHistory(id: string, xml: string, editorName: string, atMs?: number): Promise<string> {
    const hdir = await historyDir(id, true);
    let rid = atMs ?? now();
    while (await findRev(hdir, String(rid))) rid++;
    const fh = await hdir.getFileHandle(`${rid}~${encodeURIComponent(editorName)}.bpmn`, { create: true });
    const w = await fh.createWritable();
    await w.write(xml);
    await w.close();
    return String(rid);
  }
  async function revisionsIn(hdir: FileSystemDirectoryHandle): Promise<Revision[]> {
    const out: Revision[] = [];
    for await (const [name, handle] of (hdir as any).entries()) {
      if ((handle as any).kind !== "file" || !name.endsWith(".bpmn")) continue;
      const parsed = parseRev(name);
      if (!parsed) continue;
      const f = await (handle as FileSystemFileHandle).getFile();
      out.push({
        id: parsed.rid,
        modifiedTime: new Date(Number(parsed.rid)).toISOString(),
        keepForever: parsed.keep,
        sizeBytes: f.size,
        lastModifyingUser: { displayName: parsed.author, emailAddress: parsed.author },
      });
    }
    return out;
  }
  // Capture content that reached the disk WITHOUT going through putXml (AI agents,
  // other tools, teammates' copies) as a revision, so publishing over it never destroys
  // it. Dated with the file's real mtime; attributed via the BPMN exporter signature.
  // No-ops when the disk content is already the newest revision (nothing external
  // happened) or when a never-published file carries the app's own exporter (our own
  // freshly-created template, not an external write). Returns the new rid, or null.
  async function snapshotExternal(id: string): Promise<string | null> {
    let f: File;
    try {
      f = await statAt(id);
    } catch {
      return null; // file gone — nothing to capture
    }
    const xml = await f.text();
    let revs: Revision[] = [];
    try {
      revs = await revisionsIn(await historyDir(id, false));
    } catch { /* no history yet */ }
    if (revs.length === 0) {
      if (readExporter(xml) === APP_EXPORTER) return null;
    } else {
      const newest = revs.reduce((a, b) => (Number(b.id) > Number(a.id) ? b : a));
      const hdir = await historyDir(id, false);
      const found = await findRev(hdir, newest.id);
      if (found) {
        const cur = await (await hdir.getFileHandle(found.name)).getFile();
        if ((await cur.text()) === xml) return null; // disk == last published version
      }
    }
    return appendHistory(id, xml, externalAuthorOf(xml), f.lastModified);
  }
  async function prune(id: string): Promise<void> {
    let hdir: FileSystemDirectoryHandle;
    try {
      hdir = await historyDir(id, false);
    } catch {
      return;
    }
    const revs = await revisionsIn(hdir);
    const keep = keepSet(revs, now());
    for (const r of revs) {
      if (r.keepForever || keep.has(r.id)) continue;
      const found = await findRev(hdir, r.id);
      if (found) await hdir.removeEntry(found.name);
    }
  }

  // ---- Task 5 helpers ----
  function dirOf(rel: string): string {
    const i = rel.lastIndexOf("/");
    return i < 0 ? "" : rel.slice(0, i);
  }
  function baseFileName(rel: string): string {
    const i = rel.lastIndexOf("/");
    return i < 0 ? rel : rel.slice(i + 1);
  }
  function ensureBpmn(name: string): string {
    return /\.bpmn$/i.test(name) ? name : `${name}.bpmn`;
  }
  function join(folder: string, name: string): string {
    return folder ? `${folder}/${name}` : name;
  }
  async function exists(rel: string): Promise<boolean> {
    try {
      await statAt(rel);
      return true;
    } catch {
      return false;
    }
  }
  async function dirExists(rel: string): Promise<boolean> {
    try {
      const { parent, name } = await resolveParent(rel, false);
      await parent.getDirectoryHandle(name);
      return true;
    } catch {
      return false;
    }
  }
  async function uniqueName(folder: string, desired: string): Promise<string> {
    const base = desired.replace(/\.bpmn$/i, "");
    let candidate = `${base}.bpmn`;
    let n = 2;
    while (await exists(join(folder, candidate))) candidate = `${base} (${n++}).bpmn`;
    return candidate;
  }
  const native = (dir as any).__native as
    | { rename(from: string, to: string): Promise<void>; copyFile(from: string, to: string): Promise<void>; writeBinary?(rel: string, base64: string): Promise<void>; readBinary?(rel: string): Promise<string | null> }
    | undefined;
  const nativeBin = native;
  async function copyFileContent(srcRel: string, dstRel: string): Promise<void> {
    if (native) return native.copyFile(srcRel, dstRel);
    await writeTextAt(dstRel, await readTextAt(srcRel));
  }
  async function moveFileContent(srcRel: string, dstRel: string): Promise<void> {
    if (native) return native.rename(srcRel, dstRel);
    await writeTextAt(dstRel, await readTextAt(srcRel));
    await removeFileAt(srcRel);
  }
  async function getDir(rel: string, create: boolean): Promise<FileSystemDirectoryHandle> {
    let cur = dir;
    for (const seg of parts(rel)) cur = await cur.getDirectoryHandle(seg, { create });
    return cur;
  }
  async function copySubtree(srcRel: string, dstRel: string, includeHistory: boolean): Promise<void> {
    const src = await getDir(srcRel, false);
    await getDir(dstRel, true);
    for await (const [name, h] of (src as any).entries()) {
      if (name === HISTORY_DIR && !includeHistory) continue;
      if (name.endsWith(".lock")) continue;
      const childSrc = `${srcRel}/${name}`;
      const childDst = `${dstRel}/${name}`;
      if ((h as any).kind === "directory") await copySubtree(childSrc, childDst, includeHistory);
      else await copyFileContent(childSrc, childDst);
    }
  }

  async function moveHistory(id: string, newId: string): Promise<void> {
    const src = `${HISTORY_DIR}/${baseName(id)}`;
    const dst = `${HISTORY_DIR}/${baseName(newId)}`;
    if (!(await dirExists(src))) return;
    if (native) {
      await native.rename(src, dst);
      return;
    }
    // generic: copy each revision file, then remove the source dir
    const from = await historyDir(id, false);
    let to = await dir.getDirectoryHandle(HISTORY_DIR, { create: true });
    for (const seg of parts(baseName(newId))) to = await to.getDirectoryHandle(seg, { create: true });
    for await (const [name, h] of (from as any).entries()) {
      if ((h as any).kind !== "file") continue;
      const data = await (await (from as FileSystemDirectoryHandle).getFileHandle(name)).getFile();
      const w = await (await to.getFileHandle(name, { create: true })).createWritable();
      await w.write(await data.text());
      await w.close();
    }
    await removeDirAt(src);
  }
  async function moveDocs(id: string, newId: string): Promise<void> {
    const src = `${baseName(id)}.docs`;
    const dst = `${baseName(newId)}.docs`;
    if (!(await dirExists(src))) return;
    if (native) {
      await native.rename(src, dst);
      return;
    }
    await copySubtree(src, dst, true);
    await removeDirAt(src);
  }
  async function copyDocs(id: string, newId: string): Promise<void> {
    const src = `${baseName(id)}.docs`;
    if (!(await dirExists(src))) return;
    await copySubtree(src, `${baseName(newId)}.docs`, true);
  }

  return {
    async listFiles(): Promise<DriveFile[]> {
      const out: DriveFile[] = [];
      for await (const [name, handle] of (dir as any).entries()) {
        if ((handle as any).kind !== "file" || !name.endsWith(".bpmn")) continue;
        out.push(await toDriveFile(name));
      }
      return out;
    },
    async getMeta(id: string): Promise<DriveFile> {
      return toDriveFile(id);
    },
    async getXml(id: string): Promise<string> {
      return readTextAt(id);
    },
    async putXml(id: string, xml: string, editorName: string): Promise<{ version: string; headRevisionId: string | null }> {
      await snapshotExternal(id); // whatever is on disk right now must survive this write
      const stamped = stampExporter(xml, APP_EXPORTER); // published files self-describe their writer
      const mtime = await writeTextAt(id, stamped);
      await appendHistory(id, stamped, editorName);
      await prune(id);
      const version = String(mtime);
      lastWrites.set(id, version);
      return { version, headRevisionId: version };
    },
    async createFile(name: string, xml: string): Promise<DriveFile> {
      const id = name.endsWith(".bpmn") ? name : `${name}.bpmn`;
      await writeTextAt(id, stampExporter(xml, APP_EXPORTER));
      return toDriveFile(id);
    },
    snapshotExternal,
    async setLock(id: string, props: Record<string, string>): Promise<void> {
      const empty = Object.values(props).every((v) => v === "");
      if (empty) {
        await removeFileAt(`${id}.lock`);
        return;
      }
      await writeTextAt(`${id}.lock`, JSON.stringify(props));
    },
    async readSidecar(id: string, suffix: string): Promise<string | null> {
      try {
        return await readTextAt(`${baseName(id)}.${suffix}`);
      } catch {
        return null;
      }
    },
    async writeSidecar(id: string, suffix: string, text: string): Promise<void> {
      await writeTextAt(`${baseName(id)}.${suffix}`, text);
    },
    async readPath(rel: string): Promise<string | null> {
      try {
        return await readTextAt(rel);
      } catch {
        return null;
      }
    },
    async writePath(rel: string, text: string): Promise<void> {
      await writeTextAt(rel, text);
    },
    async deletePath(rel: string): Promise<void> {
      await removeFileAt(rel);
    },
    async listDir(rel: string): Promise<{ name: string; kind: "file" | "directory" }[]> {
      try {
        const d = await getDir(rel, false);
        const out: { name: string; kind: "file" | "directory" }[] = [];
        for await (const [name, h] of (d as any).entries()) out.push({ name, kind: (h as any).kind });
        return out;
      } catch (e) {
        if ((e as { name?: string })?.name === "NotFoundError") return []; // dir doesn't exist yet — normal
        throw e; // real enumeration/permission failure — surface it
      }
    },
    // ---- history API (covered by Task 5 tests) ----
    async listRevisions(id: string): Promise<Revision[]> {
      let hdir: FileSystemDirectoryHandle;
      try {
        hdir = await historyDir(id, false);
      } catch {
        return [];
      }
      return revisionsIn(hdir);
    },
    async getRevisionXml(id: string, rid: string): Promise<string> {
      const hdir = await historyDir(id, false);
      const found = await findRev(hdir, rid);
      if (!found) throw new Error(`revision not found: ${rid}`);
      return (await (await hdir.getFileHandle(found.name)).getFile()).text();
    },
    async setKeepForever(id: string, rid: string, keep: boolean): Promise<void> {
      const hdir = await historyDir(id, false);
      const found = await findRev(hdir, rid);
      if (!found || found.parsed.keep === keep) return;
      const data = await (await (await hdir.getFileHandle(found.name)).getFile()).text();
      const newName = `${rid}~${encodeURIComponent(found.parsed.author)}${keep ? ".keep" : ""}.bpmn`;
      const fh = await hdir.getFileHandle(newName, { create: true });
      const w = await fh.createWritable();
      await w.write(data);
      await w.close();
      await hdir.removeEntry(found.name);
    },
    async listTree(): Promise<TreeEntry[]> {
      const out: TreeEntry[] = [];
      async function walk(d: FileSystemDirectoryHandle, prefix: string): Promise<void> {
        for await (const [name, handle] of (d as any).entries()) {
          if (name === HISTORY_DIR || name === ".layer-templates" || name === "_bpmn-design") continue;
          const rel = prefix ? `${prefix}/${name}` : name;
          if ((handle as any).kind === "directory") {
            out.push({ path: rel, kind: "dir" });
            await walk(handle as FileSystemDirectoryHandle, rel);
          } else if (name.endsWith(".bpmn")) {
            out.push(await toEntry(rel));
          }
        }
      }
      await walk(dir, "");
      return out;
    },
    async createFolder(parentPath: string, name: string): Promise<void> {
      const rel = parentPath ? `${parentPath}/${name}` : name;
      let cur = dir;
      for (const seg of parts(rel)) cur = await cur.getDirectoryHandle(seg, { create: true });
    },
    async deleteFile(id: string): Promise<void> {
      await removeFileAt(id);
      await removeFileAt(`${baseName(id)}.layers.json`);
      await removeDirAt(`${baseName(id)}.docs`);
      await removeFileAt(`${id}.lock`);
      await removeDirAt(`${HISTORY_DIR}/${baseName(id)}`);
    },
    async renameFile(id: string, newName: string): Promise<string> {
      const newId = join(dirOf(id), ensureBpmn(newName));
      if (newId === id) return id;
      if (await exists(newId)) throw new Error("Ya existe «" + baseFileName(newId) + "»");
      await moveFileContent(id, newId);
      if (await exists(`${baseName(id)}.layers.json`)) await moveFileContent(`${baseName(id)}.layers.json`, `${baseName(newId)}.layers.json`);
      await moveDocs(id, newId);
      await moveHistory(id, newId);
      await removeFileAt(`${id}.lock`);
      return newId;
    },
    async moveFile(id: string, destFolder: string): Promise<string> {
      const newId = join(destFolder, baseFileName(id));
      if (newId === id) return id;
      if (await exists(newId)) throw new Error("Ya existe «" + baseFileName(newId) + "» en el destino");
      await moveFileContent(id, newId);
      if (await exists(`${baseName(id)}.layers.json`)) await moveFileContent(`${baseName(id)}.layers.json`, `${baseName(newId)}.layers.json`);
      await moveDocs(id, newId);
      await moveHistory(id, newId);
      await removeFileAt(`${id}.lock`);
      return newId;
    },
    async copyFile(id: string, destFolder: string, newName?: string): Promise<string> {
      const wanted = newName ? ensureBpmn(newName) : baseFileName(id);
      const finalName = await uniqueName(destFolder, wanted);
      const newId = join(destFolder, finalName);
      await copyFileContent(id, newId);
      if (await exists(`${baseName(id)}.layers.json`)) await copyFileContent(`${baseName(id)}.layers.json`, `${baseName(newId)}.layers.json`);
      await copyDocs(id, newId);
      return newId;
    },
    async duplicateFile(id: string): Promise<string> {
      const base = baseFileName(id).replace(/\.bpmn$/i, "");
      return this.copyFile(id, dirOf(id), `${base} copia`);
    },
    async moveFolder(path: string, destParent: string): Promise<string> {
      const name = baseFileName(path);
      const newPath = join(destParent, name);
      if (newPath !== path && (await dirExists(newPath))) throw new Error("Ya existe la carpeta «" + baseFileName(newPath) + "» en el destino");
      if (native) {
        await native.rename(path, newPath);
        if (await dirExists(`${HISTORY_DIR}/${path}`)) await native.rename(`${HISTORY_DIR}/${path}`, `${HISTORY_DIR}/${newPath}`);
      } else {
        await copySubtree(path, newPath, true);
        await removeDirAt(path);
        if (await dirExists(`${HISTORY_DIR}/${path}`)) {
          await copySubtree(`${HISTORY_DIR}/${path}`, `${HISTORY_DIR}/${newPath}`, true);
          await removeDirAt(`${HISTORY_DIR}/${path}`);
        }
      }
      return newPath;
    },
    async copyFolder(path: string, destParent: string): Promise<string> {
      const newPath = join(destParent, baseFileName(path));
      await copySubtree(path, newPath, false);
      return newPath;
    },
    async deleteFolder(path: string): Promise<void> {
      await removeDirAt(path);
      await removeDirAt(`${HISTORY_DIR}/${path}`);
    },
    async renameFolder(path: string, newName: string): Promise<string> {
      const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      const newPath = parent ? `${parent}/${newName}` : newName;
      if (newPath === path) return path;
      if (await dirExists(newPath)) throw new Error("Ya existe la carpeta «" + baseFileName(newPath) + "»");
      if (native) {
        await native.rename(path, newPath);
        if (await dirExists(`${HISTORY_DIR}/${path}`)) await native.rename(`${HISTORY_DIR}/${path}`, `${HISTORY_DIR}/${newPath}`);
      } else {
        await copySubtree(path, newPath, true);
        await removeDirAt(path);
        if (await dirExists(`${HISTORY_DIR}/${path}`)) {
          await copySubtree(`${HISTORY_DIR}/${path}`, `${HISTORY_DIR}/${newPath}`, true);
          await removeDirAt(`${HISTORY_DIR}/${path}`);
        }
      }
      return newPath;
    },
    async writeBinary(rel: string, data: Uint8Array): Promise<void> {
      if (nativeBin?.writeBinary) {
        const { bytesToBase64 } = await import("./processDocs/base64");
        await nativeBin.writeBinary(rel, bytesToBase64(data));
        return;
      }
      const { parent, name } = await resolveParent(rel, true);
      const fh = await parent.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(data as any);
      await w.close();
    },
    async readBinary(rel: string): Promise<Uint8Array | null> {
      try {
        if (nativeBin?.readBinary) {
          const b64 = await nativeBin.readBinary(rel);
          if (b64 == null) return null;
          const { base64ToBytes } = await import("./processDocs/base64");
          return base64ToBytes(b64);
        }
        const f = await statAt(rel);
        return new Uint8Array(await f.arrayBuffer());
      } catch {
        return null;
      }
    },
    // Move/rename an arbitrary file. Ensures the destination parent exists (native
    // rename won't create it). Prefers the native atomic rename; otherwise copies
    // bytes then deletes the source, so it is safe for binary source material.
    async movePath(fromRel: string, toRel: string): Promise<void> {
      const { parent, name } = await resolveParent(toRel, true); // creates dest dirs on both backends
      if (native) {
        await native.rename(fromRel, toRel);
        return;
      }
      const bytes = new Uint8Array(await (await statAt(fromRel)).arrayBuffer());
      const fh = await parent.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(bytes as any);
      await w.close();
      await removeFileAt(fromRel);
    },
    lastWrites,
    lastWriteVersion: (id: string) => lastWrites.get(id),
  };
}

export type FsClient = ReturnType<typeof createFsClient>;
