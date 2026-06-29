# Design: Shared BPMN Editor ("BPMN compartida")

**Date:** 2026-06-23
**Status:** Approved (pending spec review)

## 1. Overview

A **client-only single-page web app** (Vanilla TypeScript + Vite) for editing BPMN
diagrams that live as `.bpmn` files in a **shared Google Drive folder**. There is no
backend: the browser talks directly to the Google Drive REST API. The shared folder
*is* the collaboration medium — Drive's native folder-sharing controls who has access.

Collaboration between humans is **cooperative, file-level check-out / check-in**, with
lock state stored in each file's Drive `appProperties`. Critically, locks are
**advisory**: the same `.bpmn` files may be edited *outside the app* (e.g. by an LLM
code agent operating on a Google Drive Desktop–synced local copy, or another tool), so
the app must detect external changes and reload.

### Architecture

```
┌──────────────── Browser (static SPA, fixed URL) ────────────────┐
│  auth         Google Identity Services token client             │
│  driveClient  ── HTTPS ──►  Google Drive REST API               │
│  watcher      Drive Changes API (delta feed, ~5–10s poll)       │
│  lockManager  appProperties: lockedBy / lockedByEmail / lockedAt │
│  fileBrowser  lists *.bpmn in folder + lock badges              │
│  editor       bpmn-js Modeler mounted in a container div        │
│  folderConfig Drive Picker → folder ID in localStorage          │
│  main         app state machine + wiring                         │
└──────────────────────────────────────────────────────────────────┘
        ▲ shared Drive folder = team access boundary ▲
        ▲ also reachable via Drive Desktop local sync ▲
```

The serverless commitment is deliberate and total: there is **no proxy server**. All
state lives in Google Drive (files + their `appProperties`) and ephemeral client state.

## 2. Components

Each module has one job and a narrow interface, and is independently testable.

- **`auth.ts`** — wraps Google Identity Services (GIS) token client.
  - Interface: `signIn()`, `signOut()`, `getToken(): Promise<string>`, `currentUser: { name, email } | null`.
  - Depends on: GIS library.

- **`driveClient.ts`** — the *only* module that knows HTTP. Typed wrapper over Drive REST.
  - Interface: `listBpmnFiles(folderId)`, `downloadXml(fileId)`,
    `uploadXml(fileId, xml) → { version, headRevisionId }`,
    `createFile(folderId, name, xml)`, `getMeta(fileId)`,
    `setAppProperties(fileId, props)`, `getStartPageToken()`, `listChanges(pageToken)`,
    `listRevisions(fileId)`, `getRevisionXml(fileId, revisionId)`,
    `setKeepForever(fileId, revisionId, bool)`.
  - Records the `version`/`headRevisionId` of its own last write per file (for own-write suppression).
  - Depends on: `auth.getToken()`.

- **`lockManager.ts`** — logic over `driveClient` for advisory check-out.
  - Interface: `checkOut(fileId)`, `checkIn(fileId)`, `forceUnlock(fileId)`,
    `lockState(meta) → 'free' | 'mine' | 'theirs'`.
  - Encodes optimistic check-out (read-verify-write-reverify) and steal rules.
  - Depends on: `driveClient`, `auth.currentUser`.

- **`watcher.ts`** — external-change detection via Drive Changes API.
  - Interface: `start(folderId)`, `stop()`, events `fileChanged(fileId, version)`, `fileListChanged()`.
  - Suppresses changes whose version matches our own last write.
  - Depends on: `driveClient`.

