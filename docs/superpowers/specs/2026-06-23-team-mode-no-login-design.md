# Design: BPMN compartida — Team Mode (no per-user login)

**Date:** 2026-06-23
**Status:** Approved (pending spec review)
**Supersedes for this deployment mode:** the client-only design
(`2026-06-23-bpmn-compartida-design.md`). That client-only variant remains on
branch `feat/bpmn-compartida-mvp`; this variant lives on `feat/team-mode-no-login`.

## 1. Overview

A variant of the shared BPMN editor where **users do not log in with Google**.
Instead, a small **serverless backend** holds a Google **service account** that
performs all Drive reads/writes on everyone's behalf. Users reach the app via a
fixed URL, enter a **shared team password**, type a **display name**, and edit
the same `.bpmn` files in a Drive folder. The browser never sees Google
credentials — it talks only to the backend.

The same advisory check-out/check-in, external-change detection (the LLM agent
still edits the synced local file → Drive), and revision history/rollback apply;
only the storage access path and identity model change.

### Architecture

```
Browser (static SPA)
  │  password → session JWT ; display name (localStorage) for soft attribution
  ▼
/api/* → Netlify Functions v2 (TypeScript, googleapis)
  - verify session JWT (except /login)
  - service account (JWT auth, Drive scope) reads/writes the folder
  ▼
Google Drive folder (shared with the service account as Editor)
        ▲ also edited externally by the LLM agent via Drive Desktop sync
```

Host: **Netlify**. Static SPA published from `dist/`; backend as **Netlify
Functions v2** (Web `Request`/`Response`), each endpoint a file under
`netlify/functions/` that declares its route via `export const config = { path:
"/api/..." }`, so the browser calls clean `/api/*` URLs (no `/.netlify/functions`
in client code).

No Google OAuth per user. One service identity, gated by a shared password.

## 2. Reuse vs change

**Reused unchanged** (already implemented + unit-tested on the parent branch):
`lockManager.ts`, `history.ts` (keepSet/diffPins), `watcher.ts` (classifyChange/
isOwnWrite), `state.ts` (reduce), `editor.ts`, `ui.ts`.

**New (frontend):**
- `apiClient.ts` — same method shapes as the old `driveClient` (so `main.ts` and
  the pure logic barely change), but calls `/api/*` with the session token.
- `identity.ts` — prompt for + persist the display name (localStorage).
- `gate.ts` — password entry; stores/clears the session token.

**New (backend):** serverless functions under `/api/` using `googleapis` +
service-account JWT auth, plus a session-token (JWT) layer.

**Removed:** `auth.ts`, `folderConfig.ts`, and the Google bits of `config.ts`
(the folder is a server env var; the frontend keeps only an API base, no secrets).

**Rewired:** `main.ts` — drops Google auth/Picker; adds gate + identity; uses
`apiClient`.

## 3. Backend

Netlify Functions v2 (Web `Request`/`Response`, Node runtime), one file per
endpoint under `netlify/functions/`, each with `export const config = { path }`
to bind its `/api/...` route and any path params (`req.params`). Server-only env
(set in the Netlify UI, never committed):
- `GOOGLE_SERVICE_ACCOUNT_KEY` — service account JSON (string).
- `DRIVE_FOLDER_ID` — the shared folder.
- `APP_PASSWORD` — shared team password (compared via constant-time check; a
  bcrypt/argon hash is acceptable).
- `SESSION_SECRET` — HMAC secret for signing session JWTs.

A shared helper module (`netlify/functions/_lib/`, underscore = not a route):
- `drive()` — builds an authenticated `googleapis` Drive client from the service
  account (scope `https://www.googleapis.com/auth/drive`).
- `requireSession(req)` — verifies the `Authorization: Bearer <jwt>`; returns a
  401 `Response` otherwise. Applied to every endpoint except `/api/login`.
- `json(body, status)` / error helpers for consistent `Response` shapes.

Endpoints (JSON unless noted):
- `POST /api/login` — body `{ password }` → constant-time compare to `APP_PASSWORD`
  → on success return `{ token }` (JWT signed with `SESSION_SECRET`, short TTL,
  renewable). On failure 401.
- `GET /api/files` → list `.bpmn` in `DRIVE_FOLDER_ID` with
  `id,name,version,headRevisionId,appProperties`.
- `GET /api/files/:id` → XML (text).
- `PUT /api/files/:id` → body `{ xml, editorName }` → upload media; record
  `appProperties.lastEditedBy = editorName`; return `{ version, headRevisionId }`.
- `POST /api/files` → body `{ name, xml }` → create in the folder; return file meta.
- `PATCH /api/files/:id/lock` → body `{ action: "checkout"|"checkin"|"steal",
  name }` → set/clear lock appProperties (`lockedByName`, `lockedAt`).
