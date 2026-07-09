import { describe, it, expect } from "vitest";
import { parseDatosLinksFromXml } from "./datosLinks";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Task_1" name="Recepción">
      <bpmn:dataInputAssociation id="DIA_1">
        <bpmn:sourceRef>DataObjectReference_1</bpmn:sourceRef>
      </bpmn:dataInputAssociation>
      <bpmn:dataOutputAssociation id="DOA_1">
        <bpmn:targetRef>DataStoreReference_1</bpmn:targetRef>
      </bpmn:dataOutputAssociation>
    </bpmn:task>
    <bpmn:dataObjectReference id="DataObjectReference_1" name="Formulario: Recepción" dataObjectRef="DataObject_1" />
    <bpmn:dataObject id="DataObject_1" />
    <bpmn:dataStoreReference id="DataStoreReference_1" name="Almacenamiento: Reparaciones" />
    <bpmn:task id="Task_2" name="Sin datos" />
  </bpmn:process>
</bpmn:definitions>`;

describe("parseDatosLinksFromXml", () => {
  it("returns the data object/store links for an activity that has associations", async () => {
    const links = await parseDatosLinksFromXml(XML);
    expect(links).toEqual([
      {
        elementId: "Task_1",
        dataObjects: [{ id: "DataObjectReference_1", name: "Formulario: Recepción" }],
        dataStores: [{ id: "DataStoreReference_1", name: "Almacenamiento: Reparaciones" }],
      },
    ]);
  });

  it("omits activities with no data associations", async () => {
    const links = await parseDatosLinksFromXml(XML);
    expect(links.find((l) => l.elementId === "Task_2")).toBeUndefined();
  });
});
