# bpmn-js update system — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep bpmn-js (and the bpmn-io ecosystem) on the latest version via a local update command + an in-app version check, give end users a simple update path (notify + 1-click download now; electron-updater wired but dormant), and ship dormant CI (Renovate) — with the first run bumping the app to bpmn-js 18.

**Architecture:** Pure helpers (`bpmnEcosystemDeps`, `compareVersions`, `evaluateUpdate`) are unit-tested; a Node script `update-bpmn.mjs` orchestrates `npm-check-updates` + the test/typecheck/build gate; a build-time Vite `define` injects the resolved bpmn-js version; Electron main/preload expose npm-latest and app-update IPC (no CORS in main); `main.ts` shows a version line + "check for update" in ⚙ and a startup update banner. CI config (Renovate) and electron-updater stay dormant until there's a GitHub remote.

**Tech Stack:** existing Vite + Vitest + Electron; new dev deps `npm-check-updates`, `electron-updater` (dormant). No new runtime deps.

## Global Constraints

- The local command updates only the **bpmn-io ecosystem** (`bpmn-js`, `bpmn-moddle`, `diagram-js`, names starting `bpmn-js-`/`diagram-js-`/`@bpmn-io/`, plus `heatmap-ts`, `bpmnlint`, `bpmn-js-bpmnlint` if present), then runs the gate `npm test && npm run typecheck && npm run build`; on gate failure it leaves changes uncommitted and exits non-zero (no auto-commit, no revert).
- Runtime version check uses the **npm registry has no CORS** fact: fetch from Electron main; web degrades gracefully.
- `__BPMN_JS_VERSION__` is the resolved bpmn-js version injected by Vite `define` (read from `node_modules/bpmn-js/package.json`), not the semver range.
- End-user app update: Phase A (notify + 1-click download via a configurable feed URL, empty by default → silent) ships now; Phase B (electron-updater) is dormant, gated by `ENABLE_AUTOUPDATE=1`, requires GitHub Releases + NSIS installer + signing to activate (documented).
- Renovate config: group bpmn-io, automerge patch+minor after CI green + `minimumReleaseAge: "3 days"`, major → PR; dormant until the repo has a GitHub remote + Renovate app.
- First run of `npm run update:bpmn` bumps bpmn-js 17→18 (enables the "Create element" palette / plugin parity); the gate must pass, resolving any major-bump breakage.
- Gates after each task: `npm test`, `npm run typecheck`, `npm run build` green.

## File Structure

```
scripts/ecosystem.mjs        # NEW (pure): bpmnEcosystemDeps(pkgJson)
scripts/ecosystem.test.mjs   # NEW
scripts/update-bpmn.mjs      # NEW: orchestration (ncu + npm install + gate)
vite.config.ts               # MODIFY: define __BPMN_JS_VERSION__
src/vendor.d.ts              # MODIFY: declare __BPMN_JS_VERSION__ + Window.versionApi/appUpdate
src/version.ts               # NEW: BUNDLED_BPMN_JS_VERSION, compareVersions, checkLatestBpmnJs
src/version.test.ts          # NEW
src/appUpdate.ts             # NEW (pure): evaluateUpdate(current, feed)
src/appUpdate.test.ts        # NEW
electron/main.cjs            # MODIFY: ipc version:latestBpmnJs, app:version, app:checkUpdate, app:openDownload; dormant autoUpdater
electron/preload.cjs         # MODIFY: window.versionApi + window.appUpdate
src/main.ts                  # MODIFY: ⚙ version line + "Buscar actualización"; startup update banner
package.json                 # MODIFY: devDeps npm-check-updates, electron-updater; scripts update:bpmn, dist:win:installer
.github/workflows/ci.yml     # NEW (dormant): gates on PR/push
renovate.json                # NEW (dormant): automerge patch/minor + cooldown, major→PR
README.md                    # MODIFY: document update:bpmn, Renovate activation, auto-update (Phase B)
```

---

## Task 1: Local update command (Layer 1)

**Files:**
- Create: `scripts/ecosystem.mjs`, `scripts/ecosystem.test.mjs`, `scripts/update-bpmn.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `bpmnEcosystemDeps(pkgJson): string[]` (sorted ecosystem package names); npm script `update:bpmn`.

- [ ] **Step 1: Write the failing test `scripts/ecosystem.test.mjs`**

```js
import { describe, it, expect } from "vitest";
import { bpmnEcosystemDeps } from "./ecosystem.mjs";

