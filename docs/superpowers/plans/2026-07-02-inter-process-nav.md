# Plan 5 — Navegación inter-proceso Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Conectar procesos entre diagramas con mecanismos BPMN estándar: doble-clic en un **Call Activity** abre el `.bpmn` referenciado (`calledElement`); eventos **Message/Signal** con el mismo nombre en otro diagrama ofrecen "ir al proceso vinculado"; y el wikilink `[[proceso#Elemento]]` abre el otro proceso y selecciona el elemento (finding diferido del Plan 2c).

**Architecture:** `interProcessRefs.ts` (puro) extrae, de una lista normalizada de elementos, las referencias inter-proceso (Call Activities + eventos Message/Signal/Link con dirección throw/catch). `resolveTargets.ts` (puro) resuelve un `calledElement` a un archivo y encuentra la contraparte de un evento en otro diagrama. `diagramInfo.ts` parsea un `.bpmn` con `bpmn-moddle` para construir el índice de la carpeta (id de proceso + refs). La integración en `main.ts` cablea doble-clic, wikilink cross-proceso y la afinidad Message/Signal.

**Tech Stack:** TypeScript + Vite, Vitest (happy-dom), bpmn-js, bpmn-moddle.

## Global Constraints

- **Estándar BPMN, sin customizar el lenguaje:** Call Activity `calledElement`, Message/Signal/Link event definitions. La app solo *navega* esos enlaces.
- **Resolución de `calledElement`:** contra el id de proceso de cada `.bpmn` de la carpeta, con fallback al nombre base del archivo.
- **Índice de carpeta:** se construye leyendo los `.bpmn` (vía `fsClient`) y parseándolos con `bpmn-moddle`; cacheado y reconstruido cuando cambia la lista de archivos.
- **Reuso:** `fsClient.listTree`/`getXml`, `openFile`, la selección de bpmn-js, `navigateWiki` (Plan 2c).
- **Tests:** Vitest happy-dom. Lógica pura (extracción de refs, resolución, parseo moddle con un fixture XML) testeada; el wiring bpmn-js/`main.ts` se cierra con build + manual.
- **Gate por tarea:** `npm test` + `npm run typecheck`; wiring agrega `npm run build`.
- **Rama:** `feat/plan5-interproceso` (apilada sobre Plan 4).

---

### Task 1: `interProcessRefs.ts` — extraer referencias (puro)

**Files:**
- Create: `src/processDocs/interProcessRefs.ts`
- Test: `src/processDocs/interProcessRefs.test.ts`

**Interfaces:**
- Produces:
  - `interface RawEl { id: string; name: string; type: string; calledElement?: string; eventKind?: "message" | "signal" | "link"; eventRefName?: string; isThrow?: boolean }`
  - `interface CallRef { elementId: string; elementName: string; calledElement: string }`
  - `interface EventRef { elementId: string; elementName: string; kind: "message" | "signal" | "link"; direction: "throw" | "catch"; refName: string }`
  - `interface InterProcessRefs { calls: CallRef[]; events: EventRef[] }`
  - `function extractInterProcessRefs(els: RawEl[]): InterProcessRefs`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { extractInterProcessRefs, type RawEl } from "./interProcessRefs";

