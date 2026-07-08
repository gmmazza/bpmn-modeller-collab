import { describe, it, expect } from "vitest";
import { classifyLinks } from "./linkStatus";

const reg = {
  resolve: (id: string) => (id === "P_ok" ? { file: "ok.bpmn" } : null),
  ambiguities: () => ["P_dup"],
};

describe("classifyLinks", () => {
  it("classifies resolved, unresolved and ambiguous links", () => {
    const links = [
      { elementId: "A", name: "", calledElement: "P_ok" },
      { elementId: "B", name: "", calledElement: "P_missing" },
      { elementId: "C", name: "", calledElement: "P_dup" },
    ];
    expect(classifyLinks(links, reg)).toEqual([
      { elementId: "A", state: "resolved", file: "ok.bpmn", calledElement: "P_ok" },
      { elementId: "B", state: "unresolved", calledElement: "P_missing" },
      { elementId: "C", state: "ambiguous", calledElement: "P_dup" },
    ]);
  });
});
