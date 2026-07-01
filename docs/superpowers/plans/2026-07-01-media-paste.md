# Plan 2b — Media: storage binario + pegar/soltar imágenes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Pegar o soltar una imagen en el editor de notas la guarda como archivo binario en `<diagrama>.docs/assets/` e inserta `![](assets/<archivo>)`; la imagen se **muestra** inline (editor CM6 y modo lectura) resolviendo la ruta `assets/…` a un blob URL leído del disco.

**Architecture:** Se agrega escritura/lectura **binaria** a la abstracción de almacenamiento (web: `createWritable().write(Blob)`; Electron: IPC nuevo que pasa base64 y escribe `Buffer`). `docsClient` gana `writeAsset`/`readAsset`/`listAssets`. Un **resolver** con caché convierte `assets/x.png` → blob URL (leyendo bytes) y se usa en el widget de imagen (edición) y al renderizar el modo lectura. El handler de paste/drop de CM6 escribe el asset e inserta el markdown.

**Tech Stack:** TypeScript + Vite, Vitest (happy-dom), CodeMirror 6, Electron IPC.

## Global Constraints

- **Acceso a disco solo vía `fsClient`/`docsClient`.** El binario viaja: web por `Blob`; Electron por IPC `fsapi:writeFileBinary`/`readFileBinary` (base64) contra `electron/main.cjs` (respetando `guardedPath`, igual que las rutas de texto).
- **Assets:** `<diagrama>.docs/assets/<nombre-único>.<ext>`. Nombre único `imagen-<n>.<ext>` evitando colisiones (chequea `listDir(assetsDir)`).
- **Display seguro:** las imágenes se muestran vía blob URL creado desde bytes leídos por la app; nunca se inyecta HTML del usuario. Los blob URLs se cachean por `diagramId+ref` y se revocan al destruir el editor/cambiar de nota.
- **Tests:** Vitest happy-dom, globals. Lógica pura (base64, nombre único, inserción, parse de refs) testeada; la escritura binaria round-trip contra un `fakeDir` extendido a binario; IPC de Electron NO se unit-testea (gate: typecheck+build+manual).
- **Gate por tarea:** `npm test` + `npm run typecheck` verdes antes de commit; tareas que tocan `main.ts`/CM6/Electron agregan `npm run build`.
- **Rama:** `feat/plan2b-media` (apilada sobre Plan 2a).

---

### Task 1: `base64.ts` — conversión bytes ↔ base64 (pura)

**Files:**
- Create: `src/processDocs/base64.ts`
- Test: `src/processDocs/base64.test.ts`

**Interfaces:**
- Produces:
  - `function bytesToBase64(bytes: Uint8Array): string`
  - `function base64ToBytes(b64: string): Uint8Array`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { bytesToBase64, base64ToBytes } from "./base64";

