# BPMN 2.0 element reference

The full visual vocabulary: every shape, its notation (border / icon / marker), and when to use it.
Read this when you need to pick the right symbol for something, or to decode an element you see in
an existing diagram. Source: the BPMN Quick Guide (Trisotech) cross-checked against BPMN 2.0.2.

**Contents**
1. The five element groups
2. Events (border/icon encoding, the full definition matrix, boundary events)
3. Activities (task types, markers, sub-process variants, call activity)
4. Gateways
5. Connecting objects
6. Swimlanes (pools, lanes, collaboration)
7. Data
8. Artifacts
9. Basic structural rules

---

## 1. The five element groups

| Group | Members |
|---|---|
| **Flow Objects** | Events, Activities, Gateways — the core behavioral nodes |
| **Connecting Objects** | Sequence Flow, Message Flow, Association, Data Association |
| **Swimlanes** | Pools, Lanes |
| **Data** | Data Object, Data Input, Data Output, Data Store, Collections, Message |
| **Artifacts** | Group, Text Annotation |

---

## 2. Events

**Events are circles.** The inner icon says *which* trigger/result; the **border style** says
*which kind* of event; the icon **fill** says catch vs throw.

Border encoding:
- **Single thin line** = Start event.
- **Single double line** = Intermediate / Boundary event (interrupting).
- **Single double _dashed_ line** = Non-interrupting intermediate/boundary event.
- **Thick (bold) single line** = End event.
- **Dashed single thin line** = Non-interrupting Start event (only inside an event sub-process).

Icon fill encoding:
- **Unfilled (outline) icon** = **catching** (waits for / reacts to a trigger).
- **Filled (solid black) icon** = **throwing** (produces / emits a result).

### 2.1 Event position × direction

| Position | Border | Catch/Throw | Notes |
|---|---|---|---|
| Start (top-level) | thin solid | catch only | begins a process; how instances are triggered |
| Start (event sub-process, interrupting) | thin **solid** | catch only | interrupts the enclosing sub-process |
| Start (event sub-process, non-interrupting) | thin **dashed** | catch only | runs in parallel; does not interrupt |
| Intermediate (in normal flow) | double solid | catch **or** throw | on the sequence-flow path |
| Intermediate (boundary, interrupting) | double **solid** | catch only | attached to an activity edge; interrupts it |
| Intermediate (boundary, non-interrupting) | double **dashed** | catch only | attached to edge; activity keeps running |
| End | thick solid | throw only | ends a path; the end state / result |

### 2.2 Event definitions (inner icon) and where each is valid

"S"=Start, "SE"=event-subprocess start, "IC"=Intermediate Catch, "IT"=Intermediate Throw,
"B"=Boundary, "E"=End.

| Definition | Icon | S | SE | IC | IT | B | E | Meaning |
|---|---|:--:|:--:|:--:|:--:|:--:|:--:|---|
| **None / Blank** | (empty) | ✔ | — | ✔ | ✔ | — | ✔ | Unspecified. Start = plain start; Intermediate = state marker; End = plain end. A start event inside an embedded sub-process **must** be None. |
| **Message** | envelope | ✔ | ✔ | ✔ catch | ✔ throw | ✔ | ✔ | Sending/receiving a message between participants (pools). |
| **Timer** | clock | ✔ | ✔ | ✔ | — | ✔ | — | A time/date, cycle, or delay. Catch-only (never throws). |
| **Conditional** | lined page | ✔ | ✔ | ✔ | — | ✔ | — | Fires when a business condition becomes true. Catch-only. |
| **Signal** | triangle | ✔ | ✔ | ✔ catch | ✔ throw | ✔ | ✔ | Broadcast — one throw, many catchers (not targeted like a message). |
| **Error** | jagged/lightning | — | ✔ int. only | — | — | ✔ int. only | ✔ throw | Named error. End throws it; boundary/event-subprocess start catches it. Always interrupting. |
| **Escalation** | up-arrow | — | ✔ | ✔ catch | ✔ throw | ✔ | ✔ | Hand a situation to a higher level. Non-interrupting boundary allowed. |
| **Cancel** | X | — | — | — | — | ✔ int. only | ✔ throw | **Transactions only**: boundary reacts to a cancel; End triggers it. |
| **Compensation** | rewind ◀◀ | — | ✔ int. | — | ✔ throw | ✔ catch | ✔ throw | Undo committed work. Boundary catch registers a handler; throw triggers it. |
| **Link** | arrow | — | — | ✔ catch | ✔ throw | — | — | Off-page connector: a paired throw/catch stitches two spots in the **same** process. |
| **Terminate** | filled circle | — | — | — | — | — | ✔ | Immediately ends **all** activity in the instance (no normal winding down). |
| **Multiple** | pentagon | ✔ | ✔ | ✔ catch | ✔ throw | ✔ | ✔ | Several triggers; **any one** fires (catch) / all thrown (throw). |
| **Parallel Multiple** | plus (+) | ✔ | ✔ | ✔ catch | — | ✔ | — | Several triggers; **all** must occur to fire. Catch-only. |

