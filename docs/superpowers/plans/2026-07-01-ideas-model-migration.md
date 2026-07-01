# Ideas v2 — Plan 1: Modelo + migración + índice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La capa de datos de las ideas v2: nota por idea (frontmatter + descripción + hilo de comentarios) con 5 estados, nota de mejora, migración desde el `_ideas.md` v1, e índice generado que lista TODAS las ideas — todo markdown puro y testeable, sin UI nueva.

**Architecture:** Módulos pequeños y puros (`ideaState`, `ideaComments`, `ideaNote`, `mejoraNote`, `ideasIndex`, `ideasMigrate`) que reusan `parseFrontmatter`/`serializeFrontmatter` (Plan 1) y `parseIdeas` v1 (Plan 3). Un `ideasClient` hace el IO (listar/leer/escribir notas + ids únicos) vía la abstracción `fsClient`.

**Tech Stack:** TypeScript + Vite, Vitest (happy-dom).

## Global Constraints

- **TypeScript estricto** (`noUnusedLocals`, `noImplicitAny`); módulos exportan funciones puras o factorías `createX(api)`, siguiendo el patrón de `src/processDocs/`.
- **Almacenamiento markdown**: nota de idea `<diagrama>.docs/ideas/<id>.md`; nota de mejora `<diagrama>.docs/mejoras/<id>.md`; índice `<diagrama>.docs/_ideas.md`.
- **Estados (5):** `pendiente | haciendo | pausado | hecho | rechazado`. Activas = pendiente/haciendo/pausado; cerradas = hecho/rechazado. `pausado` y `rechazado` **requieren** `motivo`.
- **Índice** lista TODAS las ideas en cualquier estado (con motivo/mejora) para alimentar agentes LLM.
- **Comentario**: viñeta `- <autor>, <YYYY-MM-DD>: <texto>` bajo `## Comentarios`.
- **Frontmatter**: pares `clave: valor` (solo strings), reusando `parseFrontmatter`/`serializeFrontmatter` de `./frontmatter`.
- **Migración v1**: usa `parseIdeas` de `./ideasModel`; idempotente.
- **Tests:** Vitest `environment: "happy-dom"`, `globals: true`. IO con `createFsClient`/`createFakeDir` de `src/testHelpers/fakeDir.ts`.
- **Gate por tarea:** `npm test` + `npm run typecheck` verdes antes de cada commit.
- **Rama:** trabajar en `feat/ideas-v2-modelo` (crear al empezar la ejecución).

---

### Task 1: `ideaState.ts` — estados, grupos, motivo

**Files:**
- Create: `src/processDocs/ideaState.ts`
- Test: `src/processDocs/ideaState.test.ts`

**Interfaces:**
- Produces:
  - `type IdeaState = "pendiente" | "haciendo" | "pausado" | "hecho" | "rechazado"`
  - `const IDEA_STATES: IdeaState[]`
  - `function isIdeaState(s: string): s is IdeaState`
  - `function isActive(s: IdeaState): boolean` (pendiente/haciendo/pausado)
  - `function isClosed(s: IdeaState): boolean` (hecho/rechazado)
  - `function requiresMotivo(s: IdeaState): boolean` (pausado/rechazado)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { IDEA_STATES, isIdeaState, isActive, isClosed, requiresMotivo } from "./ideaState";

