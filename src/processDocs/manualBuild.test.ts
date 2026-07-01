import { describe, it, expect } from "vitest";
import { buildManualMarkdown, friendlyType } from "./manualBuild";

describe("manualBuild", () => {
  it("maps bpmn types to friendly labels", () => {
    expect(friendlyType("bpmn:Task")).toBe("Tarea");
    expect(friendlyType("bpmn:ExclusiveGateway")).toBe("Compuerta");
    expect(friendlyType("bpmn:StartEvent")).toBe("Evento");
    expect(friendlyType("bpmn:CallActivity")).toBe("Subproceso");
  });

  it("builds a manual with intro and one section per step", () => {
    const md = buildManualMarkdown("Validación", "Este proceso valida facturas.", [
      { name: "Validar factura", type: "bpmn:Task", note: "Revisar el PDF." },
      { name: "¿OK?", type: "bpmn:ExclusiveGateway", note: null },
    ]);
    expect(md).toContain("# Manual: Validación");
    expect(md).toContain("Este proceso valida facturas.");
    expect(md).toContain("## 1. Validar factura");
    expect(md).toContain("Revisar el PDF.");
    expect(md).toContain("## 2. ¿OK?");
    expect(md).toContain("_Sin documentar._");
  });

  it("uses a placeholder name for unnamed steps", () => {
    const md = buildManualMarkdown("P", null, [{ name: "", type: "bpmn:Task", note: null }]);
    expect(md).toContain("## 1. (sin nombre)");
  });
});
