# BPMN 2.0 Method & Style — making diagrams clear

Rules for diagrams that read as intended without a subject-matter expert. `correctness.md` tells you what
is *valid*; this tells you what is *clear* — a diagram can be 100% valid and still terrible. Read this
when naming elements, laying out flow, or reviewing a diagram for readability. Source: Bruce Silver's
*BPMN Method and Style*, the Trisotech style rules, and Camunda modeling best practices.

**Contents**
0. Two foundational principles
1. Structure & flow completeness
2. Naming conventions (highest leverage)
3. Gateways — routing not deciding
4. End states & subprocess↔gateway matching
5. Pools, lanes, message flows
6. Layout & readability
7. Hierarchy & granularity
8. Events
9. Conformance sub-classes
10. **Anti-pattern checklist** ← scan during review

---

## 0. Two foundational principles

1. **One diagram, one interpretation.** The logic must be *completely and unambiguously* described by the
   printed diagram **alone** — readable by someone who doesn't know BPMN and has no SME. A diagram that
   needs verbal explanation has failed as documentation.
2. **One diagram, one serialization.** A given diagram should have one XML serialization (enables
   tool interchange).

Style is a layer of conventions *on top of* the spec. Aim for valid **and** styled.

---

## 1. Structure & flow completeness

- **1.1 Every process starts with a start event;** every subprocess has an explicit None start.
  *Why:* marks the trigger unambiguously.
- **1.2 Every path ends at an end event.** No dangling tasks, no gateways that "fall off the page."
  *Why:* an unterminated path is an incomplete process.
- **1.3 No implicit start/end inside subprocesses.** *Why:* needed for end-state matching (§4) and clean
  interchange.
- **1.4 No orphan / disconnected activities.** *Why:* disconnected nodes are unreachable — a top real-world
  mistake.
- **1.5 A task has exactly one incoming and one outgoing flow.** Branch/merge only through gateways.
  *Why:* multiple flows off a task hide implicit gateway logic; the split condition becomes invisible.

---

## 2. Naming conventions (the single highest-leverage habit)

Name from the **business perspective**, in **sentence case**. No technical artifact names, no internal
abbreviations.

