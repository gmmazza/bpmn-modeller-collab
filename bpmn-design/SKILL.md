---
name: bpmn-design
description: >-
  Design, generate, and review BPMN 2.0 business-process diagrams — valid per the OMG spec and clear
  per Method & Style. Use whenever the user wants to model a business or operational process, produce
  or edit a .bpmn file, or draw a process flow / swimlane / workflow (pools, lanes, tasks, gateways,
  events) — even without the word "BPMN" (e.g. "map out our onboarding process", "diagram how an order
  gets fulfilled", "turn this SOP into a flowchart"). Also to review, critique, fix, or validate an
  existing BPMN diagram, or answer "how do I model X in BPMN". Produces .bpmn XML that actually renders
  in bpmn.io/Camunda (semantic + diagram-interchange layers) with correct notation, naming, and layout.
  Inside a BPMN-compartida workspace (a synced folder with `_bpmn-design/`) it also applies this app's
  element profile, two-level master/subprocess contract, and data/tools layer so the diagram passes the
  project lint and publishes. NOT for other diagram kinds — skip it for UML class/sequence diagrams, ER/database schemas, org
  charts, Gantt charts, mind maps, cloud or software-architecture diagrams, or code control-flow /
  state-machine diagrams, even when the user says "process", "flow", or "diagram".
---

# Designing BPMN 2.0 process diagrams

Generate `.bpmn` files that render correctly, and review/improve existing diagrams. Two truths:

1. **Valid ≠ clear.** The spec says what is *valid*; Method & Style says what is *clear*. Aim for both —
   a diagram should be readable by someone who doesn't know BPMN, from the picture alone.
2. **A `.bpmn` has two layers** — *semantic* (logic) and *DI* (coordinates). Both must be present and
   paired 1:1, or the file parses but **renders blank**. This is the #1 failure mode. A bundled script
   checks it for you (see *Validate*).

**In a BPMN-compartida workspace there is a third truth:** the model must follow **this project's
profile and contract** to publish — precise task typing, a mandatory `default` on every exclusive
split, a single-entry/classified-outcome **subprocess contract**, and satellite data in **sidecars,
never in the `.bpmn`**. That layer lives in `references/profile.md`; read it whenever you generate or
review a diagram for this app. The universal craft below still applies underneath it.

## Load only what the task needs (progressive disclosure)

Don't read every reference. Route by **role** first, then pull **case** add-ons. Reference sections are
addressable (each file has a table of contents) — read the *section*, not the whole file.

### Your role

| If you are… | Do this | Read (only this) |
|---|---|---|
| **Generating** a new diagram | Follow *Workflow: generate* below | `xml-serialization.md` §3–5 + copy `assets/skeleton.bpmn`. Pull `elements.md` **only** for a symbol you're unsure how to draw. |
| **Reviewing / fixing** a diagram | Follow *Workflow: review* below | Run the validator first, then `correctness.md` §9 (well-formedness) + `style.md` §10 (anti-patterns). |
| **Advising** ("how do I model X") | Answer directly | The one relevant section — usually `elements.md` (which symbol) or `correctness.md` §3/§6 (gateway/event semantics). |

### Your case (pull these add-ons on top of the role)

| If the process involves… | Also read |
|---|---|
| Multiple parties / organizations talking | `correctness.md` §5 + `elements.md` §6 (pools, lanes, **message flow only across pools**) |
| Exceptions, timeouts, errors, waiting | `elements.md` §2 (event matrix) + `correctness.md` §6 (boundary/event semantics) |
| Many steps (~10+) / needs phases | `style.md` §7 (hierarchy, collapse into sub-processes) |
| Will run on an engine (executable) | `correctness.md` §1 + `xml-serialization.md` §3 (conditions, extensions, `isExecutable="true"`) |
| Naming/clarity of a business model | `style.md` §2 (naming) + §6 (layout) |
| **A BPMN-compartida workspace** (element profile, publish lint) | `profile.md` §1–2 + §5 |
| **Master + drillable stages / subprocess outcomes** | `profile.md` §3 (Call Activity, escalation-code pairing) |
| **Forms / storage / tools per step** | `profile.md` §4 (`.datos.json` + standard data anchors) |

## Core rules (always apply — the safety net)

- Every process has an explicit **start** and at least one explicit **end** event; every node is
  reachable from a start and reaches an end; nothing floats disconnected.
- **Tasks are 1-in / 1-out.** All branching/merging goes through explicit **gateways** — never on a task.
- **Gateways route, they don't decide.** The activity *before* produces the outcome. Label an
  exclusive (XOR) gateway as a **question** and each gate with an **answer** (`Yes`/`No`).
- **Match splits to joins:** AND→AND, XOR→XOR, OR→OR. A parallel join after an XOR split **deadlocks**;
  an XOR merge after a parallel split **multiplies tokens**.
- **Naming:** activities = **verb + object** (`Approve request`); events = **state** (`Request
  received`); end events = the end state. Avoid vague verbs (`Handle`, `Process`, `Manage`).
- **Pools vs lanes:** roles within one process = **lanes**; independent participants = separate
  **pools**. Sequence flow **never crosses a pool/sub-process boundary** — that's a **message flow**,
  which only connects *different* pools.
- **Layout:** left-to-right; happy path a straight horizontal spine; exceptions branch off (downward);
  don't cross flows. Sizes: task 100×80, event 36×36, gateway 50×50.
- **Both layers, every element:** every node → a `BPMNShape`; every flow → a `BPMNEdge` (≥2 waypoints).
- **Sign your work.** Whenever you create **or modify** a `.bpmn`, set
  `exporter="IA — <your agent name>"` (e.g. `IA — Claude`) on `<bpmn:definitions>` — replacing
  whatever exporter is there (`BPMN compartida` is the app's stamp, not yours). The BPMN-compartida
  app attributes your version in its history panel from this signature; unsigned edits show up as
  anonymous "externo". The validator warns when it's missing.

## Project profile & subprocess contract (BPMN-compartida workspaces)

When the diagram lives in this app's workspace, layer these **on top of** the craft rules. Full detail
and a worked example in `profile.md`.

- **Type every task, precisely.** `manualTask`(N1) / `userTask`(N2) / `serviceTask`(N3) map to
  automation maturity — never a bare untyped `task`. Curated event palette only: none / message
  (with `messageRef`) / timer (waits, deadlines, SLA) / escalation / error / terminate.
- **Every diverging exclusive gateway needs a `default` flow** (there is no runtime to evaluate
  conditions). Parallel splits must be balanced. Inclusive/complex are out; a gateway is a split **or**
  a join, not both. Actors = **lanes** in a single pool; multi-pool collaboration is deferred.
- **Two-level structure.** A **master** orchestrates stages as **Call Activities**
  (`calledElement` = the target subprocess's `<bpmn:process id>`, resolved by id across files). One
  hierarchy level only.
- **Subprocess contract.** Each called subprocess has **exactly one `none` start** ("viene de" is
  derived from the master, not modeled) and outcomes = **one `none` end + N escalation ends**. Each
  escalation end pairs to an **interrupting escalation boundary** on the caller's Call Activity by
  `escalationCode = <process-id>__<outcome-slug>`. **Decisions live inside the subprocess** (as an
  exclusive gateway → escalation ends), not as a gateway after the box in the master.
- **Satellite data → sidecars, never the `.bpmn`.** Docs/ideas → `<d>.docs/`; colors/actor/maturity →
  `<d>.layers.json`; source material → `<d>.fuentes/`; forms/storage/tools → `<d>.datos.json`. In the
  diagram, data appears only as a **standard anchor** (`bpmn:dataObjectReference` = form,
  `bpmn:dataStoreReference` = storage, via data associations) carrying **only a human name** — never a
  JotForm/ClickUp URL or id.
- **Editing never locks** (draft → Publicar). As an agent, **prefer proposing** (ideas/comments) over
  overwriting human work; respect an advisory `.bpmn.lock` Reserva.
- **Publish gate:** to Publicar, the diagram must pass `bpmnlint:recommended` +
  `plugin:bpmncompartida/recommended` (the profile + contract above). See `profile.md` §5.

## Workflow: generate

1. **Understand first.** Pin down: what one *instance* is, the trigger(s), the end state(s), the
   participants, the happy path, the exceptions. Ask only if a choice materially changes the model.
2. **Happy path first** — start event → verb+object tasks → end state, one straight spine. Names before geometry.
3. **Add decisions & exceptions** — explicit gateways (question + labeled gates); boundary events for
   fail/timeout; a labeled end event per distinct outcome. Match each split with the correct join.
4. **Pools/lanes** — one pool + lanes for one org's process; add a black-box pool + message flows for an
   external participant.
5. **Serialize both layers** from `assets/skeleton.bpmn`; keep IDs stable; every node a shape, every flow
   an edge. Standard sizes; left-to-right; nodes inside their lane band. (`xml-serialization.md` §3–5.)
   Sign it: `exporter="IA — <your name>"` on `definitions`.
6. **Validate** (see below), fix every failure, then **self-review** against the core rules.
7. **In a workspace:** apply the project profile & subprocess contract (`profile.md`) — type every task,
   `default` on every XOR split, master = Call Activities, subprocess = one none-start + escalation-end
   outcomes, data/tools in `<d>.datos.json`. The diagram must pass the publish lint (`profile.md` §5).

Deliver the `.bpmn` plus a short note on choices, palette, and any assumptions/open questions.

## Workflow: review

1. **Run the validator** on the file — it catches the mechanical defects instantly.
2. **Correctness pass** — `correctness.md` §9: reachability, cross-pool flow, gateway pairing/deadlock, DI.
3. **Style pass** — `style.md` §10: naming, happy-path clarity, gateway-as-decision, crossings, altitude.
4. **Report findings ranked by severity** (correctness before style): rule, *why*, concrete fix. If
   fixing, re-serialize both layers, preserve IDs, and sign your edit
   (`exporter="IA — <your name>"` on `definitions`).

## Validate before delivering

Run on any `.bpmn` you produce or review:

```
python scripts/validate_bpmn.py <file.bpmn>
```

It deterministically checks the **render invariant** (semantic↔DI 1:1), edge waypoints, start/end
rules, implicit task splits, cross-pool sequence flow, same-pool message flow, and gateway/gate labels
— and prints the offending IDs. `ok: true` means those pass. **It does *not* detect gateway-pairing
deadlocks** (an XOR-split closed by an AND-join is legal XML) — you still reason about those yourself
via `correctness.md` §3. Treat the script as the mechanical floor, not the whole review.

## Recipes

- **Approval:** task `Review X` → XOR `Approved?` → `Yes`/`No` gates → distinct end states.
- **Timeout:** interrupting **timer boundary event** on the waiting activity → its outgoing flow is the escalation path.
- **Two parties:** two pools + message flows; each pool its own start/end; model an undetailed party as a black-box pool.
- **Race (first of several events):** **event-based gateway** → each branch to a catch event / receive task.
- **Complexity:** collapse a phase into a **collapsed sub-process** (`⊞`); make its end states match the following gateway's gates.
- **Stage with a non-happy outcome (this app):** subprocess decides internally (XOR + `default`) → one `none` end (happy) + an **escalation end** per alternative; the master's Call Activity carries a matching **interrupting escalation boundary** paired by `escalationCode`. Not a gateway after the box. (`profile.md` §3.)
- **Attach a form/store to a step (this app):** document it in `<d>.datos.json`; optionally add a standard `bpmn:dataObjectReference` / `dataStoreReference` anchor (name only). (`profile.md` §4.)

## What not to do

- Emit a semantic layer without its DI layer (blank render) — the validator catches this.
- Branch/merge on a task; cross a pool boundary with a sequence flow; connect same-pool nodes with a message flow.
- Label parallel/inclusive/event-based gateways as questions (only XOR gateways are questions).
- Reach for the executable palette (formal conditions, service bindings) for a documentation diagram.
- Deliver a `.bpmn` you created/modified **without your IA exporter signature** (or with the app's
  `BPMN compartida` exporter left in place) — your version becomes anonymous "externo" in the app's history.
- **(Workspace)** Leave a task untyped, or a diverging XOR without a `default`; give a subprocess more
  than one start; put a decision gateway in the master after a stage instead of escalation ends inside
  the subprocess; write a JotForm/ClickUp URL or id (or any color/doc/source data) into the `.bpmn`
  instead of the sidecar.