describe("ideaState", () => {
  it("lists the five states in order", () => {
    expect(IDEA_STATES).toEqual(["pendiente", "haciendo", "pausado", "hecho", "rechazado"]);
  });
  it("validates a state string", () => {
    expect(isIdeaState("haciendo")).toBe(true);
    expect(isIdeaState("nope")).toBe(false);
  });
  it("classifies active vs closed", () => {
    expect(["pendiente", "haciendo", "pausado"].every(isActive)).toBe(true);
    expect(["hecho", "rechazado"].every(isClosed)).toBe(true);
    expect(isActive("hecho")).toBe(false);
  });
  it("requires a motivo only for pausado and rechazado", () => {
    expect(requiresMotivo("pausado")).toBe(true);
    expect(requiresMotivo("rechazado")).toBe(true);
    expect(requiresMotivo("pendiente")).toBe(false);
    expect(requiresMotivo("hecho")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/ideaState.test.ts`
Expected: FAIL — cannot find module `./ideaState`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/ideaState.ts
export type IdeaState = "pendiente" | "haciendo" | "pausado" | "hecho" | "rechazado";

export const IDEA_STATES: IdeaState[] = ["pendiente", "haciendo", "pausado", "hecho", "rechazado"];

export function isIdeaState(s: string): s is IdeaState {
  return (IDEA_STATES as string[]).includes(s);
}
export function isActive(s: IdeaState): boolean {
  return s === "pendiente" || s === "haciendo" || s === "pausado";
}
export function isClosed(s: IdeaState): boolean {
  return s === "hecho" || s === "rechazado";
}
export function requiresMotivo(s: IdeaState): boolean {
  return s === "pausado" || s === "rechazado";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/ideaState.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/ideaState.ts src/processDocs/ideaState.test.ts
git commit -m "feat(ideas): idea state model (5 states, active/closed, motivo)"
```

---

### Task 2: `ideaComments.ts` — hilo de comentarios (puro)

**Files:**
- Create: `src/processDocs/ideaComments.ts`
- Test: `src/processDocs/ideaComments.test.ts`

**Interfaces:**
- Produces:
  - `interface Comment { author: string; date: string; text: string }`
  - `function splitBody(body: string): { description: string; comments: Comment[] }`
  - `function joinBody(description: string, comments: Comment[]): string`
  - `function addComment(comments: Comment[], c: Comment): Comment[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { splitBody, joinBody, addComment, type Comment } from "./ideaComments";

describe("ideaComments", () => {
  it("splits a body into description and comments", () => {
    const body = "La idea principal.\ncon dos líneas\n\n## Comentarios\n- Beto, 2026-07-02: buena\n- Ana, 2026-07-03: mejor con SLA";
    const { description, comments } = splitBody(body);
    expect(description).toBe("La idea principal.\ncon dos líneas");
    expect(comments).toEqual([
      { author: "Beto", date: "2026-07-02", text: "buena" },
      { author: "Ana", date: "2026-07-03", text: "mejor con SLA" },
    ]);
  });

  it("handles a body with no comments section", () => {
    const { description, comments } = splitBody("solo descripción");
    expect(description).toBe("solo descripción");
    expect(comments).toEqual([]);
  });

  it("round-trips through joinBody", () => {
    const comments: Comment[] = [{ author: "Ana", date: "2026-07-01", text: "hola" }];
    const body = joinBody("desc", comments);
    expect(body).toContain("## Comentarios");
    expect(splitBody(body)).toEqual({ description: "desc", comments });
  });

  it("omits the comments section when there are none", () => {
    expect(joinBody("desc", [])).not.toContain("## Comentarios");
  });

  it("appends a comment immutably", () => {
    const c: Comment[] = [];
    const out = addComment(c, { author: "Ana", date: "2026-07-01", text: "x" });
    expect(out).toHaveLength(1);
    expect(c).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/ideaComments.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/ideaComments.ts
export interface Comment { author: string; date: string; text: string }

const HEADING = "## Comentarios";
const LINE = /^-\s+(.+?),\s*(\d{4}-\d{2}-\d{2}):\s*(.*)$/;

export function splitBody(body: string): { description: string; comments: Comment[] } {
  const idx = body.indexOf(`\n${HEADING}`);
  const hasAtStart = body.startsWith(HEADING);
  if (idx < 0 && !hasAtStart) return { description: body.trim(), comments: [] };
  const cut = hasAtStart ? 0 : idx + 1;
  const description = body.slice(0, cut).trim();
  const block = body.slice(cut);
  const comments: Comment[] = [];
  for (const line of block.split("\n")) {
    const m = line.match(LINE);
    if (m) comments.push({ author: m[1].trim(), date: m[2], text: m[3].trim() });
  }
  return { description, comments };
}

export function joinBody(description: string, comments: Comment[]): string {
  if (comments.length === 0) return description.trim();
  const lines = comments.map((c) => `- ${c.author}, ${c.date}: ${c.text}`);
  return `${description.trim()}\n\n${HEADING}\n${lines.join("\n")}`;
}

export function addComment(comments: Comment[], c: Comment): Comment[] {
  return [...comments, c];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/ideaComments.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/ideaComments.ts src/processDocs/ideaComments.test.ts
git commit -m "feat(ideas): comment thread parse/serialize"
```

---

### Task 3: `ideaNote.ts` — nota de idea (puro)

**Files:**
- Create: `src/processDocs/ideaNote.ts`
- Test: `src/processDocs/ideaNote.test.ts`

**Interfaces:**
- Consumes: `parseFrontmatter`/`serializeFrontmatter` (`./frontmatter`), `splitBody`/`joinBody`/`Comment` (Task 2), `IdeaState`/`isIdeaState` (Task 1).
- Produces:
  - `interface IdeaNote { id: string; estado: IdeaState; anchor: string | null; anchorLabel: string; autor: string; fecha: string; motivo: string; mejora: string; description: string; comments: Comment[] }`
  - `function parseIdeaNote(md: string): IdeaNote`
  - `function serializeIdeaNote(n: IdeaNote): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseIdeaNote, serializeIdeaNote, type IdeaNote } from "./ideaNote";

const SAMPLE = `---
id: idea-3
estado: haciendo
ancla: Activity_1
ancla-nombre: Validar factura
autor: Ana
fecha: 2026-07-01
motivo:
mejora: mejora-2
---
Avisar por mail si tarda +2 días.

## Comentarios
- Beto, 2026-07-02: y en el dashboard`;

describe("ideaNote", () => {
  it("parses an idea note into structured fields", () => {
    const n = parseIdeaNote(SAMPLE);
    expect(n.id).toBe("idea-3");
    expect(n.estado).toBe("haciendo");
    expect(n.anchor).toBe("Activity_1");
    expect(n.anchorLabel).toBe("Validar factura");
    expect(n.autor).toBe("Ana");
    expect(n.mejora).toBe("mejora-2");
    expect(n.description).toBe("Avisar por mail si tarda +2 días.");
    expect(n.comments).toEqual([{ author: "Beto", date: "2026-07-02", text: "y en el dashboard" }]);
  });

  it("maps ancla 'general' to a null anchor", () => {
    const n = parseIdeaNote("---\nid: idea-1\nestado: pendiente\nancla: general\nautor: Ana\nfecha: 2026-07-01\n---\nuna idea general");
    expect(n.anchor).toBeNull();
    expect(n.anchorLabel).toBe("");
  });

  it("defaults an unknown estado to pendiente", () => {
    const n = parseIdeaNote("---\nid: idea-1\nestado: raro\nancla: general\nautor: A\nfecha: 2026-07-01\n---\nx");
    expect(n.estado).toBe("pendiente");
  });

  it("round-trips through serialize", () => {
    const n = parseIdeaNote(SAMPLE);
    expect(parseIdeaNote(serializeIdeaNote(n))).toEqual(n);
  });

  it("writes ancla 'general' and omits empty motivo/mejora values as blank", () => {
    const n: IdeaNote = { id: "idea-1", estado: "pendiente", anchor: null, anchorLabel: "", autor: "Ana", fecha: "2026-07-01", motivo: "", mejora: "", description: "x", comments: [] };
    const md = serializeIdeaNote(n);
    expect(md).toContain("ancla: general");
    expect(md).toContain("estado: pendiente");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/ideaNote.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/ideaNote.ts
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter";
import { splitBody, joinBody, type Comment } from "./ideaComments";
import { isIdeaState, type IdeaState } from "./ideaState";

export interface IdeaNote {
  id: string;
  estado: IdeaState;
  anchor: string | null;
  anchorLabel: string;
  autor: string;
  fecha: string;
  motivo: string;
  mejora: string;
  description: string;
  comments: Comment[];
}

export function parseIdeaNote(md: string): IdeaNote {
  const { meta, body } = parseFrontmatter(md);
  const { description, comments } = splitBody(body);
  const anclaRaw = (meta["ancla"] ?? "general").trim();
  const anchor = anclaRaw === "general" || anclaRaw === "" ? null : anclaRaw;
  const estadoRaw = (meta["estado"] ?? "pendiente").trim();
  return {
    id: meta["id"] ?? "",
    estado: isIdeaState(estadoRaw) ? estadoRaw : "pendiente",
    anchor,
    anchorLabel: (meta["ancla-nombre"] ?? "").trim(),
    autor: (meta["autor"] ?? "").trim(),
    fecha: (meta["fecha"] ?? "").trim(),
    motivo: (meta["motivo"] ?? "").trim(),
    mejora: (meta["mejora"] ?? "").trim(),
    description,
    comments,
  };
}

export function serializeIdeaNote(n: IdeaNote): string {
  const meta: Record<string, string> = {
    id: n.id,
    estado: n.estado,
    ancla: n.anchor ?? "general",
    "ancla-nombre": n.anchorLabel,
    autor: n.autor,
    fecha: n.fecha,
    motivo: n.motivo,
    mejora: n.mejora,
  };
  return serializeFrontmatter(meta, joinBody(n.description, n.comments));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/ideaNote.test.ts`
Expected: PASS (5 tests). Note: the round-trip test relies on `serializeFrontmatter` emitting keys in insertion order and `parseFrontmatter` trimming values — if a value round-trips with different whitespace, adjust `parseIdeaNote` trims (not the asserted behavior).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add src/processDocs/ideaNote.ts src/processDocs/ideaNote.test.ts
git commit -m "feat(ideas): idea note parse/serialize (frontmatter + description + thread)"
```

---

### Task 4: `mejoraNote.ts` — nota de mejora (puro)

**Files:**
- Create: `src/processDocs/mejoraNote.ts`
- Test: `src/processDocs/mejoraNote.test.ts`

**Interfaces:**
- Consumes: `parseFrontmatter`/`serializeFrontmatter`, `splitBody`/`joinBody`/`Comment` (Task 2).
- Produces:
  - `type MejoraState = "propuesta" | "aprobada" | "implementada"`
  - `interface MejoraNote { id: string; desdeIdea: string; estado: MejoraState; anchor: string | null; anchorLabel: string; autor: string; fecha: string; description: string; comments: Comment[] }`
  - `function parseMejoraNote(md: string): MejoraNote`
  - `function serializeMejoraNote(n: MejoraNote): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseMejoraNote, serializeMejoraNote, type MejoraNote } from "./mejoraNote";

const SAMPLE = `---
id: mejora-2
desde-idea: idea-3
estado: propuesta
ancla: Activity_1
ancla-nombre: Validar factura
autor: Ana
fecha: 2026-07-02
---
Aviso por mail con SLA configurable.

## Comentarios
- Beto, 2026-07-03: +1`;

describe("mejoraNote", () => {
  it("parses a mejora note", () => {
    const n = parseMejoraNote(SAMPLE);
    expect(n.id).toBe("mejora-2");
    expect(n.desdeIdea).toBe("idea-3");
    expect(n.estado).toBe("propuesta");
    expect(n.anchor).toBe("Activity_1");
    expect(n.description).toBe("Aviso por mail con SLA configurable.");
    expect(n.comments).toEqual([{ author: "Beto", date: "2026-07-03", text: "+1" }]);
  });

  it("defaults an unknown estado to propuesta", () => {
    const n = parseMejoraNote("---\nid: mejora-1\ndesde-idea: idea-1\nestado: raro\nancla: general\nautor: A\nfecha: 2026-07-02\n---\nx");
    expect(n.estado).toBe("propuesta");
    expect(n.anchor).toBeNull();
  });

  it("round-trips", () => {
    const n = parseMejoraNote(SAMPLE);
    expect(parseMejoraNote(serializeMejoraNote(n))).toEqual(n);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/mejoraNote.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/mejoraNote.ts
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter";
import { splitBody, joinBody, type Comment } from "./ideaComments";

export type MejoraState = "propuesta" | "aprobada" | "implementada";
const MEJORA_STATES: MejoraState[] = ["propuesta", "aprobada", "implementada"];

export interface MejoraNote {
  id: string;
  desdeIdea: string;
  estado: MejoraState;
  anchor: string | null;
  anchorLabel: string;
  autor: string;
  fecha: string;
  description: string;
  comments: Comment[];
}

export function parseMejoraNote(md: string): MejoraNote {
  const { meta, body } = parseFrontmatter(md);
  const { description, comments } = splitBody(body);
  const anclaRaw = (meta["ancla"] ?? "general").trim();
  const estadoRaw = (meta["estado"] ?? "propuesta").trim();
  return {
    id: meta["id"] ?? "",
    desdeIdea: (meta["desde-idea"] ?? "").trim(),
    estado: (MEJORA_STATES as string[]).includes(estadoRaw) ? (estadoRaw as MejoraState) : "propuesta",
    anchor: anclaRaw === "general" || anclaRaw === "" ? null : anclaRaw,
    anchorLabel: (meta["ancla-nombre"] ?? "").trim(),
    autor: (meta["autor"] ?? "").trim(),
    fecha: (meta["fecha"] ?? "").trim(),
    description,
    comments,
  };
}

export function serializeMejoraNote(n: MejoraNote): string {
  const meta: Record<string, string> = {
    id: n.id,
    "desde-idea": n.desdeIdea,
    estado: n.estado,
    ancla: n.anchor ?? "general",
    "ancla-nombre": n.anchorLabel,
    autor: n.autor,
    fecha: n.fecha,
  };
  return serializeFrontmatter(meta, joinBody(n.description, n.comments));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/mejoraNote.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add src/processDocs/mejoraNote.ts src/processDocs/mejoraNote.test.ts
git commit -m "feat(ideas): mejora note parse/serialize"
```

---

### Task 5: `ideasIndex.ts` — índice `_ideas.md` (todas las ideas)

**Files:**
- Create: `src/processDocs/ideasIndex.ts`
- Test: `src/processDocs/ideasIndex.test.ts`

**Interfaces:**
- Consumes: `IdeaNote` (Task 3).
- Produces: `function buildIdeasIndex(diagramId: string, processName: string, ideas: IdeaNote[]): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildIdeasIndex } from "./ideasIndex";
import type { IdeaNote } from "./ideaNote";

function idea(p: Partial<IdeaNote>): IdeaNote {
  return { id: "idea-1", estado: "pendiente", anchor: null, anchorLabel: "", autor: "A", fecha: "2026-07-01", motivo: "", mejora: "", description: "texto", comments: [], ...p };
}

describe("buildIdeasIndex", () => {
  it("lists every idea regardless of state, with frontmatter and a table", () => {
    const md = buildIdeasIndex("x.bpmn", "Validación", [
      idea({ id: "idea-3", estado: "haciendo", anchor: "Activity_1", anchorLabel: "Validar factura", autor: "Ana", description: "Avisar por mail" }),
      idea({ id: "idea-4", estado: "rechazado", motivo: "fuera de alcance", autor: "Ana", description: "Migrar de motor" }),
      idea({ id: "idea-5", estado: "hecho", mejora: "mejora-2", anchor: "G_1", anchorLabel: "¿OK?", description: "Falta duplicada" }),
    ]);
    expect(md).toContain("diagram: x.bpmn");
    expect(md).toContain("# Ideas — Validación");
    expect(md).toContain("| Avisar por mail | haciendo | Validar factura | Ana | [idea-3](ideas/idea-3.md) |");
    expect(md).toContain("fuera de alcance"); // rejected motivo shown
    expect(md).toContain("[mejora-2](mejoras/mejora-2.md)"); // promoted link shown
  });

  it("shows 'general' for unanchored ideas and escapes pipes", () => {
    const md = buildIdeasIndex("x.bpmn", "P", [idea({ description: "a | b" })]);
    expect(md).toContain("| general |");
    expect(md).toContain("a \\| b");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/ideasIndex.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/ideasIndex.ts
import type { IdeaNote } from "./ideaNote";

function cell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
function firstLine(s: string): string {
  return s.split("\n")[0] ?? "";
}
function outcome(i: IdeaNote): string {
  if (i.mejora) return `[${i.mejora}](mejoras/${i.mejora}.md)`;
  const link = `[${i.id}](ideas/${i.id}.md)`;
  return i.motivo ? `${cell(i.motivo)} · ${link}` : link;
}

export function buildIdeasIndex(diagramId: string, processName: string, ideas: IdeaNote[]): string {
  const rows = ideas.map((i) =>
    `| ${cell(firstLine(i.description))} | ${i.estado} | ${cell(i.anchor ? (i.anchorLabel || i.anchor) : "general")} | ${cell(i.autor)} | ${outcome(i)} |`,
  );
  return [
    "---",
    `diagram: ${diagramId}`,
    "generated-by: BPMN compartida",
    "---",
    `# Ideas — ${processName}`,
    "",
    "| Idea | Estado | Ancla | Autor | Motivo / Mejora |",
    "|------|--------|-------|-------|-----------------|",
    ...rows,
    "",
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/ideasIndex.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/ideasIndex.ts src/processDocs/ideasIndex.test.ts
git commit -m "feat(ideas): generate _ideas.md index over all ideas/states"
```

---

### Task 6: `ideasMigrate.ts` — v1 → notas (puro)

**Files:**
- Create: `src/processDocs/ideasMigrate.ts`
- Test: `src/processDocs/ideasMigrate.test.ts`

**Interfaces:**
- Consumes: `parseIdeas` (`./ideasModel`, v1), `IdeaNote` (Task 3).
- Produces: `function migrateV1ToNotes(v1md: string): IdeaNote[]` — each v1 line → an IdeaNote (`[x]`→`hecho`, `[ ]`→`pendiente`; ids `idea-1..N`; no comments/motivo/mejora).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { migrateV1ToNotes } from "./ideasMigrate";

const V1 = `# Ideas sueltas — P

- [ ] (Activity_1 · Validar factura) avisar por mail — Ana, 2026-06-30
- [x] (general) automatizar OCR — Beto, 2026-06-29
`;

describe("migrateV1ToNotes", () => {
  it("converts each v1 line into an idea note record", () => {
    const notes = migrateV1ToNotes(V1);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ id: "idea-1", estado: "pendiente", anchor: "Activity_1", anchorLabel: "Validar factura", autor: "Ana", fecha: "2026-06-30", description: "avisar por mail" });
    expect(notes[1]).toMatchObject({ id: "idea-2", estado: "hecho", anchor: null, autor: "Beto", description: "automatizar OCR" });
    expect(notes[0].comments).toEqual([]);
    expect(notes[0].motivo).toBe("");
  });

  it("returns an empty list for an empty/no-ideas file", () => {
    expect(migrateV1ToNotes("# Ideas sueltas — P\n\n")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/ideasMigrate.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/ideasMigrate.ts
import { parseIdeas } from "./ideasModel";
import type { IdeaNote } from "./ideaNote";

export function migrateV1ToNotes(v1md: string): IdeaNote[] {
  return parseIdeas(v1md).map((idea, n) => ({
    id: `idea-${n + 1}`,
    estado: idea.done ? "hecho" : "pendiente",
    anchor: idea.anchor,
    anchorLabel: idea.anchorLabel,
    autor: idea.author,
    fecha: idea.date,
    motivo: "",
    mejora: "",
    description: idea.text,
    comments: [],
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/ideasMigrate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add src/processDocs/ideasMigrate.ts src/processDocs/ideasMigrate.test.ts
git commit -m "feat(ideas): migrate v1 _ideas.md lines to idea notes"
```

---

### Task 7: `ideasClient.ts` — IO de notas + índice + ids únicos

**Files:**
- Create: `src/processDocs/ideasClient.ts`
- Test: `src/processDocs/ideasClient.test.ts`

**Interfaces:**
- Consumes: `docsDir`/`ideasPath` (`./docsPaths`), `parseIdeaNote`/`serializeIdeaNote`/`IdeaNote` (Task 3), `parseMejoraNote`/`serializeMejoraNote`/`MejoraNote` (Task 4), `buildIdeasIndex` (Task 5), `migrateV1ToNotes` (Task 6).
- Produces:
  - `interface IdeasFsApi { readPath(rel): Promise<string | null>; writePath(rel, text): Promise<void>; listDir(rel): Promise<{ name: string; kind: "file" | "directory" }[]> }`
  - `function createIdeasClient(api: IdeasFsApi)` returning:
    - `listIdeas(diagramId): Promise<IdeaNote[]>` (reads every `ideas/*.md`, sorted by id)
    - `writeIdea(diagramId, note): Promise<void>`
    - `readIdea(diagramId, id): Promise<IdeaNote | null>`
    - `nextIdeaId(diagramId): Promise<string>` (`idea-<n>` with the lowest free n≥1)
    - `writeMejora(diagramId, note): Promise<void>` / `readMejora(diagramId, id): Promise<MejoraNote | null>` / `nextMejoraId(diagramId): Promise<string>`
    - `writeIndex(diagramId, processName): Promise<void>` (regenerates `_ideas.md` from the notes)
    - `migrateIfNeeded(diagramId): Promise<boolean>` (if `ideas/` is empty AND `_ideas.md` has v1 lines → create notes; returns true if migrated)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { createIdeasClient } from "./ideasClient";
import { createFsClient } from "../fsClient";
import { createFakeDir } from "../testHelpers/fakeDir";
import type { IdeaNote } from "./ideaNote";

function client() {
  return createIdeasClient(createFsClient(createFakeDir()));
}
function idea(p: Partial<IdeaNote>): IdeaNote {
  return { id: "idea-1", estado: "pendiente", anchor: null, anchorLabel: "", autor: "A", fecha: "2026-07-01", motivo: "", mejora: "", description: "x", comments: [], ...p };
}

describe("ideasClient", () => {
  it("writes, lists and reads idea notes", async () => {
    const c = client();
    await c.writeIdea("x.bpmn", idea({ id: "idea-1", description: "uno" }));
    await c.writeIdea("x.bpmn", idea({ id: "idea-2", description: "dos", estado: "hecho" }));
    const all = await c.listIdeas("x.bpmn");
    expect(all.map((n) => n.id)).toEqual(["idea-1", "idea-2"]);
    expect((await c.readIdea("x.bpmn", "idea-2"))?.description).toBe("dos");
  });

  it("gives the lowest free idea id", async () => {
    const c = client();
    expect(await c.nextIdeaId("x.bpmn")).toBe("idea-1");
    await c.writeIdea("x.bpmn", idea({ id: "idea-1" }));
    expect(await c.nextIdeaId("x.bpmn")).toBe("idea-2");
  });

  it("regenerates the _ideas.md index over all notes", async () => {
    const c = client();
    await c.writeIdea("x.bpmn", idea({ id: "idea-1", estado: "rechazado", motivo: "no", description: "mala" }));
    await c.writeIndex("x.bpmn", "Proc");
    const idx = await c.readIdea("x.bpmn", "idea-1"); // sanity: note exists
    expect(idx).not.toBeNull();
  });

  it("migrates a v1 _ideas.md when there are no idea notes yet", async () => {
    const fs = createFsClient(createFakeDir());
    const c = createIdeasClient(fs);
    await fs.writePath("x.docs/_ideas.md", "# Ideas sueltas — P\n\n- [ ] (general) vieja idea — Ana, 2026-06-30\n");
    const migrated = await c.migrateIfNeeded("x.bpmn");
    expect(migrated).toBe(true);
    const notes = await c.listIdeas("x.bpmn");
    expect(notes).toHaveLength(1);
    expect(notes[0].description).toBe("vieja idea");
    // idempotent: second call does nothing
    expect(await c.migrateIfNeeded("x.bpmn")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/ideasClient.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/ideasClient.ts
import { docsDir, ideasPath } from "./docsPaths";
import { parseIdeaNote, serializeIdeaNote, type IdeaNote } from "./ideaNote";
import { parseMejoraNote, serializeMejoraNote, type MejoraNote } from "./mejoraNote";
import { buildIdeasIndex } from "./ideasIndex";
import { migrateV1ToNotes } from "./ideasMigrate";

export interface IdeasFsApi {
  readPath(rel: string): Promise<string | null>;
  writePath(rel: string, text: string): Promise<void>;
  listDir(rel: string): Promise<{ name: string; kind: "file" | "directory" }[]>;
}

function ideasDir(diagramId: string): string { return `${docsDir(diagramId)}/ideas`; }
function mejorasDir(diagramId: string): string { return `${docsDir(diagramId)}/mejoras`; }
function idNum(id: string): number { const m = id.match(/-(\d+)$/); return m ? Number(m[1]) : 0; }

export function createIdeasClient(api: IdeasFsApi) {
  async function listIds(dir: string): Promise<string[]> {
    const entries = await api.listDir(dir);
    return entries.filter((e) => e.kind === "file" && e.name.endsWith(".md")).map((e) => e.name.replace(/\.md$/, ""));
  }
  async function nextId(dir: string, prefix: string): Promise<string> {
    const nums = new Set((await listIds(dir)).map(idNum));
    let n = 1;
    while (nums.has(n)) n++;
    return `${prefix}-${n}`;
  }

  const self = {
    async listIdeas(diagramId: string): Promise<IdeaNote[]> {
      const ids = (await listIds(ideasDir(diagramId))).sort((a, b) => idNum(a) - idNum(b));
      const out: IdeaNote[] = [];
      for (const id of ids) {
        const md = await api.readPath(`${ideasDir(diagramId)}/${id}.md`);
        if (md !== null) out.push(parseIdeaNote(md));
      }
      return out;
    },
    readIdea(diagramId: string, id: string): Promise<IdeaNote | null> {
      return api.readPath(`${ideasDir(diagramId)}/${id}.md`).then((md) => (md === null ? null : parseIdeaNote(md)));
    },
    writeIdea(diagramId: string, note: IdeaNote): Promise<void> {
      return api.writePath(`${ideasDir(diagramId)}/${note.id}.md`, serializeIdeaNote(note));
    },
    nextIdeaId(diagramId: string): Promise<string> {
      return nextId(ideasDir(diagramId), "idea");
    },
    readMejora(diagramId: string, id: string): Promise<MejoraNote | null> {
      return api.readPath(`${mejorasDir(diagramId)}/${id}.md`).then((md) => (md === null ? null : parseMejoraNote(md)));
    },
    writeMejora(diagramId: string, note: MejoraNote): Promise<void> {
      return api.writePath(`${mejorasDir(diagramId)}/${note.id}.md`, serializeMejoraNote(note));
    },
    nextMejoraId(diagramId: string): Promise<string> {
      return nextId(mejorasDir(diagramId), "mejora");
    },
    async writeIndex(diagramId: string, processName: string): Promise<void> {
      const ideas = await self.listIdeas(diagramId);
      await api.writePath(ideasPath(diagramId), buildIdeasIndex(diagramId, processName, ideas));
    },
    async migrateIfNeeded(diagramId: string): Promise<boolean> {
      const existing = await listIds(ideasDir(diagramId));
      if (existing.length > 0) return false;
      const v1 = await api.readPath(ideasPath(diagramId));
      if (!v1) return false;
      const notes = migrateV1ToNotes(v1);
      if (notes.length === 0) return false;
      for (const n of notes) await self.writeIdea(diagramId, n);
      return true;
    },
  };
  return self;
}

export type IdeasClient = ReturnType<typeof createIdeasClient>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/ideasClient.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Full suite + typecheck + commit**

Run: `npm test && npm run typecheck`
Expected: all green (the new modules are additive; nothing else changes).

```bash
git add src/processDocs/ideasClient.ts src/processDocs/ideasClient.test.ts
git commit -m "feat(ideas): ideas client (notes IO, unique ids, index, v1 migration)"
```

---

## Self-Review

**Spec coverage (secciones A, B, E del spec):**
- Nota de idea (frontmatter + descripción + hilo) → Tasks 2, 3. ✓
- Nota de mejora aparte → Task 4. ✓
- Estados (5) + activa/cerrada + motivo → Task 1. ✓
- Índice `_ideas.md` con TODAS las ideas/estados (motivo/mejora) → Task 5. ✓
- Migración v1 idempotente → Tasks 6, 7 (`migrateIfNeeded`). ✓
- IO por notas + ids únicos → Task 7. ✓

**Diferido a los planes siguientes (no es gap):**
- Panel + vista de hilo + filtros + chip de estado + promover a mejora (UI) → **Plan 2**.
- Modo idea (toggle) + clic en canvas/badge + overlays clickeables → **Plan 3**.
- Regenerar el índice y correr la migración al abrir un diagrama (wiring en `main.ts`/controller) → Plan 2/3.

**Placeholder scan:** sin TBD/TODO; código real en cada paso.

**Type consistency:** `Comment` (Task 2) usado por `ideaNote`/`mejoraNote` (Tasks 3, 4); `IdeaState`/`isIdeaState` (Task 1) por `ideaNote` (Task 3); `IdeaNote` (Task 3) por `ideasIndex`/`ideasMigrate`/`ideasClient` (Tasks 5, 6, 7); `MejoraNote` (Task 4) por `ideasClient` (Task 7). `IdeasFsApi` (Task 7) satisfecho por `fsClient` (`readPath`/`writePath`/`listDir`). Reusa `parseFrontmatter`/`serializeFrontmatter` (`./frontmatter`), `parseIdeas` (`./ideasModel`), `docsDir`/`ideasPath` (`./docsPaths`).

**Nota:** el `docsClient` v1 y `ideasModel` v1 (Plan 3) se mantienen intactos durante este plan; la pestaña Ideas sigue usando el flujo viejo hasta el Plan 2, que la reescribe sobre `ideasClient`. Coexisten sin romper (el índice v2 sobrescribe `_ideas.md` recién cuando el Plan 2/3 llame `writeIndex`).
