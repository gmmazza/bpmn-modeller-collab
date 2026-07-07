# BPMN 2.0 correctness & well-formedness rules

The normative rules a model must not violate — token semantics, gateway behavior, connection rules,
and a validator-style checklist. Read this when generating flow logic (especially gateways/events) or
when reviewing a diagram for bugs. This is about *validity*; `style.md` is about *clarity*. Source:
OMG BPMN 2.0.2 (formal/13-12-09), cross-checked against Camunda/Flowable reproductions.

**Contents**
1. Conformance classes (descriptive / analytic / executable)
2. Token execution semantics
3. Gateway semantics & pairing (the deadlock rules)
4. Sequence-flow connection rules
5. Message flow, pools, lanes
6. Events (start/end/intermediate/boundary result semantics)
7. Sub-processes, call activities, event sub-processes, transactions
8. Data flow
9. **Well-formedness checklist** ← the one to run during review

---

## 1. Conformance classes

Three hierarchical sub-classes of Process Modeling; each is a superset of the one below.

| Sub-class | Adds | Executable? | Purpose |
|---|---|---|---|
| **Descriptive** | Pools/lanes, tasks, sub-processes, start/end events, none/message/timer events, sequence & message flow, data objects, annotations. The common shapes only. | No | High-level business communication. |
| **Analytic** | All intermediate/boundary event types, event sub-processes, inclusive/complex gateways, more event definitions. Still diagram-only. | No | Formal analysis, exception modeling, simulation. |
| **Common Executable** | Full data flow, expressions, service details. Data-type = XML Schema; interfaces = WSDL; data-access = XPath. | Yes | Tools that emit engine-runnable models. |

- Descriptive & Analytic carry only what's visible in the diagram — no data mappings, correlations,
  or service bindings.
- To make a model **executable** you must add process data + mappings, formal boolean gateway
  conditions, message/service interfaces, and human-task assignment, and set `isExecutable="true"`.
- **Decide the target class up front.** A descriptive model may omit formal conditions/data; an
  executable one may not. Don't smuggle documentation shortcuts into a model meant to run.

---

## 2. Token-based execution semantics

Execution is defined with **tokens**. A token traverses sequence flows and passes through elements; it
**never crosses into another pool** (tokens are confined to one process instance).

1. **Start events create tokens** — one on each outgoing flow when the instance starts.
2. **Tokens move along sequence flows** in arrow direction as work completes.
3. **Activities** consume the incoming token while running and emit one on each outgoing flow when done.
4. **End events consume tokens.** The instance is **complete when no tokens remain** — not merely
   "an end event was reached."
5. **Gateways** consume/generate tokens per their type (§3) — the only elements that change token count.
6. Multiple tokens may be active at once (parallelism); correct models re-synchronize or independently
   consume them all so the instance can complete.

**Failure modes to avoid:**
- **Lost/stuck token** — a token with nowhere valid to go (dangling node). Modeling error.
- **Deadlock** — tokens permanently blocked at a join that never receives all it waits for.
- **Livelock** — tokens cycling forever with no progress.
- **Multi-merge / token multiplication** — an uncontrolled merge runs downstream work too many times.

---

## 3. Gateway semantics & well-formedness

A gateway **diverges** (split) or **converges** (join). One gateway *can* do both but mixing is
discouraged. Gateways are pure control-flow (no cost/time effect).

### Exclusive (XOR, data-based)
- **Split:** exactly **one** outgoing flow — the first whose condition is true. 1 in → 1 out.
- **Default flow** (slash marker) is taken if no condition is true. No default + none true → runtime
  error. Best practice: always provide a default or make conditions exhaustive.
- **Join:** simple pass-through merge — waits for one token, forwards immediately, **no** sync.

### Parallel (AND)
- **Split (fork):** **all** outgoing flows get a token, unconditionally. 1 in → N out.
- **Join (sync):** waits until a token has arrived on **every** incoming flow, then emits one. N in → 1 out.
- **The central rule:** an AND-split must be matched by an AND-join. Merging parallel branches with an
  **XOR** join fires once per branch → **token multiplication**. Feeding an AND-join from only some
  branches → **deadlock**.