describe("extractInterProcessRefs", () => {
  it("collects call activities with a calledElement", () => {
    const els: RawEl[] = [
      { id: "CA_1", name: "Sub", type: "bpmn:CallActivity", calledElement: "Process_Sub" },
      { id: "CA_2", name: "NoRef", type: "bpmn:CallActivity" }, // no calledElement → skipped
      { id: "T_1", name: "t", type: "bpmn:Task" },
    ];
    const refs = extractInterProcessRefs(els);
    expect(refs.calls).toEqual([{ elementId: "CA_1", elementName: "Sub", calledElement: "Process_Sub" }]);
  });

  it("collects message/signal events with kind, direction and refName", () => {
    const els: RawEl[] = [
      { id: "S_1", name: "recibido", type: "bpmn:StartEvent", eventKind: "message", eventRefName: "Pedido", isThrow: false },
      { id: "E_1", name: "emitir", type: "bpmn:EndEvent", eventKind: "signal", eventRefName: "Aviso", isThrow: true },
    ];
    const refs = extractInterProcessRefs(els);
    expect(refs.events).toEqual([
      { elementId: "S_1", elementName: "recibido", kind: "message", direction: "catch", refName: "Pedido" },
      { elementId: "E_1", elementName: "emitir", kind: "signal", direction: "throw", refName: "Aviso" },
    ]);
  });

  it("ignores events without a ref name", () => {
    const els: RawEl[] = [{ id: "S", name: "x", type: "bpmn:StartEvent", eventKind: "message", isThrow: false }];
    expect(extractInterProcessRefs(els).events).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/interProcessRefs.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/interProcessRefs.ts
export interface RawEl {
  id: string;
  name: string;
  type: string;
  calledElement?: string;
  eventKind?: "message" | "signal" | "link";
  eventRefName?: string;
  isThrow?: boolean;
}
export interface CallRef { elementId: string; elementName: string; calledElement: string }
export interface EventRef { elementId: string; elementName: string; kind: "message" | "signal" | "link"; direction: "throw" | "catch"; refName: string }
export interface InterProcessRefs { calls: CallRef[]; events: EventRef[] }

export function extractInterProcessRefs(els: RawEl[]): InterProcessRefs {
  const calls: CallRef[] = [];
  const events: EventRef[] = [];
  for (const el of els) {
    if (el.type === "bpmn:CallActivity" && el.calledElement) {
      calls.push({ elementId: el.id, elementName: el.name, calledElement: el.calledElement });
    }
    if (el.eventKind && el.eventRefName) {
      events.push({
        elementId: el.id,
        elementName: el.name,
        kind: el.eventKind,
        direction: el.isThrow ? "throw" : "catch",
        refName: el.eventRefName,
      });
    }
  }
  return { calls, events };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/interProcessRefs.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/interProcessRefs.ts src/processDocs/interProcessRefs.test.ts
git commit -m "feat(docs): extract inter-process refs (call activity + message/signal)"
```

---

### Task 2: `resolveTargets.ts` — resolver destino (puro)

**Files:**
- Create: `src/processDocs/resolveTargets.ts`
- Test: `src/processDocs/resolveTargets.test.ts`

**Interfaces:**
- Consumes: `InterProcessRefs`/`EventRef` (Task 1).
- Produces:
  - `interface DiagramInfo { file: string; processId: string; baseName: string; refs: InterProcessRefs }`
  - `function resolveCalledProcess(calledElement: string, diagrams: DiagramInfo[]): string | null`
  - `function findEventCounterpart(source: EventRef, sourceFile: string, diagrams: DiagramInfo[]): string | null`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { resolveCalledProcess, findEventCounterpart, type DiagramInfo } from "./resolveTargets";

const empty = { calls: [], events: [] };
const diagrams: DiagramInfo[] = [
  { file: "ventas.bpmn", processId: "Process_Ventas", baseName: "ventas", refs: { calls: [], events: [{ elementId: "S", elementName: "r", kind: "message", direction: "catch", refName: "Pedido" }] } },
  { file: "sub/compras.bpmn", processId: "Process_Compras", baseName: "compras", refs: empty },
];

describe("resolveTargets", () => {
  it("resolves calledElement by process id", () => {
    expect(resolveCalledProcess("Process_Ventas", diagrams)).toBe("ventas.bpmn");
  });
  it("falls back to base name", () => {
    expect(resolveCalledProcess("compras", diagrams)).toBe("sub/compras.bpmn");
  });
  it("returns null when nothing matches", () => {
    expect(resolveCalledProcess("Nope", diagrams)).toBeNull();
  });
  it("finds a message catch counterpart in another file for a throw", () => {
    const source = { elementId: "E", elementName: "x", kind: "message" as const, direction: "throw" as const, refName: "Pedido" };
    expect(findEventCounterpart(source, "otro.bpmn", diagrams)).toBe("ventas.bpmn");
  });
  it("does not match the counterpart in the same file", () => {
    const source = { elementId: "E", elementName: "x", kind: "message" as const, direction: "throw" as const, refName: "Pedido" };
    expect(findEventCounterpart(source, "ventas.bpmn", diagrams)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/resolveTargets.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/resolveTargets.ts
import type { EventRef, InterProcessRefs } from "./interProcessRefs";

export interface DiagramInfo {
  file: string;
  processId: string;
  baseName: string;
  refs: InterProcessRefs;
}

export function resolveCalledProcess(calledElement: string, diagrams: DiagramInfo[]): string | null {
  const byId = diagrams.find((d) => d.processId === calledElement);
  if (byId) return byId.file;
  const byName = diagrams.find((d) => d.baseName === calledElement);
  return byName ? byName.file : null;
}

export function findEventCounterpart(source: EventRef, sourceFile: string, diagrams: DiagramInfo[]): string | null {
  const wanted = source.direction === "throw" ? "catch" : "throw";
  for (const d of diagrams) {
    if (d.file === sourceFile) continue;
    if (d.refs.events.some((e) => e.kind === source.kind && e.refName === source.refName && e.direction === wanted)) {
      return d.file;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/resolveTargets.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/processDocs/resolveTargets.ts src/processDocs/resolveTargets.test.ts
git commit -m "feat(docs): resolve call-activity target + event counterpart across diagrams"
```

---

### Task 3: `diagramInfo.ts` — parsear `.bpmn` con bpmn-moddle

**Files:**
- Create: `src/processDocs/diagramInfo.ts`
- Test: `src/processDocs/diagramInfo.test.ts`

**Interfaces:**
- Consumes: `extractInterProcessRefs`/`RawEl` (Task 1), `bpmn-moddle`.
- Produces:
  - `function normalizeModdleElements(defs: any): { processId: string; els: RawEl[] }` (puro sobre el árbol moddle)
  - `async function parseDiagramInfo(xml: string): Promise<{ processId: string; refs: InterProcessRefs }>`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseDiagramInfo } from "./diagramInfo";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:message id="Msg_1" name="Pedido" />
  <bpmn:process id="Process_Ventas" isExecutable="false">
    <bpmn:startEvent id="Start_1" name="pedido recibido">
      <bpmn:messageEventDefinition id="MED_1" messageRef="Msg_1" />
    </bpmn:startEvent>
    <bpmn:callActivity id="CA_1" name="Facturar" calledElement="Process_Factura" />
  </bpmn:process>
</bpmn:definitions>`;

describe("parseDiagramInfo", () => {
  it("extracts the process id, the call activity ref, and the message catch event", async () => {
    const info = await parseDiagramInfo(XML);
    expect(info.processId).toBe("Process_Ventas");
    expect(info.refs.calls).toEqual([{ elementId: "CA_1", elementName: "Facturar", calledElement: "Process_Factura" }]);
    expect(info.refs.events).toEqual([
      { elementId: "Start_1", elementName: "pedido recibido", kind: "message", direction: "catch", refName: "Pedido" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/diagramInfo.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/processDocs/diagramInfo.ts
import BpmnModdle from "bpmn-moddle";
import { extractInterProcessRefs, type InterProcessRefs, type RawEl } from "./interProcessRefs";

// Map a moddle event-definition $type + host event $type to a normalized RawEl event.
function eventKindOf(defType: string): "message" | "signal" | "link" | null {
  if (defType.includes("MessageEventDefinition")) return "message";
  if (defType.includes("SignalEventDefinition")) return "signal";
  if (defType.includes("LinkEventDefinition")) return "link";
  return null;
}
function isThrowType(type: string): boolean {
  return type.includes("ThrowEvent") || type.includes("EndEvent");
}

export function normalizeModdleElements(defs: any): { processId: string; els: RawEl[] } {
  const rootElements: any[] = defs.rootElements ?? [];
  const process = rootElements.find((r) => (r.$type ?? "").endsWith("Process"));
  const els: RawEl[] = [];
  const flow: any[] = process?.flowElements ?? [];
  for (const fe of flow) {
    const type: string = fe.$type ?? "";
    const el: RawEl = { id: fe.id, name: fe.name ?? "", type };
    if (type.endsWith("CallActivity") && fe.calledElement) el.calledElement = fe.calledElement;
    const defsArr: any[] = fe.eventDefinitions ?? [];
    if (defsArr.length) {
      const kind = eventKindOf(defsArr[0].$type ?? "");
      if (kind) {
        el.eventKind = kind;
        el.isThrow = isThrowType(type);
        const ref = defsArr[0].messageRef ?? defsArr[0].signalRef;
        if (ref?.name) el.eventRefName = ref.name;
        else if (kind === "link" && defsArr[0].name) el.eventRefName = defsArr[0].name;
      }
    }
    els.push(el);
  }
  return { processId: process?.id ?? "", els };
}

export async function parseDiagramInfo(xml: string): Promise<{ processId: string; refs: InterProcessRefs }> {
  const moddle = new BpmnModdle();
  const { rootElement } = await moddle.fromXML(xml);
  const { processId, els } = normalizeModdleElements(rootElement);
  return { processId, refs: extractInterProcessRefs(els) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/diagramInfo.test.ts`
Expected: PASS. If the moddle API shape differs (e.g. `messageRef` is an id string rather than a resolved object, or `rootElement` is named differently), adjust `normalizeModdleElements`/`parseDiagramInfo` so the asserted BEHAVIOR holds (processId, call ref, message catch with refName "Pedido"). Record any moddle-shape adjustment in the report.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add src/processDocs/diagramInfo.ts src/processDocs/diagramInfo.test.ts
git commit -m "feat(docs): parse a .bpmn into process id + inter-process refs (bpmn-moddle)"
```

---

### Task 4: Integración — abrir subproceso, wikilink cross-proceso, contraparte

**Files:**
- Create: `src/processDocs/folderIndex.ts` (construye/cachea el índice de la carpeta)
- Modify: `src/main.ts` (doble-clic en Call Activity, wikilink cross-proceso, afinidad Message/Signal)
- Test: `src/processDocs/folderIndex.test.ts`

**Interfaces:**
- Consumes: `parseDiagramInfo` (T3), `resolveCalledProcess`/`findEventCounterpart`/`DiagramInfo` (T2), refs adapter.
- Produces:
  - `interface IndexSource { listBpmnFiles(): Promise<string[]>; readXml(file: string): Promise<string | null> }`
  - `function baseNameOf(file: string): string`
  - `async function buildFolderIndex(src: IndexSource): Promise<DiagramInfo[]>`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildFolderIndex, baseNameOf, type IndexSource } from "./folderIndex";

const XML = (pid: string, called: string) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D">
  <bpmn:process id="${pid}"><bpmn:callActivity id="CA" name="c" calledElement="${called}" /></bpmn:process>
</bpmn:definitions>`;

describe("folderIndex", () => {
  it("derives base name from a nested path", () => {
    expect(baseNameOf("sub/area/ventas.bpmn")).toBe("ventas");
  });
  it("builds a DiagramInfo per bpmn file with its process id and refs", async () => {
    const src: IndexSource = {
      listBpmnFiles: async () => ["ventas.bpmn", "sub/compras.bpmn"],
      readXml: async (f) => (f === "ventas.bpmn" ? XML("Process_Ventas", "Process_Compras") : XML("Process_Compras", "X")),
    };
    const idx = await buildFolderIndex(src);
    expect(idx).toHaveLength(2);
    const ventas = idx.find((d) => d.file === "ventas.bpmn")!;
    expect(ventas.processId).toBe("Process_Ventas");
    expect(ventas.baseName).toBe("ventas");
    expect(ventas.refs.calls[0].calledElement).toBe("Process_Compras");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/processDocs/folderIndex.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `folderIndex.ts`**

```ts
// src/processDocs/folderIndex.ts
import { parseDiagramInfo } from "./diagramInfo";
import type { DiagramInfo } from "./resolveTargets";

export interface IndexSource {
  listBpmnFiles(): Promise<string[]>;
  readXml(file: string): Promise<string | null>;
}

export function baseNameOf(file: string): string {
  const name = file.split("/").pop() ?? file;
  return name.replace(/\.bpmn$/i, "");
}

export async function buildFolderIndex(src: IndexSource): Promise<DiagramInfo[]> {
  const files = await src.listBpmnFiles();
  const out: DiagramInfo[] = [];
  for (const file of files) {
    const xml = await src.readXml(file);
    if (!xml) continue;
    try {
      const { processId, refs } = await parseDiagramInfo(xml);
      out.push({ file, processId, baseName: baseNameOf(file), refs });
    } catch {
      /* unparseable diagram — skip */
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/processDocs/folderIndex.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire into `main.ts`**

Add imports:
```ts
import { buildFolderIndex, baseNameOf, type IndexSource } from "./processDocs/folderIndex";
import { resolveCalledProcess, findEventCounterpart, type DiagramInfo } from "./processDocs/resolveTargets";
import { extractInterProcessRefs, type RawEl } from "./processDocs/interProcessRefs";
```
Add a cached folder index + a builder that reads the current tree's `.bpmn` files:
```ts
  let folderIndex: DiagramInfo[] | null = null;
  async function getFolderIndex(): Promise<DiagramInfo[]> {
    if (folderIndex) return folderIndex;
    const src: IndexSource = {
      listBpmnFiles: async () => lastTree.filter((e) => e.kind === "file" && e.path.endsWith(".bpmn")).map((e) => e.path),
      readXml: (file) => api.getXml(file).catch(() => null),
    };
    folderIndex = await buildFolderIndex(src);
    return folderIndex;
  }
```
Invalidate it (`folderIndex = null`) wherever `lastTree` is refreshed (search for where `lastTree` is assigned in `refreshFileList`).

**(a) Double-click a Call Activity → open the referenced process.** In `mountModeler` (where the eventBus listeners are registered), add:
```ts
    modeler.get("eventBus").on("element.dblclick", (e: { element: { id: string; businessObject?: { $type?: string; calledElement?: string; name?: string } } }) => {
      const bo = e.element.businessObject;
      if (bo?.$type === "bpmn:CallActivity" && bo.calledElement) {
        void (async () => {
          const idx = await getFolderIndex();
          const file = resolveCalledProcess(bo.calledElement!, idx);
          if (file) await openFile(file);
          else showToast("No se encontró el proceso referenciado");
        })().catch(onError);
      }
    });
```

**(b) Cross-process element wikilink** (fixes the deferred Plan 2c finding). In `navigateWiki`, replace the `kind: "element"` branch so it opens the referenced process (if any) THEN selects the element:
```ts
        } else if (target.kind === "element") {
          void (async () => {
            if (target.process) {
              const idx = await getFolderIndex();
              const file = resolveCalledProcess(target.process, idx) ?? `${target.process}.bpmn`;
              if (file !== docsFileId && lastTree.some((e) => e.path === file)) {
                await openFile(file);
              }
            }
            selectElementById(target.element);
          })().catch(onError);
        }
```

**(c) Message/Signal counterpart affordance.** On double-click of a Message/Signal throw/catch event, offer to jump to the counterpart:
```ts
    modeler.get("eventBus").on("element.dblclick", (e: { element: any }) => {
      const els: RawEl[] = [toRawEl(e.element)];
      const { events } = extractInterProcessRefs(els);
      if (!events.length) return;
      void (async () => {
        const idx = await getFolderIndex();
        const file = findEventCounterpart(events[0], docsFileId, idx);
        if (file) { showToast(`Ir al proceso vinculado: ${baseNameOf(file)}`); await openFile(file); }
      })().catch(onError);
    });
```
Add a `toRawEl(element)` helper that maps a bpmn-js element to `RawEl` (id, name, `$type`, `calledElement`, and event kind/refName/isThrow from `businessObject.eventDefinitions`):
```ts
  function toRawEl(el: any): RawEl {
    const bo = el.businessObject ?? {};
    const type: string = bo.$type ?? "";
    const raw: RawEl = { id: el.id, name: bo.name ?? "", type };
    if (bo.calledElement) raw.calledElement = bo.calledElement;
    const defs: any[] = bo.eventDefinitions ?? [];
    if (defs.length) {
      const dt: string = defs[0].$type ?? "";
      const kind = dt.includes("Message") ? "message" : dt.includes("Signal") ? "signal" : dt.includes("Link") ? "link" : null;
      if (kind) {
        raw.eventKind = kind;
        raw.isThrow = type.includes("ThrowEvent") || type.includes("EndEvent");
        const ref = defs[0].messageRef ?? defs[0].signalRef;
        raw.eventRefName = ref?.name ?? (kind === "link" ? defs[0].name : undefined);
      }
    }
    return raw;
  }
```
(Register a SINGLE `element.dblclick` handler that does Call Activity first, else Message/Signal — don't register two competing handlers. Merge (a) and (c) into one listener.)

- [ ] **Step 6: Typecheck, full suite, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green.

- [ ] **Step 7: Manual verification (build/exe)**

1. Diagrama A con un **Call Activity** cuyo `calledElement` = id de proceso de B (o el nombre de archivo de B) → doble-clic → abre B.
2. Diagrama A con un **End Message** "Pedido" y diagrama B con un **Start Message** "Pedido" → doble-clic en el evento de A → abre B.
3. En una nota, `[[compras#Activity_3]]` → abre `compras.bpmn` y selecciona `Activity_3`.
4. Call Activity sin destino resoluble → toast "no encontrado", sin crash.

- [ ] **Step 8: Commit**

```bash
git add src/processDocs/folderIndex.ts src/processDocs/folderIndex.test.ts src/main.ts
git commit -m "feat(docs): inter-process navigation (call activity, message/signal, cross-process wikilink)"
```

---

## Self-Review

**Spec coverage (sección G del spec 2026-06-30 + finding diferido 2c):**
- Call Activity → abrir `.bpmn` referenciado (`calledElement`) → Tasks 1, 2, 3, 4. ✓
- Message/Signal por mismo nombre entre diagramas → "ir al proceso vinculado" → Tasks 1, 2, 3, 4. ✓
- Wikilink `[[proceso#Elemento]]` abre el otro proceso y selecciona → Task 4(b) (cierra el finding del Plan 2c). ✓
- Link events: detectados (kind "link") en la extracción; navegación intra-diagrama de Link no cableada (fuera de alcance — son intra-proceso). ✓ (documentado)

**Placeholder scan:** sin TBD/TODO; Task 4 (wiring/main.ts) usa anclas concretas + verificación manual. La lógica pura (`extractInterProcessRefs`, `resolveCalledProcess`, `findEventCounterpart`, `parseDiagramInfo`, `buildFolderIndex`) está testeada; los adaptadores bpmn-js/`element.dblclick` no (gate build+manual).

**Type consistency:** `RawEl`/`InterProcessRefs`/`EventRef` (T1) → T2/T3/T4; `DiagramInfo` (T2) → T3-fixture/T4; `parseDiagramInfo` (T3) → `buildFolderIndex` (T4); `IndexSource` (T4) construido en `main.ts` desde `lastTree`/`api.getXml`. Reusa `openFile`/`selectElementById`/`navigateWiki`/`lastTree` (Plan 1/2c).

**Nota de ejecución:** la forma del árbol de `bpmn-moddle` (`rootElement`, `rootElements`, `flowElements`, `messageRef`/`signalRef` resueltos a objetos con `.name`) se confirma en Task 3 contra el fixture; si difiere, ajustar `normalizeModdleElements`. Se registra UN solo handler `element.dblclick` en `mountModeler` que prioriza Call Activity y si no, Message/Signal. El índice de carpeta se cachea e invalida al refrescar `lastTree`.
