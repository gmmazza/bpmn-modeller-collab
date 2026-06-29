# BPMN compartida — Team Mode (no per-user login) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Netlify-hosted serverless backend (Google service account) so users edit the shared Drive `.bpmn` files without any per-user Google login — gated by a shared team password, identified by a typed display name.

**Architecture:** A static SPA (reusing the existing pure logic, editor, and UI modules) talks only to `/api/*` Netlify Functions v2. The functions hold a service account and proxy all Drive reads/writes; a shared password issues a session JWT that every endpoint verifies. Advisory locks, external-change detection, and revision history carry over.

**Tech Stack:** Vanilla TS + Vite (frontend, existing); Netlify Functions v2 (Web Request/Response) in TypeScript; `googleapis` (Drive); `jsonwebtoken` (session); Vitest + happy-dom (tests).

## Global Constraints

- Backend runs as Netlify Functions v2: each endpoint a file under `netlify/functions/`, route bound via `export const config = { path }`; path params via `context.params`.
- The service-account key (`GOOGLE_SERVICE_ACCOUNT_KEY`), `DRIVE_FOLDER_ID`, `APP_PASSWORD`, `SESSION_SECRET` are server-only env vars; never sent to the browser, never committed.
- Every `/api/*` endpoint except `/api/login` verifies the session JWT (`Authorization: Bearer <token>`); missing/invalid → 401.
- Password comparison is constant-time. Session token is a JWT signed with `SESSION_SECRET`, short TTL.
- Identity is the typed display name (soft, unverified). Locks are advisory; anyone may steal. Lock state is stored in the **same `appProperties` keys** the existing `lockManager` produces (`lockedBy`, `lockedByEmail`, `lockedByName`, `lockedAt`), with the display name used as both name and email-key, so `lockManager`/`ui` are reused unchanged.
- Source of truth for change detection is Drive `version`; own writes suppressed via `apiClient.lastWrites`.
- Restore is non-destructive (save as a new revision).
- TDD: failing test → minimal impl → passing test → commit. Build gate: `npm test`, `npm run typecheck`, `npm run build` all pass.
- Reused unchanged from `feat/bpmn-compartida-mvp`: `src/lockManager.ts`, `src/history.ts`, `src/watcher.ts`, `src/state.ts`, `src/editor.ts`, `src/ui.ts` (and their tests).

## File Structure

```
package.json                       # MODIFY: add googleapis, jsonwebtoken, @netlify/functions, @types/*
tsconfig.json                      # MODIFY: include "netlify", add types ["node"], esModuleInterop
netlify.toml                       # CREATE: build + functions config
netlify/functions/
  _lib/session.ts                  # signSession / verifySession (JWT)
  _lib/http.ts                     # json / text / requireSession
  _lib/driveClient.ts              # server Drive ops over a googleapis client (testable w/ fake)
  _lib/drive.ts                    # getDrive(): build googleapis client from service account (thin)
  login.ts                         # POST /api/login
  files.ts                         # GET /api/files (list) + POST (create)
  file.ts                          # GET /api/files/:id (download) + PUT (save)
  file-lock.ts                     # PATCH /api/files/:id/lock
  revisions.ts                     # GET /api/files/:id/revisions
  revision.ts                      # GET /api/files/:id/revisions/:rid + PATCH (keepForever)
src/
  apiClient.ts                     # CREATE: browser → /api/* (mirrors old driveClient shape)
  identity.ts                      # CREATE: display-name prompt + localStorage
  gate.ts                          # CREATE: password gate + session-token storage
  config.ts                        # MODIFY: drop Google bits; keep nothing client-secret
  main.ts                          # REPLACE: rewire to gate + identity + apiClient
  auth.ts                          # DELETE
  folderConfig.ts                  # DELETE
index.html                         # MODIFY: remove Google <script> tags (no GIS/gapi/picker)
README.md                          # MODIFY: team-mode setup
```

**Test boundaries:** `_lib/session`, `_lib/http`, `_lib/driveClient` are unit-tested (session/http pure; driveClient with a fake googleapis client). Handlers are tested by calling their `default` export with a `Request` + fake `context`, mocking `_lib/drive`. `apiClient` uses mocked `fetch`. `identity`/`gate` use happy-dom + mocked `fetch`/localStorage. `_lib/drive` (real service-account wiring) and `main.ts` are validated by typecheck/build + the manual checklist.

---

## Task 1: Backend deps, Netlify config, tsconfig

**Files:**
- Modify: `package.json`, `tsconfig.json`
- Create: `netlify.toml`, `netlify/functions/.gitkeep`

**Interfaces:**
- Produces: the toolchain for backend functions; `npm test`/`typecheck`/`build` still green.

- [ ] **Step 1: Add dependencies**

Run:
```bash
npm install googleapis@^144.0.0 jsonwebtoken@^9.0.2
npm install -D @netlify/functions@^2.8.2 @types/jsonwebtoken@^9.0.7 @types/node@^22.10.2
```

