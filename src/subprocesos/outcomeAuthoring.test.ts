import {
  markEndAsEscalation,
  revertEscalationToNormal,
  addEscalationBoundary,
  removeEscalationBoundary,
} from "./outcomeAuthoring";

// A real BpmnModeler cannot boot in happy-dom (rendering path OOMs — see task-6 report),
// so we fake only the thin modeler.get(service) surface and back it with a REAL
// bpmn-moddle: bpmnFactory.create IS moddle.create, and modeling.updateProperties sets
// props on el.businessObject, so the transform's real logic runs against real moddle
// objects. The canvas/DI side (shape geometry) is faked and is covered by the Task 10 e2e.
const SUB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="x">
  <bpmn:process id="proc_rep_3" isExecutable="false">
    <bpmn:startEvent id="S1"><bpmn:outgoing>f1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:endEvent id="E_dev" name="Devuelto sin reparar"><bpmn:incoming>f1</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="f1" sourceRef="S1" targetRef="E_dev"/>
  </bpmn:process>
</bpmn:definitions>`;

const MASTER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d2" targetNamespace="x">
  <bpmn:process id="proc_mapa" isExecutable="false">
    <bpmn:callActivity id="s3" name="Presupuesto" calledElement="proc_rep_3"/>
    <bpmn:callActivity id="s4" name="Reparación" calledElement="proc_rep_4"/>
    <bpmn:endEvent id="end_norep" name="Devuelto sin reparar"/>
  </bpmn:process>
</bpmn:definitions>`;

async function fakeModeler(xml: string): Promise<any> {
  // @ts-expect-error no type declarations published (same import as diagramInfo.ts)
  const { BpmnModdle } = await import("bpmn-moddle");
  const moddle: any = new BpmnModdle();
  const { rootElement: definitions } = await moddle.fromXML(xml);
  const process = definitions.rootElements.find((r: any) => (r.$type ?? "").endsWith("Process"));
  const byId = new Map<string, any>();
  const register = (fe: any): any => {
    // Give every element a nominal geometry box (createShape reads x/y/width/height).
    const el: any = { id: fe.id, type: fe.$type, businessObject: fe, x: 100, y: 100, width: 100, height: 80 };
    byId.set(fe.id, el);
    return el;
  };
  for (const fe of process.flowElements ?? []) register(fe);

  const services: Record<string, any> = {
    bpmnFactory: { create: (t: string, a: any) => moddle.create(t, a) },
    modeling: {
      updateProperties: (el: any, props: any) => Object.assign(el.businessObject, props),
      createShape: (shape: any, _pos: any, _parent: any) => {
        (process.flowElements ??= []).push(shape.businessObject);
        byId.set(shape.id, shape);
        return shape;
      },
      connect: (a: any, b: any) => {
        const flow = moddle.create("bpmn:SequenceFlow", {
          id: `flow_${a.id}_${b.id}`, sourceRef: a.businessObject, targetRef: b.businessObject,
        });
        (process.flowElements ??= []).push(flow);
        const el = { id: flow.id, type: flow.$type, businessObject: flow };
        byId.set(flow.id, el);
        return el;
      },
      removeShape: (el: any) => {
        process.flowElements = (process.flowElements ?? []).filter((fe: any) => fe.id !== el.businessObject.id);
        byId.delete(el.id);
      },
    },
    elementFactory: {
      createShape: (attrs: any) => {
        // Real bpmn-js assigns a fresh id to BOTH the shape and its businessObject.
        const id = attrs.businessObject.id ?? `BoundaryEvent_${byId.size}`;
        attrs.businessObject.id = id;
        return { id, type: attrs.type, businessObject: attrs.businessObject, x: 100, y: 100, width: 100, height: 80 };
      },
    },
    elementRegistry: {
      get: (id: string) => byId.get(id),
      filter: (fn: any) => [...byId.values()].filter(fn),
    },
    getDefinitions: () => definitions,
  };
  return {
    get: (n: string) => services[n],
    getDefinitions: () => definitions,
    __moddle: moddle,
    __definitions: definitions,
  };
}

