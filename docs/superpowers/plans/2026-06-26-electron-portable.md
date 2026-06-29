# Portable Electron (Windows) Packaging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the existing local-folder-sync SPA as a portable Windows Electron app — a single double-click `.exe`, no install, no Node/server/browser, with native folder access — by adding an Electron shell and a file-system bridge that reuses `fsClient` unchanged.

**Architecture:** The renderer is the current Vite-built SPA. A `preload` exposes a narrow `window.fsapi` (contextBridge); the Electron main process implements file ops with Node `fs/promises`, confined to the chosen folder by a path guard. A new `ipcFs.ts` adapts `window.fsapi` into the same minimal directory-handle interface `fsClient` already consumes, so all domain logic (locks, history, retention, diff, watcher) is reused. A `folder.ts` selector picks the Electron backend or the existing web (File System Access) backend by feature detection.

**Tech Stack:** Electron + electron-builder (portable target); existing Vanilla TS + Vite + Vitest. Electron glue files are CommonJS (`.cjs`) because `package.json` is `type: module`.

## Global Constraints

- Windows only. Output: one **portable** `.exe` (no installer, no code signing).
- No backend, no network, no env vars. The app only reads/writes files in the user-chosen folder.
- Electron security: `contextIsolation: true`, `nodeIntegration: false`; renderer reaches the FS only through `window.fsapi`. Every main-process file op is confined to the chosen root by `resolveWithinRoot` (rejects `..`/absolute escapes).
- Reuse `fsClient` unchanged: it consumes a `FileSystemDirectoryHandle`-compatible object exposing `getFileHandle(name,{create?})`, `getDirectoryHandle(name,{create?})`, `removeEntry(name)`, async `entries()`, and per file handle `getFile()` → `{ name, lastModified, size, text() }` and `createWritable()` → `{ write(s), close() }`.
- `version = headRevisionId = String(mtimeMs)`. Locks = `<id>.lock`. History = `.history/<base>/<rid>~<author>[.keep].bpmn`. Same on-disk model as the web version.
- Keep the web provider (`folderAccess.ts`) working so `npm run dev` in a browser still works; choose backend at call time via `window.fsapi` presence.
- Electron `.cjs` files are NOT typechecked (tsconfig `include` is `["src"]`) and have no unit tests except the pure `pathGuard`. `ipcFs.ts`/`folder.ts` live in `src/` and ARE typechecked + unit-tested.
- TDD where unit-testable; build gate after each task: `npm test`, `npm run typecheck`, `npm run build` all green.

## File Structure

```
package.json            # MODIFY: add electron + electron-builder devDeps; scripts electron:dev/dist:win; "main"; "build" block
vite.config.ts          # MODIFY: add base: "./" (relative asset paths for file:// in the .exe)
electron/
  pathGuard.cjs         # NEW: resolveWithinRoot(root, rel) — pure, unit-tested
  pathGuard.test.cjs    # NEW
  main.cjs              # NEW: BrowserWindow + IPC handlers (dialog + fs ops). Glue, validated by build/manual.
  preload.cjs           # NEW: contextBridge → window.fsapi. Glue.
src/
  ipcFs.ts              # NEW: FsApi interface + makeIpcDir(root, api) → FileSystemDirectoryHandle-compatible; window.fsapi global decl
  ipcFs.test.ts         # NEW
  folder.ts             # NEW: loadSavedDir()/pickDir() selector (electron vs web), call-time detection
  folder.test.ts        # NEW
  main.ts               # MODIFY: import from ./folder instead of ./folderAccess; drop ensurePermission usage (3 edits)
README.md               # MODIFY: add "Run as a Windows app" + build + double-click section
```

---

## Task 1: Toolchain — vite base path + Electron packaging config

**Files:**
- Modify: `vite.config.ts`, `package.json`

**Interfaces:**
- Produces: the build emits relative asset paths; npm scripts `electron:dev`/`dist:win`; electron-builder config. `package.json`'s `main` points at `electron/main.cjs` (created in Task 6 — npm doesn't need it to exist for the web gates).

- [ ] **Step 1: Install Electron toolchain**

```bash
npm install -D electron@^33.0.0 electron-builder@^25.1.8
```

(Large download — Electron ships a Chromium binary. Allow time.)

