# This app's BPMN profile, subprocess contract & data layer

The **project convention layer** on top of universal craft. `correctness.md`/`style.md`/`elements.md`
tell you what is *valid* and *clear* in BPMN generally; **this file tells you how BPMN compartida
expects a model to be built** so it passes the project lint and drives the app's two-level navigation
and data/tools features. Read it whenever you generate or review a diagram *for this workspace*
(anything under a synced project folder with `_bpmn-design/`), or when a task touches subprocesses,
stages, escalation outcomes, forms/storage, or "why won't it publish".

Two forces shape every verdict here:
1. **Standard-portable BPMN** — prefer a construct a real engine (Camunda/Zeebe) resolves; no
   proprietary scaffolding when a standard element exists.
2. **Readable by non-technical people** — plain-language outcomes, the smallest palette that expresses
   the process, decisions shown explicitly.

**There is no runtime.** The app is a documentation/navigation tool — **no process engine, no
variables, no condition evaluation.** Anything that needs runtime data
(`conditionExpression`, data-based gateway conditions, process variables) is **out of profile**.
Structural determinism comes from a **mandatory `default` flow** on every diverging exclusive gateway
instead.

**Contents**
1. Collaboration & storage — sidecars, never mutate the `.bpmn`
2. The element profile (verdicts)
3. Two-level structure & the subprocess contract (the heart of the app)
4. Data & tools layer
5. The publish gate (project lint)

---

## 1. Collaboration & storage — never mutate the `.bpmn` for satellite data

