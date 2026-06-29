# File Management + Subfolders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manage diagrams inside the working folder (delete, duplicate, move, copy, rename) and support subfolders (browse + create) via an expandable tree in the sidebar.

**Architecture:** `fsClient` gains path-relative ids (a segment-walking resolver), a recursive `listTree()`, and bundle-aware operations (the `.bpmn` travels with its `.layers.json` sidecar and `.history/<path>/`). Electron gets native `rename`/`copyFile` IPC for fast, Drive-safe moves; web falls back to copy+delete. New UI modules render the tree, a `⋯`/right-click context menu, and a destination-folder picker. `main.ts` wires operations with a lock-aware safety rule.

**Tech Stack:** Vanilla TS + Vite, Vitest (happy-dom), bpmn-js 18, Electron (contextIsolation + IPC). In-memory `createFakeDir`/`seedFile` test helper (`src/testHelpers/fakeDir.ts`).

## Global Constraints

- All file paths are **POSIX-relative to the root** (`Ventas/B2B.bpmn`); separator is `/`.
- The tree NEVER shows: `.history/`, sync-conflict files (`isSyncConflict`), or sidecars (`*.lock`, `*.layers.json`).
- Bundle rules: **move/rename** carry `.layers.json` + history; **copy/duplicate** carry `.layers.json`, history starts empty; **delete** removes `.bpmn` + `.layers.json` + history; `.lock` is never copied and is freed on move/delete.
- Safety: block move/rename/delete when the file is checked out by **another** user; delete a folder only if no file inside is locked by others; operating on the open file closes/re-points it.
- Name validation: non-empty, no `/` `\`; `.bpmn` appended if missing; collisions get a ` copia`/` (2)` suffix.
- Gates after every task: `npm test`, `npm run typecheck`, `npm run build` (where build applies).
- Follow existing patterns: ESM, no default exports for modules with multiple symbols, 2-space indent, Spanish UI strings.

---

### Task 1: `TreeEntry` type + fsClient path resolver

**Files:**
- Modify: `src/types.ts` (add `TreeEntry`)
- Modify: `src/fsClient.ts` (add segment-walking resolver; route leaf I/O through it)
- Test: `src/fsClient.test.ts`

**Interfaces:**
- Consumes: `createFakeDir`, `seedFile` from `./testHelpers/fakeDir`.
- Produces: `TreeEntry` type; fsClient internals `parts(rel)`, `resolveParent(rel, create)`, `statAt(rel)`, `readTextAt(rel)`, `writeTextAt(rel)`, `removeFileAt(rel)`. Existing public methods keep working with both root names and nested paths.

- [ ] **Step 1: Add the `TreeEntry` type**

In `src/types.ts`, append:

```ts
export interface TreeEntry {
  path: string; // POSIX-relative path from the root
  kind: "file" | "dir";
  modifiedTime?: string;
  version?: string;
  appProperties?: Record<string, string>;
}
```

- [ ] **Step 2: Write the failing test for nested read/write**

In `src/fsClient.test.ts`, add a new describe block:

```ts
describe("fsClient nested paths", () => {
  it("writes and reads a file inside a subfolder", async () => {
    await fs.createFile("Ventas/B2B.bpmn", "<b/>");
    expect(await fs.getXml("Ventas/B2B.bpmn")).toBe("<b/>");
    const meta = await fs.getMeta("Ventas/B2B.bpmn");
    expect(meta.id).toBe("Ventas/B2B.bpmn");
    expect(meta.version).toMatch(/^\d+$/);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run src/fsClient.test.ts -t "subfolder"`
Expected: FAIL (createFile writes to root name with a slash; getDirectoryHandle never called → fakeDir stores key `"Ventas/B2B.bpmn"` at root, but getMeta→stat path differs / or write throws). Confirm red.

- [ ] **Step 4: Add the resolver and route leaf I/O through it**

In `src/fsClient.ts`, inside `createFsClient`, replace the `stat`/`readText`/`writeText` helpers with path-aware versions and add the resolver:

```ts
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
```

Then replace the old `stat`/`readText`/`writeText` references throughout `createFsClient` with `statAt`/`readTextAt`/`writeTextAt` (the public `stat`/`readText`/`writeText` named helpers are removed; `toDriveFile`, `readLockProps`, sidecar and lock methods now call the `*At` variants). Update `setLock` to use `writeTextAt`/`removeFileAt`.

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npx vitest run src/fsClient.test.ts`
Expected: PASS (all existing fsClient tests still green + the new one).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/fsClient.ts src/fsClient.test.ts
git commit -m "feat(fsClient): path-relative resolver for nested files"
```

---

### Task 2: `fsClient.listTree()` (recursive)

**Files:**
- Modify: `src/fsClient.ts`
- Test: `src/fsClient.test.ts`

**Interfaces:**
- Consumes: resolver from Task 1; `TreeEntry` type.
- Produces: `fsClient.listTree(): Promise<TreeEntry[]>` — every folder (`kind:"dir"`) and every `.bpmn` (`kind:"file"` with metadata), recursive, excluding `.history`. Sidecars and non-`.bpmn` files are omitted.

- [ ] **Step 1: Write the failing test**

```ts
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
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/fsClient.test.ts -t "listTree"`
Expected: FAIL — `fs.listTree is not a function`.

- [ ] **Step 3: Implement `listTree`**

In `src/fsClient.ts`, add a helper and a method. Add near `toDriveFile`:

```ts
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
```

Add to the returned object:

```ts
async listTree(): Promise<TreeEntry[]> {
  const out: TreeEntry[] = [];
  async function walk(d: FileSystemDirectoryHandle, prefix: string): Promise<void> {
    for await (const [name, handle] of (d as any).entries()) {
      if (name === HISTORY_DIR) continue;
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
}
```

Add `import type { ..., TreeEntry } from "./types";` (extend the existing type import).

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run src/fsClient.test.ts -t "listTree"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fsClient.ts src/fsClient.test.ts
git commit -m "feat(fsClient): recursive listTree"
```

---

### Task 3: History path-aware (nested files)

**Files:**
- Modify: `src/fsClient.ts` (make `historyDir` walk nested base paths)
- Test: `src/fsClient.test.ts`

**Interfaces:**
- Consumes: `parts` from Task 1.
- Produces: history for `id="sub/a.bpmn"` lives under `.history/sub/a/`. `listRevisions`/`getRevisionXml`/`putXml` work for nested ids.

- [ ] **Step 1: Write the failing test**

```ts
describe("fsClient nested history", () => {
  it("stores history under .history/<dirs>/<base>", async () => {
    await fs.createFile("Ventas/B2B.bpmn", "<b/>");
    await fs.putXml("Ventas/B2B.bpmn", "<b2/>", "Ana");
    const revs = await fs.listRevisions("Ventas/B2B.bpmn");
    expect(revs.length).toBe(1);
    const xml = await fs.getRevisionXml("Ventas/B2B.bpmn", revs[0].id);
    expect(xml).toBe("<b2/>");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/fsClient.test.ts -t "nested history"`
Expected: FAIL — `historyDir` calls `getDirectoryHandle("Ventas/B2B")` with a slash → NotFound / wrong nesting.

- [ ] **Step 3: Make `historyDir` walk segments**

Replace `historyDir` in `src/fsClient.ts`:

```ts
async function historyDir(id: string, create: boolean): Promise<FileSystemDirectoryHandle> {
  let cur = await dir.getDirectoryHandle(HISTORY_DIR, { create });
  for (const seg of parts(baseName(id))) cur = await cur.getDirectoryHandle(seg, { create });
  return cur;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run src/fsClient.test.ts`
Expected: PASS (existing root-level history tests still green; `parts("proceso")` → `["proceso"]` → `.history/proceso/`, same as before).

- [ ] **Step 5: Commit**

```bash
git add src/fsClient.ts src/fsClient.test.ts
git commit -m "feat(fsClient): nested history dirs"
```

---

### Task 4: fsClient delete + create-folder (bundle-aware)

**Files:**
- Modify: `src/fsClient.ts`
- Test: `src/fsClient.test.ts`

**Interfaces:**
- Consumes: resolver, `historyDir`, `baseName`.
- Produces:
  - `fsClient.createFolder(parentPath: string, name: string): Promise<void>`
  - `fsClient.deleteFile(id: string): Promise<void>` — removes `.bpmn` + `<base>.layers.json` + `<id>.lock` + `.history/<base>/`.
  - internal `removeDirAt(rel: string): Promise<void>` (recursive, ignore-absent).

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/fsClient.test.ts -t "delete + createFolder"`
Expected: FAIL — methods undefined.

- [ ] **Step 3: Implement**

Add the internal helper near `removeFileAt`:

```ts
async function removeDirAt(rel: string): Promise<void> {
  try {
    const { parent, name } = await resolveParent(rel, false);
    await (parent as any).removeEntry(name, { recursive: true });
  } catch {
    /* already absent */
  }
}
```

Add to the returned object:

```ts
async createFolder(parentPath: string, name: string): Promise<void> {
  const rel = parentPath ? `${parentPath}/${name}` : name;
  let cur = dir;
  for (const seg of parts(rel)) cur = await cur.getDirectoryHandle(seg, { create: true });
},
async deleteFile(id: string): Promise<void> {
  await removeFileAt(id);
  await removeFileAt(`${baseName(id)}.layers.json`);
  await removeFileAt(`${id}.lock`);
  await removeDirAt(`${HISTORY_DIR}/${baseName(id)}`);
},
```

- [ ] **Step 4: Run to confirm passing**

Run: `npx vitest run src/fsClient.test.ts -t "delete + createFolder"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fsClient.ts src/fsClient.test.ts
git commit -m "feat(fsClient): createFolder + bundle-aware deleteFile"
```

---

### Task 5: fsClient move/rename/copy/duplicate (files, bundle-aware)

**Files:**
- Modify: `src/fsClient.ts`
- Test: `src/fsClient.test.ts`

**Interfaces:**
- Consumes: resolver, `removeFileAt`, `removeDirAt`, `baseName`, `historyDir`.
- Produces (all return the new id):
  - `renameFile(id, newName): Promise<string>` — same folder; carries sidecar + history; frees lock.
  - `moveFile(id, destFolder): Promise<string>` — carries sidecar + history; frees lock.
  - `copyFile(id, destFolder, newName?): Promise<string>` — carries sidecar; NO history; NO lock.
  - `duplicateFile(id): Promise<string>` — copyFile into same folder with ` copia` suffix.
  - internal `dirOf(id)`, `baseFileName(id)`, `ensureBpmn(name)`, `uniqueName(folder, name)`, `copyTree(srcRel, dstRel)`, `nativeMove(srcRel, dstRel)`.
- Native fast path: if `(dir as any).__native?.rename` / `.copyFile` exist (Electron), use them; else generic copy+delete (web/tests).

- [ ] **Step 1: Write the failing tests**

```ts
describe("fsClient move/rename/copy/duplicate", () => {
  beforeEach(async () => {
    await fs.createFile("A.bpmn", "<a/>");
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
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/fsClient.test.ts -t "move/rename/copy/duplicate"`
Expected: FAIL — methods undefined.

- [ ] **Step 3: Implement helpers + methods**

Add helpers inside `createFsClient`:

```ts
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
  | { rename(from: string, to: string): Promise<void>; copyFile(from: string, to: string): Promise<void> }
  | undefined;
async function copyFileContent(srcRel: string, dstRel: string): Promise<void> {
  if (native) return native.copyFile(srcRel, dstRel);
  await writeTextAt(dstRel, await readTextAt(srcRel));
}
async function moveFileContent(srcRel: string, dstRel: string): Promise<void> {
  if (native) return native.rename(srcRel, dstRel);
  await writeTextAt(dstRel, await readTextAt(srcRel));
  await removeFileAt(srcRel);
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
```

Add the public methods:

```ts
async renameFile(id: string, newName: string): Promise<string> {
  const newId = join(dirOf(id), ensureBpmn(newName));
  if (newId === id) return id;
  await moveFileContent(id, newId);
  if (await exists(`${baseName(id)}.layers.json`)) await moveFileContent(`${baseName(id)}.layers.json`, `${baseName(newId)}.layers.json`);
  await moveHistory(id, newId);
  await removeFileAt(`${id}.lock`);
  return newId;
},
async moveFile(id: string, destFolder: string): Promise<string> {
  const newId = join(destFolder, baseFileName(id));
  if (newId === id) return id;
  await moveFileContent(id, newId);
  if (await exists(`${baseName(id)}.layers.json`)) await moveFileContent(`${baseName(id)}.layers.json`, `${baseName(newId)}.layers.json`);
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
  return newId;
},
async duplicateFile(id: string): Promise<string> {
  const base = baseFileName(id).replace(/\.bpmn$/i, "");
  return this.copyFile(id, dirOf(id), `${base} copia`);
},
```

Note: `uniqueName` makes `duplicateFile` of `A.bpmn` produce `A copia.bpmn`, and a second duplicate `A copia (2).bpmn`. The test expects `A copia.bpmn` for the first — matches.

- [ ] **Step 4: Run to confirm passing**

Run: `npx vitest run src/fsClient.test.ts`
Expected: PASS (whole fsClient suite green).

- [ ] **Step 5: Commit**

```bash
git add src/fsClient.ts src/fsClient.test.ts
git commit -m "feat(fsClient): move/rename/copy/duplicate (bundle-aware)"
```

---

### Task 6: fsClient folder operations (move/copy/delete recursive)

**Files:**
- Modify: `src/fsClient.ts`
- Test: `src/fsClient.test.ts`

**Interfaces:**
- Consumes: helpers from Task 5; `removeDirAt`, `moveFileContent`, native.
- Produces:
  - `moveFolder(path, destParent): Promise<string>` — moves the folder + its `.history/<path>` subtree; returns new path.
  - `copyFolder(path, destParent): Promise<string>` — copies `.bpmn` + `.layers.json` recursively, NO history.
  - `deleteFolder(path): Promise<void>` — removes the folder + `.history/<path>`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("fsClient folder ops", () => {
  beforeEach(async () => {
    await fs.createFile("Grupo/X.bpmn", "<x/>");
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
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/fsClient.test.ts -t "folder ops"`
Expected: FAIL — methods undefined.

- [ ] **Step 3: Implement**

Add a recursive copy of a directory subtree (files only, used by copyFolder) and the methods:

```ts
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
    const childSrc = `${srcRel}/${name}`;
    const childDst = `${dstRel}/${name}`;
    if ((h as any).kind === "directory") await copySubtree(childSrc, childDst, includeHistory);
    else await copyFileContent(childSrc, childDst);
  }
}
```

Public methods:

```ts
async moveFolder(path: string, destParent: string): Promise<string> {
  const name = baseFileName(path);
  const newPath = join(destParent, name);
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
  await copySubtree(path, newPath, false); // .bpmn + .layers.json, no history
  return newPath;
},
async deleteFolder(path: string): Promise<void> {
  await removeDirAt(path);
  await removeDirAt(`${HISTORY_DIR}/${path}`);
},
```

- [ ] **Step 4: Run to confirm passing**

Run: `npx vitest run src/fsClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fsClient.ts src/fsClient.test.ts
git commit -m "feat(fsClient): recursive folder move/copy/delete"
```

---

### Task 7: Electron native rename/copyFile (IPC)

**Files:**
- Modify: `src/ipcFs.ts` (extend `FsApi`; expose `__native` on the handle)
- Modify: `electron/main.cjs` (handlers)
- Modify: `electron/preload.cjs` (expose)
- Test: `src/ipcFs.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `FsApi.rename(root, from, to)`, `FsApi.copyFile(root, from, to)`; `makeIpcDir(root, api)` returns a handle with `__native = { rename(from,to), copyFile(from,to) }` (root-bound). fsClient (Task 5) already prefers `__native`.

- [ ] **Step 1: Write the failing test**

In `src/ipcFs.test.ts`, add:

```ts
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
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/ipcFs.test.ts -t "__native"`
Expected: FAIL — `handle.__native` is undefined.

- [ ] **Step 3: Extend `FsApi` and `makeIpcDir`**

In `src/ipcFs.ts`, add to the `FsApi` interface:

```ts
  rename(root: string, from: string, to: string): Promise<void>;
  copyFile(root: string, from: string, to: string): Promise<void>;
```

In `makeIpcDir`, attach the native ops:

```ts
export function makeIpcDir(root: string, api: FsApi): FileSystemDirectoryHandle {
  const handle = makeDir(root, "", api) as any;
  handle.__native = {
    rename: (from: string, to: string) => api.rename(root, from, to),
    copyFile: (from: string, to: string) => api.copyFile(root, from, to),
  };
  return handle as unknown as FileSystemDirectoryHandle;
}
```

- [ ] **Step 4: Run to confirm passing**

Run: `npx vitest run src/ipcFs.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the Electron main handlers**

In `electron/main.cjs`, after `fsapi:mkdir`, add:

```js
ipcMain.handle("fsapi:rename", async (_e, _root, from, to) => {
  const dst = await guardedPath(to);
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.rename(await guardedPath(from), dst);
});

ipcMain.handle("fsapi:copyFile", async (_e, _root, from, to) => {
  const dst = await guardedPath(to);
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.copyFile(await guardedPath(from), dst);
});
```

- [ ] **Step 6: Expose in preload**

In `electron/preload.cjs`, add to the exposed `fsapi` object (mirror the existing methods' shape):

```js
  rename: (root, from, to) => ipcRenderer.invoke("fsapi:rename", root, from, to),
  copyFile: (root, from, to) => ipcRenderer.invoke("fsapi:copyFile", root, from, to),
```

- [ ] **Step 7: Verify build + typecheck**

Run: `npm run typecheck && npm run build`
Expected: both succeed.

- [ ] **Step 8: Commit**

```bash
git add src/ipcFs.ts src/ipcFs.test.ts electron/main.cjs electron/preload.cjs
git commit -m "feat(electron): native rename/copyFile IPC"
```

---

### Task 8: `fileTree.ts` — buildTree model

**Files:**
- Create: `src/fileTree.ts`
- Test: `src/fileTree.test.ts`

**Interfaces:**
- Consumes: `TreeEntry` from `./types`.
- Produces: `TreeNode = { name: string; path: string; kind: "file" | "dir"; entry?: TreeEntry; children: TreeNode[] }` and `buildTree(entries: TreeEntry[]): TreeNode[]` — nested roots, folders before files, alphabetical (locale, case-insensitive).

- [ ] **Step 1: Write the failing test**

Create `src/fileTree.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildTree } from "./fileTree";
import type { TreeEntry } from "./types";

describe("buildTree", () => {
  it("nests by path, folders first then alphabetical", () => {
    const entries: TreeEntry[] = [
      { path: "RRHH.bpmn", kind: "file" },
      { path: "Ventas", kind: "dir" },
      { path: "Ventas/B2C.bpmn", kind: "file" },
      { path: "Ventas/B2B.bpmn", kind: "file" },
      { path: "Compras", kind: "dir" },
    ];
    const roots = buildTree(entries);
    expect(roots.map((n) => n.name)).toEqual(["Compras", "Ventas", "RRHH.bpmn"]);
    const ventas = roots.find((n) => n.name === "Ventas")!;
    expect(ventas.children.map((c) => c.name)).toEqual(["B2B.bpmn", "B2C.bpmn"]);
    expect(ventas.children[0].path).toBe("Ventas/B2B.bpmn");
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/fileTree.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `buildTree`**

Create `src/fileTree.ts`:

```ts
import type { TreeEntry } from "./types";

export interface TreeNode {
  name: string;
  path: string;
  kind: "file" | "dir";
  entry?: TreeEntry;
  children: TreeNode[];
}

function ensureFolder(parent: TreeNode[], name: string, path: string): TreeNode {
  let node = parent.find((n) => n.kind === "dir" && n.name === name);
  if (!node) {
    node = { name, path, kind: "dir", children: [] };
    parent.push(node);
  }
  return node;
}

function sortNodes(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  for (const n of nodes) if (n.children.length) sortNodes(n.children);
}

export function buildTree(entries: TreeEntry[]): TreeNode[] {
  const roots: TreeNode[] = [];
  // Folders first so file insertion finds parent dirs already created.
  const ordered = [...entries].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "dir" ? -1 : 1));
  for (const e of ordered) {
    const segs = e.path.split("/").filter(Boolean);
    let level = roots;
    let acc = "";
    for (let i = 0; i < segs.length; i++) {
      acc = acc ? `${acc}/${segs[i]}` : segs[i];
      const last = i === segs.length - 1;
      if (last && e.kind === "file") {
        level.push({ name: segs[i], path: e.path, kind: "file", entry: e, children: [] });
      } else {
        const folder = ensureFolder(level, segs[i], acc);
        level = folder.children;
      }
    }
  }
  sortNodes(roots);
  return roots;
}
```

- [ ] **Step 4: Run to confirm passing**

Run: `npx vitest run src/fileTree.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fileTree.ts src/fileTree.test.ts
git commit -m "feat(fileTree): buildTree model"
```

---

### Task 9: `fileTree.ts` — renderFileTree

**Files:**
- Modify: `src/fileTree.ts`
- Test: `src/fileTree.test.ts`

**Interfaces:**
- Consumes: `buildTree`, `TreeNode`; `Identity` from `./types` (the `me` shape used by `renderFileList`).
- Produces:
  ```ts
  export interface FileTreeHandlers {
    onOpen(id: string): void;
    onMenu(target: { path: string; kind: "file" | "dir" }, anchor: DOMRect): void;
    onToggle(path: string): void;
    onNewFile(parentPath: string): void;
    onNewFolder(parentPath: string): void;
  }
  export function renderFileTree(
    el: HTMLElement,
    entries: TreeEntry[],
    state: { expanded: Set<string>; selectedId: string | null; me: { name: string; email: string } },
    handlers: FileTreeHandlers,
  ): void;
  ```
  Renders root `+ archivo`/`+ carpeta` buttons, then the tree. Folders show a ▸/▾ toggle and their own `+`/`+`. Files show name + lock/✏️ chip + a `⋯` button. `data-path` set on rows.

- [ ] **Step 1: Write the failing test**

Add to `src/fileTree.test.ts`:

```ts
import { renderFileTree } from "./fileTree";

describe("renderFileTree", () => {
  const me = { name: "Ana", email: "Ana" };
  const entries: TreeEntry[] = [
    { path: "Ventas", kind: "dir" },
    { path: "Ventas/B2B.bpmn", kind: "file", appProperties: {} },
    { path: "RRHH.bpmn", kind: "file", appProperties: {} },
  ];
  it("renders folders collapsed by default; expands when in expanded set", () => {
    const el = document.createElement("div");
    renderFileTree(el, entries, { expanded: new Set(), selectedId: null, me }, {
      onOpen() {}, onMenu() {}, onToggle() {}, onNewFile() {}, onNewFolder() {},
    });
    // collapsed: child file not rendered
    expect(el.querySelector('[data-path="Ventas/B2B.bpmn"]')).toBeNull();
    expect(el.querySelector('[data-path="Ventas"]')).not.toBeNull();
    expect(el.querySelector('[data-path="RRHH.bpmn"]')).not.toBeNull();

    const el2 = document.createElement("div");
    renderFileTree(el2, entries, { expanded: new Set(["Ventas"]), selectedId: null, me }, {
      onOpen() {}, onMenu() {}, onToggle() {}, onNewFile() {}, onNewFolder() {},
    });
    expect(el2.querySelector('[data-path="Ventas/B2B.bpmn"]')).not.toBeNull();
  });
  it("clicking a file row calls onOpen; ⋯ calls onMenu", () => {
    const el = document.createElement("div");
    let opened = ""; let menued = "";
    renderFileTree(el, entries, { expanded: new Set(), selectedId: null, me }, {
      onOpen: (id) => { opened = id; }, onMenu: (t) => { menued = t.path; },
      onToggle() {}, onNewFile() {}, onNewFolder() {},
    });
    (el.querySelector('[data-path="RRHH.bpmn"] .ft-name') as HTMLElement).click();
    expect(opened).toBe("RRHH.bpmn");
    (el.querySelector('[data-path="RRHH.bpmn"] .ft-menu') as HTMLElement).click();
    expect(menued).toBe("RRHH.bpmn");
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/fileTree.test.ts -t "renderFileTree"`
Expected: FAIL — `renderFileTree` not exported.

- [ ] **Step 3: Implement `renderFileTree`**

Append to `src/fileTree.ts`:

```ts
import type { TreeEntry } from "./types";
import { lockState } from "./lockManager";
import { readLock } from "./lockManager";

export interface FileTreeHandlers {
  onOpen(id: string): void;
  onMenu(target: { path: string; kind: "file" | "dir" }, anchor: DOMRect): void;
  onToggle(path: string): void;
  onNewFile(parentPath: string): void;
  onNewFolder(parentPath: string): void;
}

function lockChip(entry: TreeEntry | undefined, me: { email: string }): string {
  if (!entry?.appProperties) return "";
  const lock = readLock({ appProperties: entry.appProperties } as any);
  const kind = lockState(lock, { name: me.email, email: me.email } as any);
  if (kind === "mine") return ` <span class="ft-chip mine">✏️ vos</span>`;
  if (kind === "theirs") return ` <span class="ft-chip theirs">🔒 ${entry.appProperties.lockedByName || "otro"}</span>`;
  return "";
}

function addBar(el: HTMLElement, parentPath: string, h: FileTreeHandlers): void {
  const bar = document.createElement("div");
  bar.className = "ft-addbar";
  const f = document.createElement("button");
  f.type = "button"; f.className = "ft-add"; f.textContent = "+ archivo";
  f.addEventListener("click", () => h.onNewFile(parentPath));
  const d = document.createElement("button");
  d.type = "button"; d.className = "ft-add"; d.textContent = "+ carpeta";
  d.addEventListener("click", () => h.onNewFolder(parentPath));
  bar.append(f, d);
  el.appendChild(bar);
}

function renderNodes(
  container: HTMLElement,
  nodes: TreeNode[],
  depth: number,
  state: { expanded: Set<string>; selectedId: string | null; me: { name: string; email: string } },
  h: FileTreeHandlers,
): void {
  for (const node of nodes) {
    const row = document.createElement("div");
    row.className = "ft-row";
    row.dataset.path = node.path;
    row.style.paddingLeft = `${depth * 14 + 6}px`;
    if (node.kind === "dir") {
      const open = state.expanded.has(node.path);
      const tog = document.createElement("span");
      tog.className = "ft-toggle";
      tog.textContent = open ? "▾" : "▸";
      tog.addEventListener("click", () => h.onToggle(node.path));
      const name = document.createElement("span");
      name.className = "ft-name ft-folder";
      name.textContent = `📁 ${node.name}`;
      name.addEventListener("click", () => h.onToggle(node.path));
      const menu = document.createElement("button");
      menu.type = "button"; menu.className = "ft-menu"; menu.textContent = "⋯";
      menu.addEventListener("click", (e) => { e.stopPropagation(); h.onMenu({ path: node.path, kind: "dir" }, (e.currentTarget as HTMLElement).getBoundingClientRect()); });
      row.append(tog, name, menu);
      row.addEventListener("contextmenu", (e) => { e.preventDefault(); h.onMenu({ path: node.path, kind: "dir" }, (e.target as HTMLElement).getBoundingClientRect()); });
      container.appendChild(row);
      if (open) {
        renderNodes(container, node.children, depth + 1, state, h);
        const sub = document.createElement("div");
        sub.style.paddingLeft = `${(depth + 1) * 14 + 6}px`;
        addBar(sub, node.path, h);
        container.appendChild(sub);
      }
    } else {
      if (node.path === state.selectedId) row.classList.add("selected");
      const name = document.createElement("span");
      name.className = "ft-name";
      name.innerHTML = `📄 ${node.name}${lockChip(node.entry, state.me)}`;
      name.addEventListener("click", () => h.onOpen(node.path));
      const menu = document.createElement("button");
      menu.type = "button"; menu.className = "ft-menu"; menu.textContent = "⋯";
      menu.addEventListener("click", (e) => { e.stopPropagation(); h.onMenu({ path: node.path, kind: "file" }, (e.currentTarget as HTMLElement).getBoundingClientRect()); });
      row.append(name, menu);
      row.addEventListener("contextmenu", (e) => { e.preventDefault(); h.onMenu({ path: node.path, kind: "file" }, (e.target as HTMLElement).getBoundingClientRect()); });
      container.appendChild(row);
    }
  }
}

export function renderFileTree(
  el: HTMLElement,
  entries: TreeEntry[],
  state: { expanded: Set<string>; selectedId: string | null; me: { name: string; email: string } },
  handlers: FileTreeHandlers,
): void {
  el.innerHTML = "";
  renderNodes(el, buildTree(entries), 0, state, handlers);
  addBar(el, "", handlers);
}
```

Note: this `import` block goes at the TOP of `src/fileTree.ts` (merge with the existing `import type { TreeEntry }`). Verify `readLock`/`lockState` are exported from `src/lockManager.ts` (they are; used in `main.ts`).

- [ ] **Step 4: Run to confirm passing**

Run: `npx vitest run src/fileTree.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fileTree.ts src/fileTree.test.ts
git commit -m "feat(fileTree): renderFileTree with expand/collapse + menu hooks"
```

---

### Task 10: `contextMenu.ts`

**Files:**
- Create: `src/contextMenu.ts`
- Test: `src/contextMenu.test.ts`
- Modify: `src/app.css` (menu styles — reuse `.menu-pop`)

**Interfaces:**
- Produces:
  ```ts
  export interface MenuItem { label: string; danger?: boolean; onClick(): void; }
  export function openContextMenu(anchor: DOMRect, items: MenuItem[]): void; // closes any open one first
  ```
  Renders a `.menu-pop` fixed at the anchor; closes on outside click / Escape / item click.

- [ ] **Step 1: Write the failing test**

Create `src/contextMenu.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { openContextMenu } from "./contextMenu";

describe("openContextMenu", () => {
  beforeEach(() => { document.body.innerHTML = ""; });
  it("renders items and fires onClick, then closes", () => {
    let clicked = "";
    openContextMenu({ left: 10, bottom: 20, right: 10, top: 0 } as DOMRect, [
      { label: "Renombrar", onClick: () => { clicked = "Renombrar"; } },
      { label: "Borrar", danger: true, onClick: () => { clicked = "Borrar"; } },
    ]);
    const pop = document.querySelector(".ctx-menu")!;
    expect(pop).not.toBeNull();
    const buttons = pop.querySelectorAll("button");
    expect(Array.from(buttons).map((b) => b.textContent)).toEqual(["Renombrar", "Borrar"]);
    (buttons[1] as HTMLElement).click();
    expect(clicked).toBe("Borrar");
    expect(document.querySelector(".ctx-menu")).toBeNull(); // closed after click
  });
  it("only one menu at a time", () => {
    const a = { left: 0, bottom: 0, right: 0, top: 0 } as DOMRect;
    openContextMenu(a, [{ label: "A", onClick() {} }]);
    openContextMenu(a, [{ label: "B", onClick() {} }]);
    expect(document.querySelectorAll(".ctx-menu").length).toBe(1);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/contextMenu.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/contextMenu.ts`:

```ts
export interface MenuItem {
  label: string;
  danger?: boolean;
  onClick(): void;
}

let current: HTMLElement | null = null;

export function closeContextMenu(): void {
  if (current) {
    current.remove();
    current = null;
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
  }
}

function onOutside(e: MouseEvent): void {
  if (current && !current.contains(e.target as Node)) closeContextMenu();
}
function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape") closeContextMenu();
}

export function openContextMenu(anchor: DOMRect, items: MenuItem[]): void {
  closeContextMenu();
  const pop = document.createElement("div");
  pop.className = "menu-pop ctx-menu";
  pop.style.position = "fixed";
  pop.style.left = `${anchor.left}px`;
  pop.style.top = `${anchor.bottom}px`;
  for (const item of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = item.label;
    if (item.danger) b.className = "danger";
    b.addEventListener("click", () => { closeContextMenu(); item.onClick(); });
    pop.appendChild(b);
  }
  document.body.appendChild(pop);
  current = pop;
  // Defer listener attach so the opening click doesn't immediately close it.
  setTimeout(() => {
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);
}
```

- [ ] **Step 4: Run to confirm passing**

Run: `npx vitest run src/contextMenu.test.ts`
Expected: PASS.

- [ ] **Step 5: Add styles**

In `src/app.css`, add:

```css
.ctx-menu { z-index: 60; min-width: 180px; }
.ctx-menu button.danger { color: #C0392B; }
.ft-row { display: flex; align-items: center; gap: 4px; height: 26px; cursor: pointer; border-radius: 5px; }
.ft-row:hover { background: var(--hover); }
.ft-row.selected { background: var(--hover); font-weight: 600; }
.ft-toggle { width: 14px; text-align: center; color: var(--muted, #888); }
.ft-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ft-menu { opacity: 0; border: none; background: transparent; cursor: pointer; padding: 0 6px; font-size: 16px; color: var(--text); }
.ft-row:hover .ft-menu { opacity: 1; }
.ft-chip { font-size: 11px; }
.ft-chip.theirs { color: #C0392B; }
.ft-addbar { display: flex; gap: 6px; padding: 4px 6px; }
.ft-add { border: 1px dashed var(--border); background: transparent; color: var(--muted, #888); border-radius: 5px; cursor: pointer; font-size: 12px; padding: 2px 6px; }
.ft-add:hover { color: var(--text); }
```

- [ ] **Step 6: Commit**

```bash
git add src/contextMenu.ts src/contextMenu.test.ts src/app.css
git commit -m "feat: reusable context menu + file-tree styles"
```

---

### Task 11: `folderPicker.ts` (destination modal)

**Files:**
- Create: `src/folderPicker.ts`
- Test: `src/folderPicker.test.ts`

**Interfaces:**
- Consumes: `buildTree`/`TreeNode` from `./fileTree`; `TreeEntry`.
- Produces: `pickFolder(entries: TreeEntry[], opts: { title: string; disabledPath?: string }): Promise<string | null>` — resolves with the chosen folder path (`""` = root) or `null` if cancelled. Folders only; `disabledPath` and its descendants are non-selectable (for Move).

- [ ] **Step 1: Write the failing test**

Create `src/folderPicker.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { pickFolder } from "./folderPicker";
import type { TreeEntry } from "./types";

const entries: TreeEntry[] = [
  { path: "Ventas", kind: "dir" },
  { path: "Ventas/Sub", kind: "dir" },
  { path: "Compras", kind: "dir" },
];

describe("pickFolder", () => {
  beforeEach(() => { document.body.innerHTML = ""; });
  it("lists root + folders and resolves the chosen path", async () => {
    const p = pickFolder(entries, { title: "Mover a…" });
    const options = Array.from(document.querySelectorAll(".fp-folder")).map((b) => b.getAttribute("data-path"));
    expect(options).toEqual(["", "Compras", "Ventas", "Ventas/Sub"]);
    (document.querySelector('.fp-folder[data-path="Compras"]') as HTMLElement).click();
    (document.querySelector(".fp-confirm") as HTMLElement).click();
    expect(await p).toBe("Compras");
  });
  it("disables a path and its descendants; cancel resolves null", async () => {
    const p = pickFolder(entries, { title: "Mover a…", disabledPath: "Ventas" });
    expect((document.querySelector('.fp-folder[data-path="Ventas"]') as HTMLButtonElement).disabled).toBe(true);
    expect((document.querySelector('.fp-folder[data-path="Ventas/Sub"]') as HTMLButtonElement).disabled).toBe(true);
    (document.querySelector(".fp-cancel") as HTMLElement).click();
    expect(await p).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/folderPicker.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/folderPicker.ts`:

```ts
import type { TreeEntry } from "./types";

function folderPaths(entries: TreeEntry[]): string[] {
  const dirs = entries.filter((e) => e.kind === "dir").map((e) => e.path);
  dirs.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return ["", ...dirs];
}

function isDisabled(path: string, disabled?: string): boolean {
  if (disabled === undefined) return false;
  return path === disabled || path.startsWith(`${disabled}/`);
}

export function pickFolder(entries: TreeEntry[], opts: { title: string; disabledPath?: string }): Promise<string | null> {
  return new Promise((resolve) => {
    let selected: string | null = null;
    const overlay = document.createElement("div");
    overlay.className = "fp-overlay";
    const box = document.createElement("div");
    box.className = "fp-box";
    const h = document.createElement("h4");
    h.textContent = opts.title;
    box.appendChild(h);
    const list = document.createElement("div");
    list.className = "fp-list";
    for (const path of folderPaths(entries)) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "fp-folder";
      b.dataset.path = path;
      b.textContent = path === "" ? "📁 (raíz)" : `📁 ${path}`;
      b.disabled = isDisabled(path, opts.disabledPath);
      b.addEventListener("click", () => {
        selected = path;
        list.querySelectorAll(".fp-folder").forEach((x) => x.classList.remove("sel"));
        b.classList.add("sel");
      });
      list.appendChild(b);
    }
    box.appendChild(list);
    const actions = document.createElement("div");
    actions.className = "fp-actions";
    const cancel = document.createElement("button");
    cancel.type = "button"; cancel.className = "fp-cancel"; cancel.textContent = "Cancelar";
    const confirm = document.createElement("button");
    confirm.type = "button"; confirm.className = "fp-confirm"; confirm.textContent = "Aceptar";
    const close = (val: string | null) => { overlay.remove(); resolve(val); };
    cancel.addEventListener("click", () => close(null));
    confirm.addEventListener("click", () => close(selected));
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(null); });
    actions.append(cancel, confirm);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  });
}
```

- [ ] **Step 4: Run to confirm passing**

Run: `npx vitest run src/folderPicker.test.ts`
Expected: PASS.

- [ ] **Step 5: Add styles**

In `src/app.css`, add:

```css
.fp-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); display: flex; align-items: center; justify-content: center; z-index: 70; }
.fp-box { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; min-width: 320px; max-height: 70vh; display: flex; flex-direction: column; }
.fp-list { overflow: auto; margin: 8px 0; display: flex; flex-direction: column; gap: 2px; }
.fp-folder { text-align: left; background: transparent; border: none; color: var(--text); padding: 6px 8px; border-radius: 5px; cursor: pointer; }
.fp-folder:hover:not(:disabled) { background: var(--hover); }
.fp-folder.sel { background: var(--hover); font-weight: 600; }
.fp-folder:disabled { opacity: .4; cursor: not-allowed; }
.fp-actions { display: flex; justify-content: flex-end; gap: 8px; }
```

- [ ] **Step 6: Commit**

```bash
git add src/folderPicker.ts src/folderPicker.test.ts src/app.css
git commit -m "feat: destination folder picker modal"
```

---

### Task 12: Watcher — tree diff

**Files:**
- Modify: `src/watcher.ts`
- Test: `src/watcher.test.ts`

**Interfaces:**
- Consumes: `TreeEntry`.
- Produces: `diffTree(prev: Map<string,string>, next: TreeEntry[], openId: string | null, lastWrites: Map<string,string>): { reloadOpen: boolean; structureChanged: boolean; nextVersions: Map<string,string> }`. `reloadOpen` = the open file's version changed and isn't our own write. `structureChanged` = any add/remove of a path, or any non-open version change. Keeps the existing `classifyChange` for back-compat (still used? remove only if unused).

- [ ] **Step 1: Write the failing test**

Add to `src/watcher.test.ts`:

```ts
import { diffTree } from "./watcher";

describe("diffTree", () => {
  const lastWrites = new Map<string, string>([["open.bpmn", "5"]]);
  const versions = (m: Record<string, string>) => new Map(Object.entries(m));
  const entries = (m: Record<string, string>) =>
    Object.entries(m).map(([path, version]) => ({ path, kind: "file" as const, version }));

  it("flags reloadOpen when the open file changed externally", () => {
    const r = diffTree(versions({ "open.bpmn": "5" }), entries({ "open.bpmn": "6" }), "open.bpmn", lastWrites);
    expect(r.reloadOpen).toBe(true);
  });
  it("ignores our own write to the open file", () => {
    const r = diffTree(versions({ "open.bpmn": "5" }), entries({ "open.bpmn": "5" }), "open.bpmn", lastWrites);
    expect(r.reloadOpen).toBe(false);
    expect(r.structureChanged).toBe(false);
  });
  it("flags structureChanged on add/remove", () => {
    const r = diffTree(versions({ "a.bpmn": "1" }), entries({ "a.bpmn": "1", "b.bpmn": "2" }), null, lastWrites);
    expect(r.structureChanged).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/watcher.test.ts -t "diffTree"`
Expected: FAIL — `diffTree` not exported.

- [ ] **Step 3: Implement `diffTree`**

Append to `src/watcher.ts`:

```ts
import type { TreeEntry } from "./types";

export function diffTree(
  prev: Map<string, string>,
  next: TreeEntry[],
  openId: string | null,
  lastWrites: Map<string, string>,
): { reloadOpen: boolean; structureChanged: boolean; nextVersions: Map<string, string> } {
  const nextVersions = new Map<string, string>();
  for (const e of next) if (e.kind === "file" && e.version) nextVersions.set(e.path, e.version);

  let reloadOpen = false;
  let structureChanged = false;

  // additions / version changes
  for (const [path, version] of nextVersions) {
    const before = prev.get(path);
    if (before === undefined) { structureChanged = true; continue; }
    if (before !== version) {
      if (path === openId) {
        if (lastWrites.get(path) !== version) reloadOpen = true;
      } else {
        structureChanged = true;
      }
    }
  }
  // removals
  for (const path of prev.keys()) if (!nextVersions.has(path)) structureChanged = true;

  return { reloadOpen, structureChanged, nextVersions };
}
```

- [ ] **Step 4: Run to confirm passing**

Run: `npx vitest run src/watcher.test.ts`
Expected: PASS (existing `classifyChange` tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/watcher.ts src/watcher.test.ts
git commit -m "feat(watcher): tree diff"
```

---

### Task 13: Wire it all in `main.ts`

**Files:**
- Modify: `src/main.ts`
- Modify: `src/app.css` (aside scroll)

**Interfaces:**
- Consumes: `renderFileTree`, `openContextMenu`, `pickFolder`, `diffTree`, all new `fsClient`/`api` methods, `promptText`, `showToast`, `confirm`-style modal.
- Produces: the wired UI. No unit test (glue) — verified by build + E2E (Task 14), per project convention (`main.ts` has no unit test).

- [ ] **Step 1: Add imports + tree state**

At the top of `src/main.ts`, add imports:

```ts
import { renderFileTree } from "./fileTree";
import { openContextMenu } from "./contextMenu";
import { pickFolder } from "./folderPicker";
import { diffTree } from "./watcher";
import type { TreeEntry } from "./types";
```

Near the other `let` state (around line 66), add:

```ts
let expanded = new Set<string>();
let treeVersions = new Map<string, string>();
```

- [ ] **Step 2: Replace `refreshFileList` with a tree refresh**

Replace the body of `refreshFileList` (around line 522) so it lists the tree and renders it:

```ts
async function refreshFileList() {
  const all = await api.listTree();
  const conflicts = all.filter((e) => e.kind === "file" && isSyncConflict(e.path));
  const clean = all.filter((e) => !(e.kind === "file" && isSyncConflict(e.path)));
  renderSyncWarning(document.getElementById("sync")!, conflicts.map((f) => f.path));
  const selectedId = state.kind === "editing" ? state.fileId : null;
  renderFileTree(
    document.getElementById("files")!,
    clean,
    { expanded, selectedId, me },
    {
      onOpen: (id) => void openFile(id).catch(onError),
      onToggle: (path) => { if (expanded.has(path)) expanded.delete(path); else expanded.add(path); void refreshFileList().catch(onError); },
      onNewFile: (parent) => void newDiagramIn(parent).catch(onError),
      onNewFolder: (parent) => void newFolderIn(parent).catch(onError),
      onMenu: (target, anchor) => openItemMenu(target, anchor),
    },
  );
  treeVersions = new Map(clean.filter((e) => e.kind === "file" && e.version).map((e) => [e.path, e.version as string]));
}
```

- [ ] **Step 3: Add new-file/new-folder (contextual) + rename helpers**

Add these functions inside `bootstrap` (near `newDiagram`):

```ts
const isValidName = (n: string) => !!n && !/[\\/]/.test(n);

async function newDiagramIn(parent: string): Promise<void> {
  const name = await promptText("Nombre del nuevo diagrama (.bpmn)");
  if (!name) return;
  if (!isValidName(name)) { showToast("Nombre inválido (sin / ni \\)"); return; }
  const id = (parent ? `${parent}/` : "") + (name.endsWith(".bpmn") ? name : `${name}.bpmn`);
  const file = await api.createFile(id, EMPTY_BPMN);
  if (parent) expanded.add(parent);
  await refreshFileList();
  await openFile(file.id);
}

async function newFolderIn(parent: string): Promise<void> {
  const name = await promptText("Nombre de la carpeta");
  if (!name) return;
  if (!isValidName(name)) { showToast("Nombre inválido (sin / ni \\)"); return; }
  await api.createFolder(parent, name);
  expanded.add(parent ? `${parent}/${name}` : name);
  await refreshFileList();
}
```

Make the existing `newDiagram` (used by the toolbar `+`) delegate to root:

```ts
async function newDiagram() { await newDiagramIn(""); }
```

- [ ] **Step 4: Add the item context menu + safety + operations**

Add inside `bootstrap`:

```ts
// True if the entry is checked out by someone other than me.
function lockedByOther(path: string): boolean {
  const e = lastTree.find((x) => x.path === path);
  if (!e?.appProperties) return false;
  const kind = lockState(readLock({ appProperties: e.appProperties } as any), me);
  return kind === "theirs";
}
let lastTree: TreeEntry[] = [];

function openItemMenu(target: { path: string; kind: "file" | "dir" }, anchor: DOMRect): void {
  if (target.kind === "file") {
    openContextMenu(anchor, [
      { label: "Abrir", onClick: () => void openFile(target.path).catch(onError) },
      { label: "Renombrar", onClick: () => void renameItem(target.path, "file").catch(onError) },
      { label: "Duplicar", onClick: () => void dupItem(target.path).catch(onError) },
      { label: "Mover a…", onClick: () => void moveItem(target.path, "file").catch(onError) },
      { label: "Copiar a…", onClick: () => void copyItem(target.path).catch(onError) },
      { label: "Borrar", danger: true, onClick: () => void deleteItem(target.path, "file").catch(onError) },
    ]);
  } else {
    openContextMenu(anchor, [
      { label: "Nuevo diagrama aquí", onClick: () => void newDiagramIn(target.path).catch(onError) },
      { label: "Nueva subcarpeta", onClick: () => void newFolderIn(target.path).catch(onError) },
      { label: "Renombrar", onClick: () => void renameItem(target.path, "dir").catch(onError) },
      { label: "Mover a…", onClick: () => void moveItem(target.path, "dir").catch(onError) },
      { label: "Borrar", danger: true, onClick: () => void deleteItem(target.path, "dir").catch(onError) },
    ]);
  }
}

function blockIfLocked(path: string): boolean {
  if (lockedByOther(path)) { showToast("Está tomado por otra persona"); return true; }
  return false;
}
function folderHasOthersLock(folder: string): boolean {
  return lastTree.some((e) => e.kind === "file" && (e.path === folder || e.path.startsWith(`${folder}/`)) && lockedByOther(e.path));
}

async function closeIfOpen(path: string): Promise<void> {
  if (state.kind === "editing" && (state.fileId === path || state.fileId.startsWith(`${path}/`))) {
    dispatch({ type: "closedFile" });
    render();
  }
}

async function renameItem(path: string, kind: "file" | "dir"): Promise<void> {
  if (kind === "file" && blockIfLocked(path)) return;
  const current = path.slice(path.lastIndexOf("/") + 1).replace(/\.bpmn$/i, "");
  const name = await promptText("Nuevo nombre", { initial: current });
  if (!name) return;
  if (!isValidName(name)) { showToast("Nombre inválido"); return; }
  await closeIfOpen(path);
  if (kind === "file") await api.renameFile(path, name);
  else { const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""; await api.moveFolder(path, parent === "" ? "" : parent); /* same parent rename */ await api.renameFolderInPlace?.(path, name); }
  await refreshFileList();
}

async function dupItem(path: string): Promise<void> {
  await api.duplicateFile(path);
  await refreshFileList();
}

async function moveItem(path: string, kind: "file" | "dir"): Promise<void> {
  if (kind === "file" && blockIfLocked(path)) return;
  if (kind === "dir" && folderHasOthersLock(path)) { showToast("Hay archivos tomados por otros dentro"); return; }
  const dest = await pickFolder(lastTree, { title: "Mover a…", disabledPath: kind === "dir" ? path : undefined });
  if (dest === null) return;
  await closeIfOpen(path);
  if (kind === "file") await api.moveFile(path, dest);
  else await api.moveFolder(path, dest);
  if (dest) expanded.add(dest);
  await refreshFileList();
}

async function copyItem(path: string): Promise<void> {
  const dest = await pickFolder(lastTree, { title: "Copiar a…" });
  if (dest === null) return;
  await api.copyFile(path, dest);
  if (dest) expanded.add(dest);
  await refreshFileList();
}

async function deleteItem(path: string, kind: "file" | "dir"): Promise<void> {
  if (kind === "file" && blockIfLocked(path)) return;
  if (kind === "dir" && folderHasOthersLock(path)) { showToast("Hay archivos tomados por otros dentro"); return; }
  if (!confirm(`¿Borrar ${path}? No se puede deshacer.`)) return;
  await closeIfOpen(path);
  if (kind === "file") await api.deleteFile(path);
  else await api.deleteFolder(path);
  await refreshFileList();
}
```

NOTE for the implementer: the `renameItem` folder branch above is a placeholder using a non-existent helper. Replace the folder rename with a real same-parent rename using `moveFolder` semantics: implement a small `renameFolder(path, newName)` in `fsClient` (Task 6 addendum) OR compute it as: target = `join(parentOf(path), newName)`; call `api.moveFolder(path, parentOf(path))` is wrong (same dir). Instead add this method in `src/fsClient.ts` and use it here:

```ts
// src/fsClient.ts — add to the returned object
async renameFolder(path: string, newName: string): Promise<string> {
  const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const newPath = parent ? `${parent}/${newName}` : newName;
  if (newPath === path) return path;
  if (native) {
    await native.rename(path, newPath);
    if (await dirExists(`${HISTORY_DIR}/${path}`)) await native.rename(`${HISTORY_DIR}/${path}`, `${HISTORY_DIR}/${newPath}`);
  } else {
    await copySubtree(path, newPath, true);
    await removeDirAt(path);
    if (await dirExists(`${HISTORY_DIR}/${path}`)) { await copySubtree(`${HISTORY_DIR}/${path}`, `${HISTORY_DIR}/${newPath}`, true); await removeDirAt(`${HISTORY_DIR}/${path}`); }
  }
  return newPath;
},
```

Then in `renameItem`, the `dir` branch becomes simply: `await api.renameFolder(path, name);`. Add a test for `renameFolder` mirroring the `moveFolder` test (rename keeps parent, carries history).

- [ ] **Step 5: Track `lastTree` and wire the watcher**

In `refreshFileList`, set `lastTree = clean;` right after computing `clean`.

Replace `pollChanges` (around line 654) to use `diffTree`:

```ts
async function pollChanges() {
  if (state.kind === "signedOut") return;
  const all = await api.listTree();
  const clean = all.filter((e) => !(e.kind === "file" && isSyncConflict(e.path)));
  const openId = state.kind === "editing" ? state.fileId : null;
  const { reloadOpen, structureChanged } = diffTree(treeVersions, clean, openId, api.lastWrites);
  if (reloadOpen && openId) await handleExternalChange(openId);
  if (structureChanged) await refreshFileList();
  else treeVersions = new Map(clean.filter((e) => e.kind === "file" && e.version).map((e) => [e.path, e.version as string]));
}
```

- [ ] **Step 6: Make the header folder chip change the root**

Where `$("folderchip")` is set (around line 413), make it clickable:

```ts
$("folderchip").innerHTML = `${icon("folder")} <span>carpeta</span>`;
$("folderchip").style.cursor = "pointer";
$("folderchip").title = "Cambiar carpeta de trabajo";
$("folderchip").addEventListener("click", () => showFolderGate());
```

- [ ] **Step 7: aside scroll style**

In `src/app.css`, ensure the file panel scrolls:

```css
#files { overflow: auto; }
```

- [ ] **Step 8: Verify gates**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass. If `renameFolder` test was added in Step 4, it is green.

- [ ] **Step 9: Commit**

```bash
git add src/main.ts src/fsClient.ts src/fsClient.test.ts src/app.css
git commit -m "feat: wire file tree + operations + folder change into main"
```

---

### Task 14: E2E verification + repackage

**Files:** none (verification + packaging)

- [ ] **Step 1: Build and run E2E against the real Electron app**

Use the CDP harness pattern from this session (`chromium.connectOverCDP`, seeded `--user-data-dir` folder.json, `env -u ELECTRON_RUN_AS_NODE`). Drive: create subfolder → move a colored process into it (verify color survives) → duplicate → delete. Confirm no console errors and the tree updates.

Run (build first): `npm run build`

- [ ] **Step 2: Repackage the canonical exe (clean asar)**

```bash
node -e "const {packager}=require('@electron/packager');const E=/^[\\\\/](release|node_modules|src|docs|e2e|coverage|scratchpad|test|\\.git|\\.vscode|\\.superpowers|\\.playwright-mcp|\\.idea|dist[\\\\/].*\\.map)([\\\\/]|$)/;packager({dir:'.',name:'BPMN compartida',platform:'win32',arch:'x64',out:'release',overwrite:true,prune:false,ignore:p=>p!==''&&E.test(p)}).then(()=>console.log('OK'))"
```

Verify `release/BPMN compartida-win32-x64/resources/app.asar` is ~3 MB (not GBs) and the dist hash matches `dist/index.html`.

- [ ] **Step 3: Final commit (if any artifacts/docs)**

```bash
git add -A && git commit -m "chore: file-management feature verified + repackaged" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- Tree navigation → Tasks 8, 9, 13. Operations menu (⋯/right-click) → Tasks 10, 13. Move/Copy destination picker → Tasks 11, 13. Bundle semantics → Tasks 4, 5, 6. Subfolders + create → Tasks 1, 2, 4, 13. Safety (locks/open file) → Task 13. Native rename for Drive safety → Tasks 5, 7. Watcher tree diff → Task 12. Header chip → change root → Task 13. "Cambiar carpeta" fix → already committed (`aba4807`). Packaging → Task 14. ✓ All covered.

**Placeholder scan:** Task 13 Step 4 originally contained a placeholder folder-rename; it is explicitly resolved by adding `fsClient.renameFolder` (code given) and simplifying the `dir` branch to `api.renameFolder(path, name)`. No other placeholders.

**Type consistency:** `TreeEntry` (types.ts) used consistently across fsClient, fileTree, folderPicker, watcher, main. `listTree(): Promise<TreeEntry[]>`, `buildTree(entries): TreeNode[]`, `renderFileTree(el, entries, state, handlers)`, `diffTree(prev, next, openId, lastWrites)`, `pickFolder(entries, opts)` — signatures match their consumers. fsClient op names (`createFolder, deleteFile, renameFile, moveFile, copyFile, duplicateFile, moveFolder, copyFolder, deleteFolder, renameFolder`) match `main.ts` calls. `__native.rename/copyFile` produced in Task 7, consumed in Task 5.