describe("base64", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 65, 66, 67]);
    const b64 = bytesToBase64(bytes);
    expect(typeof b64).toBe("string");
    expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(bytes));
  });

  it("round-trips a larger buffer without call-stack overflow", () => {
    const bytes = new Uint8Array(200000).map((_, i) => i % 256);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it("encodes empty input to empty output", () => {
    expect(bytesToBase64(new Uint8Array([]))).toBe("");
    expect(Array.from(base64ToBytes(""))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/base64.test.ts`
Expected: FAIL — cannot find module `./base64`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/base64.ts
// Chunked conversion so large buffers don't blow the call stack via String.fromCharCode(...).
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/base64.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/base64.ts src/processDocs/base64.test.ts
git commit -m "feat(docs): base64 byte conversion helpers (chunked)"
```

---

### Task 2: `fsClient` binario + `fakeDir` binario

**Files:**
- Modify: `src/fsClient.ts` (add `writeBinary`/`readBinary`)
- Modify: `src/testHelpers/fakeDir.ts` (support binary in the fake writable/getFile)
- Test: `src/fsClientBinary.test.ts`

**Interfaces:**
- Consumes: `bytesToBase64`/`base64ToBytes` (Task 1).
- Produces on the fsClient object:
  - `writeBinary(rel: string, data: Uint8Array): Promise<void>`
  - `readBinary(rel: string): Promise<Uint8Array | null>`

**Background:** `fsClient` writes text via `getFileHandle(...).createWritable().write(string)`. For binary, the WEB handle's writable accepts a `Blob`/`BufferSource` directly. The Electron IPC handle (`makeIpcDir`) exposes `__native` (currently `rename`/`copyFile`); Task 3 adds `__native.writeBinary`/`readBinary`. So `fsClient.writeBinary` branches: if `native?.writeBinary` exists → base64 + native; else (web) → real writable with the bytes. `readBinary` mirrors it.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { createFsClient } from "./fsClient";
import { createFakeDir } from "./testHelpers/fakeDir";

describe("fsClient binary", () => {
  it("round-trips binary through writeBinary/readBinary", async () => {
    const fs = createFsClient(createFakeDir());
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 255]);
    await fs.writeBinary("x.docs/assets/a.png", bytes);
    const back = await fs.readBinary("x.docs/assets/a.png");
    expect(back && Array.from(back)).toEqual(Array.from(bytes));
  });

  it("returns null reading a missing binary file", async () => {
    const fs = createFsClient(createFakeDir());
    expect(await fs.readBinary("nope.png")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/fsClientBinary.test.ts`
Expected: FAIL — `writeBinary` not a function.

- [ ] **Step 3: Extend `fakeDir.ts` to support binary**

In `src/testHelpers/fakeDir.ts`, the file record currently stores `{ data: string; mtime }`. Add an optional `bin?: Uint8Array`. Update `fileHandle`:
- `getFile()` returns an object that also exposes `async arrayBuffer()` returning `rec.bin?.buffer ?? new TextEncoder().encode(rec.data).buffer`.
- `createWritable()` `write(chunk)`: if `chunk` is a `Uint8Array` or `Blob`, store bytes; else accumulate string. On `close`, set `rec.bin` (if binary) or `rec.data`.

Concretely, replace `createWritable` and add `arrayBuffer` to `getFile`:

```ts
      async getFile() {
        return {
          name,
          lastModified: rec.mtime,
          size: rec.bin ? rec.bin.length : rec.data.length,
          async text() { return rec.data; },
          async arrayBuffer() {
            return (rec.bin ? rec.bin : new TextEncoder().encode(rec.data)).buffer;
          },
        };
      },
      async createWritable() {
        let sbuf = "";
        let bbuf: Uint8Array | null = null;
        return {
          async write(chunk: string | Uint8Array | Blob) {
            if (chunk instanceof Uint8Array) bbuf = chunk;
            else if (typeof Blob !== "undefined" && chunk instanceof Blob) bbuf = new Uint8Array(await chunk.arrayBuffer());
            else sbuf += chunk as string;
          },
          async close() {
            if (bbuf) { rec.bin = bbuf; rec.data = ""; }
            else { rec.data = sbuf; rec.bin = undefined; }
            rec.mtime = ++clock;
          },
        };
      },
```
(Extend the `files` map record type to `{ data: string; mtime: number; bin?: Uint8Array }`.)

- [ ] **Step 4: Add `writeBinary`/`readBinary` to `fsClient.ts`**

Inside `createFsClient`, near the other helpers, add (using the existing `resolveParent`, `statAt`, and the `native` escape hatch):

```ts
  const nativeBin = (dir as any).__native as
    | { writeBinary?(rel: string, base64: string): Promise<void>; readBinary?(rel: string): Promise<string | null> }
    | undefined;
```
Then in the returned object:

```ts
    async writeBinary(rel: string, data: Uint8Array): Promise<void> {
      if (nativeBin?.writeBinary) {
        const { bytesToBase64 } = await import("./processDocs/base64");
        await nativeBin.writeBinary(rel, bytesToBase64(data));
        return;
      }
      const { parent, name } = await resolveParent(rel, true);
      const fh = await parent.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(data);
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
```
(Reuse the existing `const native = (dir as any).__native ...` if present rather than redeclaring; if a `native` const already exists in scope, add the `writeBinary`/`readBinary` fields to its type and use it.)

- [ ] **Step 5: Run test + typecheck**

Run: `npx vitest run src/fsClientBinary.test.ts && npm run typecheck`
Expected: PASS (2 tests), typecheck clean.

- [ ] **Step 6: Full suite + commit**

Run: `npm test`
Expected: full suite green (the fakeDir change must not break existing tests).

```bash
git add src/fsClient.ts src/testHelpers/fakeDir.ts src/fsClientBinary.test.ts
git commit -m "feat(docs): binary read/write in fsClient (web Blob + native base64)"
```

---

### Task 3: Electron IPC binario (main + preload + FsApi)

**Files:**
- Modify: `electron/main.cjs` (handlers `fsapi:writeFileBinary`, `fsapi:readFileBinary`)
- Modify: `electron/preload.cjs` (expose them)
- Modify: `src/ipcFs.ts` (`FsApi` methods + `__native.writeBinary`/`readBinary`)

**Interfaces:**
- Produces: the Electron backend satisfies `fsClient.writeBinary`/`readBinary` (Task 2) via `__native`.

- [ ] **Step 1: Add IPC handlers in `electron/main.cjs`**

After the existing `fsapi:writeFile` handler (search for `ipcMain.handle("fsapi:writeFile"`), add:

```js
ipcMain.handle("fsapi:writeFileBinary", async (_e, _root, rel, base64) => {
  const p = await guardedPath(rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, Buffer.from(base64, "base64"));
});
ipcMain.handle("fsapi:readFileBinary", async (_e, _root, rel) => {
  try {
    const buf = await fs.readFile(await guardedPath(rel));
    return buf.toString("base64");
  } catch {
    return null;
  }
});
```
(Uses the same `guardedPath`, `fs`, `path` already imported in the file.)

- [ ] **Step 2: Expose in `electron/preload.cjs`**

In the `fsapi` object passed to `contextBridge.exposeInMainWorld("fsapi", { ... })`, add:

```js
  writeFileBinary: (root, rel, base64) => ipcRenderer.invoke("fsapi:writeFileBinary", root, rel, base64),
  readFileBinary: (root, rel) => ipcRenderer.invoke("fsapi:readFileBinary", root, rel),
```

- [ ] **Step 3: Extend `FsApi` + `__native` in `src/ipcFs.ts`**

Add to the `FsApi` interface:
```ts
  writeFileBinary(root: string, rel: string, base64: string): Promise<void>;
  readFileBinary(root: string, rel: string): Promise<string | null>;
```
In `makeIpcDir`, extend `__native`:
```ts
  handle.__native = {
    rename: (from: string, to: string) => api.rename(root, from, to),
    copyFile: (from: string, to: string) => api.copyFile(root, from, to),
    writeBinary: (rel: string, base64: string) => api.writeFileBinary(root, rel, base64),
    readBinary: (rel: string) => api.readFileBinary(root, rel),
  };
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: typecheck clean; build succeeds (no unit test — Electron IPC is exercised manually in Task 8).

- [ ] **Step 5: Commit**

```bash
git add electron/main.cjs electron/preload.cjs src/ipcFs.ts
git commit -m "feat(docs): Electron IPC for binary asset read/write"
```

---

### Task 4: `docsClient` assets

**Files:**
- Modify: `src/processDocs/docsClient.ts` (add `writeAsset`/`readAsset`/`listAssets`)
- Modify: `src/processDocs/docsClient.test.ts` (extend)

**Interfaces:**
- Consumes: `assetsDir` (from `docsPaths`), fsClient `writeBinary`/`readBinary`/`listDir`.
- Produces on `DocsClient`:
  - `writeAsset(diagramId: string, name: string, bytes: Uint8Array): Promise<void>`
  - `readAsset(diagramId: string, name: string): Promise<Uint8Array | null>`
  - `listAssets(diagramId: string): Promise<string[]>`

**Note:** `DocsFsApi` (the interface docsClient depends on) must gain `writeBinary`/`readBinary`; `fsClient` already satisfies them after Task 2.

- [ ] **Step 1: Write the failing test**

Add to `src/processDocs/docsClient.test.ts`:

```ts
it("writes, lists and reads a binary asset", async () => {
  const c = client(); // existing helper returning createDocsClient(createFsClient(createFakeDir()))
  const bytes = new Uint8Array([1, 2, 3, 4]);
  await c.writeAsset("x.bpmn", "imagen-1.png", bytes);
  expect(await c.listAssets("x.bpmn")).toEqual(["imagen-1.png"]);
  const back = await c.readAsset("x.bpmn", "imagen-1.png");
  expect(back && Array.from(back)).toEqual([1, 2, 3, 4]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/docsClient.test.ts`
Expected: FAIL — `writeAsset` not a function.

- [ ] **Step 3: Implement in `docsClient.ts`**

Add `assetsDir` to the import from `./docsPaths`. Extend `DocsFsApi`:
```ts
export interface DocsFsApi {
  readPath(rel: string): Promise<string | null>;
  writePath(rel: string, text: string): Promise<void>;
  deletePath(rel: string): Promise<void>;
  listDir(rel: string): Promise<{ name: string; kind: "file" | "directory" }[]>;
  writeBinary(rel: string, data: Uint8Array): Promise<void>;
  readBinary(rel: string): Promise<Uint8Array | null>;
}
```
Add methods to the returned object:
```ts
    writeAsset(diagramId: string, name: string, bytes: Uint8Array): Promise<void> {
      return api.writeBinary(`${assetsDir(diagramId)}/${name}`, bytes);
    },
    readAsset(diagramId: string, name: string): Promise<Uint8Array | null> {
      return api.readBinary(`${assetsDir(diagramId)}/${name}`);
    },
    async listAssets(diagramId: string): Promise<string[]> {
      const entries = await api.listDir(assetsDir(diagramId));
      return entries.filter((e) => e.kind === "file").map((e) => e.name);
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/docsClient.test.ts`
Expected: PASS (existing + 1 new).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add src/processDocs/docsClient.ts src/processDocs/docsClient.test.ts
git commit -m "feat(docs): docsClient asset write/read/list"
```

---

### Task 5: `assetInsert.ts` — nombre único + texto de inserción (puro)

**Files:**
- Create: `src/processDocs/assetInsert.ts`
- Test: `src/processDocs/assetInsert.test.ts`

**Interfaces:**
- Produces:
  - `function uniqueAssetName(existing: string[], ext: string): string` — `imagen-<n>.<ext>` con el menor `n>=1` libre.
  - `function imageMarkdown(name: string): string` — `![](assets/<name>)`.
  - `function extFromType(mime: string): string` — `image/png`→`png`, `image/jpeg`→`jpg`, `image/gif`→`gif`, `image/webp`→`webp`, `image/svg+xml`→`svg`; fallback `png`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { uniqueAssetName, imageMarkdown, extFromType } from "./assetInsert";

describe("assetInsert", () => {
  it("picks the first free imagen-<n>.<ext>", () => {
    expect(uniqueAssetName([], "png")).toBe("imagen-1.png");
    expect(uniqueAssetName(["imagen-1.png"], "png")).toBe("imagen-2.png");
    expect(uniqueAssetName(["imagen-1.png", "imagen-3.png"], "png")).toBe("imagen-2.png");
  });
  it("builds the image markdown pointing at assets/", () => {
    expect(imageMarkdown("imagen-1.png")).toBe("![](assets/imagen-1.png)");
  });
  it("maps mime types to extensions with a png fallback", () => {
    expect(extFromType("image/jpeg")).toBe("jpg");
    expect(extFromType("image/svg+xml")).toBe("svg");
    expect(extFromType("image/weird")).toBe("png");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/assetInsert.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/assetInsert.ts
const EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg",
  "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg",
};

export function extFromType(mime: string): string {
  return EXT[mime] ?? "png";
}

export function uniqueAssetName(existing: string[], ext: string): string {
  const set = new Set(existing);
  let n = 1;
  while (set.has(`imagen-${n}.${ext}`)) n++;
  return `imagen-${n}.${ext}`;
}

export function imageMarkdown(name: string): string {
  return `![](assets/${name})`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/assetInsert.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/assetInsert.ts src/processDocs/assetInsert.test.ts
git commit -m "feat(docs): pure asset naming + image markdown helpers"
```

---

### Task 6: `assetResolver.ts` — ref `assets/…` → blob URL (con caché)

**Files:**
- Create: `src/processDocs/assetResolver.ts`
- Test: `src/processDocs/assetResolver.test.ts`

**Interfaces:**
- Consumes: `DocsClient.readAsset` (Task 4).
- Produces:
  - `interface AssetResolver { resolve(ref: string): Promise<string | null>; dispose(): void }`
  - `function createAssetResolver(deps: { readAsset(name: string): Promise<Uint8Array | null>; mime?(name: string): string }): AssetResolver`
  - Resolves a ref like `assets/imagen-1.png` (or bare `imagen-1.png`) to a blob URL built from the bytes; caches by ref; `dispose()` revokes all created URLs.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { createAssetResolver } from "./assetResolver";

describe("createAssetResolver", () => {
  it("reads bytes once per ref and returns a stable blob url", async () => {
    const readAsset = vi.fn(async (name: string) => (name === "imagen-1.png" ? new Uint8Array([1, 2, 3]) : null));
    const r = createAssetResolver({ readAsset });
    const url1 = await r.resolve("assets/imagen-1.png");
    const url2 = await r.resolve("assets/imagen-1.png");
    expect(url1).toBe(url2);               // cached
    expect(readAsset).toHaveBeenCalledTimes(1);
    expect(url1?.startsWith("blob:") || url1?.startsWith("data:")).toBe(true);
    r.dispose();
  });

  it("returns null for a missing asset", async () => {
    const r = createAssetResolver({ readAsset: async () => null });
    expect(await r.resolve("assets/nope.png")).toBeNull();
  });

  it("ignores non-asset refs (http/absolute)", async () => {
    const readAsset = vi.fn(async () => new Uint8Array([1]));
    const r = createAssetResolver({ readAsset });
    expect(await r.resolve("https://x/y.png")).toBeNull();
    expect(readAsset).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/assetResolver.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/assetResolver.ts
export interface AssetResolver {
  resolve(ref: string): Promise<string | null>;
  dispose(): void;
}

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
};

function assetName(ref: string): string | null {
  // Only local asset refs: "assets/x.png" or a bare "x.png"; reject anything with a scheme or absolute path.
  if (/^[a-z]+:/i.test(ref) || ref.startsWith("/")) return null;
  const m = ref.match(/^(?:assets\/)?([^/]+)$/);
  return m ? m[1] : null;
}

export function createAssetResolver(deps: {
  readAsset(name: string): Promise<Uint8Array | null>;
}): AssetResolver {
  const cache = new Map<string, string>();
  return {
    async resolve(ref: string): Promise<string | null> {
      const name = assetName(ref);
      if (!name) return null;
      const hit = cache.get(name);
      if (hit) return hit;
      const bytes = await deps.readAsset(name);
      if (!bytes) return null;
      const ext = name.split(".").pop()?.toLowerCase() ?? "png";
      const url = URL.createObjectURL(new Blob([bytes], { type: MIME[ext] ?? "application/octet-stream" }));
      cache.set(name, url);
      return url;
    },
    dispose(): void {
      for (const url of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/assetResolver.test.ts`
Expected: PASS (3 tests). If happy-dom lacks `URL.createObjectURL`, add a minimal polyfill in the test setup OR assert the resolver calls `readAsset` once and returns a truthy string; note it in the report. (happy-dom does implement `URL.createObjectURL`.)

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/assetResolver.ts src/processDocs/assetResolver.test.ts
git commit -m "feat(docs): asset resolver (ref -> cached blob url)"
```

---

### Task 7: Pegar/soltar en CM6 + mostrar imágenes (edición y lectura)

**Files:**
- Modify: `src/processDocs/cmEditor.ts` (paste/drop handler + pasar `onInsertImage`/`resolver`)
- Modify: `src/processDocs/mdWidgets.ts` (imagen usa el resolver para el src)
- Modify: `src/processDocs/livePreview.ts` (pasar el resolver al widget de imagen)
- Modify: `src/processDocs/notePanelController.ts` (crear el resolver por nota; pasar `writeAsset` + resolver a `createMarkdownEditor`; resolver también las imágenes del modo lectura)
- Modify: `src/processDocs/notePanel.ts` (modo lectura: resolver `assets/` a blob url tras `renderMarkdown`)
- Test: `src/processDocs/mediaPaste.test.ts` (pure insert logic)

**Interfaces:**
- Consumes: `uniqueAssetName`/`imageMarkdown`/`extFromType` (Task 5), `AssetResolver` (Task 6), `DocsClient.writeAsset`/`listAssets` (Task 4).
- Produces:
  - `src/processDocs/mediaPaste.ts`: `async function handleImageDrop(view, file, deps): Promise<boolean>` where `deps = { listAssets(): Promise<string[]>; writeAsset(name, bytes): Promise<void> }` — writes the asset with a unique name and inserts `![](assets/name)` at the selection; returns true if it handled an image.
  - `createMarkdownEditor` gains `opts.onPasteImage?(file: File): Promise<void>` and `opts.resolveAsset?(ref): Promise<string|null>` (passed to livePreview → image widget).

- [ ] **Step 1: Write the failing test (pure paste-insert logic)**

```ts
import { describe, it, expect, vi } from "vitest";
import { insertImageText } from "./mediaPaste";

describe("insertImageText", () => {
  it("computes a unique name and the markdown to insert", () => {
    const r = insertImageText(["imagen-1.png"], "image/png");
    expect(r.name).toBe("imagen-2.png");
    expect(r.text).toBe("![](assets/imagen-2.png)");
  });
  it("uses the mime extension", () => {
    expect(insertImageText([], "image/jpeg").name).toBe("imagen-1.jpg");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/mediaPaste.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create `mediaPaste.ts`**

```ts
// src/processDocs/mediaPaste.ts
import type { EditorView } from "@codemirror/view";
import { uniqueAssetName, imageMarkdown, extFromType } from "./assetInsert";

export function insertImageText(existing: string[], mime: string): { name: string; text: string } {
  const name = uniqueAssetName(existing, extFromType(mime));
  return { name, text: imageMarkdown(name) };
}

export interface MediaDeps {
  listAssets(): Promise<string[]>;
  writeAsset(name: string, bytes: Uint8Array): Promise<void>;
}

// Writes the dropped/pasted image and inserts its markdown at the current selection.
export async function handleImageFile(view: EditorView, file: File, deps: MediaDeps): Promise<boolean> {
  if (!file.type.startsWith("image/")) return false;
  const existing = await deps.listAssets();
  const { name, text } = insertImageText(existing, file.type);
  const bytes = new Uint8Array(await file.arrayBuffer());
  await deps.writeAsset(name, bytes);
  const sel = view.state.selection.main;
  view.dispatch({ changes: { from: sel.from, to: sel.to, insert: text }, selection: { anchor: sel.from + text.length } });
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/mediaPaste.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the handler + image display**

1. `cmEditor.ts`: accept `opts.media?: MediaDeps` and `opts.resolveAsset?`. Add `EditorView.domEventHandlers({ paste, drop })` that, on an image in `e.clipboardData`/`e.dataTransfer`, calls `handleImageFile(view, file, opts.media)` (preventDefault when handled). Pass `opts.resolveAsset` into `livePreview(opts.resolveAsset)`.
2. `livePreview.ts`: `livePreview(resolveAsset?)` forwards it to the image widget constructor.
3. `mdWidgets.ts`: `ImageWidgetType` gains an optional `resolve?(ref): Promise<string|null>`. In `toDOM`, build the `<img>`; if `resolve` is provided, set `src=""` then `resolve(this.src).then(url => { if (url) img.src = url; })`; otherwise set `src` directly (web relative may still fail — the resolver is the reliable path). `buildWidgetDom` keeps working for tests without a resolver.
4. `notePanelController.ts`: create an `AssetResolver` per note (`createAssetResolver({ readAsset: (n) => docsClient.readAsset(diagramId, n) })`); dispose it on note change/destroy. Pass `media = { listAssets: () => docsClient.listAssets(diagramId), writeAsset: (n, b) => docsClient.writeAsset(diagramId, n, b) }` and `resolveAsset: (ref) => resolver.resolve(ref)` into `createMarkdownEditor`. For read mode, after building the read view's HTML, query its `img[src^="assets/"]`, and for each set `src` from `await resolver.resolve(src)`.
5. `notePanel.ts`: expose a hook `h.onReadHostReady?(readEl)` (like `onEditHostReady`) so the controller can resolve images in the rendered read view; or the controller passes a `resolveImages(container)` step invoked after render. Keep it optional so existing tests pass.

(Show the concrete edits; keep `buildWidgetDom` and existing widget tests unchanged — the resolver is additive/optional.)

- [ ] **Step 6: Typecheck, full suite, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; all tests pass; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/processDocs/mediaPaste.ts src/processDocs/mediaPaste.test.ts src/processDocs/cmEditor.ts src/processDocs/livePreview.ts src/processDocs/mdWidgets.ts src/processDocs/notePanelController.ts src/processDocs/notePanel.ts
git commit -m "feat(docs): paste/drop images to assets and render them inline"
```

---

### Task 8: Verificación manual (build/exe)

**Files:** none (manual gate).

- [ ] **Step 1: Build + run**

Run `npm run build`; the controller packs the preview `.exe`. Verify in the app:
1. En una nota (modo Editar CM6), pegar una imagen desde el portapapeles → aparece `![](assets/imagen-1.png)` y se muestra la imagen inline.
2. Soltar (drag&drop) un archivo de imagen sobre el editor → igual.
3. En disco: `<diagrama>.docs/assets/imagen-1.png` existe y es un PNG válido.
4. Cambiar a modo Leer → la imagen se muestra (resuelta a blob url).
5. Reabrir el diagrama → la imagen sigue viéndose (se re-lee del disco).

- [ ] **Step 2: Commit (if any manual-fix needed, otherwise skip)**

---

## Self-Review

**Spec coverage (sección C del spec 2026-07-01):**
- Storage binario (web Blob + Electron IPC base64) → Tasks 2, 3. ✓
- `docsClient.writeAsset`/`assetsDir` → Task 4. ✓
- Paste/drop → `assets/` + inserción `![](assets/…)` → Tasks 5, 7. ✓
- Nombre único `imagen-<n>` → Task 5. ✓
- **Display** (leer bytes → blob url; edición y lectura) → Tasks 6, 7 (más allá del texto del spec, necesario para que la imagen se vea en Electron). ✓

**Placeholder scan:** sin TBD/TODO; código real salvo Task 7 paso 5, donde las ediciones de wiring se describen con anclas concretas (múltiples archivos) — el implementador tiene los tipos y funciones exactas (Tasks 4-6) y una verificación manual (Task 8) cierra el lazo, igual que la integración de `main.ts` del Plan 1.

**Type consistency:** `bytesToBase64`/`base64ToBytes` (T1) → T2/fsClient; `writeBinary`/`readBinary` (T2) → `DocsFsApi`/`docsClient` (T4); `AssetResolver`/`createAssetResolver` (T6) → controller/mdWidgets (T7); `insertImageText`/`handleImageFile`/`MediaDeps` (T7) coherentes. `assetsDir` de `docsPaths` (Plan 1) reusado.

**Nota de ejecución:** Task 3 (Electron IPC) y Task 7 paso 5 (wiring CM6/lectura) no tienen unit tests (Electron + integración CM6/DOM); su gate es typecheck+build+verificación manual (Task 8). happy-dom implementa `URL.createObjectURL`/`Blob.arrayBuffer`; si algún método faltara, degradar la aserción y anotarlo.