- [ ] **Step 2: Replace `vite.config.ts` (whole file)**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative asset paths so the built index.html works when loaded from
  // file:// inside the packaged Electron app.
  base: "./",
  test: {
    environment: "happy-dom",
    globals: true,
  },
});
```

- [ ] **Step 3: Edit `package.json` — add `main`, scripts, and the electron-builder `build` block**

Set the top-level `"main"` field (add it right after `"version"`):

```json
  "main": "electron/main.cjs",
```

Add these two scripts to the existing `"scripts"` object:

```json
    "electron:dev": "npm run build && electron .",
    "dist:win": "npm run build && electron-builder --win portable"
```

Add this top-level `"build"` block (electron-builder config):

```json
  "build": {
    "appId": "com.bpmncompartida.app",
    "productName": "BPMN compartida",
    "files": ["dist/**/*", "electron/**/*", "package.json"],
    "win": { "target": "portable" },
    "directories": { "output": "release" }
  }
```

- [ ] **Step 4: Ignore the build output**

Append to `.gitignore`:

```
release/
```

- [ ] **Step 5: Verify the web gates still pass**

Run: `npm test && npm run typecheck && npm run build`
Expected: 59 tests pass, no type errors, build succeeds. The built `dist/index.html` now references assets with relative `./assets/...` paths.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.ts .gitignore
git commit -m "chore: add electron toolchain, portable build config, relative vite base"
```

---

## Task 2: Path guard (`electron/pathGuard.cjs`)

**Files:**
- Create: `electron/pathGuard.cjs`, `electron/pathGuard.test.cjs`

**Interfaces:**
- Produces: `resolveWithinRoot(root: string, rel: string): string` — resolves `rel` against `root`, returns the absolute path, throws if it escapes `root`. `rel === ""` resolves to `root` itself (allowed).

- [ ] **Step 1: Write the failing test `electron/pathGuard.test.cjs`**

```js
const { describe, it, expect } = require("vitest");
const { resolveWithinRoot } = require("./pathGuard.cjs");

describe("resolveWithinRoot", () => {
  it("allows the root itself (rel = '')", () => {
    expect(resolveWithinRoot("/data", "")).toBe(require("node:path").resolve("/data"));
  });
  it("allows a nested relative path", () => {
    const p = resolveWithinRoot("/data", "a/b.bpmn");
    expect(p).toContain("b.bpmn");
  });
  it("allows a nested history path", () => {
    expect(() => resolveWithinRoot("/data", ".history/x/1.bpmn")).not.toThrow();
  });
  it("rejects a parent escape", () => {
    expect(() => resolveWithinRoot("/data", "../secret")).toThrow();
  });
  it("rejects an absolute path outside root", () => {
    expect(() => resolveWithinRoot("/data", "/etc/passwd")).toThrow();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run electron/pathGuard.test.cjs`
Expected: FAIL — cannot find module `./pathGuard.cjs`.

- [ ] **Step 3: Write `electron/pathGuard.cjs`**

```js
const path = require("node:path");

// Resolve `rel` against `root` and guarantee the result stays inside `root`.
// rel === "" yields root itself. Throws on any escape (.. or absolute outside).
function resolveWithinRoot(root, rel) {
  const normRoot = path.resolve(root);
  const resolved = path.resolve(normRoot, rel);
  if (resolved !== normRoot && !resolved.startsWith(normRoot + path.sep)) {
    throw new Error(`path escapes root: ${rel}`);
  }
  return resolved;
}

module.exports = { resolveWithinRoot };
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run electron/pathGuard.test.cjs`
Expected: PASS (5 tests). (`npm test`'s default glob includes `**/*.test.cjs`, so it's picked up by the suite too.)

- [ ] **Step 5: Commit**

```bash
git add electron/pathGuard.cjs electron/pathGuard.test.cjs
git commit -m "feat(electron): path guard confining file ops to the chosen root"
```

---

## Task 3: FS bridge adapter (`src/ipcFs.ts`)

**Files:**
- Create: `src/ipcFs.ts`, `src/ipcFs.test.ts`