| Element | Pattern | Good | Bad |
|---|---|---|---|
| **Activity / Task** | verb (infinitive) + object | `Approve request`, `Inspect motor` | `Request`, `Invoice handling`, `doStuff()` |
| **Subprocess / Call activity** | object + nominalized verb | `Order processing`, `Handle complaint` | `Misc`, `Sub 1` |
| **Event** | object + past participle (a **state**) | `Request received`, `Motor diagnosed` | `Receive`, `Process`, `Event 1` |
| **Exclusive (XOR) gateway** | a **question** | `Approved?`, `Repair under warranty?` | `Gateway`, `Check`, unlabeled |
| **Gateway gates (outgoing flows)** | the answer / end state | `Yes` / `No`, `Credit OK` / `Credit denied` | unlabeled |
| **Pool** | the participant | `Customer`, `Order fulfillment` | `Pool 1` |
| **Lane** | the role/system doing the work | `Warehouse`, `Billing system` | `Lane 2` |
| **Message flow** | the message **name** (noun) | `Info request`, `Invoice` | `Send invoice` (that's an action) |
| **Data object** | the business document/state | `Purchase order`, `Repair quote [approved]` | `Data` |

- **2.1 Activities = verb + object.** *Why:* an activity is work being done; the verb makes it testable.
- **2.2 Events = noun + past participle (a state), never an action.** *Why:* events mark that something
  *has happened*; phrasing as actions confuses them with tasks. `Invoice paid` > `Invoice processed`.
- **2.3 Avoid vague verbs** (`Handle`, `Process`, `Manage`, `Do`). *Why:* they hide what really happens.
- **2.4 No two activities in one process share a name;** no two end events at one level share a name.
  *Why:* duplicates break the one-interpretation property and traceability.
- **2.5 Spell out abbreviations** (gloss in an annotation if unavoidable). *Why:* acronyms are opaque to
  other readers.

---

## 3. Gateways — routing, not deciding

**Core mental model:** a gateway does **not** make the decision — the activity *before* it does. The
gateway merely routes based on the end state that activity produced. Most misunderstood point in BPMN.

- **3.1 Every split is an explicit gateway,** never a bare conditional flow off a task. *Why:* a gateway
  makes the decision point visible.
- **3.2 A splitting gateway has more than one gate.** *Why:* a single-gate gateway is noise.
- **3.3 Label the XOR gateway as a question and each gate with the answer / end state**
  (`Credit OK`, `Out of stock`). *Why:* the reader sees both the question and the outcomes.
- **3.4 At most one gate may be unlabeled (the default), and only if the gateway is labeled.**
- **3.5 Do NOT label parallel (AND), inclusive (OR), or event-based gateways or their gates.** *Why:* they
  aren't a single question with mutually-exclusive answers.
- **3.6 Split and merge symmetrically; separate gateways for split vs join.** An XOR split closes with an
  XOR merge; a parallel split closes with a parallel join. *Why:* asymmetric/mixed split-merge is a top
  cause of deadlocks, and symmetric blocks read as a unit.
- **3.7 Don't mix gateway semantics.** A merge after an XOR split must be an XOR merge, not a parallel join
  (which would wait forever). *Why:* mismatched types deadlock.

---

## 4. End states & subprocess ↔ gateway matching (signature rule)

- **4.1 Label end events with the end state** (`Issue resolved`, `Motor repaired`). *Why:* the name tells
  the reader how the process turned out.
- **4.2 Multiple end events → label each; single end event → leave unlabeled.**
- **4.3 Subprocess end states must match the gateway gates that follow it.** When a collapsed subprocess is
  followed by an XOR gateway, the number of subprocess end events equals the number of gates and their
  labels match (`Charge ok` end → `Charge ok` gate). *Why:* mechanical traceability — the reader drills
  from the parent gateway into the child and finds the matching outcome. This is what turns BPMN from
  "compliant" into genuine communication.
- **4.4 (BPMN-compartida):** this app expresses the same traceability *without* a gateway after the
  stage. The decision lives **inside** the subprocess; each distinct outcome is an **escalation end**
  paired to an **escalation boundary** on the master's Call Activity by `escalationCode`. The number and
  names of the subprocess's escalation ends are what the master's outcome-exits must match. See
  `profile.md` §3.

---

## 5. Pools, lanes & message flows

- **5.1 One process per pool.**
- **5.2 Sequence flow never crosses a pool (or subprocess) boundary;** pools communicate only via
  **message flows**. *Why:* sequence flow = control within one process.
- **5.3 Model each pool fully on its own, then wire message flows** between pools. *Why:* prevents dangling
  cross-pool sequence flows.
- **5.4 Message flows connect *different* pools only.**
- **5.5 External participants = black-box pools** (empty, name + message interactions only). *Why:* signals
  "out of scope, interaction only."
- **5.6 Organizational roles within your process = lanes, not separate pools.** *Why:* lanes partition
  responsibility within one control flow; pools partition independent control flows.
- **5.7 Label message flows with the message name (noun)** — `Info request`, not `Send info request`.
- **5.8 Replicate cross-level message flows** into the child diagram of a collapsed subprocess and back.

---

## 6. Layout & readability

- **6.1 Flow left-to-right** (or consistently top-to-bottom); pick one. *Why:* matches reading direction.
- **6.2 Happy path first — straight across the center.** Branch exceptions/alternates *off* it (usually
  downward). *Why:* the reader instantly sees the primary scenario.
- **6.3 Don't cross sequence flows.** *Why:* crossings are the #1 visual signal of a hard-to-read model.
- **6.4 Don't route flow backward** against reading direction (except a cleanly-drawn loop).
- **6.5 Keep symbol sizes uniform.** *Why:* size variation falsely implies importance.
- **6.6 For long jumps / multi-page, use Link events** instead of a giant line.
- **6.7 Align split/join gateway pairs** so each branch block reads as a unit.

---

## 7. Hierarchy & granularity

- **7.1 Keep one level to roughly ≤ 10 activities (one page).** Collapse detail into subprocesses. *Why:*
  hierarchy is BPMN's complexity tool.
- **7.2 Don't mix levels of abstraction on one page.** *Why:* mixed altitude is impossible to scan.
- **7.3 Use top-down decomposition** — end-to-end high level first, then expand each subprocess.
- **7.4 Child diagram name = subprocess name.**

---

## 8. Events

- **8.1 Label all intermediate events** (throwing and catching). *Why:* an unlabeled event is an
  unexplained wait/throw.
- **8.2 Message start → label with the message; timer start → the schedule; signal start → the signal;
  conditional start → the condition.**
- **8.3 Use boundary events for exceptions attached to an activity** — outgoing flow + labeled. Error
  boundary always interrupts. *Why:* models "what if this step fails/times out" without cluttering the
  main flow.
- **8.4 Match throw/catch pairs** (an error boundary on a subprocess needs a matching throwing error
  inside, matching labels).

---

## 9. Conformance sub-classes — choose your palette deliberately

- **Descriptive (Level 1):** pools/lanes, tasks, subprocesses, start/end, None/Message/Timer events,
  exclusive & parallel gateways, sequence/message flow, data objects, annotations. **Use for** business
  audiences and high-level docs — small palette everyone reads.
- **Analytic (Level 2):** adds most intermediate/boundary events (error, signal, escalation, conditional,
  link), event-based & inclusive gateways, event sub-processes. **Use for** real exception/event logic.
- **Executable:** full palette + technical attributes (data mappings, expressions, forms, IDs). **Use for**
  engine-run models.

**Pick the smallest palette that expresses the process.** Reaching for exotic elements you don't need
hurts readability.

---

## 10. Anti-pattern checklist (the "don'ts")

Most real-world BPMN errors are misuse of connecting objects. Scan for these during review:

- [ ] Disconnected/unreachable activity (no in or out flow). → §1.4
- [ ] Task with 2+ outgoing flows doing an implicit branch (no gateway). → §1.5 / §3.1
- [ ] Sequence flow crossing a pool or subprocess boundary. → §5.2
- [ ] Message flow between two nodes in the same pool. → §5.4
- [ ] Path that never reaches an end event / unlabeled outcome. → §1.2 / §4.1
- [ ] Gateway "making a decision" with no preceding activity producing the outcome. → §3
- [ ] Unlabeled gateway gates / more than one unlabeled gate. → §3.3–3.4
- [ ] Parallel join waiting on a token from an XOR split (deadlock). → §3.7
- [ ] Asymmetric split/merge. → §3.6
- [ ] Vague activity names (`Process`, `Handle`, `Manage`). → §2.3
- [ ] Events named as actions instead of states. → §2.2
- [ ] Crossing / backward / meandering sequence flows. → §6.3–6.4
- [ ] One page with 20+ activities / mixed abstraction levels. → §7.1–7.2
- [ ] Separate pools for departments that share one process (should be lanes). → §5.6
- [ ] Subprocess end states that don't match the following gateway's gates. → §4.3