- [ ] **Step 2: Update `tsconfig.json`** (replace the whole file)

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
    "types": ["vite/client", "vitest/globals", "node"],
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "esModuleInterop": true
  },
  "include": ["src", "netlify"]
}
```

(Note: `verbatimModuleSyntax` was removed and `esModuleInterop` added so the CJS default import `import jwt from "jsonwebtoken"` and `import { google } from "googleapis"` type-check.)

- [ ] **Step 3: Create `netlify.toml`**

```toml
[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"

[functions]
  node_bundler = "esbuild"
```

- [ ] **Step 4: Create `netlify/functions/.gitkeep`** (empty file, so the dir is tracked)

- [ ] **Step 5: Verify the toolchain still works**

Run: `npm test && npm run typecheck && npm run build`
Expected: existing 33 tests pass, no type errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json netlify.toml netlify/functions/.gitkeep
git commit -m "chore: add Netlify functions toolchain (googleapis, jwt, tsconfig)"
```

---

## Task 2: Session tokens (`_lib/session.ts`)

**Files:**
- Create: `netlify/functions/_lib/session.ts`, `netlify/functions/_lib/session.test.ts`

**Interfaces:**
- Produces:
  - `signSession(secret: string, ttlSeconds?: number): string`
  - `verifySession(token: string, secret: string): boolean`

- [ ] **Step 1: Write the failing test `netlify/functions/_lib/session.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "./session";

describe("session", () => {
  it("round-trips a valid token", () => {
    const t = signSession("s3cret");
    expect(verifySession(t, "s3cret")).toBe(true);
  });

  it("rejects a token signed with a different secret", () => {
    const t = signSession("s3cret");
    expect(verifySession(t, "other")).toBe(false);
  });

  it("rejects a tampered token", () => {
    const t = signSession("s3cret");
    expect(verifySession(t + "x", "s3cret")).toBe(false);
  });

  it("rejects an expired token", () => {
    const t = signSession("s3cret", -10);
    expect(verifySession(t, "s3cret")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(verifySession("", "s3cret")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run netlify/functions/_lib/session.test.ts`
Expected: FAIL — cannot find module `./session`.

- [ ] **Step 3: Write `netlify/functions/_lib/session.ts`**

```ts
import jwt from "jsonwebtoken";

export function signSession(secret: string, ttlSeconds = 60 * 60 * 8): string {
  return jwt.sign({ ok: true }, secret, { expiresIn: ttlSeconds });
}

export function verifySession(token: string, secret: string): boolean {
  if (!token) return false;
  try {
    jwt.verify(token, secret);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run netlify/functions/_lib/session.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_lib/session.ts netlify/functions/_lib/session.test.ts
git commit -m "feat(api): session token sign/verify"
```

---

## Task 3: HTTP helpers (`_lib/http.ts`)

**Files:**
- Create: `netlify/functions/_lib/http.ts`, `netlify/functions/_lib/http.test.ts`

**Interfaces:**
- Consumes: `verifySession` from `./session`.
- Produces:
  - `json(body: unknown, status?: number): Response`
  - `text(body: string, status?: number): Response`
  - `requireSession(req: Request, secret: string): Response | null` (null = OK, else a 401 Response)

- [ ] **Step 1: Write the failing test `netlify/functions/_lib/http.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { json, text, requireSession } from "./http";
import { signSession } from "./session";

describe("http helpers", () => {
  it("json sets content-type and status", async () => {
    const res = json({ a: 1 }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ a: 1 });
  });

  it("text returns xml content-type", async () => {
    const res = text("<x/>");
    expect(res.headers.get("content-type")).toContain("application/xml");
    expect(await res.text()).toBe("<x/>");
  });

  it("requireSession returns null for a valid bearer token", () => {
    const token = signSession("S");
    const req = new Request("https://x/api/files", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(requireSession(req, "S")).toBeNull();
  });

  it("requireSession returns a 401 Response when missing/invalid", () => {
    const req = new Request("https://x/api/files");
    const res = requireSession(req, "S");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run netlify/functions/_lib/http.test.ts`
Expected: FAIL — cannot find module `./http`.

- [ ] **Step 3: Write `netlify/functions/_lib/http.ts`**

```ts
import { verifySession } from "./session";

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/xml" },
  });
}

export function requireSession(req: Request, secret: string): Response | null {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return verifySession(token, secret) ? null : json({ error: "unauthorized" }, 401);
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run netlify/functions/_lib/http.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_lib/http.ts netlify/functions/_lib/http.test.ts
git commit -m "feat(api): http response + session-guard helpers"
```

---

## Task 4: Server Drive ops (`_lib/driveClient.ts`)

**Files:**
- Create: `netlify/functions/_lib/driveClient.ts`, `netlify/functions/_lib/driveClient.test.ts`

**Interfaces:**
- Consumes: `DriveFile`, `Revision` from `../../../src/types`.
- Produces (each takes a `DriveApiLike` client as first arg):
  - `DriveApiLike` interface (subset of `googleapis` `drive_v3.Drive`)
  - `listBpmnFiles(api, folderId): Promise<DriveFile[]>`
  - `getXml(api, fileId): Promise<string>`
  - `putXml(api, fileId, xml, editorName): Promise<{ version: string; headRevisionId: string | null }>`
  - `createFile(api, folderId, name, xml): Promise<DriveFile>`
  - `setAppProperties(api, fileId, props): Promise<void>` (props values "" become null = delete)
  - `listRevisions(api, fileId): Promise<Revision[]>`
  - `getRevisionXml(api, fileId, revisionId): Promise<string>`
  - `setKeepForever(api, fileId, revisionId, keep): Promise<void>`

- [ ] **Step 1: Write the failing test `netlify/functions/_lib/driveClient.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import {
  listBpmnFiles,
  putXml,
  setAppProperties,
  listRevisions,
} from "./driveClient";

function fakeApi(overrides: any = {}) {
  return {
    files: {
      list: vi.fn().mockResolvedValue({
        data: { files: [{ id: "f1", name: "a.bpmn", version: "1", headRevisionId: "r1", appProperties: {} }] },
      }),
      get: vi.fn().mockResolvedValue({ data: "<x/>" }),
      update: vi.fn().mockResolvedValue({ data: { version: "9", headRevisionId: "r9" } }),
      create: vi.fn().mockResolvedValue({ data: { id: "n1", name: "n.bpmn", version: "1", headRevisionId: "r1" } }),
      ...overrides.files,
    },
    revisions: {
      list: vi.fn().mockResolvedValue({
        data: { revisions: [{ id: "r1", modifiedTime: "t", keepForever: true, size: "10" }] },
      }),
      get: vi.fn().mockResolvedValue({ data: "<rev/>" }),
      update: vi.fn().mockResolvedValue({ data: {} }),
      ...overrides.revisions,
    },
  };
}

describe("server driveClient", () => {
  it("lists only .bpmn in the folder with the right query", async () => {
    const api = fakeApi();
    const files = await listBpmnFiles(api as any, "FOLDER");
    const params = api.files.list.mock.calls[0][0];
    expect(params.q).toContain("'FOLDER' in parents");
    expect(params.q).toContain("name contains '.bpmn'");
    expect(files[0].id).toBe("f1");
  });

  it("putXml sends media + lastEditedBy and returns version", async () => {
    const api = fakeApi();
    const res = await putXml(api as any, "f1", "<x/>", "Ana");
    const params = api.files.update.mock.calls[0][0];
    expect(params.fileId).toBe("f1");
    expect(params.media.body).toBe("<x/>");
    expect(params.requestBody.appProperties.lastEditedBy).toBe("Ana");
    expect(res.version).toBe("9");
  });

  it("setAppProperties converts empty-string values to null (delete)", async () => {
    const api = fakeApi();
    await setAppProperties(api as any, "f1", { lockedByName: "", lockedAt: "" });
    const params = api.files.update.mock.calls[0][0];
    expect(params.requestBody.appProperties.lockedByName).toBeNull();
    expect(params.requestBody.appProperties.lockedAt).toBeNull();
  });

  it("listRevisions maps size→sizeBytes and keepForever", async () => {
    const api = fakeApi();
    const revs = await listRevisions(api as any, "f1");
    expect(revs[0]).toMatchObject({ id: "r1", keepForever: true, sizeBytes: 10 });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run netlify/functions/_lib/driveClient.test.ts`
Expected: FAIL — cannot find module `./driveClient`.

- [ ] **Step 3: Write `netlify/functions/_lib/driveClient.ts`**

```ts
import type { DriveFile, Revision } from "../../../src/types";

const FILE_FIELDS = "id,name,version,headRevisionId,appProperties,lastModifyingUser";

export interface DriveApiLike {
  files: {
    list(params: any): Promise<{ data: { files?: any[] } }>;
    get(params: any, opts?: any): Promise<{ data: any }>;
    update(params: any): Promise<{ data: any }>;
    create(params: any): Promise<{ data: any }>;
  };
  revisions: {
    list(params: any): Promise<{ data: { revisions?: any[] } }>;
    get(params: any, opts?: any): Promise<{ data: any }>;
    update(params: any): Promise<{ data: any }>;
  };
}

export async function listBpmnFiles(api: DriveApiLike, folderId: string): Promise<DriveFile[]> {
  const res = await api.files.list({
    q: `'${folderId}' in parents and name contains '.bpmn' and trashed = false`,
    fields: `files(${FILE_FIELDS})`,
    pageSize: 1000,
  });
  return (res.data.files ?? []) as DriveFile[];
}

export async function getXml(api: DriveApiLike, fileId: string): Promise<string> {
  const res = await api.files.get({ fileId, alt: "media" }, { responseType: "text" });
  return String(res.data);
}

export async function putXml(
  api: DriveApiLike,
  fileId: string,
  xml: string,
  editorName: string,
): Promise<{ version: string; headRevisionId: string | null }> {
  const res = await api.files.update({
    fileId,
    media: { mimeType: "application/xml", body: xml },
    requestBody: { appProperties: { lastEditedBy: editorName } },
    fields: "version,headRevisionId",
  });
  return { version: String(res.data.version), headRevisionId: res.data.headRevisionId ?? null };
}

export async function createFile(
  api: DriveApiLike,
  folderId: string,
  name: string,
  xml: string,
): Promise<DriveFile> {
  const res = await api.files.create({
    requestBody: { name, parents: [folderId], mimeType: "application/xml" },
    media: { mimeType: "application/xml", body: xml },
    fields: FILE_FIELDS,
  });
  return res.data as DriveFile;
}

export async function setAppProperties(
  api: DriveApiLike,
  fileId: string,
  props: Record<string, string>,
): Promise<void> {
  // Drive deletes an appProperty when its value is null.
  const appProperties: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(props)) appProperties[k] = v === "" ? null : v;
  await api.files.update({ fileId, requestBody: { appProperties }, fields: "id" });
}

export async function listRevisions(api: DriveApiLike, fileId: string): Promise<Revision[]> {
  const res = await api.revisions.list({
    fileId,
    fields: "revisions(id,modifiedTime,keepForever,size,lastModifyingUser)",
    pageSize: 1000,
  });
  return ((res.data.revisions ?? []) as any[]).map((r) => ({
    id: r.id,
    modifiedTime: r.modifiedTime,
    keepForever: !!r.keepForever,
    sizeBytes: r.size ? Number(r.size) : undefined,
    lastModifyingUser: r.lastModifyingUser,
  }));
}

export async function getRevisionXml(api: DriveApiLike, fileId: string, revisionId: string): Promise<string> {
  const res = await api.revisions.get({ fileId, revisionId, alt: "media" }, { responseType: "text" });
  return String(res.data);
}

export async function setKeepForever(
  api: DriveApiLike,
  fileId: string,
  revisionId: string,
  keep: boolean,
): Promise<void> {
  await api.revisions.update({ fileId, revisionId, requestBody: { keepForever: keep } });
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run netlify/functions/_lib/driveClient.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_lib/driveClient.ts netlify/functions/_lib/driveClient.test.ts
git commit -m "feat(api): server-side Drive operations over googleapis"
```

---

## Task 5: Service-account Drive client (`_lib/drive.ts`)

**Files:**
- Create: `netlify/functions/_lib/drive.ts`

**Interfaces:**
- Consumes: `googleapis`.
- Produces: `getDrive(): DriveApiLike` (builds an authenticated client from `GOOGLE_SERVICE_ACCOUNT_KEY`); `env(name): string` helper.

This wraps a real external SDK + env; it has no unit test (handler tests mock this module). Validated by typecheck.

- [ ] **Step 1: Write `netlify/functions/_lib/drive.ts`**

```ts
import { google } from "googleapis";
import type { DriveApiLike } from "./driveClient";

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function getDrive(): DriveApiLike {
  const credentials = JSON.parse(env("GOOGLE_SERVICE_ACCOUNT_KEY"));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth }) as unknown as DriveApiLike;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/_lib/drive.ts
git commit -m "feat(api): service-account Drive client factory"
```

---

## Task 6: Login endpoint (`login.ts`)

**Files:**
- Create: `netlify/functions/login.ts`, `netlify/functions/login.test.ts`

**Interfaces:**
- Consumes: `signSession` (`./_lib/session`), `json` (`./_lib/http`), `env` (`./_lib/drive`).
- Produces: `POST /api/login` — body `{ password }` → `{ token }` (200) or `{ error }` (401). Constant-time compare.

- [ ] **Step 1: Write the failing test `netlify/functions/login.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import handler from "./login";
import { verifySession } from "./_lib/session";

beforeEach(() => {
  process.env.APP_PASSWORD = "team-pass";
  process.env.SESSION_SECRET = "sek";
});

function post(body: unknown) {
  return new Request("https://x/api/login", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/login", () => {
  it("returns a valid token for the correct password", async () => {
    const res = await handler(post({ password: "team-pass" }), {} as any);
    expect(res.status).toBe(200);
    const { token } = await res.json();
    expect(verifySession(token, "sek")).toBe(true);
  });

  it("rejects a wrong password with 401", async () => {
    const res = await handler(post({ password: "nope" }), {} as any);
    expect(res.status).toBe(401);
  });

  it("rejects a missing password with 401", async () => {
    const res = await handler(post({}), {} as any);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run netlify/functions/login.test.ts`
Expected: FAIL — cannot find module `./login`.

- [ ] **Step 3: Write `netlify/functions/login.ts`**

```ts
import type { Config, Context } from "@netlify/functions";
import { timingSafeEqual } from "node:crypto";
import { signSession } from "./_lib/session";
import { json } from "./_lib/http";
import { env } from "./_lib/drive";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let password = "";
  try {
    password = (await req.json())?.password ?? "";
  } catch {
    return json({ error: "bad request" }, 400);
  }
  if (!password || !safeEqual(password, env("APP_PASSWORD"))) {
    return json({ error: "invalid password" }, 401);
  }
  return json({ token: signSession(env("SESSION_SECRET")) });
};

export const config: Config = { path: "/api/login" };
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run netlify/functions/login.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/login.ts netlify/functions/login.test.ts
git commit -m "feat(api): /api/login with constant-time password check"
```

---

## Task 7: Files list + create (`files.ts`)

**Files:**
- Create: `netlify/functions/files.ts`, `netlify/functions/files.test.ts`

**Interfaces:**
- Consumes: `requireSession`/`json` (`./_lib/http`), `getDrive`/`env` (`./_lib/drive`), `listBpmnFiles`/`createFile` (`./_lib/driveClient`).
- Produces: `GET /api/files` → `DriveFile[]`; `POST /api/files` body `{ name, xml }` → `DriveFile`.

- [ ] **Step 1: Write the failing test `netlify/functions/files.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const fakeApi = {
  files: {
    list: vi.fn().mockResolvedValue({ data: { files: [{ id: "f1", name: "a.bpmn" }] } }),
    create: vi.fn().mockResolvedValue({ data: { id: "n1", name: "n.bpmn" } }),
  },
};
vi.mock("./_lib/drive", () => ({
  getDrive: () => fakeApi,
  env: (n: string) => (n === "DRIVE_FOLDER_ID" ? "FOLDER" : "sek"),
}));

import handler from "./files";
import { signSession } from "./_lib/session";

let token: string;
beforeEach(() => {
  process.env.SESSION_SECRET = "sek";
  token = signSession("sek");
  fakeApi.files.list.mockClear();
  fakeApi.files.create.mockClear();
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe("/api/files", () => {
  it("401 without a token", async () => {
    const res = await handler(new Request("https://x/api/files"), {} as any);
    expect(res.status).toBe(401);
  });

  it("GET lists files", async () => {
    const res = await handler(new Request("https://x/api/files", { headers: auth() }), {} as any);
    expect(res.status).toBe(200);
    expect((await res.json())[0].id).toBe("f1");
    expect(fakeApi.files.list).toHaveBeenCalled();
  });

  it("POST creates a file in the folder", async () => {
    const req = new Request("https://x/api/files", {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ name: "n.bpmn", xml: "<x/>" }),
    });
    const res = await handler(req, {} as any);
    expect(res.status).toBe(200);
    expect(fakeApi.files.create.mock.calls[0][0].requestBody.parents).toEqual(["FOLDER"]);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run netlify/functions/files.test.ts`
Expected: FAIL — cannot find module `./files`.

- [ ] **Step 3: Write `netlify/functions/files.ts`**

```ts
import type { Config, Context } from "@netlify/functions";
import { requireSession, json } from "./_lib/http";
import { getDrive, env } from "./_lib/drive";
import { listBpmnFiles, createFile } from "./_lib/driveClient";

export default async (req: Request, _context: Context): Promise<Response> => {
  const unauth = requireSession(req, env("SESSION_SECRET"));
  if (unauth) return unauth;

  const api = getDrive();
  const folderId = env("DRIVE_FOLDER_ID");

  if (req.method === "GET") {
    return json(await listBpmnFiles(api, folderId));
  }
  if (req.method === "POST") {
    const { name, xml } = await req.json();
    if (!name || typeof xml !== "string") return json({ error: "name and xml required" }, 400);
    const finalName = name.endsWith(".bpmn") ? name : `${name}.bpmn`;
    return json(await createFile(api, folderId, finalName, xml));
  }
  return json({ error: "method not allowed" }, 405);
};

export const config: Config = { path: "/api/files" };
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run netlify/functions/files.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/files.ts netlify/functions/files.test.ts
git commit -m "feat(api): GET/POST /api/files (list + create)"
```

---

## Task 8: File download + save (`file.ts`)

**Files:**
- Create: `netlify/functions/file.ts`, `netlify/functions/file.test.ts`

**Interfaces:**
- Consumes: `requireSession`/`json`/`text` (`./_lib/http`), `getDrive`/`env` (`./_lib/drive`), `getXml`/`putXml` (`./_lib/driveClient`).
- Produces: `GET /api/files/:id` → XML text; `PUT /api/files/:id` body `{ xml, editorName }` → `{ version, headRevisionId }`. `:id` via `context.params.id`.

- [ ] **Step 1: Write the failing test `netlify/functions/file.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const fakeApi = {
  files: {
    get: vi.fn().mockResolvedValue({ data: "<diagram/>" }),
    update: vi.fn().mockResolvedValue({ data: { version: "5", headRevisionId: "r5" } }),
  },
};
vi.mock("./_lib/drive", () => ({ getDrive: () => fakeApi, env: () => "sek" }));

import handler from "./file";
import { signSession } from "./_lib/session";

let token: string;
beforeEach(() => {
  process.env.SESSION_SECRET = "sek";
  token = signSession("sek");
  fakeApi.files.get.mockClear();
  fakeApi.files.update.mockClear();
});
const auth = () => ({ Authorization: `Bearer ${token}` });
const ctx = (id: string) => ({ params: { id } }) as any;

describe("/api/files/:id", () => {
  it("401 without a token", async () => {
    const res = await handler(new Request("https://x/api/files/f1"), ctx("f1"));
    expect(res.status).toBe(401);
  });

  it("GET returns the XML", async () => {
    const res = await handler(new Request("https://x/api/files/f1", { headers: auth() }), ctx("f1"));
    expect(await res.text()).toBe("<diagram/>");
    expect(fakeApi.files.get.mock.calls[0][0].fileId).toBe("f1");
  });

  it("PUT saves xml with editorName and returns version", async () => {
    const req = new Request("https://x/api/files/f1", {
      method: "PUT",
      headers: auth(),
      body: JSON.stringify({ xml: "<x/>", editorName: "Ana" }),
    });
    const res = await handler(req, ctx("f1"));
    expect(await res.json()).toEqual({ version: "5", headRevisionId: "r5" });
    expect(fakeApi.files.update.mock.calls[0][0].requestBody.appProperties.lastEditedBy).toBe("Ana");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run netlify/functions/file.test.ts`
Expected: FAIL — cannot find module `./file`.

- [ ] **Step 3: Write `netlify/functions/file.ts`**

```ts
import type { Config, Context } from "@netlify/functions";
import { requireSession, json, text } from "./_lib/http";
import { getDrive, env } from "./_lib/drive";
import { getXml, putXml } from "./_lib/driveClient";

export default async (req: Request, context: Context): Promise<Response> => {
  const unauth = requireSession(req, env("SESSION_SECRET"));
  if (unauth) return unauth;

  const fileId = context.params.id;
  const api = getDrive();

  if (req.method === "GET") {
    return text(await getXml(api, fileId));
  }
  if (req.method === "PUT") {
    const { xml, editorName } = await req.json();
    if (typeof xml !== "string") return json({ error: "xml required" }, 400);
    return json(await putXml(api, fileId, xml, editorName ?? "anónimo"));
  }
  return json({ error: "method not allowed" }, 405);
};

export const config: Config = { path: "/api/files/:id" };
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run netlify/functions/file.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/file.ts netlify/functions/file.test.ts
git commit -m "feat(api): GET/PUT /api/files/:id (download + save)"
```

---

## Task 9: Lock endpoint (`file-lock.ts`)

**Files:**
- Create: `netlify/functions/file-lock.ts`, `netlify/functions/file-lock.test.ts`

**Interfaces:**
- Consumes: `requireSession`/`json` (`./_lib/http`), `getDrive`/`env` (`./_lib/drive`), `setAppProperties` (`./_lib/driveClient`).
- Produces: `PATCH /api/files/:id/lock` body `{ props: Record<string,string> }` → 200 `{ ok: true }`. The client sends the exact appProperties from `lockManager.lockProps`/`clearProps`; the server persists them (""→null delete handled by `setAppProperties`).

- [ ] **Step 1: Write the failing test `netlify/functions/file-lock.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const fakeApi = { files: { update: vi.fn().mockResolvedValue({ data: { id: "f1" } }) } };
vi.mock("./_lib/drive", () => ({ getDrive: () => fakeApi, env: () => "sek" }));

import handler from "./file-lock";
import { signSession } from "./_lib/session";

let token: string;
beforeEach(() => {
  process.env.SESSION_SECRET = "sek";
  token = signSession("sek");
  fakeApi.files.update.mockClear();
});
const auth = () => ({ Authorization: `Bearer ${token}` });
const ctx = (id: string) => ({ params: { id } }) as any;

describe("PATCH /api/files/:id/lock", () => {
  it("401 without a token", async () => {
    const res = await handler(new Request("https://x/api/files/f1/lock", { method: "PATCH" }), ctx("f1"));
    expect(res.status).toBe(401);
  });

  it("persists the provided appProperties", async () => {
    const req = new Request("https://x/api/files/f1/lock", {
      method: "PATCH",
      headers: auth(),
      body: JSON.stringify({ props: { lockedByEmail: "Ana", lockedByName: "Ana", lockedAt: "t" } }),
    });
    const res = await handler(req, ctx("f1"));
    expect(res.status).toBe(200);
    expect(fakeApi.files.update.mock.calls[0][0].requestBody.appProperties.lockedByName).toBe("Ana");
  });

  it("converts empty strings to null (release lock)", async () => {
    const req = new Request("https://x/api/files/f1/lock", {
      method: "PATCH",
      headers: auth(),
      body: JSON.stringify({ props: { lockedByEmail: "", lockedByName: "", lockedAt: "" } }),
    });
    await handler(req, ctx("f1"));
    expect(fakeApi.files.update.mock.calls[0][0].requestBody.appProperties.lockedByName).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run netlify/functions/file-lock.test.ts`
Expected: FAIL — cannot find module `./file-lock`.

- [ ] **Step 3: Write `netlify/functions/file-lock.ts`**

```ts
import type { Config, Context } from "@netlify/functions";
import { requireSession, json } from "./_lib/http";
import { getDrive, env } from "./_lib/drive";
import { setAppProperties } from "./_lib/driveClient";

export default async (req: Request, context: Context): Promise<Response> => {
  const unauth = requireSession(req, env("SESSION_SECRET"));
  if (unauth) return unauth;
  if (req.method !== "PATCH") return json({ error: "method not allowed" }, 405);

  const { props } = await req.json();
  if (!props || typeof props !== "object") return json({ error: "props required" }, 400);
  await setAppProperties(getDrive(), context.params.id, props as Record<string, string>);
  return json({ ok: true });
};

export const config: Config = { path: "/api/files/:id/lock" };
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run netlify/functions/file-lock.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/file-lock.ts netlify/functions/file-lock.test.ts
git commit -m "feat(api): PATCH /api/files/:id/lock (advisory lock persist)"
```

---

## Task 10: Revisions endpoints (`revisions.ts`, `revision.ts`)

**Files:**
- Create: `netlify/functions/revisions.ts`, `netlify/functions/revision.ts`, `netlify/functions/revisions.test.ts`

**Interfaces:**
- Consumes: `requireSession`/`json`/`text` (`./_lib/http`), `getDrive`/`env` (`./_lib/drive`), `listRevisions`/`getRevisionXml`/`setKeepForever` (`./_lib/driveClient`).
- Produces: `GET /api/files/:id/revisions` → `Revision[]`; `GET /api/files/:id/revisions/:rid` → XML; `PATCH /api/files/:id/revisions/:rid` body `{ keepForever }` → `{ ok: true }`.

- [ ] **Step 1: Write the failing test `netlify/functions/revisions.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const fakeApi = {
  revisions: {
    list: vi.fn().mockResolvedValue({ data: { revisions: [{ id: "r1", modifiedTime: "t", keepForever: false }] } }),
    get: vi.fn().mockResolvedValue({ data: "<rev/>" }),
    update: vi.fn().mockResolvedValue({ data: {} }),
  },
};
vi.mock("./_lib/drive", () => ({ getDrive: () => fakeApi, env: () => "sek" }));

import listHandler from "./revisions";
import itemHandler from "./revision";
import { signSession } from "./_lib/session";

let token: string;
beforeEach(() => {
  process.env.SESSION_SECRET = "sek";
  token = signSession("sek");
  fakeApi.revisions.list.mockClear();
  fakeApi.revisions.get.mockClear();
  fakeApi.revisions.update.mockClear();
});
const auth = () => ({ Authorization: `Bearer ${token}` });

describe("revisions endpoints", () => {
  it("401 without a token (list)", async () => {
    const res = await listHandler(new Request("https://x/api/files/f1/revisions"), { params: { id: "f1" } } as any);
    expect(res.status).toBe(401);
  });

  it("lists revisions", async () => {
    const res = await listHandler(
      new Request("https://x/api/files/f1/revisions", { headers: auth() }),
      { params: { id: "f1" } } as any,
    );
    expect((await res.json())[0].id).toBe("r1");
  });

  it("gets a revision's xml", async () => {
    const res = await itemHandler(
      new Request("https://x/api/files/f1/revisions/r1", { headers: auth() }),
      { params: { id: "f1", rid: "r1" } } as any,
    );
    expect(await res.text()).toBe("<rev/>");
  });

  it("sets keepForever via PATCH", async () => {
    const req = new Request("https://x/api/files/f1/revisions/r1", {
      method: "PATCH",
      headers: auth(),
      body: JSON.stringify({ keepForever: true }),
    });
    const res = await itemHandler(req, { params: { id: "f1", rid: "r1" } } as any);
    expect(res.status).toBe(200);
    expect(fakeApi.revisions.update.mock.calls[0][0].requestBody.keepForever).toBe(true);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run netlify/functions/revisions.test.ts`
Expected: FAIL — cannot find module `./revisions`.

- [ ] **Step 3: Write `netlify/functions/revisions.ts`**

```ts
import type { Config, Context } from "@netlify/functions";
import { requireSession, json } from "./_lib/http";
import { getDrive, env } from "./_lib/drive";
import { listRevisions } from "./_lib/driveClient";

export default async (req: Request, context: Context): Promise<Response> => {
  const unauth = requireSession(req, env("SESSION_SECRET"));
  if (unauth) return unauth;
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);
  return json(await listRevisions(getDrive(), context.params.id));
};

export const config: Config = { path: "/api/files/:id/revisions" };
```

- [ ] **Step 4: Write `netlify/functions/revision.ts`**

```ts
import type { Config, Context } from "@netlify/functions";
import { requireSession, json, text } from "./_lib/http";
import { getDrive, env } from "./_lib/drive";
import { getRevisionXml, setKeepForever } from "./_lib/driveClient";

export default async (req: Request, context: Context): Promise<Response> => {
  const unauth = requireSession(req, env("SESSION_SECRET"));
  if (unauth) return unauth;

  const { id, rid } = context.params;
  const api = getDrive();

  if (req.method === "GET") {
    return text(await getRevisionXml(api, id, rid));
  }
  if (req.method === "PATCH") {
    const { keepForever } = await req.json();
    await setKeepForever(api, id, rid, !!keepForever);
    return json({ ok: true });
  }
  return json({ error: "method not allowed" }, 405);
};

export const config: Config = { path: "/api/files/:id/revisions/:rid" };
```

- [ ] **Step 5: Run it — expect PASS**

Run: `npx vitest run netlify/functions/revisions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/revisions.ts netlify/functions/revision.ts netlify/functions/revisions.test.ts
git commit -m "feat(api): revisions list/get/keepForever endpoints"
```

---

## Task 11: Frontend API client (`apiClient.ts`)

**Files:**
- Create: `src/apiClient.ts`, `src/apiClient.test.ts`

**Interfaces:**
- Consumes: `DriveFile`, `Revision` from `./types`; an injected `getToken(): string | null`.
- Produces a client with: `listFiles()`, `getXml(id)`, `putXml(id, xml, editorName)`, `createFile(name, xml)`, `setLock(id, props)`, `listRevisions(id)`, `getRevisionXml(id, rid)`, `setKeepForever(id, rid, keep)`, `lastWrites: Map`, `lastWriteVersion(id)`. Throws `UnauthorizedError` on 401 (so the gate can re-show).

- [ ] **Step 1: Write the failing test `src/apiClient.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApiClient, UnauthorizedError } from "./apiClient";

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

describe("apiClient", () => {
  let client: ReturnType<typeof createApiClient>;
  beforeEach(() => {
    client = createApiClient(() => "TOK");
  });

  it("sends the bearer token and lists files", async () => {
    const fetchMock = vi.fn().mockReturnValue(jsonResponse([{ id: "f1", name: "a.bpmn" }]));
    vi.stubGlobal("fetch", fetchMock);
    const files = await client.listFiles();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/files");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer TOK");
    expect(files[0].id).toBe("f1");
  });

  it("records last write version after putXml", async () => {
    const fetchMock = vi.fn().mockReturnValue(jsonResponse({ version: "7", headRevisionId: "r7" }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await client.putXml("f1", "<x/>", "Ana");
    expect(res.version).toBe("7");
    expect(client.lastWriteVersion("f1")).toBe("7");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/files/f1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string).editorName).toBe("Ana");
  });

  it("throws UnauthorizedError on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(jsonResponse({ error: "unauthorized" }, 401)));
    await expect(client.listFiles()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/apiClient.test.ts`
Expected: FAIL — cannot find module `./apiClient`.

- [ ] **Step 3: Write `src/apiClient.ts`**

```ts
import type { DriveFile, Revision } from "./types";

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

export function createApiClient(getToken: () => string | null) {
  const lastWrites = new Map<string, string>();

  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const token = getToken();
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(path, { ...init, headers });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    return res;
  }

  const jsonInit = (body: unknown, method: string): RequestInit => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return {
    async listFiles(): Promise<DriveFile[]> {
      return (await call("/api/files")).json();
    },
    async getXml(id: string): Promise<string> {
      return (await call(`/api/files/${id}`)).text();
    },
    async putXml(id: string, xml: string, editorName: string): Promise<{ version: string; headRevisionId: string | null }> {
      const data = await (await call(`/api/files/${id}`, jsonInit({ xml, editorName }, "PUT"))).json();
      lastWrites.set(id, String(data.version));
      return { version: String(data.version), headRevisionId: data.headRevisionId ?? null };
    },
    async createFile(name: string, xml: string): Promise<DriveFile> {
      return (await call("/api/files", jsonInit({ name, xml }, "POST"))).json();
    },
    async setLock(id: string, props: Record<string, string>): Promise<void> {
      await call(`/api/files/${id}/lock`, jsonInit({ props }, "PATCH"));
    },
    async listRevisions(id: string): Promise<Revision[]> {
      return (await call(`/api/files/${id}/revisions`)).json();
    },
    async getRevisionXml(id: string, rid: string): Promise<string> {
      return (await call(`/api/files/${id}/revisions/${rid}`)).text();
    },
    async setKeepForever(id: string, rid: string, keep: boolean): Promise<void> {
      await call(`/api/files/${id}/revisions/${rid}`, jsonInit({ keepForever: keep }, "PATCH"));
    },
    lastWrites,
    lastWriteVersion: (id: string) => lastWrites.get(id),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/apiClient.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/apiClient.ts src/apiClient.test.ts
git commit -m "feat: frontend apiClient to the team-mode backend"
```

---

## Task 12: Identity + gate (`identity.ts`, `gate.ts`)

**Files:**
- Create: `src/identity.ts`, `src/gate.ts`, `src/identity.test.ts`, `src/gate.test.ts`

**Interfaces:**
- `identity.ts`: `getName(): string | null`, `setName(name: string): void`, `clearName(): void` (localStorage key `bpmn-compartida.name`).
- `gate.ts`: `getToken(): string | null`, `setToken(t: string): void`, `clearToken(): void` (localStorage key `bpmn-compartida.token`); `login(password: string): Promise<boolean>` (POST `/api/login`, stores token, returns success).

- [ ] **Step 1: Write the failing test `src/identity.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getName, setName, clearName } from "./identity";

describe("identity", () => {
  beforeEach(() => localStorage.clear());
  it("persists and clears the display name", () => {
    expect(getName()).toBeNull();
    setName("Ana");
    expect(getName()).toBe("Ana");
    clearName();
    expect(getName()).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing test `src/gate.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getToken, setToken, clearToken, login } from "./gate";