**Interfaces:**
- Consumes: `createFsClient` from `./fsClient` (for the integration test).
- Produces:
  - `interface FsApi` — the shape of `window.fsapi`: `chooseFolder(): Promise<string|null>`, `listDir(root, rel): Promise<{name:string; kind:"file"|"directory"}[]>`, `readFile(root, rel): Promise<string>`, `writeFile(root, rel, data): Promise<void>`, `removeEntry(root, rel): Promise<void>`, `stat(root, rel): Promise<{mtimeMs:number; size:number; kind:"file"|"directory"}|null>`, `mkdir(root, rel): Promise<void>`.
  - `makeIpcDir(root: string, api: FsApi): FileSystemDirectoryHandle` — a `FileSystemDirectoryHandle`-compatible object backed by `api`, usable as `createFsClient`'s argument.
  - Global `Window.fsapi?: FsApi` declaration.

- [ ] **Step 1: Write the failing test `src/ipcFs.test.ts`**

```ts
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

  it("works as a real fsClient backend (putXml + history round-trip)", async () => {
    const api = fakeApi();
    api._seed("proceso.bpmn", "<a/>");
    const fs = createFsClient(makeIpcDir("root", api), () => 1000);
    await fs.putXml("proceso.bpmn", "<b/>", "Ana");
    expect(await fs.getXml("proceso.bpmn")).toBe("<b/>");
    const revs = await fs.listRevisions("proceso.bpmn");
    expect(revs).toHaveLength(1);
    expect(await fs.getRevisionXml("proceso.bpmn", revs[0].id)).toBe("<b/>");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/ipcFs.test.ts`
Expected: FAIL — cannot find module `./ipcFs`.

- [ ] **Step 3: Write `src/ipcFs.ts`**

```ts
export interface FsApi {
  chooseFolder(): Promise<string | null>;
  listDir(root: string, rel: string): Promise<{ name: string; kind: "file" | "directory" }[]>;
  readFile(root: string, rel: string): Promise<string>;
  writeFile(root: string, rel: string, data: string): Promise<void>;
  removeEntry(root: string, rel: string): Promise<void>;
  stat(root: string, rel: string): Promise<{ mtimeMs: number; size: number; kind: "file" | "directory" } | null>;
  mkdir(root: string, rel: string): Promise<void>;
}

declare global {
  interface Window {
    fsapi?: FsApi;
  }
}

function notFound(name: string): Error {
  const e = new Error(`NotFound: ${name}`);
  e.name = "NotFoundError";
  return e;
}

function join(a: string, b: string): string {
  return a ? `${a}/${b}` : b;
}

function makeFile(root: string, rel: string, api: FsApi): any {
  const name = rel.split("/").pop() ?? rel;
  return {
    kind: "file",
    name,
    async getFile() {
      const s = await api.stat(root, rel);
      if (!s) throw notFound(rel);
      return {
        name,
        lastModified: s.mtimeMs,
        size: s.size,
        async text() {
          return api.readFile(root, rel);
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
          await api.writeFile(root, rel, buf);
        },
      };
    },
  };
}

function makeDir(root: string, rel: string, api: FsApi): any {
  return {
    kind: "directory",
    name: rel.split("/").pop() ?? "",
    async *entries() {
      for (const e of await api.listDir(root, rel)) {
        const childRel = join(rel, e.name);
        yield [e.name, e.kind === "directory" ? makeDir(root, childRel, api) : makeFile(root, childRel, api)];
      }
    },
    async getFileHandle(name: string, _opts?: { create?: boolean }) {
      // Lazy: the handle is returned even when absent; getFile() throws if missing,
      // and createWritable() creates on close. Mirrors how fsClient uses the handle.
      return makeFile(root, join(rel, name), api);
    },
    async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
      const childRel = join(rel, name);
      if (opts?.create) {
        await api.mkdir(root, childRel);
      } else {
        const s = await api.stat(root, childRel);
        if (!s || s.kind !== "directory") throw notFound(childRel);
      }
      return makeDir(root, childRel, api);
    },
    async removeEntry(name: string) {
      await api.removeEntry(root, join(rel, name));
    },
  };
}

export function makeIpcDir(root: string, api: FsApi): FileSystemDirectoryHandle {
  return makeDir(root, "", api) as unknown as FileSystemDirectoryHandle;
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/ipcFs.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Verify gates**

Run: `npm run typecheck && npm test`
Expected: clean; full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/ipcFs.ts src/ipcFs.test.ts
git commit -m "feat: ipcFs adapter — FileSystemDirectoryHandle over a native fs bridge"
```

---

## Task 4: Folder provider selector (`src/folder.ts`)

