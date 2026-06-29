# Shared BPMN Editor (BPMN compartida) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A client-only web app to edit BPMN diagrams stored as `.bpmn` files in a shared Google Drive folder, with advisory file check-out/check-in, external-change detection, and revision-based history/rollback.

**Architecture:** Serverless SPA. Pure logic (lock decisions, retention math, change classification, app state) is isolated into side-effect-free modules that are unit-tested without network or DOM. Thin IO shells (`driveClient`, `auth`, `editor`, Drive Picker) wrap the Google/bpmn-js globals. `main.ts` is the imperative shell wiring events to a pure reducer and effects.

**Tech Stack:** Vanilla TypeScript, Vite (build/dev), Vitest + happy-dom (tests), bpmn-js (canvas), Google Identity Services + Google Drive REST v3 + Drive Picker (auth/storage).

## Global Constraints

- No backend server of any kind. All persistence is Google Drive (file content + `appProperties` + revisions) and `localStorage`.
- Source of truth for "did a file change" is Drive `version`/`headRevisionId` (monotonic), never `modifiedTime`.
- Locks are **advisory**: external editors bypass them; the app must still detect external changes.
- Restore is **non-destructive**: restoring writes a new revision; never deletes history.
- OAuth scope: `https://www.googleapis.com/auth/drive`, run in OAuth "Testing" mode (≤100 test users).
- `keepForever` pin budget per file: hard ceiling 200; keep-set caps at 150.
- Secrets/config (client ID, API key) come from Vite env (`import.meta.env.VITE_*`); never hard-coded, never committed (`.env` is git-ignored).
- TDD throughout: failing test → minimal impl → passing test → commit.

## File Structure

```
package.json            # deps + scripts
tsconfig.json           # strict TS
vite.config.ts          # Vite + Vitest config
index.html              # app shell + Google <script> tags
.env.example            # documents required env vars
src/
  config.ts             # reads VITE_* env
  types.ts              # shared domain types
  lockManager.ts        # PURE lock decisions
  history.ts            # PURE keepSet/diffPins + (later) restore orchestration
  watcher.ts            # PURE change classification + (later) polling loop
  state.ts              # PURE app-state reducer
  driveClient.ts        # Drive REST v3 wrapper (fetch)
  auth.ts               # Google Identity Services wrapper
  editor.ts             # bpmn-js Modeler wrapper + dirty tracking
  folderConfig.ts       # Drive Picker + localStorage
  ui.ts                 # DOM render helpers (toast, conflict bar, history panel, file list)
  main.ts               # wiring / effects
src/*.test.ts           # co-located unit tests
README.md               # setup + OAuth + manual test checklist
```

**Test boundaries:** Tasks 3–6 are pure and fully unit-tested. Task 7 (`driveClient`) is tested with a mocked `fetch`. Task 9 (`editor`) is tested against a fake modeler interface. Tasks 8, 10, 11, 12 are thin/integration and verified by the manual checklist in Task 13.

---