describe("gate", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("stores and clears the token", () => {
    expect(getToken()).toBeNull();
    setToken("T");
    expect(getToken()).toBe("T");
    clearToken();
    expect(getToken()).toBeNull();
  });

  it("login stores the token on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: "JWT" }), { status: 200 })));
    const ok = await login("pw");
    expect(ok).toBe(true);
    expect(getToken()).toBe("JWT");
  });

  it("login returns false and stores nothing on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "x" }), { status: 401 })));
    const ok = await login("bad");
    expect(ok).toBe(false);
    expect(getToken()).toBeNull();
  });
});
```

- [ ] **Step 3: Run both — expect FAIL**

Run: `npx vitest run src/identity.test.ts src/gate.test.ts`
Expected: FAIL — cannot find modules.

- [ ] **Step 4: Write `src/identity.ts`**

```ts
const KEY = "bpmn-compartida.name";

export function getName(): string | null {
  return localStorage.getItem(KEY);
}
export function setName(name: string): void {
  localStorage.setItem(KEY, name);
}
export function clearName(): void {
  localStorage.removeItem(KEY);
}
```

- [ ] **Step 5: Write `src/gate.ts`**

```ts
const KEY = "bpmn-compartida.token";

export function getToken(): string | null {
  return localStorage.getItem(KEY);
}
export function setToken(t: string): void {
  localStorage.setItem(KEY, t);
}
export function clearToken(): void {
  localStorage.removeItem(KEY);
}