- **Top-level start** may be None / Message / Timer / Signal / Conditional / Multiple.
- **Embedded sub-process start** uses **only None**.
- **Event sub-process start** uses the interrupting (solid) / non-interrupting (dashed) triggers:
  Error, Escalation, Message, Timer, Signal, Conditional, Compensation.
- **End results:** None, Message, Signal, Escalation, Error, Compensation, Cancel (transaction only),
  Terminate, Multiple.

### 2.3 Boundary events (interrupting vs non-interrupting)

- A boundary event is an intermediate **catch** event attached to an activity's border.
- **Interrupting** (solid double circle): when it fires, the activity is aborted; flow continues out
  the boundary event's outgoing sequence flow.
- **Non-interrupting** (dashed double circle): fires while the activity keeps running, spawning a
  parallel path (e.g. a reminder timer, an escalation).
- Rules: a boundary event has **at most one outgoing** sequence flow and **no incoming** sequence flow.
- Valid definitions: Message, Timer, Conditional, Signal, Escalation, Error, Compensation,
  Cancel (transaction only), Multiple, Parallel Multiple. (Error and Cancel are always interrupting.)

---

## 3. Activities

An **activity** is a **rounded rectangle** — work performed. Three families: **Task** (atomic),
**Sub-Process** (compound), **Call Activity** (reusable reference).

### 3.1 Task types (icon in the top-left corner)

| Task type | Icon | Use when |
|---|---|---|
| **Abstract / Undefined** | none | Generic task; type not yet specified. Fine for descriptive models. |
| **User** | person | A human does the work with software support (worklist item). |
| **Manual** | hand | A human does the work with **no** system involvement. |
| **Service** | gears | Automated call to a system/service/API — no human. |
| **Send** | filled envelope | Sends a message to another participant/pool. |
| **Receive** | outline envelope | Waits for and receives a message from another participant. |
| **Business Rule** | table/grid | Executes a decision/business rule (e.g. DMN); externalizes logic. |
| **Script** | scroll | The engine runs an inline script. |

### 3.2 Activity markers (bottom-center of the shape)

| Marker | Symbol | Meaning |
|---|---|---|
| **Loop** | circular arrow | Repeat the activity while a condition holds. |
| **Multi-Instance parallel** | ‖‖‖ (vertical bars) | Multiple instances run **in parallel** (once per item). |
| **Multi-Instance sequential** | ☰ (horizontal bars) | Multiple instances run **one after another**. |
| **Compensation** | rewind ◀◀ | This activity is a compensation handler (undo). |
| **Sub-Process (collapsed)** | ⊞ (plus in box) | Hides an internal process. |
| **Ad-hoc** | ~ (tilde) | Contained activities have no fixed order. |

Markers can combine (e.g. a collapsed sub-process that is also multi-instance).

### 3.3 Sub-Process types

| Variant | Notation | Use |
|---|---|---|
| **Collapsed (embedded)** | rounded rect + ⊞ | Hides internals; the tool for splitting a process into **phases**. |
| **Expanded (embedded)** | large rounded rect showing child flow inline | Shows internals in-place. Its start event must be **None**. |
| **Event Sub-Process** | **dashed** border | Sits inside a parent, not connected by sequence flow. Triggered by its start event; handles events during the parent's run. |
| **Transaction** | **double-line** border | Activities that all succeed or are compensated/cancelled together. Pairs with Cancel boundary/end + compensation. |
| **Ad-hoc** | rounded rect + ~ | Contained tasks may run in any order, some, or repeatedly. |

### 3.4 Call Activity

- **Notation:** rounded rectangle with a **thick / bold border**.
- **Meaning:** references a reusable, globally-defined process or task (not inlined). Use to re-use
  logic across models. A call activity's name **may** duplicate another activity's (normal tasks
  should not).

