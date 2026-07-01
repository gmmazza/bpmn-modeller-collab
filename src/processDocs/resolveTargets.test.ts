import { describe, it, expect } from "vitest";
import { resolveCalledProcess, findEventCounterpart, type DiagramInfo } from "./resolveTargets";

const empty = { calls: [], events: [] };
const diagrams: DiagramInfo[] = [
  { file: "ventas.bpmn", processId: "Process_Ventas", baseName: "ventas", refs: { calls: [], events: [{ elementId: "S", elementName: "r", kind: "message", direction: "catch", refName: "Pedido" }] } },
  { file: "sub/compras.bpmn", processId: "Process_Compras", baseName: "compras", refs: empty },
];

describe("resolveTargets", () => {
  it("resolves calledElement by process id", () => {
    expect(resolveCalledProcess("Process_Ventas", diagrams)).toBe("ventas.bpmn");
  });
  it("falls back to base name", () => {
    expect(resolveCalledProcess("compras", diagrams)).toBe("sub/compras.bpmn");
  });
  it("returns null when nothing matches", () => {
    expect(resolveCalledProcess("Nope", diagrams)).toBeNull();
  });
  it("finds a message catch counterpart in another file for a throw", () => {
    const source = { elementId: "E", elementName: "x", kind: "message" as const, direction: "throw" as const, refName: "Pedido" };
    expect(findEventCounterpart(source, "otro.bpmn", diagrams)).toBe("ventas.bpmn");
  });
  it("does not match the counterpart in the same file", () => {
    const source = { elementId: "E", elementName: "x", kind: "message" as const, direction: "throw" as const, refName: "Pedido" };
    expect(findEventCounterpart(source, "ventas.bpmn", diagrams)).toBeNull();
  });
});