export async function login(password: string): Promise<boolean> {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) return false;
  const { token } = await res.json();
  if (!token) return false;
  setToken(token);
  return true;
}
```

- [ ] **Step 6: Run both — expect PASS**

Run: `npx vitest run src/identity.test.ts src/gate.test.ts`
Expected: PASS (identity 1, gate 3).

- [ ] **Step 7: Commit**

```bash
git add src/identity.ts src/gate.ts src/identity.test.ts src/gate.test.ts
git commit -m "feat: display-name identity and password gate"
```

---

## Task 13: Rewire `main.ts` + remove Google client modules

**Files:**
- Replace: `src/main.ts`
- Modify: `src/config.ts`, `index.html`
- Delete: `src/auth.ts`, `src/folderConfig.ts` (and `src/auth`/`folderConfig` are not imported anywhere else)

**Interfaces:**
- Consumes everything above plus reused `editor`, `ui`, `state`, `lockManager`, `history`, `watcher`. No new exports — composition root.
- Behavior: gate (password) → name prompt → list → check-out → edit → save → check-in → steal → external-change detection (auto-reload clean / conflict bar dirty) + save-time backstop → history preview/restore + retention → new diagram. Identity = typed name used as `me = { name, email: name }` so reused `lockManager` works unchanged.

- [ ] **Step 1: Delete the Google-only modules and their tests**

```bash
git rm src/auth.ts src/folderConfig.ts
```
(There are no unit tests for these; if `src/auth.test.ts`/`src/folderConfig.test.ts` exist, remove them too — they do not in this project.)

- [ ] **Step 2: Replace `src/config.ts`**

```ts
// Team mode keeps no client-side Google secrets; the backend holds everything.
// This module is intentionally minimal; kept so future client config has a home.
export const config = {
  appName: "BPMN compartida",
};
```

- [ ] **Step 3: Edit `index.html` — remove the Google `<script>`/comment block**

Remove the entire commented block plus these two lines (the GIS + gapi loaders are no longer used):

```html
    <script src="https://accounts.google.com/gsi/client" async></script>
    <script src="https://apis.google.com/js/api.js" async></script>