**Files:**
- Create: `src/folder.ts`, `src/folder.test.ts`

**Interfaces:**
- Consumes: `makeIpcDir`, `FsApi` from `./ipcFs`; `loadSavedDir`/`pickDir`/`ensurePermission` from `./folderAccess` (web provider, unchanged).
- Produces:
  - `loadSavedDir(): Promise<FileSystemDirectoryHandle | null>`
  - `pickDir(): Promise<FileSystemDirectoryHandle | null>`
  Both detect `window.fsapi` AT CALL TIME: present → Electron backend (native dialog + path in `localStorage` key `bpmn-compartida.folder`); absent → web backend (File System Access, permission folded in; user-cancel → null).

- [ ] **Step 1: Write the failing test `src/folder.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

// Web provider is mocked so the no-fsapi branch is deterministic.
vi.mock("./folderAccess", () => ({
  loadSavedDir: vi.fn(),
  pickDir: vi.fn(),
  ensurePermission: vi.fn(),
}));
import * as web from "./folderAccess";
import { loadSavedDir, pickDir } from "./folder";

function setFsApi(api: any) {
  (window as any).fsapi = api;
}

describe("folder selector", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    delete (window as any).fsapi;
  });

  it("electron: pickDir stores the chosen path and returns a dir handle", async () => {
    setFsApi({
      chooseFolder: vi.fn().mockResolvedValue("C:/synced"),
      stat: vi.fn().mockResolvedValue({ mtimeMs: 0, size: 0, kind: "directory" }),
    });
    const dir = await pickDir();
    expect((dir as any)?.kind).toBe("directory");
    expect(localStorage.getItem("bpmn-compartida.folder")).toBe("C:/synced");
  });

  it("electron: pickDir returns null when the dialog is cancelled", async () => {
    setFsApi({ chooseFolder: vi.fn().mockResolvedValue(null) });
    expect(await pickDir()).toBeNull();
  });

  it("electron: loadSavedDir returns null when the saved folder no longer exists", async () => {
    localStorage.setItem("bpmn-compartida.folder", "C:/gone");
    setFsApi({ stat: vi.fn().mockResolvedValue(null) });
    expect(await loadSavedDir()).toBeNull();
  });

  it("web: falls back to folderAccess when no fsapi", async () => {
    const handle = { kind: "directory", name: "web" } as any;
    (web.loadSavedDir as any).mockResolvedValue(handle);
    (web.ensurePermission as any).mockResolvedValue(true);
    expect(await loadSavedDir()).toBe(handle);
  });

  it("web: pickDir returns null when the user cancels the picker (AbortError)", async () => {
    const err = Object.assign(new Error("aborted"), { name: "AbortError" });
    (web.pickDir as any).mockRejectedValue(err);
    expect(await pickDir()).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/folder.test.ts`
Expected: FAIL — cannot find module `./folder`.

- [ ] **Step 3: Write `src/folder.ts`**

```ts
import { makeIpcDir, type FsApi } from "./ipcFs";
import * as web from "./folderAccess";

const FOLDER_KEY = "bpmn-compartida.folder";

function electronApi(): FsApi | null {
  return typeof window !== "undefined" && window.fsapi ? window.fsapi : null;
}

export async function loadSavedDir(): Promise<FileSystemDirectoryHandle | null> {
  const api = electronApi();
  if (api) {
    const root = localStorage.getItem(FOLDER_KEY);
    if (!root) return null;
    const s = await api.stat(root, "");
    if (!s || s.kind !== "directory") return null;
    return makeIpcDir(root, api);
  }
  const h = await web.loadSavedDir();
  if (h && (await web.ensurePermission(h))) return h;
  return null;
}

export async function pickDir(): Promise<FileSystemDirectoryHandle | null> {
  const api = electronApi();
  if (api) {
    const root = await api.chooseFolder();
    if (!root) return null;
    localStorage.setItem(FOLDER_KEY, root);
    return makeIpcDir(root, api);
  }
  try {
    const h = await web.pickDir();
    return (await web.ensurePermission(h)) ? h : null;
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") return null; // user cancelled the picker
    throw e;
  }
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/folder.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Verify gates**

Run: `npm run typecheck && npm test`
Expected: clean; full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/folder.ts src/folder.test.ts
git commit -m "feat: folder provider selector (electron native vs web File System Access)"
```

---

