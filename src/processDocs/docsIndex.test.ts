import { describe, it, expect } from "vitest";
import { buildIndexMarkdown } from "./docsIndex";

describe("buildIndexMarkdown", () => {
  it("renders frontmatter, a heading and a row per element", () => {
    const md = buildIndexMarkdown("x.bpmn", "Validación de facturas", [
      { id: "Start_1", name: "Factura recibida", type: "bpmn:StartEvent", hasNote: false },
      { id: "Activity_1", name: "Validar factura", type: "bpmn:Task", hasNote: true },
    ]);
    expect(md).toContain("diagram: x.bpmn");
    expect(md).toContain("generated-by: BPMN compartida");
    expect(md).toContain("# Índice del proceso: Validación de facturas");
    expect(md).toContain("| Factura recibida | bpmn:StartEvent | _(sin nota)_ |");
    expect(md).toContain("| Validar factura | bpmn:Task | [Activity_1.md](Activity_1.md) |");
  });

  it("escapes pipe characters in element names", () => {
    const md = buildIndexMarkdown("x.bpmn", "P", [
      { id: "A", name: "a | b", type: "bpmn:Task", hasNote: false },
    ]);
    expect(md).toContain("a \\| b");
  });
});
