# Writing .bpmn XML that renders in bpmn.io / Camunda

How to serialize a diagram to a `.bpmn` file that actually opens and renders. Read this whenever you
produce or edit a `.bpmn`. Two things dominate: (1) the file needs **both** a semantic layer and a DI
(diagram-interchange) layer, paired 1:1, or it renders as a **blank canvas**; and (2) standard element
sizes + left-to-right layout so it looks sane. Source: Camunda BPMN reference, bpmn.io / bpmn-js,
bpmn-moddle XSD, a real bpmn-io example file.

**Contents**
1. Two-layer architecture (the thing that breaks)
2. Namespaces (exact URIs)
3. Semantic layer building blocks
4. DI layer (coordinates)
5. Standard sizes & layout math
6. Authoring checklist

A complete, ready-to-copy skeleton lives at `../assets/skeleton.bpmn`. Start from it.

---

## 1. Two-layer architecture

A `.bpmn` is one `definitions` document with two parallel trees:

- **Semantic layer** — `bpmn:process` (+ `bpmn:collaboration` when there are pools). Nodes and their
  sequence/message flows. Element **IDs** here are the join key.
- **DI layer** — `bpmndi:BPMNDiagram` → `bpmndi:BPMNPlane` → many `bpmndi:BPMNShape` / `bpmndi:BPMNEdge`.
  The picture: x/y/width/height and waypoints.

Linked by the **`bpmnElement` attribute**: every `BPMNShape`/`BPMNEdge` has `bpmnElement="<semantic id>"`.
The `BPMNPlane` itself points at the **collaboration id** (multi-pool) or the **process id** (single pool).

**The invariant that must hold:** every visible flow node and every sequence/message flow needs a
matching DI entry. A semantic node with no `BPMNShape` is invisible; a `BPMNEdge` with no waypoints or a
`BPMNShape` with no `dc:Bounds` is invalid. IDs are unique across the whole document and referenced
verbatim — keep them stable when editing so the DI stays attached. **This 1:1 semantic↔DI pairing is the
single most common thing to get wrong.**

---

## 2. Namespaces (copy verbatim)

```
xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"    <- semantic model
xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"     <- BPMN diagram interchange
xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"           <- diagram common (Bounds, Point)
xmlns:di="http://www.omg.org/spec/DD/20100524/DI"           <- diagram interchange (waypoint)
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"       <- for xsi:type on expressions
xmlns:camunda="http://camunda.org/schema/1.0/bpmn"          <- OPTIONAL Camunda 7 extensions
```
- `dc:Bounds` comes from **DC**; `di:waypoint` from **DI**. Modern bpmn.io serializes edge points as
  `<di:waypoint x="" y="" />` (not `dc:Point`) — prefer that.
- `targetNamespace` on `definitions` is **required** (any URI, e.g. `http://bpmn.io/schema/bpmn`).
- Camunda 8 (Zeebe) uses `xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"`. Extensions are
  tool-specific and **optional** — a plain documentation diagram needs none.

---

## 3. Semantic layer building blocks

### definitions / process / collaboration
```xml
<bpmn:definitions ... id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="..." processRef="Process_1" />
    <!-- messageFlow lives here, between pools -->
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    ...
  </bpmn:process>
  <!-- one bpmndi:BPMNDiagram follows -->
</bpmn:definitions>
```
- `isExecutable="false"` for documentation diagrams. Use `true` only for an engine.
- **Sign your writes**: when you (an AI agent) create or modify a `.bpmn`, set the standard
  `exporter` attribute on `definitions` to `IA — <your agent name>` (e.g.
  `exporter="IA — Claude"`; plain `exporter="IA"` if you have no distinct name). The
  BPMN-compartida app reads it to attribute your version in its history panel; never use the
  app's own value (`BPMN compartida`), which marks human publishes from the app.
- A **single-pool** diagram may omit `collaboration`/`participant` and just have a `process`; then the
  `BPMNPlane` references the process id. Add a `participant` (pool) when you want a visible pool box or
  lanes, or when there are multiple pools.

### Pools and lanes
A **pool** = a `participant` → `process`. **Lanes** subdivide the process; each lists its members by ID
via **`flowNodeRef`** (flow nodes only, not sequence flows). Assign each node to exactly one lane.
```xml
<bpmn:process id="Process_1" isExecutable="false">
  <bpmn:laneSet id="LaneSet_1">
    <bpmn:lane id="Lane_a" name="Recepción">
      <bpmn:flowNodeRef>StartEvent_1</bpmn:flowNodeRef>
      <bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef>
    </bpmn:lane>
    <bpmn:lane id="Lane_b" name="Taller">
      <bpmn:flowNodeRef>Task_2</bpmn:flowNodeRef>
    </bpmn:lane>
  </bpmn:laneSet>
  <!-- flow nodes + sequence flows -->
</bpmn:process>
```
Each lane also needs its own `BPMNShape` (a horizontal band).