- `GET /api/files/:id/revisions` → revisions list.
- `GET /api/files/:id/revisions/:rid` → revision XML (text).
- `PATCH /api/files/:id/revisions/:rid` → body `{ keepForever }`.

All non-`/login` endpoints `requireSession`. Errors return a JSON `{ error }` with
the right status; the backend never leaks the service-account key or stack traces.

## 4. Frontend data flow

- **Gate:** no session token → render `gate` (password field) → `POST /api/login`
  → store token → continue. 401 on any later call → drop token, re-show gate.
- **Identity:** after the gate, if no stored name → prompt; persist to localStorage.
  The name rides along on `PUT` (`editorName`) and `PATCH …/lock` (`name`).
- **Browse / edit / check-in / steal / history / restore / retention:** identical
  to the parent design, but every Drive call goes through `apiClient` →
  backend. `apiClient.uploadXml` records the returned `version` in its `lastWrites`
  map for own-write suppression.
- **External-change detection:** poll `GET /api/files` every ~7 s; reuse
  `watcher.classifyChange` over the returned versions vs `lastWrites` and the open
  file. Clean → auto-reload; dirty → conflict bar. Plus the save-time backstop
  (compare `headRevisionId` before `PUT`) carried over from the parent branch.

## 5. Identity & locking (no real auth)

- Locks are advisory and keyed by the **typed name** (not a verified account);
  anyone may steal. Stale detection unchanged.
- **Honest limitation:** because the service account performs every in-app write,
  Drive's native revision `lastModifyingUser` is always the service account, so
  in-app edits are not distinguishable by author in native history. Soft
  attribution (`lastEditedBy`, `lockedByName`) lives in `appProperties`. External
  agent edits still appear as a different author / via sync, so "external" is
  still detectable.

## 6. Security

- Service-account key lives only in server env; never sent to the browser.
- Shared password gate: `/api/login` issues a signed session JWT; every other
  endpoint verifies it. No token → 401.
- Password compare is constant-time; the JWT secret is server-only.
- Same-origin (functions co-located with the static site) → no CORS surface.
- The static `index.html` shell uses no interpolated HTML; dynamic UI uses
  `createElement`/`textContent` (carried over).

## 7. Setup (README)

1. Create a service account in Google Cloud; enable the Drive API; download its
   JSON key.
2. **Share the Drive folder with the service account's email as Editor.**
3. Set env vars in the **Netlify** site settings: `GOOGLE_SERVICE_ACCOUNT_KEY`,
   `DRIVE_FOLDER_ID`, `APP_PASSWORD`, `SESSION_SECRET`.
4. Deploy via `netlify.toml`: `build.command = "npm run build"`,
   `build.publish = "dist"`, `build.functions = "netlify/functions"`. One deploy
   ships the static SPA + the functions; routes are bound by each function's
   `config.path` (no manual redirects needed for v2 path routing).

**Caveat:** files *created* by the service account are owned by it (counts against
its quota; `.bpmn` files are tiny, so negligible). Editing existing files has no
such issue. A Google Workspace Shared Drive would resolve ownership cleanly if
ever adopted.

## 8. Testing

- **Reused pure logic:** already covered by the parent branch's unit tests.
- **Backend handlers:** unit-test with `googleapis` mocked — `files` list/get/put/
  create, `lock` transitions, `revisions` list/get/keepForever — and the
  `login`/`requireSession` token logic (valid/invalid/expired, wrong password).
- **`apiClient`:** mocked-`fetch` tests (URLs, methods, token header, own-write
  recording) mirroring the old `driveClient` tests.
- **`identity` / `gate`:** light tests (persist/clear, 401 → re-gate).
- **Manual checklist:** password gate; name prompt; list/edit/save/check-in;
  steal; external edit while clean (auto-reload) and dirty (conflict bar);
  history preview/restore; retention thinning.

## 9. MVP scope

Password → name → list `.bpmn` → check-out → edit → save → check-in → steal →
external-change detection (auto-reload clean / conflict bar dirty) → history with
preview & restore (exponential-decay retention) → new diagram.

**Deferred (YAGNI):** verified per-user identity, real-time co-editing, Shared
Drive ownership, multiple folders, password rotation UI.

## 10. Notes

- Built on `feat/team-mode-no-login`, branched from `feat/bpmn-compartida-mvp` to
  inherit the reused pure modules. The client-only variant stays intact on its
  branch.
- Host: **Netlify** (static `dist/` + Netlify Functions v2 with `config.path`
  routing). Local dev uses `netlify dev` to serve the SPA and functions together.