describe("markEndAsEscalation / revert (subprocess side)", () => {
  it("declares an escalation root element, sets it on the end, and reverts cleanly", async () => {
    const modeler = await fakeModeler(SUB_XML);
    const end = modeler.get("elementRegistry").get("E_dev");
    const code = markEndAsEscalation(modeler, end, { processId: "proc_rep_3", outcomeName: "Devuelto sin reparar" });
    expect(code).toBe("proc_rep_3__devuelto_sin_reparar");

    // Real moddle object graph: escalation is a root element with the code, end BO points at it.
    const defs = modeler.__definitions;
    const esc = defs.rootElements.find((r: any) => (r.$type ?? "").endsWith("Escalation"));
    expect(esc).toBeTruthy();
    expect(esc.id).toBe("Escalation_proc_rep_3__devuelto_sin_reparar");
    expect(esc.escalationCode).toBe("proc_rep_3__devuelto_sin_reparar");
    expect(end.businessObject.eventDefinitions[0].escalationRef).toBe(esc);

    const { xml } = await modeler.__moddle.toXML(defs, { format: true });
    expect(xml).toContain('escalationCode="proc_rep_3__devuelto_sin_reparar"');
    expect(xml).toMatch(/escalationEventDefinition/i);

    revertEscalationToNormal(modeler, end);
    expect(end.businessObject.eventDefinitions).toEqual([]);
    const { xml: xml2 } = await modeler.__moddle.toXML(defs, { format: true });
    expect(xml2).not.toMatch(/escalationEventDefinition/i);
  });

  it("reuses an existing escalation with the same code instead of declaring a duplicate", async () => {
    const modeler = await fakeModeler(SUB_XML);
    const end = modeler.get("elementRegistry").get("E_dev");
    markEndAsEscalation(modeler, end, { processId: "proc_rep_3", outcomeName: "Devuelto sin reparar" });
    markEndAsEscalation(modeler, end, { processId: "proc_rep_3", outcomeName: "Devuelto sin reparar" });
    const escalations = modeler.__definitions.rootElements.filter((r: any) => (r.$type ?? "").endsWith("Escalation"));
    expect(escalations).toHaveLength(1);
  });
});

describe("addEscalationBoundary / removeEscalationBoundary (master side)", () => {
  const code = "proc_rep_3__devuelto_sin_reparar";

  it("attaches an interrupting boundary wired to the destination, then removes it by code", async () => {
    const modeler = await fakeModeler(MASTER_XML);
    const callActivity = modeler.get("elementRegistry").get("s3");
    const boundaryId = addEscalationBoundary(modeler, {
      callActivityId: "s3", escalationCode: code, outcomeName: "Devuelto sin reparar", destinationId: "end_norep",
    });
    expect(boundaryId).toBeTruthy();

    const defs = modeler.__definitions;
    // Escalation declared on the master too.
    const esc = defs.rootElements.find((r: any) => (r.$type ?? "").endsWith("Escalation") && r.escalationCode === code);
    expect(esc).toBeTruthy();
    // A BoundaryEvent BO exists: interrupting, attached to the call activity, escalation ref by code.
    const boundary = modeler.get("elementRegistry").get(boundaryId).businessObject;
    expect((boundary.$type ?? "").endsWith("BoundaryEvent")).toBe(true);
    expect(boundary.cancelActivity).toBe(true);
    expect(boundary.attachedToRef).toBe(callActivity.businessObject);
    expect(boundary.eventDefinitions[0].escalationRef).toBe(esc);
    // A sequence flow to the destination was created.
    const process = defs.rootElements.find((r: any) => (r.$type ?? "").endsWith("Process"));
    const flow = process.flowElements.find(
      (fe: any) => (fe.$type ?? "").endsWith("SequenceFlow") && fe.targetRef?.id === "end_norep",
    );
    expect(flow).toBeTruthy();
    expect(flow.sourceRef.id).toBe(boundaryId);

    removeEscalationBoundary(modeler, code);
    expect(modeler.get("elementRegistry").get(boundaryId)).toBeUndefined();
    const stillThere = process.flowElements.find((fe: any) => (fe.$type ?? "").endsWith("BoundaryEvent"));
    expect(stillThere).toBeUndefined();
  });

  it("reuses an existing escalation with the same code across two boundary attachments", async () => {
    const modeler = await fakeModeler(MASTER_XML);
    addEscalationBoundary(modeler, {
      callActivityId: "s3", escalationCode: code, outcomeName: "Devuelto sin reparar", destinationId: "end_norep",
    });
    addEscalationBoundary(modeler, {
      callActivityId: "s4", escalationCode: code, outcomeName: "Devuelto sin reparar", destinationId: "end_norep",
    });
    const escalations = modeler.__definitions.rootElements.filter(
      (r: any) => (r.$type ?? "").endsWith("Escalation") && r.escalationCode === code,
    );
    expect(escalations).toHaveLength(1);
  });
});