### Inclusive (OR)
- **Split:** every true condition's flow is taken (0..N); if none true, the **default** is taken.
- **Join:** waits for a token on **every incoming branch that will actually receive one** this
  instance — synchronizes only the activated branches. The hardest construct.
- **Pairing:** inclusive split ↔ inclusive join. Inclusive split → parallel join deadlocks. Keep the
  split/join pair in one block; don't cross external conditions into it.

### Event-based
- Models a **deferred choice** — the branch taken depends on **which event occurs first**, not data.
- Must have **≥2** outgoing flows, each to an **intermediate catch event** (message/timer/signal/
  conditional) **or** a receive task. Those catch events have exactly one incoming flow (from the gateway).
- Used as a **split only**, never a join. (An instantiating variant can start a process.)

### Complex
- Custom synchronization via an `activationCondition` (e.g. "proceed when 3 of 5 arrive"). Use sparingly —
  tool-dependent and hard to read.

### General
- Conditions live on the **outgoing flows** of data-based gateways (XOR/OR), not on the gateway.
- Parallel and event-based gateways **ignore** conditions.
- **Only gateways** should have multiple incoming/outgoing sequence flows. A task/event with multiple
  outgoing flows = an uncontrolled AND-split; multiple incoming = an uncontrolled XOR-merge — legal but
  ambiguous and discouraged. Route all branching through explicit gateways.

---

## 4. Sequence-flow connection rules

A sequence flow has exactly **one source** and **one target**, each a **Flow Node**: an Event, an
Activity, or a Gateway.

**Valid endpoints:** Events ↔ Activities ↔ Gateways (respecting start/end limits below).
**Never** endpoints: pools, lanes, data objects, data stores, groups, text annotations (those use
**associations**).