## Task 1: Project scaffold + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.env.example`, `src/sanity.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test` / `npm run dev` toolchain for all later tasks.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "bpmn-compartida",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "bpmn-js": "^17.11.1"
  },
  "devDependencies": {
    "happy-dom": "^15.11.6",
    "typescript": "^5.6.3",
    "vite": "^5.4.11",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

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
    "types": ["vite/client", "vitest/globals"],
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `vite.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
  },
});
```

- [ ] **Step 4: Write `index.html`**

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BPMN compartida</title>
    <!--
      Google's GIS + gapi loaders are intentionally NOT version-pinned and
      Google does not publish SRI hashes for them (they are mutable loaders),
      so Subresource Integrity cannot be applied here. They must load from
      Google's origin. bpmn-js CSS is NOT loaded from a CDN — it is bundled
      from the npm package via main.ts (see Task 12), avoiding CDN risk and
      pinning it to the installed version.
    -->
    <script src="https://accounts.google.com/gsi/client" async></script>
    <script src="https://apis.google.com/js/api.js" async></script>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Write `.env.example`**

```
VITE_GOOGLE_CLIENT_ID=your-oauth-client-id.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=your-drive-api-key
VITE_DRIVE_SCOPE=https://www.googleapis.com/auth/drive
```

- [ ] **Step 6: Write the sanity test `src/sanity.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Install and run the test**

Run: `npm install && npm test`
Expected: 1 passing test (`toolchain > runs vitest`).

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json vite.config.ts index.html .env.example src/sanity.test.ts package-lock.json
git commit -m "chore: scaffold Vite + TS + Vitest toolchain"
```

---

## Task 2: Shared types + config

**Files:**
- Create: `src/types.ts`, `src/config.ts`, `src/config.test.ts`

**Interfaces:**
- Produces:
  - `User { name: string; email: string }`
  - `DriveFile { id; name; modifiedTime; version; headRevisionId; appProperties?; lastModifyingUser? }`
  - `LockInfo { lockedBy?; lockedByEmail?; lockedByName?; lockedAt? }`
  - `LockState = "free" | "mine" | "theirs"`
  - `Revision { id; modifiedTime; lastModifyingUser?; sizeBytes?; keepForever? }`
  - `RestorePoint { id; modifiedTime; authorName; authorEmail; isExternal; sizeBytes? }`
  - `config { clientId; apiKey; scope }`

- [ ] **Step 1: Write `src/types.ts`**

```ts
export interface User {
  name: string;
  email: string;
}

export interface DriveUser {
  displayName: string;
  emailAddress: string;
}

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string; // RFC3339
  version: string; // monotonic string per Drive
  headRevisionId: string;
  appProperties?: Record<string, string>;
  lastModifyingUser?: DriveUser;
}

export interface LockInfo {
  lockedBy?: string;
  lockedByEmail?: string;
  lockedByName?: string;
  lockedAt?: string; // RFC3339
}

export type LockState = "free" | "mine" | "theirs";

export interface Revision {
  id: string;
  modifiedTime: string; // RFC3339
  lastModifyingUser?: DriveUser;
  sizeBytes?: number;
  keepForever?: boolean;
}

export interface RestorePoint {
  id: string;
  modifiedTime: string;
  authorName: string;
  authorEmail: string;
  isExternal: boolean;
  sizeBytes?: number;
}
```

- [ ] **Step 2: Write the failing test `src/config.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { config } from "./config";

describe("config", () => {
  it("falls back to the full drive scope when unset", () => {
    expect(config.scope).toContain("auth/drive");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/config.test.ts`
Expected: FAIL — cannot find module `./config`.

- [ ] **Step 4: Write `src/config.ts`**

```ts
export const config = {
  clientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) ?? "",
  apiKey: (import.meta.env.VITE_GOOGLE_API_KEY as string) ?? "",
  scope:
    (import.meta.env.VITE_DRIVE_SCOPE as string) ??
    "https://www.googleapis.com/auth/drive",
};
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/config.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/config.ts src/config.test.ts
git commit -m "feat: shared domain types and env config"
```

---

## Task 3: lockManager pure logic

**Files:**
- Create: `src/lockManager.ts`, `src/lockManager.test.ts`

**Interfaces:**
- Consumes: `DriveFile`, `LockInfo`, `LockState`, `User` from `./types`.
- Produces:
  - `readLock(file: DriveFile): LockInfo`
  - `lockState(lock: LockInfo, me: User): LockState`
  - `isStale(lock: LockInfo, nowMs: number, ttlMs?: number): boolean`
  - `canCheckOut(lock: LockInfo, me: User): boolean`
  - `lockProps(me: User, nowIso: string): Record<string, string>` (appProperties to write on check-out)
  - `clearProps(): Record<string, string>` (appProperties to write on check-in/steal)
  - `STALE_MS: number`

- [ ] **Step 1: Write the failing test `src/lockManager.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  readLock,
  lockState,
  isStale,
  canCheckOut,
  lockProps,
  clearProps,
  STALE_MS,
} from "./lockManager";
import type { DriveFile, User } from "./types";

const me: User = { name: "Ana", email: "ana@x.com" };
const other: User = { name: "Bob", email: "bob@x.com" };

function fileWith(props: Record<string, string>): DriveFile {
  return {
    id: "f1",
    name: "p.bpmn",
    modifiedTime: "2026-06-23T10:00:00Z",
    version: "1",
    headRevisionId: "r1",
    appProperties: props,
  };
}

describe("lockManager", () => {
  it("reads no lock from empty appProperties", () => {
    expect(lockState(readLock(fileWith({})), me)).toBe("free");
  });

  it("recognizes my own lock", () => {
    const f = fileWith({ lockedBy: me.email, lockedByEmail: me.email, lockedAt: "2026-06-23T10:00:00Z" });
    expect(lockState(readLock(f), me)).toBe("mine");
  });

  it("recognizes someone else's lock", () => {
    const f = fileWith({ lockedBy: other.email, lockedByEmail: other.email, lockedAt: "2026-06-23T10:00:00Z" });
    expect(lockState(readLock(f), me)).toBe("theirs");
  });

  it("allows check-out when free or mine, not when theirs", () => {
    expect(canCheckOut(readLock(fileWith({})), me)).toBe(true);
    expect(canCheckOut(readLock(fileWith({ lockedByEmail: me.email })), me)).toBe(true);
    expect(canCheckOut(readLock(fileWith({ lockedByEmail: other.email })), me)).toBe(false);
  });

  it("detects stale locks past the TTL", () => {
    const lockedAt = "2026-06-23T10:00:00Z";
    const base = Date.parse(lockedAt);
    expect(isStale({ lockedAt }, base + STALE_MS - 1)).toBe(false);
    expect(isStale({ lockedAt }, base + STALE_MS + 1)).toBe(true);
    expect(isStale({}, base + STALE_MS + 1)).toBe(false);
  });

  it("builds and clears lock appProperties", () => {
    const p = lockProps(me, "2026-06-23T10:00:00Z");
    expect(p.lockedByEmail).toBe(me.email);
    expect(p.lockedAt).toBe("2026-06-23T10:00:00Z");
    // Drive deletes a key when its value is empty string
    expect(clearProps().lockedByEmail).toBe("");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lockManager.test.ts`
Expected: FAIL — cannot find module `./lockManager`.

- [ ] **Step 3: Write `src/lockManager.ts`**

```ts
import type { DriveFile, LockInfo, LockState, User } from "./types";

// Advisory staleness hint only — never enforced; informs the "steal" affordance.
export const STALE_MS = 1000 * 60 * 60 * 2; // 2 hours

export function readLock(file: DriveFile): LockInfo {
  const p = file.appProperties ?? {};
  return {
    lockedBy: p.lockedBy || undefined,
    lockedByEmail: p.lockedByEmail || undefined,
    lockedByName: p.lockedByName || undefined,
    lockedAt: p.lockedAt || undefined,
  };
}

export function lockState(lock: LockInfo, me: User): LockState {
  if (!lock.lockedByEmail) return "free";
  return lock.lockedByEmail === me.email ? "mine" : "theirs";
}

export function canCheckOut(lock: LockInfo, me: User): boolean {
  const s = lockState(lock, me);
  return s === "free" || s === "mine";
}

export function isStale(lock: LockInfo, nowMs: number, ttlMs: number = STALE_MS): boolean {
  if (!lock.lockedAt) return false;
  return nowMs - Date.parse(lock.lockedAt) > ttlMs;
}

export function lockProps(me: User, nowIso: string): Record<string, string> {
  return {
    lockedBy: me.email,
    lockedByEmail: me.email,
    lockedByName: me.name,
    lockedAt: nowIso,
  };
}

// Setting an appProperties value to "" instructs Drive to delete that key.
export function clearProps(): Record<string, string> {
  return { lockedBy: "", lockedByEmail: "", lockedByName: "", lockedAt: "" };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lockManager.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lockManager.ts src/lockManager.test.ts
git commit -m "feat: pure advisory lock decision logic"
```

---

## Task 4: history retention math (keepSet + diffPins)

**Files:**
- Create: `src/history.ts`, `src/history.test.ts`

**Interfaces:**
- Consumes: `Revision` from `./types`.
- Produces:
  - `keepSet(revisions: Revision[], nowMs: number, opts?: KeepSetOptions): Set<string>`
  - `diffPins(current: Revision[], desired: Set<string>): { pin: string[]; unpin: string[] }`
  - `KeepSetOptions { budget?: number; baseMs?: number; factor?: number }`

- [ ] **Step 1: Write the failing test `src/history.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { keepSet, diffPins } from "./history";
import type { Revision } from "./types";

const HOUR = 60 * 60 * 1000;
const now = Date.parse("2026-06-23T12:00:00Z");

function rev(id: string, ageHours: number, keepForever = false): Revision {
  return { id, modifiedTime: new Date(now - ageHours * HOUR).toISOString(), keepForever };
}

describe("keepSet", () => {
  it("returns empty for no revisions", () => {
    expect(keepSet([], now).size).toBe(0);
  });

  it("always keeps the newest (head) revision", () => {
    const revs = [rev("head", 0), rev("a", 1), rev("b", 5)];
    expect(keepSet(revs, now).has("head")).toBe(true);
  });

  it("thins exponentially: keeps fewer points as age grows", () => {
    const revs: Revision[] = [];
    for (let h = 0; h <= 256; h++) revs.push(rev(`r${h}`, h));
    const kept = keepSet(revs, now);
    // recent hours are individually addressable; far past collapses to sparse points
    const keptAges = revs.filter((r) => kept.has(r.id)).map((r) => (now - Date.parse(r.modifiedTime)) / HOUR);
    keptAges.sort((a, b) => a - b);
    // gaps between successive kept points should generally grow
    const firstGap = keptAges[2] - keptAges[1];
    const lastGap = keptAges[keptAges.length - 1] - keptAges[keptAges.length - 2];
    expect(lastGap).toBeGreaterThan(firstGap);
  });

  it("never exceeds the pin budget", () => {
    const revs: Revision[] = [];
    for (let h = 0; h <= 10000; h++) revs.push(rev(`r${h}`, h));
    expect(keepSet(revs, now, { budget: 50 }).size).toBeLessThanOrEqual(50);
  });
});

describe("diffPins", () => {
  it("pins wanted-unpinned and unpins unwanted-pinned", () => {
    const current = [rev("a", 0, false), rev("b", 1, true), rev("c", 2, true)];
    const desired = new Set(["a", "b"]);
    const { pin, unpin } = diffPins(current, desired);
    expect(pin).toEqual(["a"]);
    expect(unpin).toEqual(["c"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/history.test.ts`
Expected: FAIL — cannot find module `./history`.

- [ ] **Step 3: Write `src/history.ts`**

```ts
import type { Revision } from "./types";

export interface KeepSetOptions {
  budget?: number; // max pins (default 150, hard ceiling below Drive's 200)
  baseMs?: number; // smallest target age gap (default 1h)
  factor?: number; // geometric growth factor (default 2)
}

/**
 * Exponential-decay retention. Always keeps the newest revision, then keeps
 * the revision nearest each geometrically-growing target age. Result: dense
 * recent restore points, exponentially sparser going back, bounded by budget.
 */
export function keepSet(
  revisions: Revision[],
  nowMs: number,
  opts: KeepSetOptions = {},
): Set<string> {
  const budget = opts.budget ?? 150;
  const baseMs = opts.baseMs ?? 60 * 60 * 1000;
  const factor = opts.factor ?? 2;
  const keep = new Set<string>();
  if (revisions.length === 0) return keep;

  const sorted = [...revisions].sort(
    (a, b) => Date.parse(b.modifiedTime) - Date.parse(a.modifiedTime),
  );
  keep.add(sorted[0].id); // head always kept

  const oldestAge = nowMs - Date.parse(sorted[sorted.length - 1].modifiedTime);
  for (let age = baseMs; age <= oldestAge && keep.size < budget; age *= factor) {
    const targetTime = nowMs - age;
    let best = sorted[0];
    let bestDelta = Infinity;
    for (const r of sorted) {
      const d = Math.abs(Date.parse(r.modifiedTime) - targetTime);
      if (d < bestDelta) {
        bestDelta = d;
        best = r;
      }
    }
    keep.add(best.id);
  }
  return keep;
}

export function diffPins(
  current: Revision[],
  desired: Set<string>,
): { pin: string[]; unpin: string[] } {
  const pin: string[] = [];
  const unpin: string[] = [];
  for (const r of current) {
    const want = desired.has(r.id);
    if (want && !r.keepForever) pin.push(r.id);
    if (!want && r.keepForever) unpin.push(r.id);
  }
  return { pin, unpin };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/history.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/history.ts src/history.test.ts
git commit -m "feat: exponential-decay revision retention math"
```

---

## Task 5: watcher change classification

**Files:**
- Create: `src/watcher.ts`, `src/watcher.test.ts`

**Interfaces:**
- Produces:
  - `ChangeRecord { fileId: string; version?: string; removed?: boolean }`
  - `isOwnWrite(change: ChangeRecord, lastWrites: Map<string, string>): boolean`
  - `classifyChange(change, openFileId, lastWrites): "ignore" | "reload-open" | "list-changed"`

- [ ] **Step 1: Write the failing test `src/watcher.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { isOwnWrite, classifyChange } from "./watcher";

describe("watcher classification", () => {
  const lastWrites = new Map<string, string>([["open", "5"]]);

  it("treats a change matching our last write as our own", () => {
    expect(isOwnWrite({ fileId: "open", version: "5" }, lastWrites)).toBe(true);
    expect(isOwnWrite({ fileId: "open", version: "6" }, lastWrites)).toBe(false);
    expect(isOwnWrite({ fileId: "other", version: "1" }, lastWrites)).toBe(false);
  });

  it("classifies an external edit to the open file as reload-open", () => {
    expect(classifyChange({ fileId: "open", version: "6" }, "open", lastWrites)).toBe("reload-open");
  });

  it("ignores our own write to the open file", () => {
    expect(classifyChange({ fileId: "open", version: "5" }, "open", lastWrites)).toBe("ignore");
  });

  it("classifies a change to a different file as list-changed", () => {
    expect(classifyChange({ fileId: "other", version: "1" }, "open", lastWrites)).toBe("list-changed");
  });

  it("classifies a removal of a non-open file as list-changed", () => {
    expect(classifyChange({ fileId: "other", removed: true }, "open", lastWrites)).toBe("list-changed");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/watcher.test.ts`
Expected: FAIL — cannot find module `./watcher`.

- [ ] **Step 3: Write `src/watcher.ts` (pure parts only for now)**

```ts
export interface ChangeRecord {
  fileId: string;
  version?: string;
  removed?: boolean;
}

export function isOwnWrite(
  change: ChangeRecord,
  lastWrites: Map<string, string>,
): boolean {
  const v = lastWrites.get(change.fileId);
  return v !== undefined && change.version !== undefined && v === change.version;
}

export function classifyChange(
  change: ChangeRecord,
  openFileId: string | null,
  lastWrites: Map<string, string>,
): "ignore" | "reload-open" | "list-changed" {
  if (change.fileId === openFileId && !change.removed) {
    return isOwnWrite(change, lastWrites) ? "ignore" : "reload-open";
  }
  return "list-changed";
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/watcher.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/watcher.ts src/watcher.test.ts
git commit -m "feat: pure external-change classification"
```

---

## Task 6: app-state reducer

**Files:**
- Create: `src/state.ts`, `src/state.test.ts`

**Interfaces:**
- Consumes: `LockState` from `./types`.
- Produces:
  - `AppState` (discriminated union: `signedOut` | `browsing` | `editing`)
  - `AppEvent` (discriminated union, see code)
  - `initialState: AppState`
  - `reduce(state: AppState, event: AppEvent): AppState`

- [ ] **Step 1: Write the failing test `src/state.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { reduce, initialState } from "./state";
import type { AppState } from "./state";

describe("app reducer", () => {
  it("starts signed out", () => {
    expect(initialState.kind).toBe("signedOut");
  });

  it("signing in with a folder goes to browsing", () => {
    const s = reduce(reduce(initialState, { type: "signedIn" }), {
      type: "folderSelected",
      folderId: "F",
    });
    expect(s).toEqual({ kind: "browsing", folderId: "F" });
  });

  it("opening a file goes to editing, clean, no conflict", () => {
    const browsing: AppState = { kind: "browsing", folderId: "F" };
    const s = reduce(browsing, { type: "openedFile", fileId: "f1", lock: "mine" });
    expect(s).toEqual({ kind: "editing", folderId: "F", fileId: "f1", lock: "mine", dirty: false, conflict: false });
  });

  it("external change while clean stays clean (caller auto-reloads)", () => {
    const editing: AppState = { kind: "editing", folderId: "F", fileId: "f1", lock: "mine", dirty: false, conflict: false };
    expect(reduce(editing, { type: "externalChange" })).toEqual(editing);
  });

  it("external change while dirty raises conflict", () => {
    const editing: AppState = { kind: "editing", folderId: "F", fileId: "f1", lock: "mine", dirty: true, conflict: false };
    const s = reduce(editing, { type: "externalChange" });
    expect(s).toMatchObject({ conflict: true });
  });

  it("resolving conflict clears the flag and dirties per choice", () => {
    const conflicted: AppState = { kind: "editing", folderId: "F", fileId: "f1", lock: "mine", dirty: true, conflict: true };
    expect(reduce(conflicted, { type: "resolvedConflict", keepMine: false })).toMatchObject({ conflict: false, dirty: false });
    expect(reduce(conflicted, { type: "resolvedConflict", keepMine: true })).toMatchObject({ conflict: false, dirty: true });
  });

  it("closing a file returns to browsing", () => {
    const editing: AppState = { kind: "editing", folderId: "F", fileId: "f1", lock: "mine", dirty: false, conflict: false };
    expect(reduce(editing, { type: "closedFile" })).toEqual({ kind: "browsing", folderId: "F" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/state.test.ts`
Expected: FAIL — cannot find module `./state`.

- [ ] **Step 3: Write `src/state.ts`**

```ts
import type { LockState } from "./types";

export type AppState =
  | { kind: "signedOut" }
  | { kind: "browsing"; folderId: string }
  | {
      kind: "editing";
      folderId: string;
      fileId: string;
      lock: LockState;
      dirty: boolean;
      conflict: boolean;
    };

export type AppEvent =
  | { type: "signedIn" }
  | { type: "signedOut" }
  | { type: "folderSelected"; folderId: string }
  | { type: "openedFile"; fileId: string; lock: LockState }
  | { type: "dirtyChanged"; dirty: boolean }
  | { type: "externalChange" }
  | { type: "reloaded" }
  | { type: "resolvedConflict"; keepMine: boolean }
  | { type: "closedFile" };

export const initialState: AppState = { kind: "signedOut" };

export function reduce(state: AppState, event: AppEvent): AppState {
  switch (event.type) {
    case "signedOut":
      return initialState;
    case "signedIn":
      return state.kind === "signedOut" ? state : state; // folder selection drives next transition
    case "folderSelected":
      return { kind: "browsing", folderId: event.folderId };
    case "openedFile":
      if (state.kind !== "browsing") return state;
      return {
        kind: "editing",
        folderId: state.folderId,
        fileId: event.fileId,
        lock: event.lock,
        dirty: false,
        conflict: false,
      };
    case "dirtyChanged":
      return state.kind === "editing" ? { ...state, dirty: event.dirty } : state;
    case "externalChange":
      if (state.kind !== "editing") return state;
      return state.dirty ? { ...state, conflict: true } : state;
    case "reloaded":
      return state.kind === "editing" ? { ...state, dirty: false, conflict: false } : state;
    case "resolvedConflict":
      if (state.kind !== "editing") return state;
      return { ...state, conflict: false, dirty: event.keepMine };
    case "closedFile":
      return state.kind === "editing" ? { kind: "browsing", folderId: state.folderId } : state;
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/state.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/state.ts src/state.test.ts
git commit -m "feat: pure app-state reducer"
```

---

## Task 7: driveClient (Drive REST v3 wrapper)

**Files:**
- Create: `src/driveClient.ts`, `src/driveClient.test.ts`

**Interfaces:**
- Consumes: `DriveFile`, `Revision` from `./types`; a `getToken(): Promise<string>` injected at construction.
- Produces a `DriveClient` with:
  - `listBpmnFiles(folderId): Promise<DriveFile[]>`
  - `getMeta(fileId): Promise<DriveFile>`
  - `downloadXml(fileId): Promise<string>`
  - `uploadXml(fileId, xml): Promise<{ version: string; headRevisionId: string }>` (records last write)
  - `createFile(folderId, name, xml): Promise<DriveFile>`
  - `setAppProperties(fileId, props): Promise<void>`
  - `listRevisions(fileId): Promise<Revision[]>`
  - `getRevisionXml(fileId, revisionId): Promise<string>`
  - `setKeepForever(fileId, revisionId, keep): Promise<void>`
  - `getStartPageToken(): Promise<string>`
  - `listChanges(pageToken): Promise<{ changes: ChangeRecord[]; newPageToken: string }>`
  - `lastWriteVersion(fileId): string | undefined`

- [ ] **Step 1: Write the failing test `src/driveClient.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDriveClient } from "./driveClient";

function jsonResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

describe("driveClient", () => {
  const getToken = async () => "TOK";
  let client: ReturnType<typeof createDriveClient>;

  beforeEach(() => {
    client = createDriveClient(getToken);
  });

  it("lists only .bpmn files in a folder with an auth header", async () => {
    const fetchMock = vi.fn().mockReturnValue(
      jsonResponse({ files: [{ id: "f1", name: "a.bpmn", modifiedTime: "t", version: "1", headRevisionId: "r1" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const files = await client.listBpmnFiles("FOLDER");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("'FOLDER'%20in%20parents");
    expect(url).toContain("name%20contains%20'.bpmn'");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer TOK");
    expect(files[0].id).toBe("f1");
  });

  it("records last write version after uploadXml", async () => {
    const fetchMock = vi.fn().mockReturnValue(jsonResponse({ version: "9", headRevisionId: "r9" }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await client.uploadXml("f1", "<xml/>");

    expect(res.version).toBe("9");
    expect(client.lastWriteVersion("f1")).toBe("9");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/upload/drive/v3/files/f1");
    expect(init.method).toBe("PATCH");
  });

  it("maps changes feed to ChangeRecords", async () => {
    const fetchMock = vi.fn().mockReturnValue(
      jsonResponse({
        newStartPageToken: "T2",
        changes: [
          { fileId: "f1", removed: false, file: { version: "7" } },
          { fileId: "f2", removed: true },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { changes, newPageToken } = await client.listChanges("T1");
    expect(newPageToken).toBe("T2");
    expect(changes).toEqual([
      { fileId: "f1", version: "7", removed: false },
      { fileId: "f2", version: undefined, removed: true },
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/driveClient.test.ts`
Expected: FAIL — cannot find module `./driveClient`.

- [ ] **Step 3: Write `src/driveClient.ts`**

```ts
import type { DriveFile, Revision } from "./types";
import type { ChangeRecord } from "./watcher";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FILE_FIELDS = "id,name,modifiedTime,version,headRevisionId,appProperties,lastModifyingUser";

export function createDriveClient(getToken: () => Promise<string>) {
  const lastWrites = new Map<string, string>();

  async function api(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await getToken();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(url, { ...init, headers });
    if (!res.ok) throw new Error(`Drive API ${res.status}: ${await res.text()}`);
    return res;
  }

  async function listBpmnFiles(folderId: string): Promise<DriveFile[]> {
    const q = encodeURIComponent(`'${folderId}' in parents and name contains '.bpmn' and trashed = false`);
    const fields = encodeURIComponent(`files(${FILE_FIELDS})`);
    const res = await api(`${API}/files?q=${q}&fields=${fields}&pageSize=1000`);
    const data = await res.json();
    return data.files as DriveFile[];
  }

  async function getMeta(fileId: string): Promise<DriveFile> {
    const res = await api(`${API}/files/${fileId}?fields=${encodeURIComponent(FILE_FIELDS)}`);
    return (await res.json()) as DriveFile;
  }

  async function downloadXml(fileId: string): Promise<string> {
    const res = await api(`${API}/files/${fileId}?alt=media`);
    return await res.text();
  }

  async function uploadXml(fileId: string, xml: string): Promise<{ version: string; headRevisionId: string }> {
    const res = await api(`${UPLOAD}/files/${fileId}?uploadType=media&fields=version,headRevisionId`, {
      method: "PATCH",
      headers: { "Content-Type": "application/xml" },
      body: xml,
    });
    const data = await res.json();
    lastWrites.set(fileId, String(data.version));
    return { version: String(data.version), headRevisionId: data.headRevisionId };
  }

  async function createFile(folderId: string, name: string, xml: string): Promise<DriveFile> {
    const boundary = "-------bpmn-compartida-boundary";
    const metadata = { name, parents: [folderId], mimeType: "application/xml" };
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/xml\r\n\r\n${xml}\r\n--${boundary}--`;
    const res = await api(`${UPLOAD}/files?uploadType=multipart&fields=${encodeURIComponent(FILE_FIELDS)}`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    return (await res.json()) as DriveFile;
  }

  async function setAppProperties(fileId: string, props: Record<string, string>): Promise<void> {
    await api(`${API}/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appProperties: props }),
    });
  }

  async function listRevisions(fileId: string): Promise<Revision[]> {
    const fields = encodeURIComponent("revisions(id,modifiedTime,keepForever,size,lastModifyingUser)");
    const res = await api(`${API}/files/${fileId}/revisions?fields=${fields}&pageSize=1000`);
    const data = await res.json();
    return ((data.revisions ?? []) as any[]).map((r) => ({
      id: r.id,
      modifiedTime: r.modifiedTime,
      keepForever: !!r.keepForever,
      sizeBytes: r.size ? Number(r.size) : undefined,
      lastModifyingUser: r.lastModifyingUser,
    }));
  }

  async function getRevisionXml(fileId: string, revisionId: string): Promise<string> {
    const res = await api(`${API}/files/${fileId}/revisions/${revisionId}?alt=media`);
    return await res.text();
  }

  async function setKeepForever(fileId: string, revisionId: string, keep: boolean): Promise<void> {
    await api(`${API}/files/${fileId}/revisions/${revisionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keepForever: keep }),
    });
  }

  async function getStartPageToken(): Promise<string> {
    const res = await api(`${API}/changes/startPageToken`);
    return (await res.json()).startPageToken as string;
  }

  async function listChanges(pageToken: string): Promise<{ changes: ChangeRecord[]; newPageToken: string }> {
    const fields = encodeURIComponent("newStartPageToken,nextPageToken,changes(fileId,removed,file(version))");
    const res = await api(`${API}/changes?pageToken=${pageToken}&fields=${fields}&pageSize=100`);
    const data = await res.json();
    const changes: ChangeRecord[] = (data.changes ?? []).map((c: any) => ({
      fileId: c.fileId,
      version: c.file?.version ? String(c.file.version) : undefined,
      removed: !!c.removed,
    }));
    return { changes, newPageToken: data.newStartPageToken ?? data.nextPageToken ?? pageToken };
  }

  return {
    listBpmnFiles,
    getMeta,
    downloadXml,
    uploadXml,
    createFile,
    setAppProperties,
    listRevisions,
    getRevisionXml,
    setKeepForever,
    getStartPageToken,
    listChanges,
    lastWriteVersion: (fileId: string) => lastWrites.get(fileId),
    lastWrites,
  };
}

