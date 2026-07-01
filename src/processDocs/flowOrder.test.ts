import { describe, it, expect } from "vitest";
import { orderFlow, type FlowGraph } from "./flowOrder";

describe("orderFlow", () => {
  it("orders a simple linear flow from the start", () => {
    const g: FlowGraph = {
      nodes: [{ id: "S", name: "inicio", type: "bpmn:StartEvent" }, { id: "A", name: "a", type: "bpmn:Task" }, { id: "E", name: "fin", type: "bpmn:EndEvent" }],
      edges: [{ source: "S", target: "A" }, { source: "A", target: "E" }],
      starts: ["S"],
    };
    expect(orderFlow(g)).toEqual(["S", "A", "E"]);
  });

  it("follows gateway branches depth-first in edge order", () => {
    const g: FlowGraph = {
      nodes: ["S", "G", "A", "B", "E"].map((id) => ({ id, name: id, type: "bpmn:Task" })),
      edges: [
        { source: "S", target: "G" }, { source: "G", target: "A" }, { source: "G", target: "B" },
        { source: "A", target: "E" }, { source: "B", target: "E" },
      ],
      starts: ["S"],
    };
    expect(orderFlow(g)).toEqual(["S", "G", "A", "E", "B"]);
  });

  it("appends unreachable nodes at the end and does not loop", () => {
    const g: FlowGraph = {
      nodes: ["S", "A", "X"].map((id) => ({ id, name: id, type: "bpmn:Task" })),
      edges: [{ source: "S", target: "A" }, { source: "A", target: "S" }], // loop S->A->S
      starts: ["S"],
    };
    expect(orderFlow(g)).toEqual(["S", "A", "X"]); // X unreachable, appended; no infinite loop
  });
});
