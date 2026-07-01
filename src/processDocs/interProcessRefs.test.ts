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