```

Leave the bpmn-js stylesheet handling as-is (CSS is bundled via `main.ts`). The `<head>` keeps charset, viewport, and title.

- [ ] **Step 4: Replace `src/main.ts`**

```ts
// bpmn-js styles bundled from the npm package (no CDN, version-locked).
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";

import { createApiClient, UnauthorizedError } from "./apiClient";
import { createEditor, createBpmnModeler } from "./editor";
import { getToken, setToken, clearToken, login } from "./gate";
import { getName, setName } from "./identity";
import { reduce, initialState, type AppState } from "./state";
import { readLock, lockState, lockProps, clearProps, canCheckOut } from "./lockManager";
import { keepSet, diffPins } from "./history";
import { classifyChange } from "./watcher";
import type { User } from "./types";
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
  const api = createApiClient(() => getToken());

  let state: AppState = initialState;
  let me: User = { name: "", email: "" };
  let openHeadRevisionId: string | null = null;
  let forceOverwrite = false;
  let pollTimer: number | null = null;

  function guard(fn: () => Promise<void>) {
    return () => fn().catch(onError);
  }
  function onError(e: unknown) {
    if (e instanceof UnauthorizedError) {
      clearToken();
      showGate();
      return;
    }
    showToast(String((e as any)?.message ?? e));
  }

  // ---- Gate (password) ----
  function showGate() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    root.innerHTML = `
      <form id="gate">
        <h2>BPMN compartida</h2>
        <input id="pw" type="password" placeholder="Contraseña del equipo" />
        <button type="submit">Entrar</button>
      </form>`;
    (document.getElementById("gate") as HTMLFormElement).addEventListener("submit", (ev) => {
      ev.preventDefault();
      void (async () => {
        const pw = (document.getElementById("pw") as HTMLInputElement).value;
        if (await login(pw)) ensureNameThenApp();
        else showToast("Contraseña incorrecta");
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
    startApp();
  }

  // ---- App shell ----
  let editor: ReturnType<typeof createEditor>;
  async function startApp() {
    root.innerHTML = `
      <header>
        <span id="who"></span>
        <button id="newfile">Nuevo diagrama</button>
        <button id="logout">Salir</button>
      </header>
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

    const modeler = await createBpmnModeler($("canvas") as HTMLElement);
    editor = createEditor(modeler);
    editor.onDirtyChange((dirty) => {
      state = reduce(state, { type: "dirtyChanged", dirty });
    });

    $("newfile").addEventListener("click", guard(newDiagram));
    $("logout").addEventListener("click", () => {
      clearToken();
      showGate();
    });
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

    dispatch({ type: "signedIn" });
    dispatch({ type: "folderSelected", folderId: "server" });
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
    const files = await api.listFiles();
    renderFileList(document.getElementById("files")!, files, me, {
      onOpen: (id) => void openFile(id).catch(onError),
      onSteal: (id) => void steal(id).catch(onError),
    });
  }

  async function openFile(fileId: string) {
    const files = await api.listFiles();
    const meta = files.find((f) => f.id === fileId);
    if (!meta) {
      await refreshFileList();
      return;
    }
    const lock = readLock(meta);
    let lockKind = lockState(lock, me);
    if (canCheckOut(lock, me)) {
      await api.setLock(fileId, lockProps(me, new Date().toISOString()));
      const after = (await api.listFiles()).find((f) => f.id === fileId)!;
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
    if (!forceOverwrite && openHeadRevisionId) {
      const meta = (await api.listFiles()).find((f) => f.id === fileId);
      if (meta && meta.headRevisionId !== openHeadRevisionId) {
        dispatch({ type: "externalChange" });
        showConflictBar(fileId);
        return;
      }
    }
    const xml = await editor.getXml();
    const res = await api.putXml(fileId, xml, me.name);
    openHeadRevisionId = res.headRevisionId ?? openHeadRevisionId;
    forceOverwrite = false;
    editor.markSaved();
    dispatch({ type: "dirtyChanged", dirty: false });
    await reconcileRetention(fileId);
    await loadHistory(fileId);
    showToast("Guardado");
  }

  async function checkIn(fileId: string) {
    if (state.kind === "editing" && state.dirty) await save(fileId);
    await api.setLock(fileId, clearProps());
    dispatch({ type: "closedFile" });
    await refreshFileList();
  }

  async function reconcileRetention(fileId: string) {
    const revs = await api.listRevisions(fileId);
    const desired = keepSet(revs, Date.now());
    const { pin, unpin } = diffPins(revs, desired);
    for (const id of pin) await api.setKeepForever(fileId, id, true);
    for (const id of unpin) await api.setKeepForever(fileId, id, false);
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

  function showConflictBar(fileId: string) {
    renderConflictBar(document.getElementById("conflict")!, {
      onDiscard: () => void (async () => {
        const xml = await api.getXml(fileId);
        await editor.load(xml);
        const fresh = (await api.listFiles()).find((f) => f.id === fileId);
        openHeadRevisionId = fresh?.headRevisionId ?? null;
        document.getElementById("conflict")!.innerHTML = "";
        dispatch({ type: "resolvedConflict", keepMine: false });
      })().catch(onError),
      onKeepMine: () => {
        forceOverwrite = true;
        document.getElementById("conflict")!.innerHTML = "";
        dispatch({ type: "resolvedConflict", keepMine: true });
        void save(fileId).catch(onError);
      },
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
      const fresh = (await api.listFiles()).find((f) => f.id === fileId);
      openHeadRevisionId = fresh?.headRevisionId ?? openHeadRevisionId;
      dispatch({ type: "reloaded" });
      showToast("Recargado — actualizado externamente");
    } else {
      dispatch({ type: "externalChange" });
      showConflictBar(fileId);
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
  if (getToken()) ensureNameThenApp();
  else showGate();
}

bootstrap();
```

Note: `pollChanges` passes `{ fileId, version }` to `classifyChange`; `classifyChange`'s own-write suppression compares `version` against `api.lastWrites` (populated by `putXml`), so our own saves don't trigger reloads.

- [ ] **Step 5: Build gate — typecheck, build, full test suite**

Run: `npm run typecheck && npm test && npm run build`
Expected: no type errors; all tests green (existing reused-module tests + new backend/frontend tests); build succeeds. If transcription causes a type error against a real interface, fix minimally to match the actual exported signatures.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: rewire app to team-mode (gate, identity, apiClient); drop Google client"
```

---

## Task 14: README (team mode) + final verification

**Files:**
- Modify: `README.md`

**Interfaces:** none (docs + verification).

- [ ] **Step 1: Replace `README.md`**

````markdown
# BPMN compartida — Team Mode

Collaboratively edit BPMN diagrams stored in a shared Google Drive folder, with
**no per-user Google login**. A Netlify Functions backend holds a Google service
account and does all Drive access; users enter a **shared team password** and a
**display name**.

## Setup

### Google
1. In Google Cloud, create a **service account**; enable the **Google Drive API**.
2. Create a **JSON key** for the service account and download it.
3. **Share the target Drive folder** with the service account's email
   (`…@….iam.gserviceaccount.com`) as **Editor**. Note the folder ID (from its URL).

### Netlify env vars (Site settings → Environment variables)
- `GOOGLE_SERVICE_ACCOUNT_KEY` — the full JSON key (as a single string).
- `DRIVE_FOLDER_ID` — the shared folder's ID.
- `APP_PASSWORD` — the shared team password.
- `SESSION_SECRET` — a long random string (signs session tokens).

### Deploy
Connect the repo to Netlify. `netlify.toml` builds the SPA to `dist/` and the
functions from `netlify/functions/`. Endpoints are bound via each function's
`config.path` (`/api/*`).

## Commands

- `npm run dev` — Vite dev server (frontend only; for full local API use `netlify dev`).
- `netlify dev` — serves the SPA + functions together locally (needs the env vars set).
- `npm test` — unit tests (frontend + backend).
- `npm run typecheck` — TypeScript check.
- `npm run build` — production build to `dist/`.

## Architecture

Static SPA (reuses the pure logic, editor, and UI modules) → `/api/*` Netlify
Functions → Google Drive via a service account. Shared password issues a session
JWT verified by every endpoint. Locks are advisory (keyed by the typed name);
external edits (e.g. the LLM agent on the synced local file) are detected by
polling file versions; history uses Drive revisions with exponential-decay
retention. See `docs/superpowers/specs/2026-06-23-team-mode-no-login-design.md`.

**Note on attribution:** because the service account performs all in-app writes,
Drive's native revision author is always the service account. The display name is
soft attribution stored in `appProperties` (`lastEditedBy`, `lockedByName`).

## Manual test checklist

- [ ] Open the site → password gate appears; wrong password rejected, correct one enters.
- [ ] First entry prompts for a display name; it shows in the header.
- [ ] `.bpmn` files from the folder list.
- [ ] Open a free file → "checked out by you"; edit; Guardar; Check in.
- [ ] Second browser (same password, different name) sees the file locked while held.
- [ ] Steal a stale lock.
- [ ] With the file open and no unsaved edits, edit the synced local `.bpmn`
      externally → app auto-reloads.
- [ ] With unsaved edits, an external change → conflict bar; Descartar / Conservar work;
      saving over a stale base triggers the same conflict bar (save-time backstop).
- [ ] History lists revisions; Preview is read-only; Restore creates a new revision.
- [ ] After many saves, old restore points thin out (exponential decay).
````

- [ ] **Step 2: Final verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests pass, no type errors, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: team-mode setup, Netlify env, and manual checklist"
```

---

## Self-Review (spec coverage)

| Spec section | Covered by |
| --- | --- |
| §1 serverless backend + service account | Tasks 1, 5, 6–10 |
| §2 reuse pure modules; new apiClient/identity/gate; remove auth/folderConfig | Tasks 11, 12, 13 |
| §3 Netlify Functions v2, env vars, endpoints, `drive()`/`requireSession()`/`json()` | Tasks 1, 3, 5, 6–10 |
| §4 gate → identity → browse/edit/checkin/steal/history/restore/retention; poll + backstop | Task 13 |
| §5 advisory lock keyed by typed name (reuses lockManager appProperties) | Tasks 9, 13 |
| §6 service-account key server-only; password gate + JWT; constant-time; same-origin | Tasks 2, 5, 6 |
| §7 setup (service account, share folder, env, deploy) | Tasks 1, 14 |
| §8 testing (backend mocked googleapis; apiClient mocked fetch; identity/gate; manual) | Tasks 2–4, 6–12, 14 |
| §9 MVP scope incl. new diagram | Tasks 7, 13 |

No placeholders remain. Type/signature consistency checked: `putXml(...editorName)`, `setLock(id, props)` ↔ `setAppProperties`, `classifyChange({fileId,version}, openId, lastWrites)`, `keepSet`/`diffPins`, `lockProps`/`clearProps`, `UnauthorizedError`, `headRevisionId: string | null` are consistent across frontend, backend, and reused modules.