Editing **never locks**. Each person edits a private local **draft**; only **Publicar** (`Ctrl+S`)
writes to the shared folder and creates a history version. As an agent your default is
**propose → let the human review & publish**: prefer leaving **ideas/comments** over overwriting human
work. You *may* edit the `.bpmn` directly when appropriate — the app detects the external change and
reloads it (showing the human a diff if they had unpublished work) — but respect any advisory
`<name>.bpmn.lock` **Reserva** (don't stomp; propose instead).

**The `.bpmn` carries flow structure only.** All satellite data lives in **sidecars** next to the file
— never encode it in the diagram XML:

| Sidecar | Holds |
|---|---|
| `<d>.docs/` | Markdown process docs + ideas/mejoras (wikilinks `[[proceso#elemento]]`, images) |
| `<d>.layers.json` | Color / actor / maturity layers (diagram-js markers, not BPMN) |
| `<d>.fuentes/` | Source material being modeled from (`pendiente` at root, `procesado/` once reflected) |
| `<d>.datos.json` | Data & tools per element — forms, storage, other tools (see §4) |

Changing **flow structure** (adding a task, a gateway, an escalation outcome) *is* a legitimate `.bpmn`
edit — that is the diagram. Changing **colors, docs, sources, form/storage identity** is **not** — it
goes to the sidecar. Reapplying colors after a reload, etc., is the app's job, not something you bake
into the XML.

---

## 2. The element profile (verdicts)

Verdicts: **Core** (base of every model) · **Adopt** (recommended, with convention) · **Permit** (valid
where it applies) · **Discourage** (avoid without a strong reason) · **Exclude** (out of profile → lint
error). Pick the **smallest palette** that expresses the process.

### Activities — task typing is REQUIRED and precise
A bare untyped `bpmn:task` is **discouraged** (lint warns; allowed only in a rough draft). Type every
task, and let the type carry the **automation-maturity** dimension (it feeds the maturity layer):

| Element | Verdict | Convention |
|---|---|---|
| `manualTask` **(N1)** | **Adopt** | Human does it with **no** system — manual maturity |
| `userTask` **(N2)** | **Adopt** | Human does it **with** software support |
| `serviceTask` **(N3)** | **Adopt** | Automated / system does it — highest maturity |
| `sendTask` / `receiveTask` / `businessRuleTask` | Permit | Messaging / rules where they genuinely apply |
| `scriptTask` | Discourage | Implies code; rare in documentation |
| `callActivity` (+ `calledElement`) | **Core** | = a **stage** in the master (see §3) |
| Multi-Instance (parallel/sequential) + Loop markers | Permit | "for each item / N times" is real documentation |
| Untyped `task` | Discourage | Use a precise type; draft-only |
| Transaction / Event Sub-Process / Ad-Hoc / Compensation | **Exclude** | ACID/compensation/unordered semantics = overkill without a runtime |

### Events — a curated palette
| Type | Verdict | Convention |
|---|---|---|
| None (start / end) | **Core** | Plain start; normal end (see the contract in §3) |
| Timer (start / intermediate-catch / boundary) | **Adopt** | Waits, deadlines, SLAs. **Interrupting** boundary = deadline that cancels & diverts; **non-interrupting** = reminder/escalation |
| Message (start / catch / end / boundary) | **Adopt** | External trigger/comms — **requires a `messageRef`** to a declared `<bpmn:message>` |
| **Escalation** (end / boundary) | **Core (this app)** | Alternative **business outcomes**; paired by escalation code (§3) |
| Error (end / boundary) | **Adopt** | A real **fault** — distinct from a business escalation |
| Terminate (end) | **Adopt** | Ends the whole process at once |
| Link (throw/catch) | Permit | "goto" within one large diagram (intra-process only) |
| Signal (throw/catch) | Permit | Broadcast across processes; use sparingly |
| Conditional | **Discourage** | Reacts to data → needs a runtime the app doesn't have |
| Cancel / Compensation | **Exclude** | Belong to Transaction, which is excluded |

### Gateways
| Element | Verdict | Convention |
|---|---|---|
| Exclusive (XOR) | **Core** | **Every diverging exclusive gateway MUST declare a `default` flow** (no-runtime determinism) |
| Parallel (AND) | **Core** | Must be **balanced** — a fork has a matching join |
| Event-based | Permit | Waits/races ("customer reply or timeout") |
| Inclusive (OR) | **Discourage** | Hard to reason about without a runtime |
| Complex | **Exclude** | Obscure |
| Event-based/Parallel *instantiate* | **Exclude** | Advanced instantiation |
| **A gateway that both splits AND joins** | **Exclude** | A gateway is split **or** join, not both — use two |

### Participants / artifacts / data
| Element | Verdict | Convention |
|---|---|---|
| Single Pool + **Lanes** | **Adopt** | Lanes = actors/roles; aligns with the actors layer |
| Multi-pool + Message Flow + Collaboration | **Defer** | Master/subprocess decomposition already separates concerns; an external trigger is a message-start + `messageRef`, not a full collaboration |
| Text Annotation | Permit | Lightweight note; the docs sidecar is usually better |
| Group (`bpmn:group` / category) | **Discourage as structure** | Stages are Call Activities → groups are redundant; **delete orphan categories** |
| Data Object / Data Store / Data Association | **Owned by the data layer** | Used only as the standard anchors in §4 — carry a name, never tool ids/URLs |

---

## 3. Two-level structure & the subprocess contract

The app renders a **master** diagram and lets you **drill into** each stage. This works only if the
model follows a strict, standard contract. **One hierarchy level only** (a master calling subprocesses;
a called subprocess is not itself a master).

### 3.1 The master orchestrates stages as Call Activities
Each stage in the master is a **`callActivity`** whose **`calledElement` = the target subprocess's
`<bpmn:process id>`**. Resolution is **by process id across files**, so renaming a file (or the call
activity) never breaks the link. The master is a clean line of stages with **labeled outcome-exits** —
**not** a place for decision gateways.

### 3.2 Entry — exactly one `none` start per subprocess
Every called subprocess has **exactly one `none` start event** (lint: `single-none-start`). Its
"**viene de**" (who called it) is **derived by the app from the master** — never modeled inside the
subprocess. If a subprocess used to have several starts driving different internal logic, re-model that
as **one none-start → an internal exclusive gateway** with a readable business question
(e.g. *"¿El motor ya tiene PaP/antecedente?"*) — the decision becomes explicit and standard.

### 3.3 Exit — one normal end + N escalation ends
A subprocess's outcomes are:
- **one `none` end** = the happy path. On normal completion the token follows the Call Activity's
  **normal outgoing flow** in the master.
- **one Escalation End Event per alternative outcome** (e.g. *"devuelto sin reparar"*, *"no cubre"*).

### 3.4 Pairing — by `escalationCode` (standard engine behavior)
Each escalation end is paired to an **interrupting Escalation Boundary Event** on the caller's Call
Activity, matched by an **`escalationCode`** string — exactly how Camunda/Zeebe propagate an escalation
from a called process to a boundary. **Each file declares its own `<bpmn:escalation>`** and references
it; matching is **by the code string**, not by id.

**Code scheme:** `<subprocess-process-id>__<outcome-slug>` — e.g. `proc_rep_3__devuelto`,
`proc_rep_7__no_cubre`. Process id (not filename) keeps it rename-safe; the slug is the outcome name,
accent-stripped to `[a-z0-9_]`.

### 3.5 Decisions live INSIDE the subprocess, not after the box in the master
Do **not** put a decision gateway in the master *after* a stage. The "why" of each exit belongs where
the work happens: the subprocess ends in distinct escalation outcomes, and the master's Call Activity
simply carries one boundary-exit per outcome. (The master *may* legitimately have a `none` start **and**
a message start for an external trigger — give the message start a declared `<bpmn:message>` +
`messageRef`.)

### 3.6 Worked example — a "Diagnóstico" stage with a non-happy outcome

**Master** (`proc_maestro.bpmn`) — a stage and its escalation exit:
```xml
<bpmn:process id="proc_maestro" isExecutable="false">
  <bpmn:startEvent id="se_map"><bpmn:outgoing>f_m1</bpmn:outgoing></bpmn:startEvent>
  <bpmn:callActivity id="ca_dx" name="Diagnóstico" calledElement="proc_diagnostico">
    <bpmn:incoming>f_m1</bpmn:incoming>
    <bpmn:outgoing>f_m2</bpmn:outgoing>          <!-- normal exit -->
  </bpmn:callActivity>
  <bpmn:boundaryEvent id="be_dx_nocubre" attachedToRef="ca_dx" cancelActivity="true">
    <bpmn:outgoing>f_nocubre</bpmn:outgoing>
    <bpmn:escalationEventDefinition escalationRef="Esc_m_nocubre" />
  </bpmn:boundaryEvent>
  <bpmn:callActivity id="ca_rep" name="Reparación" calledElement="proc_reparacion"> … </bpmn:callActivity>
  <bpmn:endEvent id="ee_nocubre" name="No cubre garantía">
    <bpmn:incoming>f_nocubre</bpmn:incoming>
  </bpmn:endEvent>
  <!-- flows: f_m1 se_map→ca_dx, f_m2 ca_dx→ca_rep (normal), f_nocubre be_dx_nocubre→ee_nocubre -->
  <bpmn:escalation id="Esc_m_nocubre" name="No cubre" escalationCode="proc_diagnostico__no_cubre" />
</bpmn:process>
```

**Subprocess** (`proc_diagnostico.bpmn`) — single none-start, internal decision, normal + escalation ends:
```xml
<bpmn:process id="proc_diagnostico" isExecutable="false">
  <bpmn:startEvent id="se_dx"><bpmn:outgoing>f1</bpmn:outgoing></bpmn:startEvent>   <!-- the only start -->
  <bpmn:userTask id="t_dx" name="Diagnosticar motor">
    <bpmn:incoming>f1</bpmn:incoming><bpmn:outgoing>f2</bpmn:outgoing>
  </bpmn:userTask>
  <bpmn:exclusiveGateway id="gw_cubre" name="¿Cubre garantía?" default="f_si">
    <bpmn:incoming>f2</bpmn:incoming>
    <bpmn:outgoing>f_si</bpmn:outgoing><bpmn:outgoing>f_no</bpmn:outgoing>
  </bpmn:exclusiveGateway>
  <bpmn:endEvent id="ee_ok" name="Diagnóstico OK"><bpmn:incoming>f_si</bpmn:incoming></bpmn:endEvent>
  <bpmn:endEvent id="ee_no" name="No cubre">
    <bpmn:incoming>f_no</bpmn:incoming>
    <bpmn:escalationEventDefinition escalationRef="Esc_no" />
  </bpmn:endEvent>
  <bpmn:escalation id="Esc_no" name="No cubre" escalationCode="proc_diagnostico__no_cubre" />
</bpmn:process>
```

Notes: the normal `none` end (`ee_ok`) drives the Call Activity's normal flow (`f_m2` → Reparación);
the escalation end (`ee_no`) surfaces in the master as the boundary `be_dx_nocubre`, matched **by the
shared code `proc_diagnostico__no_cubre`** (each file declares its own `<bpmn:escalation>`). The
`gw_cubre` gateway carries a mandatory `default`. `ee_ok` is the single none-end; every other outcome is
an escalation end.

---

## 4. Data & tools layer (`<d>.datos.json` + standard anchors)

Document, per element, **which forms feed a step** (today: JotForm), **where its data is stored**
(today: a ClickUp list) and **any other tools**. Because forms/stores are external systems (not BPMN),
their identity/detail lives **outside** the portable `.bpmn`:

- **Sidecar `<d>.datos.json` is the source of truth** — keyed by element id, each entry is
  `{ tool, nombre, url, … }` under `formularios` / `almacenamiento` / `herramientas`
  (`tool` ∈ `jotform` | `clickup` | `otro`). **No secrets** — references only (name + URL/id), never
  API keys or live API calls.
- **Optional standard anchor in the diagram** makes it *visible* that a step has data:
  a **`bpmn:dataObjectReference`** ("Formulario …") linked via **`bpmn:dataInputAssociation`** = a form;
  a **`bpmn:dataStoreReference`** ("Almacenamiento …") linked via **`bpmn:dataOutputAssociation`** =
  storage. These are 100% standard and portable, and carry **only a human name**.
- **NEVER put a JotForm/ClickUp URL or id in the `.bpmn`.** The anchor holds the name; the specifics
  resolve to the sidecar by element/reference id. The app's "Mostrar en el diagrama" action creates the
  anchor and round-trips via draft→publish; editing the sidecar alone never touches the `.bpmn`.

---

## 5. The publish gate (project lint)

To **Publicar**, a diagram must pass the project lint — `bpmnlint:recommended` **plus**
`plugin:bpmncompartida/recommended`, which encodes this profile. The custom rules (messages surface to
users in Spanish):

- `no-untyped-task` — a bare `bpmn:task` (warn; draft-only). → §2
- `exclusive-split-needs-default` — a diverging exclusive gateway with no `default` flow. → §2
- `no-inclusive-complex-gateway` — inclusive/complex gateways. → §2
- `message-needs-messageref` — a message event without a `messageRef`. → §2
- `single-none-start` — a called subprocess with more than one start, or a non-`none` start. → §3.2
- `no-gateway-split-and-join` — a gateway that both splits and joins. → §2
- `no-orphan-category` — a declared category with no referrer. → §2

The craft still applies underneath the profile: both the **semantic and DI layers** must be present and
paired 1:1 (`xml-serialization.md`), and Method & Style (naming, happy-path layout, gateway-as-router)
must not regress. Profile-conformant but unclear is still a bad diagram; run the bundled validator and
the style pass regardless.