export type DriveClient = ReturnType<typeof createDriveClient>;
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/driveClient.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/driveClient.ts src/driveClient.test.ts
git commit -m "feat: Drive REST v3 client wrapper"
```

---

## Task 8: auth (Google Identity Services wrapper)

**Files:**
- Create: `src/auth.ts`

**Interfaces:**
- Consumes: `config` from `./config`; `User` from `./types`; global `google.accounts.oauth2` (from the GIS `<script>`).
- Produces a `createAuth()` returning:
  - `signIn(): Promise<void>`
  - `signOut(): void`
  - `getToken(): Promise<string>`
  - `currentUser(): User | null`

This task is a thin shell over a browser global; it is verified by the manual checklist (Task 13), so it has no unit test. Keep it minimal.

- [ ] **Step 1: Write `src/auth.ts`**

```ts
import { config } from "./config";
import type { User } from "./types";

declare const google: any;

export function createAuth() {
  let accessToken: string | null = null;
  let expiresAt = 0;
  let user: User | null = null;
  let tokenClient: any = null;

  function ensureClient() {
    if (tokenClient) return;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: config.clientId,
      scope: config.scope,
      callback: () => {},
    });
  }

  function requestToken(): Promise<string> {
    ensureClient();
    return new Promise((resolve, reject) => {
      tokenClient.callback = (resp: any) => {
        if (resp.error) return reject(new Error(resp.error));
        accessToken = resp.access_token;
        expiresAt = Date.now() + (resp.expires_in - 60) * 1000;
        resolve(accessToken!);
      };
      tokenClient.requestAccessToken({ prompt: accessToken ? "" : "consent" });
    });
  }

  async function fetchUser(token: string): Promise<User> {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const info = await res.json();
    return { name: info.name ?? info.email, email: info.email };
  }

  return {
    async signIn(): Promise<void> {
      const token = await requestToken();
      user = await fetchUser(token);
    },
    signOut(): void {
      if (accessToken) google.accounts.oauth2.revoke(accessToken, () => {});
      accessToken = null;
      user = null;
      expiresAt = 0;
    },
    async getToken(): Promise<string> {
      if (accessToken && Date.now() < expiresAt) return accessToken;
      return await requestToken();
    },
    currentUser: (): User | null => user,
  };
}