### Flow nodes
Child `<bpmn:incoming>`/`<bpmn:outgoing>` name the sequence-flow IDs (derivable, but bpmn-js writes them —
include for cleanliness).
```xml
<bpmn:startEvent id="StartEvent_1" name="Solicitud recibida">
  <bpmn:outgoing>Flow_1</bpmn:outgoing>
</bpmn:startEvent>

<bpmn:task id="Task_1" name="Registrar equipo">          <!-- or userTask/serviceTask/manualTask/
  <bpmn:incoming>Flow_1</bpmn:incoming>                        sendTask/receiveTask/scriptTask/
  <bpmn:outgoing>Flow_2</bpmn:outgoing>                        businessRuleTask -->
</bpmn:task>

<bpmn:exclusiveGateway id="Gateway_1" name="¿Aprobado?" default="Flow_no">
  <bpmn:incoming>Flow_2</bpmn:incoming>
  <bpmn:outgoing>Flow_si</bpmn:outgoing>
  <bpmn:outgoing>Flow_no</bpmn:outgoing>
</bpmn:exclusiveGateway>   <!-- also parallelGateway / inclusiveGateway / eventBasedGateway -->

<bpmn:endEvent id="End_1" name="Equipo entregado">
  <bpmn:incoming>Flow_x</bpmn:incoming>
</bpmn:endEvent>
```
An event's trigger is a child definition, e.g. `<bpmn:timerEventDefinition/>`,
`<bpmn:messageEventDefinition/>`, `<bpmn:errorEventDefinition errorRef="Error_1"/>`. A boundary event:
```xml
<bpmn:boundaryEvent id="Boundary_1" name="30 min" attachedToRef="Task_1" cancelActivity="true">
  <bpmn:outgoing>Flow_timeout</bpmn:outgoing>
  <bpmn:timerEventDefinition />
</bpmn:boundaryEvent>
```

### Sequence flow (and conditions)
```xml
<bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
<bpmn:sequenceFlow id="Flow_si" name="Sí" sourceRef="Gateway_1" targetRef="Task_reparar">
  <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${aprobado == true}</bpmn:conditionExpression>
</bpmn:sequenceFlow>
```
- `sourceRef`/`targetRef` must name existing node IDs.
- For documentation diagrams the flow `name` ("Sí"/"No") is what matters; `conditionExpression` only
  matters for engines. Mark the fallback with `default="Flow_no"` on the gateway.

### Message flow & data (quick map)
- **Message flow** lives in `collaboration`, connects across pools:
  `<bpmn:messageFlow id=".." sourceRef=".." targetRef=".." />` (dashed).
- **Data:** `bpmn:dataObjectReference`, `bpmn:dataStoreReference`, linked by `bpmn:association` — informational.

### Escalation end ↔ boundary pairing (subprocess outcomes)
An escalation is thrown by an **end event** carrying an `escalationEventDefinition escalationRef="…"`,
and caught by an **interrupting boundary event** on the calling Call Activity with the same definition.
They are matched by the **`escalationCode`** string on the referenced `<bpmn:escalation>` — **each file
declares its own** `<bpmn:escalation escalationCode="…">`; the code, not the id, is the join key across
files.
```xml
<!-- in the subprocess (throws) -->
<bpmn:endEvent id="ee_no" name="No cubre">
  <bpmn:incoming>f_no</bpmn:incoming>
  <bpmn:escalationEventDefinition escalationRef="Esc_no" />
</bpmn:endEvent>
<bpmn:escalation id="Esc_no" name="No cubre" escalationCode="proc_diagnostico__no_cubre" />

<!-- in the master (catches, on the Call Activity) -->
<bpmn:boundaryEvent id="be_dx" attachedToRef="ca_dx" cancelActivity="true">
  <bpmn:outgoing>f_nocubre</bpmn:outgoing>
  <bpmn:escalationEventDefinition escalationRef="Esc_m_nocubre" />
</bpmn:boundaryEvent>
<bpmn:escalation id="Esc_m_nocubre" name="No cubre" escalationCode="proc_diagnostico__no_cubre" />
```
This is the standard construct behind this app's subprocess contract — see `profile.md` §3.