## Task 5: Rewire `main.ts` to the folder selector

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `loadSavedDir`, `pickDir` from `./folder` (Task 4).
- Produces: the app entry uses the selector; no `ensurePermission` in `main.ts` (the provider folds it in). Validated by typecheck + build + existing tests.

- [ ] **Step 1: Swap the import (line 8)**

In `src/main.ts`, replace:
```ts
import { loadSavedDir, pickDir, ensurePermission } from "./folderAccess";
```
with:
```ts
import { loadSavedDir, pickDir } from "./folder";
```

- [ ] **Step 2: Update `showFolderGate`'s click handler**

Replace:
```ts
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
```
with:
```ts
    document.getElementById("pick")!.addEventListener("click", () => {
      void (async () => {
        const dir = await pickDir();
        if (dir) {
          api = createFsClient(dir);
          ensureNameThenApp();
        } else {
          showToast("No se eligió una carpeta usable");
        }
      })().catch(onError);
    });
```

- [ ] **Step 3: Update the entry block (bottom of `bootstrap`)**

Replace:
```ts
  const saved = await loadSavedDir();
  if (saved && (await ensurePermission(saved))) {
    api = createFsClient(saved);
    ensureNameThenApp();
  } else {
    showFolderGate();
  }
```
with:
```ts
  const saved = await loadSavedDir();
  if (saved) {
    api = createFsClient(saved);
    ensureNameThenApp();
  } else {
    showFolderGate();
  }
```

- [ ] **Step 4: Verify gates**

Run: `npm run typecheck && npm test && npm run build`
Expected: no type errors (note: `ensurePermission` is no longer imported, and `pickDir`/`loadSavedDir` now come from `./folder`), 59 tests pass, build succeeds. `folderAccess.ts` stays in the tree (used by `folder.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat: app entry uses folder selector (electron-aware), drops direct ensurePermission"
```

---

## Task 6: Electron shell + run/build docs

**Files:**
- Create: `electron/main.cjs`, `electron/preload.cjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: `electron/pathGuard.cjs` (Task 2). Implements the `window.fsapi` contract that `ipcFs.ts` expects.
- Produces: a runnable Electron app (`npm run electron:dev`) and a portable build (`npm run dist:win`). The `.cjs` glue is validated by typecheck (web build unaffected), `npm run build`, and the manual checklist; it is not unit-tested.

- [ ] **Step 1: Write `electron/preload.cjs`**

```js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fsapi", {
  chooseFolder: () => ipcRenderer.invoke("fsapi:chooseFolder"),
  listDir: (root, rel) => ipcRenderer.invoke("fsapi:listDir", root, rel),
  readFile: (root, rel) => ipcRenderer.invoke("fsapi:readFile", root, rel),
  writeFile: (root, rel, data) => ipcRenderer.invoke("fsapi:writeFile", root, rel, data),
  removeEntry: (root, rel) => ipcRenderer.invoke("fsapi:removeEntry", root, rel),
  stat: (root, rel) => ipcRenderer.invoke("fsapi:stat", root, rel),
  mkdir: (root, rel) => ipcRenderer.invoke("fsapi:mkdir", root, rel),
});
```

- [ ] **Step 2: Write `electron/main.cjs`**

```js
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { resolveWithinRoot } = require("./pathGuard.cjs");

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

ipcMain.handle("fsapi:chooseFolder", async () => {
  const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
});

ipcMain.handle("fsapi:listDir", async (_e, root, rel) => {
  const entries = await fs.readdir(resolveWithinRoot(root, rel), { withFileTypes: true });
  return entries.map((d) => ({ name: d.name, kind: d.isDirectory() ? "directory" : "file" }));
});

ipcMain.handle("fsapi:readFile", (_e, root, rel) => fs.readFile(resolveWithinRoot(root, rel), "utf8"));

ipcMain.handle("fsapi:writeFile", async (_e, root, rel, data) => {
  const p = resolveWithinRoot(root, rel);
  const tmp = `${p}.tmp-${process.pid}`;
  await fs.writeFile(tmp, data, "utf8");
  await fs.rename(tmp, p); // atomic-ish: avoids the sync tool uploading a half-written file
});

ipcMain.handle("fsapi:removeEntry", async (_e, root, rel) => {
  await fs.rm(resolveWithinRoot(root, rel), { force: true });
});