- **`history.ts`** — restore points via Drive revisions + retention.
  - Interface: `listRestorePoints(fileId)` → `{ id, modifiedTime, lastModifyingUser, sizeBytes }[]`
    (author distinguishes in-app saves from the agent's external edits);
    `restore(fileId, revisionId)`; `reconcileRetention(fileId)`.
  - `restore` fetches the revision's XML, loads it into the editor, and saves it as a
    **new** revision (non-destructive — old head stays in history; respects advisory
    check-out; own-write suppression applies).
  - `reconcileRetention` runs after each save: computes the exponential-decay keep-set
    and `keepForever`-pins those, un-pins the rest. Includes the pure function
    `keepSet(revisions, now) → Set<id>` (deterministic, unit-testable).
  - Depends on: `driveClient`, `editor`.

- **`editor.ts`** — bpmn-js Modeler lifecycle.
  - Interface: `mount(container)`, `load(xml)`, `getXml(): Promise<string>`,
    `setReadOnly(bool)`, `isDirty(): boolean`, event `dirtyChanged`.
  - Depends on: bpmn-js only.

- **`fileBrowser.ts`** — renders the folder's `.bpmn` list with lock badges
  (e.g. `🔒 locked by Ana since 10:42 — [Steal]`).
  - Depends on: `driveClient`, `lockManager`.

- **`folderConfig.ts`** — pick/store the shared folder via Drive Picker; persist folder ID in `localStorage`.

- **`main.ts`** — wires modules; owns the app state machine:
  `signed-out → browsing → editing (clean | dirty | conflict)`.

## 3. Data flow

### Check out & edit
1. User clicks a file → `lockManager.checkOut(fileId)`.
2. `checkOut` re-reads live metadata, verifies `appProperties.lockedBy` is empty or
   the current user, then writes `lockedBy=me, lockedByEmail, lockedAt=now`.
3. Re-read metadata; confirm `lockedBy === me`. If not, the check-out lost the race.
4. `driveClient.downloadXml` → `editor.load(xml)` in editable mode. `watcher` is running.
5. **Save:** `editor.getXml()` → `driveClient.uploadXml`; record returned `version`. Lock stays held.
   Then `history.reconcileRetention(fileId)` adjusts `keepForever` pins.
6. **Check in:** final save, then clear the `appProperties` lock.

### History & restore
- **Browse:** History panel → `history.listRestorePoints(fileId)` lists revisions with
  time + author + an "external" tag for revisions whose author isn't the current app user.
- **Preview:** `getRevisionXml` → `editor.load` in read-only mode (does not touch the file).
- **Restore:** fetch the chosen revision's XML → load → save as a **new** revision. Old
  states remain in history (non-destructive), so a restore can itself be undone by
  restoring a later point. Requires the file checked out (advisory); own-write suppression
  means the restore-save won't trigger a phantom external-change reload.

### Read-only view
Locked by someone else → load XML, `editor.setReadOnly(true)`, show holder + `lockedAt`.

### Steal
Confirmation dialog → `lockManager.forceUnlock` clears the lock regardless of holder
(for stale locks).

### External change (the new path)
- `watcher` reports `fileChanged` for the open file with a version != our last write:
  - **editor clean** → reload XML silently; toast: "Reloaded — updated externally at <time>".
  - **editor dirty** → block; conflict bar: **[Discard mine & reload] [Keep mine]**.
    "Keep mine" means the next save overwrites the external version (surfaced, not hidden).
- `watcher` reports `fileListChanged` → `fileBrowser` relists (new/deleted files appear).

## 4. Error handling & hard edges

- **Lost check-out race (TOCTOU):** Drive has no transactions, so check-out is
  best-effort optimistic locking: read-verify-write-reverify. If reverify shows another
  user, surface "X just grabbed it" — never pretend success.
- **Save conflict backstop:** capture `version`/`headRevisionId` at load; if it changed
  unexpectedly at save time (and not via our own write), route into the dirty-conflict bar.
- **Stale lock:** `lockedAt` always shown; **Steal** always available with confirmation —
  a diagram is never permanently stuck.
- **Locks are advisory:** external agents bypass `appProperties`. The watcher stays active
  even while you hold the lock; an external edit to your checked-out file still triggers
  the dirty-conflict path, noted as "changed externally while checked out by you".
- **Token expiry / 401:** transparent GIS re-auth, retry once.
- **Network failure on save:** keep dirty in-memory XML, show retry; never silently drop edits.
- **Changes-API page-token expiry:** fetch a fresh start token and do a full folder relist.
- **Drive Desktop sync clock jitter:** use `version`/`headRevisionId` (monotonic) — **not**
  `modifiedTime` — as the source of truth for "did it change".
- **Retention pin budget:** never exceed Drive's ~200 `keepForever` pins per file; the
  keep-set caps well below (~150). The current head revision can't be unpinned.
- **Pruned revision:** a wanted revision already expired by Drive simply drops from the
  keep-set — restore points degrade gracefully (fewer points), never error.

## 4a. History retention — exponential decay

`keepSet(revisions, now)` is a pure, deterministic function:
- Always keep the newest (head) revision.
- Define geometrically growing target ages (gap roughly doubles): e.g. ~1h, 2h, 4h, 8h,
  16h, 1.3d, 2.7d, … up to the oldest revision.
- For each target age, keep the single revision closest to `now - age` (dedup if two
  targets map to the same revision).
- Cap the total at the pin budget (~150); if more targets than budget, drop the densest
  (most recent, beyond the few always-kept) first so old history is preserved.
- Result: dense recent restore points, exponentially sparser going back — maximum age
  range for a bounded number of pins.

After each save, `reconcileRetention` diffs the desired keep-set against currently-pinned
revisions and issues the minimal set of `setKeepForever` toggles.

## 5. OAuth scope

To **list** a folder's contents the app needs the broad `drive` scope (the minimal
`drive.file` scope cannot enumerate a folder's children).

**Decision:** ship with the `drive` scope using the OAuth consent screen's **"Testing"
mode**, which supports up to 100 named test users — sufficient for a team — with no Google
verification required. Tightening to `drive.file` + Picker (per-file grants) is a later
privacy-hardening step. External/public production use would require Google's app
verification.

## 6. Testing

- **Unit (Vitest):**
  - `lockManager` transitions: free → mine → theirs → stolen; stale detection. Mocked `driveClient`.
  - `watcher`: own-write suppression; dirty-vs-clean branching. Mocked changes feed.
  - `editor`: load / getXml round-trip; dirty tracking.
  - `history.keepSet`: crafted revision timelines — head always kept, exponential thinning
    correct, pin budget respected, graceful when revisions are pruned.
- **Manual / integration:**
  - Real Drive folder, two browser profiles: exercise the check-out race and steal.
  - Edit the local synced `.bpmn` in an external editor while the app has it open —
    verify auto-reload when clean and the conflict bar when dirty.
  - Make several saves, confirm restore points appear (in-app + external authors), preview
    and restore one, verify restore creates a new revision and is itself reversible.

## 7. MVP scope

**In:** sign in → pick folder → list `.bpmn` → check out → edit → save → check in →
steal stale lock → external-change detection with auto-reload (clean) / conflict bar
(dirty) → history panel with preview & restore (Drive revisions + exponential-decay
retention) → basic "new diagram" creation.

**Deferred (YAGNI):** real-time cursors, per-element locking, comments/annotations,
PNG/SVG export, visual version diffing (history is restore-only, not a diff view),
configurable retention tiers, a creation wizard beyond a blank new file.

## 8. Notes / open items

- This directory is **not a git repository** yet. Initialize git before/at implementation
  so the spec and code are tracked (the brainstorming "commit the design" step is deferred
  until then).
- Google Cloud project + OAuth client ID (with the app's fixed origin as an authorized
  JavaScript origin) and a Drive API key for the Picker must be provisioned before auth works.