describe("bpmnEcosystemDeps", () => {
  it("selects bpmn-io ecosystem packages from deps + devDeps, sorted", () => {
    const pkg = {
      dependencies: {
        "bpmn-js": "^17.0.0",
        "bpmn-js-color-picker": "^0.7.2",
        "@bpmn-io/properties-panel": "^3.0.0",
        "diagram-js-minimap": "^5.0.0",
        "bpmn-moddle": "^10.0.0",
        "heatmap-ts": "^0.0.5",
        "vite-plugin-x": "^1.0.0",
      },
      devDependencies: { "diagram-js-grid": "^2.0.0", typescript: "^5.0.0", vite: "^5.0.0" },
    };
    expect(bpmnEcosystemDeps(pkg)).toEqual([
      "@bpmn-io/properties-panel",
      "bpmn-js",
      "bpmn-js-color-picker",
      "bpmn-moddle",
      "diagram-js-grid",
      "diagram-js-minimap",
      "heatmap-ts",
    ]);
  });

  it("returns [] when there are no ecosystem deps", () => {
    expect(bpmnEcosystemDeps({ dependencies: { vite: "^5" } })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run scripts/ecosystem.test.mjs`
Expected: FAIL — cannot find module `./ecosystem.mjs`.

- [ ] **Step 3: Write `scripts/ecosystem.mjs`**

```js
// Pure: pick the bpmn-io ecosystem package names from a package.json object.
export function bpmnEcosystemDeps(pkgJson) {
  const all = { ...(pkgJson.dependencies || {}), ...(pkgJson.devDependencies || {}) };
  const exact = new Set(["bpmn-js", "bpmn-moddle", "diagram-js", "heatmap-ts", "bpmnlint", "bpmn-js-bpmnlint"]);
  return Object.keys(all)
    .filter(
      (name) =>
        exact.has(name) ||
        name.startsWith("bpmn-js-") ||
        name.startsWith("diagram-js-") ||
        name.startsWith("@bpmn-io/"),
    )
    .sort();
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run scripts/ecosystem.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Write `scripts/update-bpmn.mjs`**

```js
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { bpmnEcosystemDeps } from "./ecosystem.mjs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const deps = bpmnEcosystemDeps(pkg);
if (deps.length === 0) {
  console.log("No bpmn-io ecosystem dependencies found.");
  process.exit(0);
}
console.log("Updating bpmn-io ecosystem:\n  " + deps.join("\n  ") + "\n");

function run(cmd) {
  console.log("> " + cmd);
  execSync(cmd, { stdio: "inherit" });
}

try {
  run(`npx --yes npm-check-updates -u ${deps.join(" ")}`);
  run("npm install");
  run("npm test");
  run("npm run typecheck");
  run("npm run build");
  console.log("\n✓ bpmn-io ecosystem updated; all gates passed.");
} catch {
  console.error(
    "\n✗ Update gate failed. Review with `git diff`, then revert if needed:\n" +
      "  git checkout -- package.json package-lock.json\n",
  );
  process.exit(1);
}
```

- [ ] **Step 6: Add the dev dep + script to `package.json`**

Add to `devDependencies`: `"npm-check-updates": "^17.1.13"`. Run `npm install npm-check-updates@^17.1.13 --save-dev`.
Add to `scripts`: `"update:bpmn": "node scripts/update-bpmn.mjs"`.

- [ ] **Step 7: Verify gates (the script itself is not run here)**

Run: `npm test && npm run typecheck && npm run build`
Expected: existing suite + the 2 new ecosystem tests pass; typecheck/build green. (Do NOT run `npm run update:bpmn` yet — that's Task 7.)

- [ ] **Step 8: Commit**

```bash
git add scripts/ecosystem.mjs scripts/ecosystem.test.mjs scripts/update-bpmn.mjs package.json package-lock.json
git commit -m "feat: local bpmn-io ecosystem update command (ncu + test gate)"
```

---

## Task 2: Bundled version + npm-latest check (Layer 2)

**Files:**
- Modify: `vite.config.ts`, `src/vendor.d.ts`
- Create: `src/version.ts`, `src/version.test.ts`

**Interfaces:**
- Produces:
  - global `__BPMN_JS_VERSION__: string` (Vite define)
  - `BUNDLED_BPMN_JS_VERSION: string`
  - `compareVersions(a: string, b: string): number`
  - `checkLatestBpmnJs(fetchLatest: () => Promise<string>): Promise<{ latest: string; isOutdated: boolean }>`

- [ ] **Step 1: Inject the version in `vite.config.ts` (replace the whole file)**

```ts
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const bpmnJsVersion = JSON.parse(
  readFileSync("node_modules/bpmn-js/package.json", "utf8"),
).version;

export default defineConfig({
  // Relative asset paths so the built index.html works from file:// in Electron.
  base: "./",
  define: {
    __BPMN_JS_VERSION__: JSON.stringify(bpmnJsVersion),
  },
  test: {
    environment: "happy-dom",
    globals: true,
  },
});
```

- [ ] **Step 2: Declare the global in `src/vendor.d.ts`** (append)

```ts
declare const __BPMN_JS_VERSION__: string;
```

- [ ] **Step 3: Write the failing test `src/version.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { compareVersions, checkLatestBpmnJs } from "./version";

describe("compareVersions", () => {
  it("orders by numeric parts", () => {
    expect(compareVersions("18.1.0", "18.0.9")).toBeGreaterThan(0);
    expect(compareVersions("17.11.1", "18.0.0")).toBeLessThan(0);
    expect(compareVersions("18.0.0", "18.0.0")).toBe(0);
  });
  it("handles differing lengths", () => {
    expect(compareVersions("18.1", "18.1.0")).toBe(0);
    expect(compareVersions("18.1.1", "18.1")).toBeGreaterThan(0);
  });
});

describe("checkLatestBpmnJs", () => {
  it("flags outdated when latest is newer than bundled", async () => {
    const r = await checkLatestBpmnJs(async () => "999.0.0");
    expect(r.latest).toBe("999.0.0");
    expect(r.isOutdated).toBe(true);
  });
  it("not outdated when latest equals bundled", async () => {
    const { BUNDLED_BPMN_JS_VERSION } = await import("./version");
    const r = await checkLatestBpmnJs(async () => BUNDLED_BPMN_JS_VERSION);
    expect(r.isOutdated).toBe(false);
  });
  it("throws on an invalid latest", async () => {
    await expect(checkLatestBpmnJs(async () => "" as string)).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Run it — expect FAIL**

Run: `npx vitest run src/version.test.ts`
Expected: FAIL — cannot find module `./version`.

- [ ] **Step 5: Write `src/version.ts`**

```ts
export const BUNDLED_BPMN_JS_VERSION: string = __BPMN_JS_VERSION__;

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function checkLatestBpmnJs(
  fetchLatest: () => Promise<string>,
): Promise<{ latest: string; isOutdated: boolean }> {
  const latest = await fetchLatest();
  if (typeof latest !== "string" || latest.length === 0) {
    throw new Error("Invalid latest bpmn-js version");
  }
  return { latest, isOutdated: compareVersions(latest, BUNDLED_BPMN_JS_VERSION) > 0 };
}
```

- [ ] **Step 6: Run it — expect PASS**

Run: `npx vitest run src/version.test.ts`
Expected: PASS (5 tests). (`__BPMN_JS_VERSION__` is provided by the Vite/Vitest `define`.)

- [ ] **Step 7: Verify gates**

Run: `npm run typecheck && npm test && npm run build`
Expected: clean; build injects the real version.

- [ ] **Step 8: Commit**

```bash
git add vite.config.ts src/vendor.d.ts src/version.ts src/version.test.ts
git commit -m "feat: bundled bpmn-js version + npm-latest check"
```

---

## Task 3: App-update evaluation (Layer 4 Phase A core)

**Files:**
- Create: `src/appUpdate.ts`, `src/appUpdate.test.ts`

**Interfaces:**
- Consumes: `compareVersions` from `./version`.
- Produces:
  - `interface UpdateFeed { version: string; url: string; notes?: string }`
  - `interface UpdateResult { updateAvailable: boolean; latest: string; url: string }`
  - `evaluateUpdate(currentVersion: string, feed: unknown): UpdateResult`

- [ ] **Step 1: Write the failing test `src/appUpdate.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { evaluateUpdate } from "./appUpdate";

describe("evaluateUpdate", () => {
  it("reports an available update when the feed is newer", () => {
    expect(evaluateUpdate("0.1.0", { version: "0.2.0", url: "http://x/app.zip" })).toEqual({
      updateAvailable: true,
      latest: "0.2.0",
      url: "http://x/app.zip",
    });
  });
  it("not available when feed equals current", () => {
    expect(evaluateUpdate("0.2.0", { version: "0.2.0", url: "u" }).updateAvailable).toBe(false);
  });
  it("not available for null/invalid feed", () => {
    expect(evaluateUpdate("0.1.0", null).updateAvailable).toBe(false);
    expect(evaluateUpdate("0.1.0", { version: 2 }).updateAvailable).toBe(false);
    expect(evaluateUpdate("0.1.0", { version: "0.2.0" }).updateAvailable).toBe(false); // no url
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/appUpdate.test.ts`
Expected: FAIL — cannot find module `./appUpdate`.

- [ ] **Step 3: Write `src/appUpdate.ts`**

```ts
import { compareVersions } from "./version";

export interface UpdateFeed {
  version: string;
  url: string;
  notes?: string;
}
export interface UpdateResult {
  updateAvailable: boolean;
  latest: string;
  url: string;
}

export function evaluateUpdate(currentVersion: string, feed: unknown): UpdateResult {
  const none: UpdateResult = { updateAvailable: false, latest: currentVersion, url: "" };
  if (!feed || typeof feed !== "object") return none;
  const f = feed as Record<string, unknown>;
  if (typeof f.version !== "string" || typeof f.url !== "string") return none;
  return {
    updateAvailable: compareVersions(f.version, currentVersion) > 0,
    latest: f.version,
    url: f.url,
  };
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/appUpdate.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify gates**

Run: `npm run typecheck && npm test`
Expected: clean; full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/appUpdate.ts src/appUpdate.test.ts
git commit -m "feat: pure app-update evaluation from a version feed"
```

---

## Task 4: Electron IPC for version + app-update (glue)

**Files:**
- Modify: `electron/main.cjs`, `electron/preload.cjs`, `src/vendor.d.ts`

**Interfaces:**
- Produces:
  - `window.versionApi.latestBpmnJs(): Promise<string | null>`
  - `window.appUpdate.currentVersion(): Promise<string>`
  - `window.appUpdate.checkFeed(): Promise<unknown | null>`
  - `window.appUpdate.openDownload(url: string): void`
- Glue (no unit test) — validated by typecheck + build; runtime by manual checklist.

- [ ] **Step 1: Add IPC handlers to `electron/main.cjs`**

Add `shell` to the top `require("electron")` destructure, and add a feed constant + handlers (next to the existing `fsapi:*` handlers):

```js
// (top) const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");

// Empty by default → app-update check is a silent no-op until a feed is published.
// Point this at GitHub Releases (.../releases/latest as JSON) or a static JSON
// returning { version, url, notes? } to enable the in-app update banner.
const APP_UPDATE_FEED_URL = "";

ipcMain.handle("version:latestBpmnJs", async () => {
  try {
    const res = await fetch("https://registry.npmjs.org/bpmn-js/latest");
    const j = await res.json();
    return typeof j.version === "string" ? j.version : null;
  } catch {
    return null;
  }
});

ipcMain.handle("app:version", () => app.getVersion());

ipcMain.handle("app:checkUpdate", async () => {
  if (!APP_UPDATE_FEED_URL) return null;
  try {
    const res = await fetch(APP_UPDATE_FEED_URL);
    return await res.json();
  } catch {
    return null;
  }
});

ipcMain.handle("app:openDownload", (_e, url) => {
  if (typeof url === "string" && /^https?:\/\//.test(url)) shell.openExternal(url);
});
```

Add the dormant auto-updater guard near the bottom (before/after `app.whenReady`), off by default:

```js
// Phase B (dormant): silent auto-update. Off unless ENABLE_AUTOUPDATE=1 AND a
// GitHub Releases feed + NSIS build are published (see README). Lazy-required so
// it never loads in the normal portable build.
if (process.env.ENABLE_AUTOUPDATE === "1") {
  try {
    const { autoUpdater } = require("electron-updater");
    app.whenReady().then(() => autoUpdater.checkForUpdatesAndNotify());
  } catch (e) {
    console.error("auto-update disabled:", e);
  }
}
```

- [ ] **Step 2: Expose the bridge in `electron/preload.cjs`** (add two more `exposeInMainWorld` blocks)

```js
contextBridge.exposeInMainWorld("versionApi", {
  latestBpmnJs: () => ipcRenderer.invoke("version:latestBpmnJs"),
});
contextBridge.exposeInMainWorld("appUpdate", {
  currentVersion: () => ipcRenderer.invoke("app:version"),
  checkFeed: () => ipcRenderer.invoke("app:checkUpdate"),
  openDownload: (url) => ipcRenderer.invoke("app:openDownload", url),
});
```

- [ ] **Step 3: Type the globals in `src/vendor.d.ts`** (append)

```ts
declare global {
  interface Window {
    versionApi?: { latestBpmnJs(): Promise<string | null> };
    appUpdate?: {
      currentVersion(): Promise<string>;
      checkFeed(): Promise<unknown | null>;
      openDownload(url: string): void;
    };
  }
}
export {};
```

- [ ] **Step 4: Verify gates**

Run: `npm run typecheck && npm test && npm run build`
Expected: clean; build succeeds. (`.cjs` files aren't typechecked; the `Window` augmentation makes `window.versionApi`/`window.appUpdate` typed in `src`.)

- [ ] **Step 5: Commit**

```bash
git add electron/main.cjs electron/preload.cjs src/vendor.d.ts
git commit -m "feat(electron): IPC for npm-latest + app-update feed; dormant autoUpdater"
```

---

## Task 5: Wire version check + update banner into `main.ts` (glue)

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `BUNDLED_BPMN_JS_VERSION`/`checkLatestBpmnJs` (`./version`), `evaluateUpdate` (`./appUpdate`), `window.versionApi`/`window.appUpdate`.
- Glue (no unit test) — validated by typecheck + build + manual.

- [ ] **Step 1: Add imports to `src/main.ts`**

```ts
import { BUNDLED_BPMN_JS_VERSION, checkLatestBpmnJs } from "./version";
import { evaluateUpdate } from "./appUpdate";
```

- [ ] **Step 2: Add a `fetchLatestBpmnJs` helper inside `bootstrap`**

```ts
  // npm registry has no CORS → use Electron main when available; web may be blocked.
  async function fetchLatestBpmnJs(): Promise<string> {
    if (window.versionApi) {
      const v = await window.versionApi.latestBpmnJs();
      if (!v) throw new Error("sin respuesta");
      return v;
    }
    const res = await fetch("https://registry.npmjs.org/bpmn-js/latest");
    const j = await res.json();
    return j.version;
  }
```

- [ ] **Step 3: Add the bpmn-js version line + button to the ⚙ settings panel**

In `renderVizSettings()` (the settings panel HTML built when ⚙ is opened), append a version block after the existing toggles. Add to the panel's `innerHTML`:

```ts
      <hr/>
      <div class="viz-version">
        bpmn-js <b>${BUNDLED_BPMN_JS_VERSION}</b>
        <button id="check-bpmnjs" type="button">Buscar actualización</button>
        <span id="bpmnjs-status"></span>
      </div>
```

And wire the button (in the same place the toggles are wired):

```ts
    document.getElementById("check-bpmnjs")?.addEventListener("click", () => {
      const status = document.getElementById("bpmnjs-status")!;
      status.textContent = "Buscando…";
      void checkLatestBpmnJs(fetchLatestBpmnJs)
        .then((r) => {
          status.textContent = r.isOutdated
            ? `${r.latest} disponible — corré "npm run update:bpmn" y regenerá el .exe`
            : `${r.latest} es la última ✓`;
        })
        .catch(() => {
          status.textContent = "No se pudo verificar (offline o sin acceso)";
        });
    });
```

- [ ] **Step 4: Add the startup update banner (Phase A) + a container**

In `startApp`'s shell, add a banner container right after `<header>…</header>`:

```html
      <div id="appupdate"></div>
```

And at the end of `startApp` (after `pollTimer` is set), kick off a non-blocking check:

```ts
    void maybeShowUpdateBanner();
```

Define `maybeShowUpdateBanner` inside `bootstrap`:

```ts
  async function maybeShowUpdateBanner(): Promise<void> {
    if (!window.appUpdate) return;
    try {
      const [current, feed] = await Promise.all([
        window.appUpdate.currentVersion(),
        window.appUpdate.checkFeed(),
      ]);
      const r = evaluateUpdate(current, feed);
      if (!r.updateAvailable) return;
      const el = document.getElementById("appupdate");
      if (!el) return;
      el.innerHTML = `<div class="appupdate-bar">Versión ${r.latest} disponible.
        <button id="appupdate-get" type="button">Descargar</button>
        <button id="appupdate-later" type="button">Después</button></div>`;
      document.getElementById("appupdate-get")?.addEventListener("click", () => {
        window.appUpdate?.openDownload(r.url);
      });
      document.getElementById("appupdate-later")?.addEventListener("click", () => {
        el.innerHTML = "";
      });
    } catch {
      /* silent: no feed / offline */
    }
  }
```

- [ ] **Step 5: Add minimal styles** (append to `src/viz.css`)

```css
.viz-version { font-size: 13px; margin-top: 8px; }
.viz-version button { margin: 0 6px; }
.viz-version #bpmnjs-status { color: #6b7280; }
.appupdate-bar { background: #dbeafe; color: #1e3a8a; padding: 6px 10px; font-size: 13px; }
.appupdate-bar button { margin-left: 8px; }
```

- [ ] **Step 6: Verify gates**

Run: `npm run typecheck && npm test && npm run build`
Expected: clean; 109 tests pass; build succeeds. `main.ts` validated here + manual.

- [ ] **Step 7: Commit**

```bash
git add src/main.ts src/viz.css
git commit -m "feat: in-app bpmn-js version check + app-update banner (Phase A)"
```

---

## Task 6: Dormant CI + auto-update scaffolding + docs

**Files:**
- Create: `.github/workflows/ci.yml`, `renovate.json`
- Modify: `package.json`, `README.md`

**Interfaces:**
- Produces: dormant CI/Renovate config; `electron-updater` dev dep + `dist:win:installer` script; docs. No runtime effect.

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  build-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run typecheck
      - run: npm run build
```

- [ ] **Step 2: Create `renovate.json`**

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "minimumReleaseAge": "3 days",
  "packageRules": [
    {
      "matchPackageNames": ["bpmn-js", "bpmn-moddle", "diagram-js", "heatmap-ts", "bpmnlint", "bpmn-js-bpmnlint"],
      "matchPackagePrefixes": ["bpmn-js-", "diagram-js-", "@bpmn-io/"],
      "groupName": "bpmn-io ecosystem",
      "matchUpdateTypes": ["minor", "patch"],
      "automerge": true
    },
    {
      "matchPackageNames": ["bpmn-js", "bpmn-moddle", "diagram-js", "heatmap-ts", "bpmnlint", "bpmn-js-bpmnlint"],
      "matchPackagePrefixes": ["bpmn-js-", "diagram-js-", "@bpmn-io/"],
      "matchUpdateTypes": ["major"],
      "automerge": false
    }
  ]
}
```

- [ ] **Step 3: Add `electron-updater` dev dep + installer script to `package.json`**

Run `npm install electron-updater@^6.3.9 --save-dev`. Add to `scripts`:
`"dist:win:installer": "npm run build && electron-builder --win nsis"`.

- [ ] **Step 4: Document in `README.md`** (append a section)

````markdown
## Mantener bpmn-js actualizado

- **Local:** `npm run update:bpmn` sube bpmn-js + el ecosistema bpmn-io a la última
  versión y corre los tests/typecheck/build como compuerta. Si falla, revisá con
  `git diff` y revertí con `git checkout -- package.json package-lock.json`.
- **En la app:** ⚙ → "Buscar actualización" muestra la versión de bpmn-js y si hay
  una nueva.
- **CI (cuando subas a GitHub):** instalá la app de **Renovate** en el repo; usará
  `renovate.json` (auto-merge de patch/minor del ecosistema bpmn-io tras CI verde +
  cooldown de 3 días; los major llegan como PR). `.github/workflows/ci.yml` provee el
  check verde.

### Auto-update de la app del usuario final
- **Fase A (activa):** poné `APP_UPDATE_FEED_URL` en `electron/main.cjs` apuntando a
  un JSON `{ version, url }` (p. ej. GitHub Releases) → la app muestra un banner
  "Versión X disponible — Descargar".
- **Fase B (silencioso, dormido):** `electron-updater`. Para activarlo: repo en
  GitHub + `electron-builder` con `publish: github` + target NSIS
  (`npm run dist:win:installer`) + idealmente firma de código; luego corré con
  `ENABLE_AUTOUPDATE=1`.
````

- [ ] **Step 5: Verify gates**

Run: `npm test && npm run typecheck && npm run build`
Expected: green (config/docs/dep additions don't affect them).

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml renovate.json package.json package-lock.json README.md
git commit -m "chore: dormant CI (Renovate) + electron-updater scaffolding + update docs"
```

---

## Task 7: First run — bump to bpmn-js 18 via the new command

**Files:**
- Modify: whatever the bump touches (`package.json`, `package-lock.json`, and any source needing a fix for the major bump)

**Interfaces:**
- Consumes: `npm run update:bpmn` (Task 1). Produces: the app on bpmn-js 18 with all gates green and the "Create element" palette available.

- [ ] **Step 1: Run the update command**

Run: `npm run update:bpmn`
Expected: it bumps `bpmn-js` 17→18 and the ecosystem, installs, and runs the gate. One of two outcomes:
- Gate passes → done, go to Step 3.
- Gate fails → Step 2.

- [ ] **Step 2: Resolve any major-bump breakage**

If `npm test`/`typecheck`/`build` failed after the bump, fix the breakage while keeping behavior. Likely spots and how to check:
- `src/bpmnDiff.ts` / `src/diffView.ts` (bpmn-moddle/differ): run `npx vitest run src/bpmnDiff.test.ts src/diffView.test.ts`.
- `src/editor.ts` module assembly (properties-panel/token-sim/etc. import shapes may shift on 18): run `npm run build` and read the first error; adjust the dynamic-import destructuring minimally.
- `src/layers/*` (canvas/overlays API): run `npx vitest run src/layers`.
- Re-run the full gate after each fix: `npm test && npm run typecheck && npm run build`.
If a dependency is fundamentally incompatible at its latest, pin it one minor back in `package.json` and note it. Do not weaken tests to pass.

- [ ] **Step 3: Confirm bpmn-js 18 + the extended palette**

Run: `node -e "console.log(require('bpmn-js/package.json').version)"`
Expected: `18.x.x`.
Manual (best-effort; note if headless): `npm run dev`, open a `.bpmn`, confirm the palette shows the **"..." / "Create element"** entry with search. The ⚙ version line should now read `18.x`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: bump bpmn-js to 18 via update:bpmn (Create element palette / plugin parity)"
```

---

## Self-Review notes (resolved)

- **Spec coverage:** Layer 1 local command (T1 + first run T7), Layer 2 runtime check (T2), Layer 4 Phase A app-update notify+download (T3 evaluate, T4 IPC, T5 UI/banner) + Phase B dormant electron-updater (T4 guard, T6 dep/script/docs), Layer 3 dormant CI/Renovate (T6). First-run bump to 18 (T7).
- **Type/contract consistency:** `bpmnEcosystemDeps` (T1) ↔ the package list in `update-bpmn.mjs` and `renovate.json` (T6) use the same ecosystem rule. `compareVersions` (T2) is reused by `checkLatestBpmnJs` (T2) and `evaluateUpdate` (T3). `window.versionApi`/`window.appUpdate` shapes in `vendor.d.ts` (T4) match preload (T4) and `main.ts` usage (T5). `__BPMN_JS_VERSION__` defined in vite (T2) and declared in vendor.d.ts (T2), consumed by `version.ts` (T2).
- **Dormant-by-default:** `APP_UPDATE_FEED_URL` empty → app-update silent; `ENABLE_AUTOUPDATE` unset → electron-updater never loads (lazy require); Renovate/CI inert without a GitHub remote. None affect the local/web build.
- **No-CORS handling:** npm-latest + app feed fetched in Electron main; web path degrades to "no se pudo verificar" / no banner.
- **Risk (T7):** the major bump is the one empirical task; the gate (109 tests + typecheck + build) is the safety net, with concrete resolution spots listed.
```
