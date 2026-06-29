# Local Folder Sync Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the app into a self-contained static SPA that edits `.bpmn` files in a local folder (chosen via the File System Access API), with any external sync tool (Google Drive Desktop, OneDrive, Dropbox, Syncthing) propagating changes between PCs — no backend, no OAuth, no login.

**Architecture:** `apiClient` (talks to `/api/*`) is the only I/O layer; every other module is decoupled from how bytes arrive. We replace it with `fsClient` (same shape, backed by the File System Access API), add folder-access/diff modules, delete the Netlify backend and the password gate, and rewire `main.ts`. `version`/`headRevisionId` become the file mtime; locks become a sibling `<name>.lock` JSON file; history becomes a `.history/<name>/<rid>.bpmn` tree pruned by the existing exponential-decay retention.

**Tech Stack:** Vanilla TS + Vite (frontend, existing); File System Access API + IndexedDB (storage); `bpmn-js-differ` + `bpmn-moddle` (visual diff); Vitest + happy-dom (tests).

## Global Constraints

- No backend, no network calls, no env vars, no secrets. The app only reads/writes files in the user-chosen folder.
- Must run under a secure context; served on `localhost` (File System Access API requirement).
- `id` for a file IS its filename (e.g. `proceso.bpmn`); the app treats `id` opaquely.
- `version` = `headRevisionId` = `String(file.lastModified)` (epoch ms). The reused `watcher`/`state` compare these as opaque strings.
- Locks are advisory, best-effort (sync latency is real): a sibling `<id>.lock` JSON file `{ lockedBy, lockedByEmail, lockedByName, lockedAt }`. Empty-string props (from `clearProps()`) delete the lock.
- History lives in `.history/<baseName>/<rid>~<encodedAuthor>[.keep].bpmn`, where `rid` is an epoch-ms string and `.keep` marks `keepForever`. Retention prunes via `keepSet` from `src/history.ts`.
- Identity = typed display name (`src/identity.ts`), used as both `name` and `email` so `lockManager` is reused unchanged. No password.
- Reused UNCHANGED: `src/lockManager.ts`, `src/history.ts`, `src/watcher.ts`, `src/state.ts`, `src/editor.ts`, `src/identity.ts` (`ui.ts` gets two small additive functions).
- TDD: failing test → minimal impl → passing test → commit. Build gate after each task: `npm test`, `npm run typecheck`, `npm run build` all green.

## File Structure

```
package.json                 # MODIFY: drop googleapis/jsonwebtoken/@netlify/*; add bpmn-js-differ, bpmn-moddle, fake-indexeddb, @types/wicg-file-system-access
tsconfig.json                # MODIFY: include ["src"]; add "wicg-file-system-access" to types
netlify/ , netlify.toml      # DELETE (backend gone)
src/
  folderAccess.ts            # NEW: pick folder, persist handle in IndexedDB, re-grant permission
  fsClient.ts                # NEW: same interface as apiClient, backed by the File System Access API
  syncConflict.ts            # NEW (pure): detect sync-tool conflict filenames
  bpmnDiff.ts                # NEW (pure): compute added/removed/changed/layoutChanged between two BPMN XML
  diffView.ts                # NEW: canvas markers + fast-switch over the modeler
  diff.css                   # NEW: marker colors
  testHelpers/fakeDir.ts     # NEW: in-memory FileSystemDirectoryHandle fake for tests
  ui.ts                      # MODIFY: add renderSyncWarning + onDiff button in renderConflictBar
  main.ts                    # REWRITE: folder gate + identity + fsClient + diff wiring; remove gate/retention
  apiClient.ts , gate.ts , driveClient.ts (+ their .test.ts)  # DELETE (in Task 8, once main no longer imports them)
start.bat , start.sh         # NEW: double-click launchers (npx vite preview --open)
README.md                    # MODIFY: local-folder-sync setup + manual checklist
```

---

## Task 1: Toolchain — swap deps, drop backend, retarget tsconfig

**Files:**
- Modify: `package.json`, `tsconfig.json`
- Delete: `netlify/` (whole dir), `netlify.toml`

**Interfaces:**
- Produces: a frontend-only toolchain. `apiClient.ts`/`gate.ts` stay for now (still imported by `main.ts`), so the build stays green until Task 8.

- [ ] **Step 1: Remove backend deps, add frontend deps**

```bash
npm uninstall googleapis jsonwebtoken @netlify/functions @types/jsonwebtoken
npm install bpmn-js-differ bpmn-moddle
npm install -D fake-indexeddb @types/wicg-file-system-access
```

- [ ] **Step 2: Delete the Netlify backend**

```bash
git rm -r netlify netlify.toml
```

- [ ] **Step 3: Replace `tsconfig.json` (whole file)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "vitest/globals", "node", "wicg-file-system-access"],
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "esModuleInterop": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Verify gates still pass**

Run: `npm test && npm run typecheck && npm run build`
Expected: src tests pass (netlify tests gone), no type errors, build succeeds. `main.ts` still references `apiClient`/`gate` — that's fine; they still exist.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: frontend-only toolchain (drop netlify/googleapis/jwt; add diff + fs deps)"
```

---

## Task 2: Folder access (`folderAccess.ts`)

**Files:**
- Create: `src/folderAccess.ts`, `src/folderAccess.test.ts`

**Interfaces:**
- Produces:
  - `loadSavedDir(): Promise<FileSystemDirectoryHandle | null>` — handle persisted in IndexedDB, or null.
  - `saveDir(handle: FileSystemDirectoryHandle): Promise<void>`
  - `pickDir(): Promise<FileSystemDirectoryHandle>` — `showDirectoryPicker({mode:"readwrite"})`, then `saveDir`.
  - `ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean>` — query, else request, `readwrite`.

- [ ] **Step 1: Write the failing test `src/folderAccess.test.ts`**

```ts
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadSavedDir, saveDir, pickDir, ensurePermission } from "./folderAccess";

function fakeHandle(perm: "granted" | "prompt" | "denied" = "granted") {
  return {
    kind: "directory",
    name: "folder",
    queryPermission: vi.fn().mockResolvedValue(perm),
    requestPermission: vi.fn().mockResolvedValue("granted"),
  } as any;
}