**Hard structural restrictions:**
- **Start events:** **no incoming** sequence flow.
- **End events:** **no outgoing** sequence flow.
- Every non-start node must be reachable **from** a start; every non-end node must reach **an** end
  (no unreachable nodes, no dangling nodes that can't complete).
- **No sequence flow across a sub-process boundary** — flow enters/leaves only through the sub-process
  shape itself.
- **No sequence flow across a pool boundary** — cross-pool uses **message flow** only.
- **Boundary events:** no incoming flow; only an outgoing (the exception path).
- **Compensation** boundary events are outside normal flow — connected to their handler by an
  **association**, not sequence flow.

**Conditional & default flows:** a conditional flow's `conditionExpression` must be boolean; a default
flow (slash) is taken only when no other outgoing condition is true (its own condition is ignored).
Only exclusive/inclusive gateways and activities may have a default.

---

## 5. Message flow, pools, lanes

- **Pool** = a Participant (autonomous process/organization). **Lane** = a sub-partition (role/dept/
  system) *inside* one pool; lanes never span pools.
- **Message flow** connects nodes in **two different pools**; **never** two nodes in the same pool.
  Valid endpoints: a whole pool, or message-appropriate nodes (activities, message/signal events,
  send/receive tasks). Not gateways, not sequence flows. It carries a message, never a control token.
- A **black-box** pool (collapsed, no internals) attaches only via message flow.
- **Association** (dotted) links artifacts/data to elements — no token, no ordering.
- **Collaboration** = ≥2 pools exchanging messages; each pool runs its own process with its own
  start/end and its own token set.

**The most common structural error:** using sequence flow where you need a message flow (across orgs)
or vice-versa. Within one pool → sequence flow. Across pools → message flow.

---

## 6. Events — result semantics that matter

- **Start:** no incoming flow. Top-level triggers: None/Message/Timer/Signal/Conditional/Multiple.
  Embedded sub-process start = **None only**. Event-sub-process starts = interrupting/non-interrupting
  triggers.
- **End results:**
  - **None** — consumes the token / ends that path only.
  - **Message** — sends a message. **Signal** — broadcasts (many catchers).
  - **Error** — throws a named error; must be caught by an error boundary/event-subprocess start in an
    enclosing scope, else the instance ends in error.
  - **Escalation** — non-terminating hand-off equivalent of error.
  - **Compensation** — triggers compensation of completed activities.
  - **Cancel** — **Transaction sub-process only**; triggers rollback/compensation.
  - **Terminate** — **immediately ends the whole enclosing instance**, consuming all remaining tokens,
    no compensation. (Contrast a None end, which ends only its own path.)
- **Multiple end events are allowed;** reaching one doesn't end the instance unless it's Terminate.
- **Intermediate:** catching (Message/Timer/Signal/Conditional/Link-target/Multiple) waits then
  releases; throwing (Message/Signal/Escalation/Compensation/Link-source/None/Multiple) fires and
  passes through. **Link** events are paired throw/catch shortcuts within the **same** process.
- **Boundary:** always catching, attached to an activity.
  - **Interrupting** (`cancelActivity="true"`, solid): fires → host activity cancelled → token exits
    the boundary flow.
  - **Non-interrupting** (`cancelActivity="false"`, dashed): host keeps running; each firing spawns an
    **additional parallel token**.
  - **Error** boundary must be interrupting. **Cancel** boundary only on a Transaction. **Compensation**
    boundary connects to its handler via association, has no outgoing flow, runs in reverse order.

---

## 7. Sub-processes, call activities, event sub-processes, transactions

- **Embedded (expanded) sub-process:** shares parent data; exactly **one None start** + ≥1 end
  internally; no sequence flow crosses its boundary; completes when all inner tokens are consumed.
- **Call activity:** invokes an independently-defined process/global task (not inlined); own scope;
  data via mappings.
- **Event sub-process:** an inline handler inside a process/sub-process, **not** connected by sequence
  flow; triggered by its start event (Error/Escalation/Message/Timer/Signal/Conditional/Compensation).
  Interrupting (solid) cancels the enclosing scope; non-interrupting (dashed) runs in parallel.
- **Transaction sub-process:** ACID-style with completion / cancellation (Cancel end → Cancel boundary
  → compensation) / hazard (error boundary). Cancel & Cancel-boundary events are valid **only** here.

---

## 8. Data flow

- **Data objects** have a lifecycle scoped to the instance; connected to activities/events by **data
  associations** (never sequence flow). **Data stores** persist beyond the instance.
- Data has **no token semantics** — associations don't order execution. Control flow is only sequence
  flow + gateways + events.
- Descriptive/Analytic models show data as documentation; Executable models must define real data
  types, item definitions, and association mappings.

---

## 9. Well-formedness checklist

Run this during any review or before delivering a generated diagram.

**Structural (all classes):**
1. Every process has ≥1 explicit start event and ≥1 explicit end event.
2. Start events have **no incoming** flow; end events have **no outgoing** flow.
3. No sequence flow crosses a **pool** or **sub-process** boundary.
4. Cross-pool communication uses **message flow**, connecting **different** pools only.
5. Sequence-flow endpoints are only Events/Activities/Gateways (never pools, lanes, data, annotations).
6. Every node is **reachable** from a start and can **reach** an end (no orphan/dead nodes).
7. Only gateways carry multiple incoming/outgoing flows (no implicit split/merge on tasks/events).
8. **Gateway pairing:** AND-split → AND-join; OR-split → OR-join; XOR-split → XOR-merge. Mismatches
   → deadlock or token multiplication.
9. Exclusive/inclusive splits have a **default flow** or exhaustive conditions.
10. Event-based gateway: ≥2 outgoing, each to an intermediate catch event / receive task; split only.
11. Cancel & Cancel-boundary events only inside a **Transaction** sub-process.
12. Compensation boundary events connect to a handler via **association**, no normal flow, reverse order.
13. Boundary events have no incoming flow; their outgoing flow is the exception path.
14. Embedded sub-processes contain exactly one **None** start event.

**Semantic (token model):**
15. No deadlock, no livelock, no lost tokens, no unintended multi-merge.
16. Instance completes only when **all** tokens are consumed; `Terminate` is the only force-clear.

**Executable-only (Common Executable class):**
17. Gateway conditions are formal booleans; data types (XSD), interfaces (WSDL), mappings (XPath) fully
    specified; `isExecutable="true"`.