### Data / tools anchors (standard, name-only)
To show that a step has a form or a store without any tool specifics in the `.bpmn`: a
`bpmn:dataObjectReference` (form) via `dataInputAssociation`, a `bpmn:dataStoreReference` (store) via
`dataOutputAssociation`. The reference carries **only a human name**; the JotForm/ClickUp URL or id
lives in the `<d>.datos.json` sidecar, **never in the XML** (`profile.md` §4).
```xml
<bpmn:dataObjectReference id="do_form" name="Formulario Recepción" dataObjectRef="DataObj_1" />
<bpmn:dataObject id="DataObj_1" />
<bpmn:userTask id="t_rec" name="Recepcionar motor">
  <bpmn:dataInputAssociation id="dia_1"><bpmn:sourceRef>do_form</bpmn:sourceRef></bpmn:dataInputAssociation>
</bpmn:userTask>
<bpmn:dataStoreReference id="ds_cu" name="Almacenamiento Reparaciones" />
```
Every data reference and boundary event also needs its own `BPMNShape`/`BPMNEdge` (§4).

### Camunda 7 extensions (optional)
`camunda:assignee`, `camunda:candidateGroups`, `camunda:formKey` on `userTask`; `camunda:class`,
`camunda:delegateExpression`, `camunda:topic` on `serviceTask`; `camunda:formData` inside
`<bpmn:extensionElements>`. Ignore unless the target engine needs them.

---

## 4. DI layer (coordinates that make it render)

```xml
<bpmndi:BPMNDiagram id="BPMNDiagram_1">
  <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1"><!-- or Process_1 -->
    <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true">
      <dc:Bounds x="130" y="80" width="720" height="260" />
    </bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Lane_a_di" bpmnElement="Lane_a" isHorizontal="true">
      <dc:Bounds x="160" y="80" width="690" height="130" />
    </bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
      <dc:Bounds x="290" y="100" width="100" height="80" />
    </bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
      <dc:Bounds x="202" y="122" width="36" height="36" />
      <bpmndi:BPMNLabel><dc:Bounds x="180" y="165" width="80" height="27" /></bpmndi:BPMNLabel>
    </bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
      <di:waypoint x="238" y="140" />
      <di:waypoint x="290" y="140" />
    </bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane>
</bpmndi:BPMNDiagram>
```
Rules:
- One `BPMNShape` per flow node **and** per pool/lane; one `BPMNEdge` per sequence/message flow.
- `dc:Bounds` = absolute canvas coordinates (origin top-left, x right, y down).
- A `BPMNEdge` needs **≥2** `di:waypoint`s (start + end); add mid-points for bends.
- `BPMNLabel` (optional) with `dc:Bounds` controls external label placement (events/gateways/flows put
  their text outside the shape).
- `isMarkerVisible="true"` on an exclusive-gateway shape draws the `X`.
- `isHorizontal="true"` on pool/lane shapes = swimlanes stacked vertically, flow left→right.

---

## 5. Standard sizes & layout math

Match bpmn-js defaults so hit-boxes and labels line up:

| Element | width × height |
|---|---|
| Task / activity / collapsed sub-process | **100 × 80** |
| Event (start/intermediate/end, all types) | **36 × 36** |
| Gateway (all types) | **50 × 50** |
| Pool (participant) | ~600×250+ (height = sum of lanes) |
| Lane | pool width − ~30 × per-lane height (~120+) |
| Data object reference | 36 × 50 |
| Text annotation | 100 × 30 |

Layout conventions:
- **Left-to-right** happy path along a horizontal spine; y centered in the node's lane.
- Leave ~50 px gaps between shapes (task at x=270 w=100 → next at ~x=420). Branches fan up/down then rejoin.
- **Lanes stack vertically**; each node's y must fall within its lane's band, and that node must be in
  that lane's `flowNodeRef`.
- **Vertical centering trick:** to align an event/gateway with a task row — task y=100 h=80 (center 140) →
  event y=122 h=36 (center 140); gateway y=115 h=50 (center 140).
- Waypoints attach at borders: exit the source's right edge (x = source.x + width, y = center), enter the
  target's left edge.

---

## 6. Authoring checklist

1. Emit the namespaces + `targetNamespace` on `definitions`.
2. Pools: none → just `process`, plane→process; one+ → `collaboration` + `participant`(s), plane→collaboration.
3. Lanes: `laneSet` with a `lane` per role; put every node's ID in exactly one `flowNodeRef`.
4. Each node: semantic element (+ incoming/outgoing) **and** a `BPMNShape` with the correct size.
5. Each connection: `sequenceFlow` (or `messageFlow` across pools) **and** a `BPMNEdge` with ≥2 waypoints.
6. Keep IDs unique and stable; never leave a semantic element without its DI counterpart.
7. Lay out left-to-right, nodes inside their lane's y-band, ~50px gaps.
8. Before delivering, re-scan: does every semantic id appear once as a shape/edge? (Catches the blank-render bug.)