---

## 4. Gateways

A **gateway is a diamond**; the inner marker says how flow is split/merged. Gateways **route** flow —
they do **not** perform work. See `correctness.md` §3 for exact token semantics and pairing rules.

| Gateway | Marker | Diverging (split) | Converging (merge) |
|---|---|---|---|
| **Exclusive (XOR)** | **X** or blank diamond | Takes **exactly one** path — first whose condition is true. Data-based. | Passes each token straight through (no wait). |
| **Inclusive (OR)** | **O** (circle) | Takes **one or more** paths — every branch whose condition is true. | Waits for all *activated* incoming branches, then continues once. |
| **Parallel (AND)** | **+** | Activates **all** paths (fork). No conditions. | Waits for **all** incoming (synchronize), then one token out. |
| **Event-Based** | pentagon in double circle | Waits; path decided by **which event happens first** (race). Each branch → a catch event / receive task. | (Merge form uncommon.) |
| **Complex** | **✱** (asterisk) | Custom routing the others can't express. | Custom sync ("wait for N of M"). |

Event-based variants: normal **Exclusive Event-Based** (first event wins, others cancelled);
**instantiating** event-based (first of several events *starts* a process); **Parallel Event-Based
instantiating** (process starts only after **all** events occur).

---

## 5. Connecting objects

| Connector | Notation | Connects | Rules |
|---|---|---|---|
| **Sequence Flow** | solid line, **filled** arrowhead | Events / Activities / Gateways within one pool | Order of execution. **Never crosses a sub-process or pool boundary.** |
| **— Conditional** | + small **diamond** at source | as above | Taken only if its condition is true (used on a task's outgoing flow). |
| **— Default** | + **slash** near source | out of a diverging XOR/OR/Complex gateway | Fallback when no other condition is true. Do **not** name it. |
| **Message Flow** | **dashed** line, hollow circle at start, open arrowhead | Two **different** pools | Communication between participants. **Never within the same pool.** |
| **Association** | **dotted** line | Artifacts / annotations ↔ any element | Attaches info. Un-, uni-, or bi-directional. |
| **Data Association** | dotted line, open arrowhead | Data objects/stores ↔ activities/events | Moves data in/out. Never sequence flow. |

Layout habit: horizontal Sequence Flows; **vertical** Data Associations and Message Flows.

---

## 6. Swimlanes

- **Pool** — a large rectangle = a **Participant** (organization, role, or system). Sequence flow
  **cannot cross** a pool boundary; participants communicate only via **Message Flow**.
- **Black-box Pool** — an empty pool: an external participant whose internals you don't model. Only
  message flows attach to it.
- **Lane** — a subdivision **within** a pool (role, department, system). Sequence flow **may** cross
  lane boundaries (still one pool). Name it with the role/category.
- **Collaboration** — two or more pools connected by message flows.
- Tip: don't wrap the single in-focus process inside its own pool unless you need to show pools —
  a pool-less single process is fine and cleaner.

---

## 7. Data

| Element | Notation | Meaning |
|---|---|---|
| **Data Object** | page with folded corner | Info an activity produces/consumes; one instance. May carry a `[State]`. |
| **Data Object Collection** | + ‖‖‖ at bottom | A collection of the data object. |
| **Data Input** | data object + **outline** arrow | Input required by the process/activity. |
| **Data Output** | data object + **filled** arrow | Output produced. |
| **Data Store** | **cylinder** | Persistent data outliving the instance (DB, filing). |
| **Message** | envelope | Content passed between participants. |

Data is wired with **Data Association** (dotted arrow), never sequence flow.

---

## 8. Artifacts

| Artifact | Notation | Meaning |
|---|---|---|
| **Group** | **dashed** rounded rectangle | Visual grouping for documentation. No effect on flow; can span lanes/pools. |
| **Text Annotation** | open bracket `[` + text | Free-text comment attached via an Association. |

---

## 9. Basic structural rules (verbatim essentials)

- Sequence Flows show order; **cannot cross Sub-Process boundaries**; **cannot cross Pool boundaries**.
- Message Flows show communication between Participants; **cannot connect objects within the same Pool**.
- Boundary Events have **at most one outgoing** Sequence Flow and **no incoming** Sequence Flow.
- A Start Event inside an embedded Sub-Process **must** be type None.
