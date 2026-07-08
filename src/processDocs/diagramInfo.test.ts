import { describe, it, expect } from "vitest";
import { parseDiagramInfo, parseCallLinks } from "./diagramInfo";

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

describe("parseCallLinks", () => {
  it("returns the raw elements, including the call activity's calledElement", async () => {
    const els = await parseCallLinks(XML);
    const callActivity = els.find((e) => e.id === "CA_1");
    expect(callActivity).toEqual({ id: "CA_1", name: "Facturar", type: "bpmn:CallActivity", calledElement: "Process_Factura" });
  });
});