export type Auth = ReturnType<typeof createAuth>;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/auth.ts
git commit -m "feat: Google Identity Services auth wrapper"
```

---

## Task 9: editor (bpmn-js wrapper + dirty tracking)

**Files:**
- Create: `src/editor.ts`, `src/editor.test.ts`

**Interfaces:**
- Produces:
  - `ModelerLike` interface (the subset of bpmn-js the wrapper uses) — enables testing with a fake.
  - `createEditor(modeler: ModelerLike)` returning:
    - `load(xml: string): Promise<void>`
    - `getXml(): Promise<string>`
    - `setReadOnly(ro: boolean): void`
    - `isDirty(): boolean`
    - `onDirtyChange(cb: (dirty: boolean) => void): void`
  - `createBpmnModeler(container: HTMLElement): ModelerLike` (real factory, untested).

- [ ] **Step 1: Write the failing test `src/editor.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { createEditor, type ModelerLike } from "./editor";

function fakeModeler(): ModelerLike & { fire: (event: string) => void } {
  const handlers: Record<string, Array<() => void>> = {};
  let readonly = false;
  let lastXml = "";
  return {
    async importXML(xml: string) {
      lastXml = xml;
    },
    async saveXML() {
      return { xml: lastXml };
    },
    on(event: string, cb: () => void) {
      (handlers[event] ??= []).push(cb);
    },
    get(name: string) {
      if (name === "modeling") return {};
      if (name === "readOnly" || name === "editorActions") return { readOnly: (v: boolean) => (readonly = v) };
      return {};
    },
    isReadOnly: () => readonly,
    fire: (event: string) => (handlers[event] ?? []).forEach((h) => h()),
  };
}