describe("folderAccess", () => {
  beforeEach(() => {
    indexedDB.deleteDatabase("bpmn-compartida");
    vi.restoreAllMocks();
  });

  it("returns null when nothing saved", async () => {
    expect(await loadSavedDir()).toBeNull();
  });

  it("persists and reloads a handle", async () => {
    const h = fakeHandle();
    await saveDir(h);
    const got = await loadSavedDir();
    expect((got as any)?.name).toBe("folder");
  });

  it("pickDir stores the chosen handle", async () => {
    const h = fakeHandle();
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(h));
    const picked = await pickDir();
    expect((picked as any).name).toBe("folder");
    expect((await loadSavedDir() as any)?.name).toBe("folder");
  });

  it("ensurePermission returns true when already granted", async () => {
    const h = fakeHandle("granted");
    expect(await ensurePermission(h)).toBe(true);
    expect(h.requestPermission).not.toHaveBeenCalled();
  });

  it("ensurePermission requests when prompt, then true", async () => {
    const h = fakeHandle("prompt");
    expect(await ensurePermission(h)).toBe(true);
    expect(h.requestPermission).toHaveBeenCalledWith({ mode: "readwrite" });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/folderAccess.test.ts`
Expected: FAIL — cannot find module `./folderAccess`.

- [ ] **Step 3: Write `src/folderAccess.ts`**

```ts
const DB_NAME = "bpmn-compartida";
const STORE = "handles";
const KEY = "dir";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function loadSavedDir(): Promise<FileSystemDirectoryHandle | null> {
  const h = await idb<FileSystemDirectoryHandle | undefined>("readonly", (s) => s.get(KEY));
  return h ?? null;
}

export async function saveDir(handle: FileSystemDirectoryHandle): Promise<void> {
  await idb("readwrite", (s) => s.put(handle, KEY));
}

export async function pickDir(): Promise<FileSystemDirectoryHandle> {
  const handle = await showDirectoryPicker({ mode: "readwrite" });
  await saveDir(handle);
  return handle;
}

export async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts = { mode: "readwrite" } as const;
  if ((await handle.queryPermission(opts)) === "granted") return true;
  return (await handle.requestPermission(opts)) === "granted";
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/folderAccess.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/folderAccess.ts src/folderAccess.test.ts
git commit -m "feat: folder access (pick, persist handle in IndexedDB, re-grant permission)"
```

---

## Task 3: Sync-conflict detection + warning UI (`syncConflict.ts`, `ui.ts`)

**Files:**
- Create: `src/syncConflict.ts`, `src/syncConflict.test.ts`
- Modify: `src/ui.ts`, `src/ui.test.ts`

**Interfaces:**
- Produces:
  - `isSyncConflict(name: string): boolean` — true for common sync-tool conflict filenames.
  - `renderSyncWarning(container: HTMLElement, names: string[]): void` — renders a warning banner (or clears it when `names` is empty).

- [ ] **Step 1: Write the failing test `src/syncConflict.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { isSyncConflict } from "./syncConflict";

describe("isSyncConflict", () => {
  it("flags Drive/OS '(1)' duplicates", () => {
    expect(isSyncConflict("proceso (1).bpmn")).toBe(true);
  });
  it("flags Syncthing conflicts", () => {
    expect(isSyncConflict("proceso.sync-conflict-20260626-PC.bpmn")).toBe(true);
  });
  it("flags OneDrive '-PCNAME' conflicts", () => {
    expect(isSyncConflict("proceso-DESKTOP-A1B2C3.bpmn")).toBe(true);
  });
  it("flags Spanish 'conflicto'", () => {
    expect(isSyncConflict("proceso-conflicto.bpmn")).toBe(true);
  });
  it("does not flag a normal name", () => {
    expect(isSyncConflict("proceso.bpmn")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/syncConflict.test.ts`
Expected: FAIL — cannot find module `./syncConflict`.

- [ ] **Step 3: Write `src/syncConflict.ts`**

```ts
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
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/syncConflict.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Add the failing test for `renderSyncWarning` to `src/ui.test.ts`**

Append this block inside `src/ui.test.ts` (keep existing imports; add `renderSyncWarning` to the import from `./ui`):

```ts
import { renderSyncWarning } from "./ui";

describe("renderSyncWarning", () => {
  it("shows the conflicting names", () => {
    const el = document.createElement("div");
    renderSyncWarning(el, ["proceso (1).bpmn"]);
    expect(el.textContent).toContain("proceso (1).bpmn");
    expect(el.querySelector(".sync-warning")).not.toBeNull();
  });
  it("clears when there are none", () => {
    const el = document.createElement("div");
    renderSyncWarning(el, ["x"]);
    renderSyncWarning(el, []);
    expect(el.innerHTML).toBe("");
  });
});
```

- [ ] **Step 6: Run it — expect FAIL**

Run: `npx vitest run src/ui.test.ts`
Expected: FAIL — `renderSyncWarning` is not exported.

- [ ] **Step 7: Add `renderSyncWarning` to `src/ui.ts`** (append at end of file)

```ts
export function renderSyncWarning(container: HTMLElement, names: string[]): void {
  container.innerHTML = "";
  if (names.length === 0) return;
  const bar = document.createElement("div");
  bar.className = "sync-warning";
  bar.textContent = `⚠ Archivos en conflicto de sincronización (resolvé a mano): ${names.join(", ")}`;
  container.appendChild(bar);
}
```

- [ ] **Step 8: Run it — expect PASS**

Run: `npx vitest run src/ui.test.ts src/syncConflict.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/syncConflict.ts src/syncConflict.test.ts src/ui.ts src/ui.test.ts
git commit -m "feat: detect sync-tool conflict files and surface a warning banner"
```

---

## Task 4: FS client — files, meta, xml, locks (`fsClient.ts` part 1)

**Files:**
- Create: `src/testHelpers/fakeDir.ts`, `src/fsClient.ts`, `src/fsClient.test.ts`

**Interfaces:**
- Consumes: `DriveFile`, `Revision` from `./types`; `keepSet` from `./history` (used in Task 5).
- Produces: `createFsClient(dir: FileSystemDirectoryHandle, now?: () => number)` returning at least
  `listFiles()`, `getMeta(id)`, `getXml(id)`, `putXml(id, xml, editorName)`, `createFile(name, xml)`,
  `setLock(id, props)`, `lastWrites`, `lastWriteVersion(id)`. (History methods added in Task 5.)
  `version` = `headRevisionId` = `String(file.lastModified)`.

- [ ] **Step 1: Write the in-memory fake `src/testHelpers/fakeDir.ts`**

```ts
// Minimal in-memory implementation of the FileSystemDirectoryHandle subset fsClient uses.
function notFound(name: string): Error {
  const e = new Error(`NotFoundError: ${name}`);
  e.name = "NotFoundError";
  return e;
}

export function createFakeDir(): FileSystemDirectoryHandle & { _files: Map<string, { data: string; mtime: number }> } {
  const files = new Map<string, { data: string; mtime: number }>();
  const dirs = new Map<string, ReturnType<typeof createFakeDir>>();
  let clock = 1;

  function fileHandle(name: string, rec: { data: string; mtime: number }): any {
    return {
      kind: "file",
      name,
      async getFile() {
        return {
          name,
          lastModified: rec.mtime,
          size: rec.data.length,
          async text() {
            return rec.data;
          },
        };
      },
      async createWritable() {
        let buf = "";
        return {
          async write(chunk: string) {
            buf += chunk;
          },
          async close() {
            rec.data = buf;
            rec.mtime = ++clock;
          },
        };
      },
    };
  }

  const self: any = {
    kind: "directory",
    name: "fake",
    _files: files,
    async *entries() {
      for (const [name, rec] of files) yield [name, fileHandle(name, rec)];
      for (const [name, d] of dirs) yield [name, d];
    },
    async getFileHandle(name: string, opts?: { create?: boolean }) {
      let rec = files.get(name);
      if (!rec) {
        if (!opts?.create) throw notFound(name);
        rec = { data: "", mtime: ++clock };
        files.set(name, rec);
      }
      return fileHandle(name, rec);
    },
    async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
      let d = dirs.get(name);
      if (!d) {
        if (!opts?.create) throw notFound(name);
        d = createFakeDir();
        dirs.set(name, d);
      }
      return d;
    },
    async removeEntry(name: string) {
      files.delete(name);
      dirs.delete(name);
    },
  };
  return self;
}

export async function seedFile(dir: FileSystemDirectoryHandle, name: string, data: string): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}
```

- [ ] **Step 2: Write the failing test `src/fsClient.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createFsClient } from "./fsClient";
import { createFakeDir, seedFile } from "./testHelpers/fakeDir";

let dir: ReturnType<typeof createFakeDir>;
let fs: ReturnType<typeof createFsClient>;

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
```

- [ ] **Step 3: Run it — expect FAIL**

Run: `npx vitest run src/fsClient.test.ts`
Expected: FAIL — cannot find module `./fsClient`.

- [ ] **Step 4: Write `src/fsClient.ts`** (history methods are stubbed here and filled in Task 5)

```ts
import type { DriveFile, Revision } from "./types";
import { keepSet } from "./history";

const HISTORY_DIR = ".history";

function baseName(id: string): string {
  return id.replace(/\.bpmn$/i, "");
}

export function createFsClient(dir: FileSystemDirectoryHandle, now: () => number = () => Date.now()) {
  const lastWrites = new Map<string, string>();

  async function stat(name: string): Promise<File> {
    const fh = await dir.getFileHandle(name);
    return fh.getFile();
  }
  async function readText(name: string): Promise<string> {
    return (await stat(name)).text();
  }
  async function writeText(name: string, data: string): Promise<number> {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(data);
    await w.close();
    return (await fh.getFile()).lastModified;
  }
  async function readLockProps(id: string): Promise<Record<string, string>> {
    try {
      const j = JSON.parse(await readText(`${id}.lock`));
      return {
        lockedBy: j.lockedBy ?? "",
        lockedByEmail: j.lockedByEmail ?? "",
        lockedByName: j.lockedByName ?? "",
        lockedAt: j.lockedAt ?? "",
      };
    } catch {
      return {};
    }
  }
  async function toDriveFile(id: string): Promise<DriveFile> {
    const f = await stat(id);
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
    const root = await dir.getDirectoryHandle(HISTORY_DIR, { create });
    return root.getDirectoryHandle(baseName(id), { create });
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
  async function appendHistory(id: string, xml: string, editorName: string): Promise<string> {
    const hdir = await historyDir(id, true);
    let rid = now();
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
      return readText(id);
    },
    async putXml(id: string, xml: string, editorName: string): Promise<{ version: string; headRevisionId: string | null }> {
      const mtime = await writeText(id, xml);
      await appendHistory(id, xml, editorName);
      await prune(id);
      const version = String(mtime);
      lastWrites.set(id, version);
      return { version, headRevisionId: version };
    },
    async createFile(name: string, xml: string): Promise<DriveFile> {
      const id = name.endsWith(".bpmn") ? name : `${name}.bpmn`;
      await writeText(id, xml);
      return toDriveFile(id);
    },
    async setLock(id: string, props: Record<string, string>): Promise<void> {
      const empty = Object.values(props).every((v) => v === "");
      if (empty) {
        try {
          await dir.removeEntry(`${id}.lock`);
        } catch {
          /* already absent */
        }
        return;
      }
      await writeText(`${id}.lock`, JSON.stringify(props));
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
    lastWrites,
    lastWriteVersion: (id: string) => lastWrites.get(id),
  };
}

export type FsClient = ReturnType<typeof createFsClient>;
```

- [ ] **Step 5: Run it — expect PASS**

Run: `npx vitest run src/fsClient.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/fsClient.ts src/fsClient.test.ts src/testHelpers/fakeDir.ts
git commit -m "feat: fsClient — files, meta, xml, advisory locks over File System Access API"
```

---

## Task 5: FS client — history + retention (`fsClient.ts` part 2)

**Files:**
- Modify (test only): `src/fsClient.test.ts` (the history methods were already implemented in Task 4; this task proves them and the retention prune)

**Interfaces:**
- Consumes: `createFsClient` from Task 4; `keepSet` from `./history`.
- Produces: verified `listRevisions(id)`, `getRevisionXml(id, rid)`, `setKeepForever(id, rid, keep)`, and prune-on-`putXml`.

- [ ] **Step 1: Add the failing history tests to `src/fsClient.test.ts`** (append a new describe block)

```ts
describe("fsClient history + retention", () => {
  it("putXml creates a revision readable by listRevisions/getRevisionXml", async () => {
    const res = await fs.putXml("proceso.bpmn", "<v1/>", "Ana");
    const revs = await fs.listRevisions("proceso.bpmn");
    expect(revs).toHaveLength(1);
    expect(revs[0].lastModifyingUser?.displayName).toBe("Ana");
    expect(await fs.getRevisionXml("proceso.bpmn", revs[0].id)).toBe("<v1/>");
    expect(res.version).toMatch(/^\d+$/);
  });

  it("setKeepForever toggles the keep flag (and survives renaming)", async () => {
    await fs.putXml("proceso.bpmn", "<v1/>", "Ana");
    const [rev] = await fs.listRevisions("proceso.bpmn");
    await fs.setKeepForever("proceso.bpmn", rev.id, true);
    expect((await fs.listRevisions("proceso.bpmn"))[0].keepForever).toBe(true);
    expect(await fs.getRevisionXml("proceso.bpmn", rev.id)).toBe("<v1/>");
    await fs.setKeepForever("proceso.bpmn", rev.id, false);
    expect((await fs.listRevisions("proceso.bpmn"))[0].keepForever).toBe(false);
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
});
```

- [ ] **Step 2: Run it — expect PASS** (implementation already exists from Task 4)

Run: `npx vitest run src/fsClient.test.ts`
Expected: PASS (all fsClient tests, including the 3 new ones).

> If any history test fails, fix `src/fsClient.ts` history helpers (`appendHistory`, `revisionsIn`, `findRev`, `prune`, `setKeepForever`) until green — do not change the tests.

- [ ] **Step 3: Commit**

```bash
git add src/fsClient.test.ts
git commit -m "test: fsClient history listing, keepForever rename, decay prune"
```

---

## Task 6: BPMN diff compute (`bpmnDiff.ts`)

**Files:**
- Create: `src/bpmnDiff.ts`, `src/bpmnDiff.test.ts`

**Interfaces:**
- Consumes: `bpmn-moddle`, `bpmn-js-differ`.
- Produces:
  - `interface BpmnChanges { added: string[]; removed: string[]; changed: string[]; layoutChanged: string[] }`
  - `computeDiff(oldXml: string, newXml: string): Promise<BpmnChanges>` — element ids per bucket.

- [ ] **Step 1: Write the failing test `src/bpmnDiff.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { computeDiff } from "./bpmnDiff";

const base = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1"><bpmn:task id="Task_1" name="A"/></bpmn:process>
</bpmn:definitions>`;

const withAdded = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1"><bpmn:task id="Task_1" name="A"/><bpmn:task id="Task_2" name="B"/></bpmn:process>
</bpmn:definitions>`;

const withRenamed = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1"><bpmn:task id="Task_1" name="A-renamed"/></bpmn:process>
</bpmn:definitions>`;

describe("computeDiff", () => {
  it("detects an added element", async () => {
    const d = await computeDiff(base, withAdded);
    expect(d.added).toContain("Task_2");
    expect(d.removed).toHaveLength(0);
  });
  it("detects a removed element", async () => {
    const d = await computeDiff(withAdded, base);
    expect(d.removed).toContain("Task_2");
  });
  it("detects a changed element", async () => {
    const d = await computeDiff(base, withRenamed);
    expect(d.changed).toContain("Task_1");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/bpmnDiff.test.ts`
Expected: FAIL — cannot find module `./bpmnDiff`.

- [ ] **Step 3: Write `src/bpmnDiff.ts`**

```ts
import BpmnModdle from "bpmn-moddle";
// bpmn-js-differ ships without types; declare the minimal surface we use.
// @ts-expect-error no type declarations published
import { diff } from "bpmn-js-differ";

export interface BpmnChanges {
  added: string[];
  removed: string[];
  changed: string[];
  layoutChanged: string[];
}

export async function computeDiff(oldXml: string, newXml: string): Promise<BpmnChanges> {
  const moddle = new BpmnModdle();
  const a = (await moddle.fromXML(oldXml)).rootElement;
  const b = (await moddle.fromXML(newXml)).rootElement;
  const r = diff(a, b) as {
    _added?: Record<string, unknown>;
    _removed?: Record<string, unknown>;
    _changed?: Record<string, unknown>;
    _layoutChanged?: Record<string, unknown>;
  };
  return {
    added: Object.keys(r._added ?? {}),
    removed: Object.keys(r._removed ?? {}),
    changed: Object.keys(r._changed ?? {}),
    layoutChanged: Object.keys(r._layoutChanged ?? {}),
  };
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/bpmnDiff.test.ts`
Expected: PASS (3 tests).

> If `moddle.fromXML` typing complains, ensure `bpmn-moddle` resolved; `skipLibCheck` covers its internal types. If `diff` import fails at runtime, confirm `bpmn-js-differ` is installed (Task 1).

- [ ] **Step 5: Commit**

```bash
git add src/bpmnDiff.ts src/bpmnDiff.test.ts
git commit -m "feat: semantic BPMN diff (added/removed/changed) via bpmn-js-differ"
```

---

## Task 7: Diff view — markers + fast-switch (`diffView.ts`, `diff.css`)

**Files:**
- Create: `src/diffView.ts`, `src/diffView.test.ts`, `src/diff.css`

**Interfaces:**
- Consumes: `ModelerLike`, `Editor` from `./editor`; `BpmnChanges` from `./bpmnDiff`.
- Produces: `createDiffView(modeler: ModelerLike, editor: Editor)` returning
  `show(mineXml, theirXml, changes)`, `toggle(): Promise<"mine"|"theirs">`, `showing(): "mine"|"theirs"`, `isActive(): boolean`, `close()`.
  Markers via `modeler.get("canvas").addMarker/removeMarker`. When showing "mine": mark `removed`+`changed`; when "theirs": mark `added`+`changed`.

- [ ] **Step 1: Write the failing test `src/diffView.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { createEditor, type ModelerLike } from "./editor";
import { createDiffView } from "./diffView";
import type { BpmnChanges } from "./bpmnDiff";

function fakeModeler() {
  const added: Array<[string, string]> = [];
  const removed: Array<[string, string]> = [];
  const canvas = {
    addMarker: (id: string, cls: string) => added.push([id, cls]),
    removeMarker: (id: string, cls: string) => removed.push([id, cls]),
  };
  const modeler: ModelerLike = {
    async importXML() {
      return {};
    },
    async saveXML() {
      return { xml: "<x/>" };
    },
    on() {},
    get(name: string) {
      if (name === "canvas") return canvas;
      return undefined;
    },
  };
  return { modeler, added, removed };
}

const changes: BpmnChanges = { added: ["A"], removed: ["R"], changed: ["C"], layoutChanged: [] };

describe("diffView", () => {
  it("marks removed+changed when showing mine", async () => {
    const { modeler, added } = fakeModeler();
    const view = createDiffView(modeler, createEditor(modeler));
    await view.show("<mine/>", "<their/>", changes);
    expect(view.showing()).toBe("mine");
    expect(added).toEqual(expect.arrayContaining([["R", "diff-removed"], ["C", "diff-changed"]]));
    expect(added.find(([id]) => id === "A")).toBeUndefined();
  });

  it("toggle switches to theirs and marks added+changed", async () => {
    const { modeler, added } = fakeModeler();
    const view = createDiffView(modeler, createEditor(modeler));
    await view.show("<mine/>", "<their/>", changes);
    added.length = 0;
    const now = await view.toggle();
    expect(now).toBe("theirs");
    expect(added).toEqual(expect.arrayContaining([["A", "diff-added"], ["C", "diff-changed"]]));
    expect(added.find(([id]) => id === "R")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/diffView.test.ts`
Expected: FAIL — cannot find module `./diffView`.

- [ ] **Step 3: Write `src/diffView.ts`**

```ts
import type { ModelerLike, Editor } from "./editor";
import type { BpmnChanges } from "./bpmnDiff";

const CLS = { added: "diff-added", removed: "diff-removed", changed: "diff-changed" };

export function createDiffView(modeler: ModelerLike, editor: Editor) {
  let active = false;
  let mineXml = "";
  let theirXml = "";
  let changes: BpmnChanges = { added: [], removed: [], changed: [], layoutChanged: [] };
  let showing: "mine" | "theirs" = "mine";
  let marked: string[] = [];

  const canvas = () => modeler.get("canvas");

  function clearMarkers() {
    const c = canvas();
    if (c) {
      for (const id of marked) {
        try {
          c.removeMarker(id, CLS.added);
          c.removeMarker(id, CLS.removed);
          c.removeMarker(id, CLS.changed);
        } catch {
          /* element not present in this version */
        }
      }
    }
    marked = [];
  }

  function applyMarkers() {
    clearMarkers();
    const c = canvas();
    if (!c) return;
    const add = (ids: string[], cls: string) => {
      for (const id of ids) {
        try {
          c.addMarker(id, cls);
          marked.push(id);
        } catch {
          /* element not present in this version */
        }
      }
    };
    if (showing === "mine") {
      add(changes.removed, CLS.removed);
      add(changes.changed, CLS.changed);
    } else {
      add(changes.added, CLS.added);
      add(changes.changed, CLS.changed);
    }
  }

  return {
    async show(mine: string, their: string, ch: BpmnChanges): Promise<void> {
      active = true;
      mineXml = mine;
      theirXml = their;
      changes = ch;
      showing = "mine";
      await editor.load(mineXml);
      editor.setReadOnly(true);
      applyMarkers();
    },
    async toggle(): Promise<"mine" | "theirs"> {
      if (!active) return showing;
      showing = showing === "mine" ? "theirs" : "mine";
      await editor.load(showing === "mine" ? mineXml : theirXml);
      editor.setReadOnly(true);
      applyMarkers();
      return showing;
    },
    showing: () => showing,
    isActive: () => active,
    async close(): Promise<void> {
      active = false;
      clearMarkers();
    },
  };
}

export type DiffView = ReturnType<typeof createDiffView>;
```

- [ ] **Step 4: Write `src/diff.css`**

```css
.diff-added .djs-visual > :nth-child(1) { stroke: #16a34a !important; stroke-width: 3px !important; }
.diff-removed .djs-visual > :nth-child(1) { stroke: #dc2626 !important; stroke-width: 3px !important; stroke-dasharray: 4 !important; }
.diff-changed .djs-visual > :nth-child(1) { stroke: #d97706 !important; stroke-width: 3px !important; }
.sync-warning { background: #fde68a; color: #92400e; padding: 6px 10px; font-size: 13px; }
.conflict-bar { background: #fee2e2; color: #991b1b; padding: 6px 10px; }
```

- [ ] **Step 5: Run it — expect PASS**

Run: `npx vitest run src/diffView.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/diffView.ts src/diffView.test.ts src/diff.css
git commit -m "feat: diff view — canvas markers + fast-switch between mine/theirs"
```

---

## Task 8: Rewire `main.ts`; extend conflict bar; delete dead modules

**Files:**
- Modify: `src/ui.ts`, `src/ui.test.ts` (add optional `onDiff` to `renderConflictBar`)
- Rewrite: `src/main.ts`
- Delete: `src/apiClient.ts`, `src/apiClient.test.ts`, `src/gate.ts`, `src/gate.test.ts`, `src/driveClient.ts`, `src/driveClient.test.ts`

**Interfaces:**
- Consumes: everything built above plus reused `editor`, `ui`, `state`, `lockManager`, `history`, `watcher`, `identity`.
- Produces: the composition root. No new exports. Validated by typecheck + build + the manual checklist (Task 9). `main.ts` is not unit-tested (DOM/modeler composition).

- [ ] **Step 1: Extend `renderConflictBar` — add the failing test to `src/ui.test.ts`**

```ts
import { renderConflictBar } from "./ui";

describe("renderConflictBar onDiff", () => {
  it("renders a 'Ver diferencias' button when onDiff is given", () => {
    const el = document.createElement("div");
    let clicked = false;
    renderConflictBar(el, { onDiscard() {}, onKeepMine() {}, onDiff() { clicked = true; } });
    const btn = el.querySelector<HTMLButtonElement>("[data-diff]");
    expect(btn).not.toBeNull();
    btn!.click();
    expect(clicked).toBe(true);
  });
  it("omits the button when onDiff is absent", () => {
    const el = document.createElement("div");
    renderConflictBar(el, { onDiscard() {}, onKeepMine() {} });
    expect(el.querySelector("[data-diff]")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/ui.test.ts`
Expected: FAIL — `onDiff` not supported.

- [ ] **Step 3: Update `renderConflictBar` in `src/ui.ts`** (replace the existing function)

```ts
export function renderConflictBar(
  container: HTMLElement,
  handlers: { onDiscard: () => void; onKeepMine: () => void; onDiff?: () => void },
): void {
  container.innerHTML = "";
  const bar = document.createElement("div");
  bar.className = "conflict-bar";
  bar.textContent = "Este diagrama cambió por fuera. ";

  if (handlers.onDiff) {
    const diff = document.createElement("button");
    diff.textContent = "Ver diferencias";
    diff.dataset.diff = "1";
    diff.addEventListener("click", handlers.onDiff);
    bar.appendChild(diff);
  }

  const discard = document.createElement("button");
  discard.textContent = "Descartar lo mío y recargar";
  discard.dataset.discard = "1";
  discard.addEventListener("click", handlers.onDiscard);
  bar.appendChild(discard);

  const keep = document.createElement("button");
  keep.textContent = "Conservar lo mío";
  keep.dataset.keepMine = "1";
  keep.addEventListener("click", handlers.onKeepMine);
  bar.appendChild(keep);

  container.appendChild(bar);
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/ui.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Rewrite `src/main.ts` (whole file)**

```ts
// bpmn-js styles bundled from the npm package (no CDN, version-locked).
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";
import "./diff.css";

import { createFsClient, type FsClient } from "./fsClient";
import { loadSavedDir, pickDir, ensurePermission } from "./folderAccess";
import { createEditor, createBpmnModeler, type ModelerLike } from "./editor";
import { getName, setName } from "./identity";
import { reduce, initialState, type AppState } from "./state";
import { readLock, lockState, lockProps, clearProps, canCheckOut } from "./lockManager";
import { classifyChange } from "./watcher";
import { computeDiff } from "./bpmnDiff";
import { createDiffView, type DiffView } from "./diffView";
import { isSyncConflict } from "./syncConflict";
import type { User } from "./types";
import {
  renderFileList,
  renderHistoryPanel,
  renderConflictBar,
  renderSyncWarning,
  toRestorePoint,
  showToast,
} from "./ui";

const EMPTY_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false" />
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1" />
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

async function bootstrap() {
  const root = document.getElementById("app")!;

  let api: FsClient;
  let state: AppState = initialState;
  let me: User = { name: "", email: "" };
  let openHeadRevisionId: string | null = null;
  let forceOverwrite = false;
  let pollTimer: number | null = null;
  let editor: ReturnType<typeof createEditor>;
  let diffView: DiffView;

  function guard(fn: () => Promise<void>) {
    return () => fn().catch(onError);
  }
  function onError(e: unknown) {
    if ((e as any)?.name === "NotAllowedError" || (e as any)?.name === "SecurityError") {
      showToast("Se perdió el permiso de la carpeta — elegila de nuevo");
      showFolderGate();
      return;
    }
    showToast(String((e as any)?.message ?? e));
  }

  // ---- Folder gate ----
  function showFolderGate() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    root.innerHTML = `
      <main class="gate">
        <h2>BPMN compartida</h2>
        <p>Elegí la carpeta sincronizada que contiene los diagramas .bpmn.</p>
        <button id="pick">Elegir carpeta</button>
      </main>`;
    document.getElementById("pick")!.addEventListener("click", () => {
      void (async () => {
        const dir = await pickDir();
        if (await ensurePermission(dir)) {
          api = createFsClient(dir);
          ensureNameThenApp();
        } else {
          showToast("Sin permiso no puedo leer la carpeta");
        }
      })().catch(onError);
    });
  }

  // ---- Identity ----
  function ensureNameThenApp() {
    let name = getName();
    if (!name) {
      name = (prompt("¿Tu nombre? (se muestra en los bloqueos y el historial)") ?? "").trim();
      if (!name) {
        showToast("Necesitás un nombre para editar");
        return;
      }
      setName(name);
    }
    me = { name, email: name }; // typed name is the identity key (reuses lockManager)
    void startApp().catch(onError);
  }

  // ---- App shell ----
  async function startApp() {
    root.innerHTML = `
      <header>
        <span id="who"></span>
        <button id="newfile">Nuevo diagrama</button>
        <button id="changedir">Cambiar carpeta</button>
      </header>
      <div id="sync"></div>
      <div id="conflict"></div>
      <main>
        <aside id="files"></aside>
        <section id="canvas" style="height:80vh"></section>
        <aside id="history" hidden></aside>
      </main>
      <footer>
        <button id="save" hidden>Guardar</button>
        <button id="checkin" hidden>Check in</button>
        <button id="close" hidden>Cerrar</button>
      </footer>`;
    const $ = (id: string) => document.getElementById(id)!;
    $("who").textContent = me.name;

    const modeler = (await createBpmnModeler($("canvas") as HTMLElement)) as ModelerLike;
    editor = createEditor(modeler);
    diffView = createDiffView(modeler, editor);
    editor.onDirtyChange((dirty) => {
      state = reduce(state, { type: "dirtyChanged", dirty });
    });

    $("newfile").addEventListener("click", guard(newDiagram));
    $("changedir").addEventListener("click", () => showFolderGate());
    $("save").addEventListener("click", guard(async () => {
      if (state.kind === "editing") await save(state.fileId);
    }));
    $("checkin").addEventListener("click", guard(async () => {
      if (state.kind === "editing") await checkIn(state.fileId);
    }));
    $("close").addEventListener("click", guard(async () => {
      if (state.kind === "editing" && state.lock === "mine") await checkIn(state.fileId);
      else dispatch({ type: "closedFile" });
    }));

    // Fast-switch: press "d" to blink between mine/theirs while a diff is shown.
    window.addEventListener("keydown", (ev) => {
      if (ev.key.toLowerCase() !== "d" || !diffView.isActive()) return;
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      void diffView.toggle().then((showing) =>
        showToast(showing === "mine" ? "Mostrando tu versión" : "Mostrando la versión externa"),
      );
    });

    dispatch({ type: "signedIn" });
    dispatch({ type: "folderSelected", folderId: "local" });
    await refreshFileList();
    pollTimer = window.setInterval(() => void pollChanges().catch(onError), 7000);
  }

  function dispatch(event: Parameters<typeof reduce>[1]) {
    state = reduce(state, event);
    render();
  }

  function render() {
    const editing = state.kind === "editing";
    const el = (id: string) => document.getElementById(id);
    if (el("save")) (el("save") as HTMLElement).hidden = !editing || (state.kind === "editing" && state.lock !== "mine");
    if (el("checkin")) (el("checkin") as HTMLElement).hidden = !editing || (state.kind === "editing" && state.lock !== "mine");
    if (el("close")) (el("close") as HTMLElement).hidden = !editing;
    if (!editing) {
      if (el("history")) (el("history") as HTMLElement).hidden = true;
      if (el("conflict")) (el("conflict") as HTMLElement).innerHTML = "";
    }
  }

  async function refreshFileList() {
    const all = await api.listFiles();
    const conflicts = all.filter((f) => isSyncConflict(f.name));
    const clean = all.filter((f) => !isSyncConflict(f.name));
    renderSyncWarning(document.getElementById("sync")!, conflicts.map((f) => f.name));
    renderFileList(document.getElementById("files")!, clean, me, {
      onOpen: (id) => void openFile(id).catch(onError),
      onSteal: (id) => void steal(id).catch(onError),
    });
  }

  async function openFile(fileId: string) {
    let meta;
    try {
      meta = await api.getMeta(fileId);
    } catch {
      await refreshFileList();
      return;
    }
    const lock = readLock(meta);
    let lockKind = lockState(lock, me);
    if (canCheckOut(lock, me)) {
      await api.setLock(fileId, lockProps(me, new Date().toISOString()));
      const after = await api.getMeta(fileId);
      lockKind = lockState(readLock(after), me);
      if (lockKind !== "mine") showToast("Otra persona lo tomó — abriendo en solo lectura");
    }
    const xml = await api.getXml(fileId);
    await editor.load(xml);
    editor.setReadOnly(lockKind !== "mine");
    openHeadRevisionId = meta.headRevisionId ?? null;
    forceOverwrite = false;
    dispatch({ type: "openedFile", fileId, lock: lockKind });
    await loadHistory(fileId);
  }

  async function steal(fileId: string) {
    if (!confirm("¿Robar el bloqueo? La otra persona podría perder cambios sin guardar.")) return;
    await api.setLock(fileId, clearProps());
    await refreshFileList();
  }

  async function save(fileId: string) {
    if (!forceOverwrite && openHeadRevisionId !== null) {
      const meta = await api.getMeta(fileId);
      if (meta && meta.headRevisionId !== openHeadRevisionId) {
        dispatch({ type: "externalChange" });
        await showConflictBar(fileId);
        return;
      }
    }
    const xml = await editor.getXml();
    const res = await api.putXml(fileId, xml, me.name);
    openHeadRevisionId = res.headRevisionId ?? openHeadRevisionId;
    forceOverwrite = false;
    editor.markSaved();
    dispatch({ type: "dirtyChanged", dirty: false });
    // Retention/prune runs inside fsClient.putXml (decay = deletion); nothing to do here.
    await loadHistory(fileId);
    showToast("Guardado");
  }

  async function checkIn(fileId: string) {
    if (state.kind === "editing" && state.dirty) await save(fileId);
    await api.setLock(fileId, clearProps());
    dispatch({ type: "closedFile" });
    await refreshFileList();
  }

  async function loadHistory(fileId: string) {
    const revs = await api.listRevisions(fileId);
    const points = revs
      .map((r) => toRestorePoint(r, me))
      .sort((a, b) => Date.parse(b.modifiedTime) - Date.parse(a.modifiedTime));
    const panel = document.getElementById("history")!;
    panel.hidden = false;
    renderHistoryPanel(panel, points, {
      onPreview: (rid) => void (async () => {
        const xml = await api.getRevisionXml(fileId, rid);
        await editor.load(xml);
        editor.setReadOnly(true);
        showToast("Previsualizando una versión anterior (solo lectura)");
      })().catch(onError),
      onRestore: (rid) => void (async () => {
        if (state.kind !== "editing" || state.lock !== "mine") {
          showToast("Hacé check-out antes de restaurar");
          return;
        }
        const xml = await api.getRevisionXml(fileId, rid);
        await editor.load(xml);
        editor.setReadOnly(false);
        await save(fileId);
        showToast("Restaurado como nueva revisión");
      })().catch(onError),
    });
  }

  async function showConflictBar(fileId: string) {
    // Snapshot MY version now, before any diff fast-switch can swap the canvas to "theirs".
    const mineSnapshot = await editor.getXml();
    renderConflictBar(document.getElementById("conflict")!, {
      onDiff: () => void (async () => {
        const theirs = await api.getXml(fileId);
        const changes = await computeDiff(mineSnapshot, theirs);
        await diffView.show(mineSnapshot, theirs, changes);
        showToast("Diff: 🟢 nuevo 🔴 eliminado 🟡 cambiado — tecla 'd' alterna versiones");
      })().catch(onError),
      onDiscard: () => void (async () => {
        await diffView.close();
        const xml = await api.getXml(fileId);
        await editor.load(xml);
        editor.setReadOnly(false);
        const fresh = await api.getMeta(fileId);
        openHeadRevisionId = fresh.headRevisionId ?? null;
        api.lastWrites.set(fileId, fresh.version); // mark seen so the watcher doesn't reload it again
        document.getElementById("conflict")!.innerHTML = "";
        dispatch({ type: "resolvedConflict", keepMine: false });
      })().catch(onError),
      onKeepMine: () => void (async () => {
        await diffView.close();
        // Restore MY snapshot in case fast-switch left "theirs" loaded — otherwise we'd save theirs.
        await editor.load(mineSnapshot);
        editor.setReadOnly(false);
        forceOverwrite = true;
        document.getElementById("conflict")!.innerHTML = "";
        dispatch({ type: "resolvedConflict", keepMine: true });
        await save(fileId);
      })().catch(onError),
    });
  }

  async function pollChanges() {
    if (state.kind === "signedOut") return;
    const files = await api.listFiles();
    const openId = state.kind === "editing" ? state.fileId : null;
    let listChanged = false;
    for (const f of files) {
      const verdict = classifyChange({ fileId: f.id, version: f.version }, openId, api.lastWrites);
      if (verdict === "reload-open") await handleExternalChange(f.id);
      else if (verdict === "list-changed") listChanged = true;
    }
    if (listChanged) await refreshFileList();
  }

  async function handleExternalChange(fileId: string) {
    if (state.kind !== "editing") return;
    if (!state.dirty) {
      const xml = await api.getXml(fileId);
      await editor.load(xml);
      const fresh = await api.getMeta(fileId);
      openHeadRevisionId = fresh.headRevisionId ?? openHeadRevisionId;
      api.lastWrites.set(fileId, fresh.version); // mark this version as seen so we don't reload it again
      dispatch({ type: "reloaded" });
      showToast("Recargado — actualizado externamente");
    } else {
      dispatch({ type: "externalChange" });
      await showConflictBar(fileId);
    }
  }

  async function newDiagram() {
    const name = (prompt("Nombre del nuevo diagrama (.bpmn)") ?? "").trim();
    if (!name) return;
    const file = await api.createFile(name, EMPTY_BPMN);
    await refreshFileList();
    await openFile(file.id);
  }

  // ---- entry ----
  const saved = await loadSavedDir();
  if (saved && (await ensurePermission(saved))) {
    api = createFsClient(saved);
    ensureNameThenApp();
  } else {
    showFolderGate();
  }
}

bootstrap();
```

- [ ] **Step 6: Delete the dead modules and their tests**

```bash
git rm src/apiClient.ts src/apiClient.test.ts src/gate.ts src/gate.test.ts src/driveClient.ts src/driveClient.test.ts
```

- [ ] **Step 7: Verify all gates**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests pass, no type errors, build succeeds. No remaining import of `apiClient`/`gate`/`driveClient`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: rewire app to local-folder-sync (fsClient, folder gate, diff); drop api/gate/drive client"
```

---

## Task 9: Launchers + docs

**Files:**
- Create: `start.bat`, `start.sh`
- Modify: `README.md`

**Interfaces:**
- Produces: a double-click way to run the built app on localhost, and setup + manual-test docs.

- [ ] **Step 1: Create `start.bat`** (Windows)

```bat
@echo off
call npm run build
call npx vite preview --open
```

- [ ] **Step 2: Create `start.sh`** (macOS/Linux)

```sh
#!/usr/bin/env sh
npm run build && npx vite preview --open
```

- [ ] **Step 3: Replace `README.md`** with local-folder-sync instructions

````markdown
# BPMN compartida — modo carpeta local sincronizada

Editor BPMN colaborativo **sin backend**. Cada PC abre la app en el navegador,
elige una carpeta local, y cualquier herramienta de sincronización (Google Drive
para Escritorio, OneDrive, Dropbox, Syncthing) propaga los `.bpmn` entre equipos.

## Requisitos

- Node 18+ (solo para construir/servir localmente).
- Navegador Chromium (Chrome o Edge) — usa la File System Access API.
- Una carpeta sincronizada por la herramienta que ya uses.

## Correr

```bash
npm install
npm run build
npm run preview   # sirve en http://localhost:4173
```

O doble-click en `start.bat` (Windows) / `start.sh` (macOS/Linux).

La primera vez: **Elegir carpeta** → seleccioná la carpeta sincronizada →
escribí tu nombre. El permiso se recuerda (se re-pide con 1 click al volver).

## Cómo funciona

- Los diagramas son archivos `.bpmn` en la carpeta elegida.
- Bloqueos: archivo `<nombre>.bpmn.lock` (advisory, best-effort por la latencia de sync).
- Historial: subcarpeta `.history/<nombre>/` con poda automática por antigüedad.
- Cambios externos: la app vigila los archivos; si llega una versión nueva, recarga
  (si no tenés cambios) o muestra una barra de conflicto con **Ver diferencias**
  (overlay de colores + tecla `d` para alternar entre tu versión y la externa).
- Archivos en conflicto de sincronización (`... (1).bpmn`, etc.) se marcan en un
  aviso para resolver a mano.

## Checklist manual (dos PCs / dos navegadores sobre la misma carpeta sincronizada)

1. PC A: **Elegir carpeta**, nombre "Ana". PC B: misma carpeta, nombre "Beto".
2. A: **Nuevo diagrama** `demo.bpmn`, agrega una tarea, **Guardar**, **Check in**.
3. B: tras la sync, `demo.bpmn` aparece en la lista. Abrir → se ve la tarea.
4. A: abrir `demo.bpmn` (queda 🔒 para B). B ve "lo edita Ana" y el botón **Steal**.
5. A: editar y **Guardar**. B (con el archivo abierto y SIN cambios): se recarga solo.
6. Conflicto: A y B editan a la vez; el segundo en guardar ve la barra de conflicto →
   **Ver diferencias** (colores + tecla `d`), luego **Descartar** o **Conservar lo mío**.
7. Historial: varias guardadas → panel de historial → **Preview** y **Restore**.
8. Verificá que `.history/demo/` acumula revisiones y que las viejas se podan.
````

- [ ] **Step 4: Verify gates (docs/scripts don't break anything)**

Run: `npm test && npm run typecheck && npm run build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add start.bat start.sh README.md
git commit -m "docs: local-folder-sync setup, launchers, and manual checklist"
```

---

## Self-Review notes (resolved)

- **Spec coverage:** folder access (T2), sync-conflict surfacing (T3), fsClient files/locks (T4), history+retention (T5), semantic diff (T6), overlay+fast-switch (T7), rewire/identity/no-password (T8), launchers/docs (T9). External-change detection is covered by the **existing** inline poll in `main.ts` reusing `watcher.classifyChange` — no separate `fsWatcher.ts` module is needed (deviation from spec, by design / YAGNI).
- **`version`/`headRevisionId`:** both equal `String(file.lastModified)` everywhere (`toDriveFile`, `putXml`) — consistent with `watcher`/`state` treating them as opaque strings.
- **Retention:** the decay **prune** (delete of non-kept revisions) runs entirely inside `fsClient.putXml`, reusing `keepSet` from `history.ts`. `main.ts` does NOT auto-pin — there is no `reconcileRetention` (an earlier draft had one that auto-marked every decay survivor `.keep`, which would have exempted them from the prune forever and defeated the decay). `setKeepForever`/`.keep` is reserved for explicit manual pins (no UI affordance yet; the client method exists for parity/future use). `diffPins` stays in `history.ts` (tested) but is no longer called by the app.
- **Type consistency:** `createFsClient` returns the exact method set `main.ts` consumes (`listFiles/getMeta/getXml/putXml/createFile/setLock/listRevisions/getRevisionXml/setKeepForever/lastWrites/lastWriteVersion`), matching the old `apiClient` shape, so the composition root is a near drop-in swap.
```