ipcMain.handle("fsapi:stat", async (_e, root, rel) => {
  try {
    const s = await fs.stat(resolveWithinRoot(root, rel));
    return { mtimeMs: s.mtimeMs, size: s.size, kind: s.isDirectory() ? "directory" : "file" };
  } catch {
    return null;
  }
});

ipcMain.handle("fsapi:mkdir", async (_e, root, rel) => {
  await fs.mkdir(resolveWithinRoot(root, rel), { recursive: true });
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

- [ ] **Step 3: Verify the web gates are unaffected**

Run: `npm test && npm run typecheck && npm run build`
Expected: 59 tests pass, no type errors, build succeeds. (`electron/*.cjs` is not part of the web build or typecheck.)

- [ ] **Step 4: Smoke-test the Electron app (best effort; may not be possible in a headless agent environment)**

Run: `npm run electron:dev`
Expected (on a machine with a display): a window opens showing the "Elegir carpeta" screen.
If the environment is headless and the app cannot open a window, SKIP this step and note it in the report — the renderer logic is already covered by unit tests; the manual checklist below is the real verification.

- [ ] **Step 5: Build the portable `.exe` (best effort)**

Run: `npm run dist:win`
Expected: electron-builder produces a single portable `.exe` under `release/`.
If electron-builder cannot run in this environment (download/permission/platform limits), SKIP and note it in the report; document the exact command for the user to run on their machine.

- [ ] **Step 6: Update `README.md`** — add this section after the existing "Correr" section

````markdown
## Correr como app de Windows (sin instalación)

La app también se empaqueta como un único `.exe` portable (Electron) — sin Node,
sin servidor, sin navegador.

**Generar el `.exe`** (una vez, en una máquina con Node):

```bash
npm install
npm run dist:win
```

El portable queda en `release/` (p. ej. `release/BPMN compartida <versión>.exe`).
Copiá ese `.exe` a cada PC.

**Usar:** doble-click al `.exe`. La primera vez Windows SmartScreen puede advertir
(app sin firmar) → "Más información" → "Ejecutar de todos modos". Luego:

1. **Elegir carpeta** → la carpeta sincronizada (Google Drive Desktop / OneDrive /
   Dropbox / Syncthing). No pide permisos del navegador; recuerda la ruta.
2. Escribí tu nombre.
3. Editás los `.bpmn`; los cambios se guardan en esa carpeta y tu sincronizador
   los propaga a los demás PCs.

**Desarrollo:** `npm run electron:dev` abre la app Electron contra el build local;
`npm run dev` sigue corriendo la versión web en el navegador (Chrome/Edge).
````

- [ ] **Step 7: Commit**

```bash
git add electron/main.cjs electron/preload.cjs README.md
git commit -m "feat(electron): main process + preload bridge; portable build docs"
```

---

## Self-Review notes (resolved)

- **Spec coverage:** Electron shell + IPC bridge (T6), path guard (T2), ipcFs adapter reusing fsClient (T3), folder selector electron/web (T4), main.ts rewire (T5), vite base + packaging config (T1), README run/build (T6). All spec sections map to a task.
- **Reuse:** `fsClient`, all domain modules, and `folderAccess` (as the web provider) are untouched. The only renderer changes are 3 edits in `main.ts` (T5) plus two new modules (`ipcFs`, `folder`).
- **Type/contract consistency:** `FsApi` (T3) is exactly the contract `preload.cjs` exposes and `main.cjs` implements (T6): `chooseFolder/listDir/readFile/writeFile/removeEntry/stat/mkdir`. `makeIpcDir` returns a `FileSystemDirectoryHandle`-compatible object accepted by `createFsClient`. `folder.ts` (T4) returns `FileSystemDirectoryHandle | null`, matching what `main.ts` (T5) now expects from `loadSavedDir`/`pickDir`.
- **`.cjs` choice:** Electron glue is CommonJS because `package.json` is `type: module`; these files are excluded from tsconfig (`include: ["src"]`) and from the web build, so they don't affect typecheck/build gates. Only the pure `pathGuard.cjs` is unit-tested (vitest's default glob covers `**/*.test.cjs`).
- **Headless caveat:** T6 steps 4–5 (launch + electron-builder) are best-effort and may be skipped in a headless agent; the report must say if they were, and the manual checklist + the user's machine are the real verification.
```