describe("editor", () => {
  it("round-trips xml through load/getXml", async () => {
    const ed = createEditor(fakeModeler());
    await ed.load("<defs/>");
    expect(await ed.getXml()).toBe("<defs/>");
  });

  it("is clean after load and dirty after a change event", async () => {
    const m = fakeModeler();
    const ed = createEditor(m);
    const seen: boolean[] = [];
    ed.onDirtyChange((d) => seen.push(d));
    await ed.load("<defs/>");
    expect(ed.isDirty()).toBe(false);
    m.fire("commandStack.changed");
    expect(ed.isDirty()).toBe(true);
    expect(seen).toContain(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/editor.test.ts`
Expected: FAIL — cannot find module `./editor`.

- [ ] **Step 3: Write `src/editor.ts`**

```ts
export interface ModelerLike {
  importXML(xml: string): Promise<unknown>;
  saveXML(opts?: { format?: boolean }): Promise<{ xml?: string }>;
  on(event: string, cb: () => void): void;
  get(name: string): any;
}

export function createEditor(modeler: ModelerLike) {
  let dirty = false;
  let loading = false;
  const dirtyCbs: Array<(d: boolean) => void> = [];

  function setDirty(value: boolean) {
    if (dirty === value) return;
    dirty = value;
    dirtyCbs.forEach((cb) => cb(dirty));
  }

  modeler.on("commandStack.changed", () => {
    if (!loading) setDirty(true);
  });

  return {
    async load(xml: string): Promise<void> {
      loading = true;
      try {
        await modeler.importXML(xml);
      } finally {
        loading = false;
      }
      setDirty(false);
    },
    async getXml(): Promise<string> {
      const { xml } = await modeler.saveXML({ format: true });
      return xml ?? "";
    },
    setReadOnly(ro: boolean): void {
      // diagram-js exposes read-only toggling via the "editorActions"/"keyboard" stack;
      // bpmn-js supports it through the optional "bpmn-js" read-only mixin.
      const actions = modeler.get("editorActions");
      if (actions && typeof actions.readOnly === "function") actions.readOnly(ro);
    },
    isDirty: (): boolean => dirty,
    onDirtyChange(cb: (d: boolean) => void): void {
      dirtyCbs.push(cb);
    },
    markSaved(): void {
      setDirty(false);
    },
  };
}

export async function createBpmnModeler(container: HTMLElement): Promise<ModelerLike> {
  const { default: BpmnModeler } = await import("bpmn-js/lib/Modeler");
  return new BpmnModeler({ container }) as unknown as ModelerLike;
}

export type Editor = ReturnType<typeof createEditor>;
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/editor.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/editor.ts src/editor.test.ts
git commit -m "feat: bpmn-js editor wrapper with dirty tracking"
```

---

## Task 10: folderConfig (Drive Picker + localStorage)

**Files:**
- Create: `src/folderConfig.ts`

**Interfaces:**
- Consumes: `config` from `./config`; globals `gapi`, `google.picker`.
- Produces:
  - `getSavedFolderId(): string | null`
  - `saveFolderId(id: string): void`
  - `pickFolder(getToken: () => Promise<string>): Promise<string | null>`

Thin shell over the Picker global; verified by the manual checklist (Task 13).

- [ ] **Step 1: Write `src/folderConfig.ts`**

```ts
import { config } from "./config";

declare const gapi: any;
declare const google: any;

const KEY = "bpmn-compartida.folderId";

export function getSavedFolderId(): string | null {
  return localStorage.getItem(KEY);
}

export function saveFolderId(id: string): void {
  localStorage.setItem(KEY, id);
}

function loadPicker(): Promise<void> {
  return new Promise((resolve) => gapi.load("picker", { callback: () => resolve() }));
}

export async function pickFolder(getToken: () => Promise<string>): Promise<string | null> {
  await loadPicker();
  const token = await getToken();
  return new Promise((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setSelectFolderEnabled(true)
      .setMimeTypes("application/vnd.google-apps.folder");
    const picker = new google.picker.PickerBuilder()
      .setOAuthToken(token)
      .setDeveloperKey(config.apiKey)
      .addView(view)
      .setCallback((data: any) => {
        if (data.action === google.picker.Action.PICKED) {
          const id = data.docs[0].id as string;
          saveFolderId(id);
          resolve(id);
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
    picker.setVisible(true);
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/folderConfig.ts
git commit -m "feat: Drive Picker folder selection with localStorage"
```

---

## Task 11: UI render helpers

**Files:**
- Create: `src/ui.ts`, `src/ui.test.ts`

**Interfaces:**
- Consumes: `DriveFile`, `RestorePoint`, `User`, `LockState` from `./types`; `readLock`, `lockState`, `isStale` from `./lockManager`.
- Produces (each renders into a passed container / returns an element):
  - `renderFileList(container, files, me, handlers): void` where `handlers = { onOpen(fileId), onSteal(fileId) }`
  - `toRestorePoint(rev: Revision, me: User): RestorePoint`
  - `renderHistoryPanel(container, points, handlers): void` where `handlers = { onPreview(id), onRestore(id) }`
  - `showToast(message: string): void`
  - `renderConflictBar(container, handlers): void` where `handlers = { onDiscard(), onKeepMine() }`

- [ ] **Step 1: Write the failing test `src/ui.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { renderFileList, toRestorePoint, renderHistoryPanel } from "./ui";
import type { DriveFile, User, Revision } from "./types";

const me: User = { name: "Ana", email: "ana@x.com" };

describe("ui", () => {
  it("renders a locked file with a steal button that fires onSteal", () => {
    const container = document.createElement("div");
    const files: DriveFile[] = [
      { id: "f1", name: "a.bpmn", modifiedTime: "t", version: "1", headRevisionId: "r",
        appProperties: { lockedByEmail: "bob@x.com", lockedByName: "Bob", lockedAt: "2026-06-23T10:00:00Z" } },
    ];
    const onSteal = vi.fn();
    renderFileList(container, files, me, { onOpen: vi.fn(), onSteal });
    expect(container.textContent).toContain("Bob");
    const stealBtn = container.querySelector("[data-steal]") as HTMLButtonElement;
    stealBtn.click();
    expect(onSteal).toHaveBeenCalledWith("f1");
  });

  it("flags an external revision author as external", () => {
    const rev: Revision = { id: "r1", modifiedTime: "t", lastModifyingUser: { displayName: "Agent", emailAddress: "agent@x.com" } };
    expect(toRestorePoint(rev, me)).toMatchObject({ isExternal: true, authorName: "Agent" });
    const mineRev: Revision = { id: "r2", modifiedTime: "t", lastModifyingUser: { displayName: "Ana", emailAddress: "ana@x.com" } };
    expect(toRestorePoint(mineRev, me).isExternal).toBe(false);
  });

  it("renders restore points with a working restore button", () => {
    const container = document.createElement("div");
    const onRestore = vi.fn();
    renderHistoryPanel(container, [{ id: "r1", modifiedTime: "2026-06-23T10:00:00Z", authorName: "Agent", authorEmail: "a@x.com", isExternal: true }], { onPreview: vi.fn(), onRestore });
    (container.querySelector("[data-restore]") as HTMLButtonElement).click();
    expect(onRestore).toHaveBeenCalledWith("r1");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ui.test.ts`
Expected: FAIL — cannot find module `./ui`.

- [ ] **Step 3: Write `src/ui.ts`**

```ts
import type { DriveFile, RestorePoint, Revision, User } from "./types";
import { readLock, lockState, isStale } from "./lockManager";

export function renderFileList(
  container: HTMLElement,
  files: DriveFile[],
  me: User,
  handlers: { onOpen: (id: string) => void; onSteal: (id: string) => void },
): void {
  container.innerHTML = "";
  const now = Date.now();
  for (const f of files) {
    const lock = readLock(f);
    const state = lockState(lock, me);
    const row = document.createElement("div");
    row.className = "file-row";

    const name = document.createElement("button");
    name.textContent = f.name;
    name.dataset.open = f.id;
    name.addEventListener("click", () => handlers.onOpen(f.id));
    row.appendChild(name);

    if (state === "theirs") {
      const badge = document.createElement("span");
      const staleTag = isStale(lock, now) ? " (stale)" : "";
      badge.textContent = `🔒 ${lock.lockedByName ?? lock.lockedByEmail} since ${lock.lockedAt}${staleTag}`;
      row.appendChild(badge);
      const steal = document.createElement("button");
      steal.textContent = "Steal";
      steal.dataset.steal = f.id;
      steal.addEventListener("click", () => handlers.onSteal(f.id));
      row.appendChild(steal);
    } else if (state === "mine") {
      const badge = document.createElement("span");
      badge.textContent = "✏️ checked out by you";
      row.appendChild(badge);
    }
    container.appendChild(row);
  }
}

export function toRestorePoint(rev: Revision, me: User): RestorePoint {
  const email = rev.lastModifyingUser?.emailAddress ?? "";
  return {
    id: rev.id,
    modifiedTime: rev.modifiedTime,
    authorName: rev.lastModifyingUser?.displayName ?? email ?? "unknown",
    authorEmail: email,
    isExternal: email !== "" && email !== me.email,
    sizeBytes: rev.sizeBytes,
  };
}

export function renderHistoryPanel(
  container: HTMLElement,
  points: RestorePoint[],
  handlers: { onPreview: (id: string) => void; onRestore: (id: string) => void },
): void {
  container.innerHTML = "<h3>History</h3>";
  for (const p of points) {
    const row = document.createElement("div");
    row.className = "history-row";
    const label = document.createElement("span");
    label.textContent = `${p.modifiedTime} — ${p.authorName}${p.isExternal ? " (external)" : ""}`;
    row.appendChild(label);

    const preview = document.createElement("button");
    preview.textContent = "Preview";
    preview.dataset.preview = p.id;
    preview.addEventListener("click", () => handlers.onPreview(p.id));
    row.appendChild(preview);

    const restore = document.createElement("button");
    restore.textContent = "Restore";
    restore.dataset.restore = p.id;
    restore.addEventListener("click", () => handlers.onRestore(p.id));
    row.appendChild(restore);

    container.appendChild(row);
  }
}

export function showToast(message: string): void {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

export function renderConflictBar(
  container: HTMLElement,
  handlers: { onDiscard: () => void; onKeepMine: () => void },
): void {
  container.innerHTML = "";
  const bar = document.createElement("div");
  bar.className = "conflict-bar";
  bar.textContent = "This diagram changed externally. ";

  const discard = document.createElement("button");
  discard.textContent = "Discard mine & reload";
  discard.dataset.discard = "1";
  discard.addEventListener("click", handlers.onDiscard);
  bar.appendChild(discard);

  const keep = document.createElement("button");
  keep.textContent = "Keep mine";
  keep.dataset.keepMine = "1";
  keep.addEventListener("click", handlers.onKeepMine);
  bar.appendChild(keep);

  container.appendChild(bar);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/ui.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui.ts src/ui.test.ts
git commit -m "feat: DOM render helpers for file list, history, toast, conflict bar"
```

---

## Task 12: main.ts wiring + effects

**Files:**
- Create: `src/main.ts`

**Interfaces:**
- Consumes: every module above. No new exports — this is the composition root.
- Behavior implements the data flows from spec §3 (check out & edit, read-only, steal, external change, history & restore) by translating UI/watcher events into `reduce()` calls plus IO effects.

- [ ] **Step 1: Write `src/main.ts`**

```ts
// bpmn-js styles bundled from the npm package (no CDN, version-locked).
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";

import { createAuth } from "./auth";
import { createDriveClient } from "./driveClient";
import { createEditor, createBpmnModeler } from "./editor";
import { pickFolder, getSavedFolderId } from "./folderConfig";
import { reduce, initialState, type AppState } from "./state";
import { readLock, lockState, lockProps, clearProps, canCheckOut } from "./lockManager";
import { keepSet, diffPins } from "./history";
import { classifyChange } from "./watcher";
import {
  renderFileList,
  renderHistoryPanel,
  renderConflictBar,
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
  const auth = createAuth();
  const drive = createDriveClient(() => auth.getToken());

  let state: AppState = initialState;
  let pollTimer: number | null = null;
  let pageToken = "";

  // Layout
  root.innerHTML = `
    <header><button id="signin">Sign in with Google</button>
      <button id="pick" hidden>Change folder</button>
      <span id="who"></span></header>
    <div id="conflict"></div>
    <main>
      <aside id="files"></aside>
      <section id="canvas" style="height:80vh"></section>
      <aside id="history" hidden></aside>
    </main>
    <footer>
      <button id="save" hidden>Save</button>
      <button id="checkin" hidden>Check in</button>
      <button id="close" hidden>Close</button>
      <button id="newfile" hidden>New diagram</button>
    </footer>`;

  const $ = (id: string) => document.getElementById(id)!;
  const canvas = $("canvas") as HTMLElement;
  const modeler = await createBpmnModeler(canvas);
  const editor = createEditor(modeler);

  editor.onDirtyChange((dirty) => {
    state = reduce(state, { type: "dirtyChanged", dirty });
  });

  function dispatch(event: Parameters<typeof reduce>[1]) {
    state = reduce(state, event);
    render();
  }

  async function refreshFileList() {
    if (state.kind === "signedOut") return;
    const folderId = state.kind === "browsing" ? state.folderId : state.folderId;
    const files = await drive.listBpmnFiles(folderId);
    renderFileList($("files"), files, auth.currentUser()!, {
      onOpen: (id) => openFile(id),
      onSteal: (id) => steal(id),
    });
  }

  async function openFile(fileId: string) {
    const meta = await drive.getMeta(fileId);
    const me = auth.currentUser()!;
    const lock = readLock(meta);
    let lockKind = lockState(lock, me);

    if (canCheckOut(lock, me)) {
      await drive.setAppProperties(fileId, lockProps(me, new Date().toISOString()));
      const after = readLock(await drive.getMeta(fileId));
      lockKind = lockState(after, me);
      if (lockKind !== "mine") {
        showToast(`${after.lockedByName ?? "Someone"} just grabbed it — opening read-only`);
      }
    }
    const xml = await drive.downloadXml(fileId);
    await editor.load(xml);
    editor.setReadOnly(lockKind !== "mine");
    dispatch({ type: "openedFile", fileId, lock: lockKind });
    await loadHistory(fileId);
  }

  async function steal(fileId: string) {
    if (!confirm("Steal this lock? The current holder may lose unsaved work.")) return;
    await drive.setAppProperties(fileId, clearProps());
    await refreshFileList();
  }

  async function save(fileId: string) {
    const xml = await editor.getXml();
    await drive.uploadXml(fileId, xml);
    editor.markSaved();
    dispatch({ type: "dirtyChanged", dirty: false });
    await reconcileRetention(fileId);
    await loadHistory(fileId);
    showToast("Saved");
  }

  async function checkIn(fileId: string) {
    if (state.kind === "editing" && state.dirty) await save(fileId);
    await drive.setAppProperties(fileId, clearProps());
    dispatch({ type: "closedFile" });
    await refreshFileList();
  }

  async function reconcileRetention(fileId: string) {
    const revs = await drive.listRevisions(fileId);
    const desired = keepSet(revs, Date.now());
    const { pin, unpin } = diffPins(revs, desired);
    for (const id of pin) await drive.setKeepForever(fileId, id, true);
    for (const id of unpin) await drive.setKeepForever(fileId, id, false);
  }

  async function loadHistory(fileId: string) {
    const me = auth.currentUser()!;
    const revs = await drive.listRevisions(fileId);
    const points = revs
      .map((r) => toRestorePoint(r, me))
      .sort((a, b) => Date.parse(b.modifiedTime) - Date.parse(a.modifiedTime));
    $("history").hidden = false;
    renderHistoryPanel($("history"), points, {
      onPreview: async (rid) => {
        const xml = await drive.getRevisionXml(fileId, rid);
        await editor.load(xml);
        editor.setReadOnly(true);
        showToast("Previewing a past version (read-only)");
      },
      onRestore: async (rid) => {
        if (state.kind !== "editing" || state.lock !== "mine") {
          showToast("Check out the file before restoring");
          return;
        }
        const xml = await drive.getRevisionXml(fileId, rid);
        await editor.load(xml);
        editor.setReadOnly(false);
        await save(fileId);
        showToast("Restored as a new revision");
      },
    });
  }

  // External-change polling (Drive Changes API)
  async function startWatching() {
    pageToken = await drive.getStartPageToken();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = window.setInterval(pollChanges, 7000);
  }

  async function pollChanges() {
    if (state.kind === "signedOut") return;
    let result;
    try {
      result = await drive.listChanges(pageToken);
    } catch {
      pageToken = await drive.getStartPageToken(); // token expired → reset + relist
      await refreshFileList();
      return;
    }
    pageToken = result.newPageToken;
    const openId = state.kind === "editing" ? state.fileId : null;
    let listDirty = false;
    for (const change of result.changes) {
      const verdict = classifyChange(change, openId, drive.lastWrites);
      if (verdict === "reload-open") await handleExternalChange();
      else if (verdict === "list-changed") listDirty = true;
    }
    if (listDirty) await refreshFileList();
  }

  async function handleExternalChange() {
    if (state.kind !== "editing") return;
    if (!state.dirty) {
      const xml = await drive.downloadXml(state.fileId);
      await editor.load(xml);
      dispatch({ type: "reloaded" });
      showToast("Reloaded — updated externally");
    } else {
      dispatch({ type: "externalChange" });
      renderConflictBar($("conflict"), {
        onDiscard: async () => {
          const xml = await drive.downloadXml((state as any).fileId);
          await editor.load(xml);
          $("conflict").innerHTML = "";
          dispatch({ type: "resolvedConflict", keepMine: false });
        },
        onKeepMine: () => {
          $("conflict").innerHTML = "";
          dispatch({ type: "resolvedConflict", keepMine: true });
        },
      });
    }
  }

  async function newDiagram() {
    if (state.kind === "signedOut") return;
    const name = prompt("New diagram name (will get .bpmn)")?.trim();
    if (!name) return;
    const folderId = state.kind === "browsing" ? state.folderId : (state as any).folderId;
    const file = await drive.createFile(folderId, name.endsWith(".bpmn") ? name : `${name}.bpmn`, EMPTY_BPMN);
    await refreshFileList();
    await openFile(file.id);
  }

  function render() {
    const signedIn = state.kind !== "signedOut";
    ($("signin") as HTMLElement).hidden = signedIn;
    ($("pick") as HTMLElement).hidden = !signedIn;
    ($("newfile") as HTMLElement).hidden = !signedIn;
    const editing = state.kind === "editing";
    ($("save") as HTMLElement).hidden = !editing || (editing && state.lock !== "mine");
    ($("checkin") as HTMLElement).hidden = !editing || (editing && state.lock !== "mine");
    ($("close") as HTMLElement).hidden = !editing;
    $("who").textContent = auth.currentUser() ? `${auth.currentUser()!.name}` : "";
  }

  // Wire static buttons
  $("signin").addEventListener("click", async () => {
    await auth.signIn();
    let folderId = getSavedFolderId();
    if (!folderId) folderId = await pickFolder(() => auth.getToken());
    if (!folderId) return;
    dispatch({ type: "signedIn" });
    dispatch({ type: "folderSelected", folderId });
    await refreshFileList();
    await startWatching();
  });
  $("pick").addEventListener("click", async () => {
    const folderId = await pickFolder(() => auth.getToken());
    if (folderId) {
      dispatch({ type: "folderSelected", folderId });
      await refreshFileList();
    }
  });
  $("newfile").addEventListener("click", () => newDiagram());
  $("save").addEventListener("click", () => state.kind === "editing" && save(state.fileId));
  $("checkin").addEventListener("click", () => state.kind === "editing" && checkIn(state.fileId));
  $("close").addEventListener("click", async () => {
    if (state.kind === "editing" && state.lock === "mine") await checkIn(state.fileId);
    else dispatch({ type: "closedFile" });
  });

  render();
}

bootstrap();
```

- [ ] **Step 2: Typecheck the whole project**

Run: `npm run typecheck`
Expected: no errors. (If bpmn-js types complain about the dynamic import default, the `ModelerLike` cast in `editor.ts` already isolates it.)

- [ ] **Step 3: Run the full unit suite**

Run: `npm test`
Expected: all tests from Tasks 1–11 pass.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire app shell, effects, watcher loop, history/restore"
```

---

## Task 13: README, OAuth setup, and manual test checklist

**Files:**
- Create: `README.md`

**Interfaces:** none (documentation + verification).

- [ ] **Step 1: Write `README.md`**

````markdown
# BPMN compartida

Client-only web app to collaboratively edit BPMN diagrams stored as `.bpmn`
files in a shared Google Drive folder. Advisory file check-out/check-in,
external-change detection with reload, and revision-based history/rollback.

## Setup

1. **Google Cloud project**
   - Enable the **Google Drive API** and the **Google Picker API**.
   - Create an **OAuth 2.0 Client ID** (type: Web application). Add your app
     origin (e.g. `http://localhost:5173` for dev, and your deployed URL) to
     **Authorized JavaScript origins**.
   - Create an **API key** (used by the Picker).
   - OAuth consent screen: **Testing** mode; add team members as test users
     (≤100). Scope: `https://www.googleapis.com/auth/drive`.
2. **Env**: copy `.env.example` to `.env` and fill `VITE_GOOGLE_CLIENT_ID`
   and `VITE_GOOGLE_API_KEY`.
3. `npm install`
4. `npm run dev` → open the printed URL.

## Commands

- `npm run dev` — dev server
- `npm test` — unit tests (Vitest)
- `npm run typecheck` — TypeScript check
- `npm run build` — production build to `dist/`

## Architecture

Pure logic (`lockManager`, `history`, `watcher`, `state`) is side-effect-free
and unit-tested. IO shells (`driveClient`, `auth`, `editor`, `folderConfig`)
wrap browser/Google globals. `main.ts` composes them. See
`docs/superpowers/specs/2026-06-23-bpmn-compartida-design.md`.

## Manual test checklist

- [ ] Sign in; pick a shared Drive folder; `.bpmn` files list.
- [ ] Open a free file → it shows "checked out by you"; edit; Save; Check in.
- [ ] In a second browser profile, open the same file while checked out →
      read-only with the holder shown.
- [ ] Stale/forgotten lock → Steal works.
- [ ] Two profiles race to check out the same free file → loser gets a toast
      and read-only.
- [ ] With the file open and **no** unsaved edits, edit the synced local
      `.bpmn` in an external editor → app auto-reloads with a toast.
- [ ] With **unsaved** edits, trigger an external change → conflict bar;
      "Discard mine & reload" pulls external; "Keep mine" keeps edits.
- [ ] History panel lists revisions incl. an "external" author after an
      external edit; Preview is read-only; Restore creates a new revision and
      is itself reversible.
- [ ] After many saves, old restore points thin out (exponential decay) while
      recent ones remain.
````

- [ ] **Step 2: Final full verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: tests pass, no type errors, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: setup, OAuth config, and manual test checklist"
```

---

## Self-Review (spec coverage)

| Spec section | Covered by |
| --- | --- |
| §1 serverless SPA, Vanilla TS+Vite | Task 1 |
| §2 `auth` | Task 8 |
| §2 `driveClient` | Task 7 |
| §2 `lockManager` | Task 3 |
| §2 `watcher` | Task 5 (pure) + Task 12 (poll loop) |
| §2 `history` | Task 4 (math) + Task 12 (restore/reconcile orchestration) |
| §2 `editor` | Task 9 |
| §2 `fileBrowser` | Task 11 (`renderFileList`) |
| §2 `folderConfig` | Task 10 |
| §2 `main` state machine | Task 6 (`reduce`) + Task 12 (wiring) |
| §3 check out & edit | Task 12 `openFile`/`save` |
| §3 read-only view | Task 12 `openFile` (read-only branch) |
| §3 steal | Task 12 `steal` + Task 11 steal button |
| §3 external change (clean/dirty) | Task 12 `handleExternalChange` + Task 6 reducer |
| §3 history & restore | Task 12 `loadHistory`/`reconcileRetention` |
| §4 error edges (TOCTOU, token, page-token, prune) | Task 12 (`openFile` reverify, `pollChanges` token reset) + Task 4 (graceful prune) |
| §4a exponential decay | Task 4 |
| §5 OAuth scope/testing mode | Task 2 (`config`) + Task 13 (README) |
| §6 testing | Tasks 3–7, 9, 11 unit; Task 13 manual checklist |
| §7 MVP scope incl. new-diagram | Task 12 `newDiagram` |

No placeholders remain; types/signatures are consistent across tasks (`getXml`, `keepSet`, `diffPins`, `classifyChange`, `reduce`, `lockProps`/`clearProps`, `lastWrites`).
