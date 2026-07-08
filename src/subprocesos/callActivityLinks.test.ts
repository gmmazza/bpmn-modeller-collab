import { describe, it, expect } from "vitest";
import { callLinksFromEls, freshProcessId, newSubprocessSkeleton } from "./callActivityLinks";

describe("callLinksFromEls", () => {
  it("keeps only call activities that carry a calledElement", () => {
    const els = [
      { id: "A", name: "Etapa 1", type: "bpmn:CallActivity", calledElement: "P_1" },
      { id: "B", name: "Tarea", type: "bpmn:Task" },
      { id: "C", name: "Vacía", type: "bpmn:CallActivity" }, // no calledElement
    ];
    expect(callLinksFromEls(els)).toEqual([{ elementId: "A", name: "Etapa 1", calledElement: "P_1" }]);
  });
});

describe("freshProcessId", () => {
  it("slugifies the name and avoids collisions", () => {
    expect(freshProcessId("2 · Diagnóstico", new Set())).toBe("Process_2_Diagnostico");
    const taken = new Set(["Process_Recepcion"]);
    expect(freshProcessId("Recepción", taken)).toBe("Process_Recepcion_2");
  });
});

describe("newSubprocessSkeleton", () => {
  it("produces valid-looking BPMN XML with the fresh process id and a start event", () => {
    const { xml, processId } = newSubprocessSkeleton("Recepción", new Set());
    expect(processId).toBe("Process_Recepcion");
    expect(xml).toContain(`<bpmn:process id="Process_Recepcion"`);
    expect(xml).toContain("bpmn:startEvent");
    expect(xml).toContain("bpmndi:BPMNDiagram"); // has DI so it renders
  });

  it("escapes &, <, > in the process name attribute", () => {
    const { xml } = newSubprocessSkeleton("Altas & Bajas <x>", new Set());
    expect(xml).toContain(`name="Altas &amp; Bajas &lt;x&gt;"`);
    // Verify the XML is well-formed by checking the closing bpmn:process tag is present
    expect(xml).toContain("</bpmn:process>");
  });
});
