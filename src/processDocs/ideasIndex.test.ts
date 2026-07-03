import { describe, it, expect } from "vitest";
import { buildIdeasIndex } from "./ideasIndex";
import type { IdeaNote } from "./ideaNote";

function idea(p: Partial<IdeaNote>): IdeaNote {
  return { id: "idea-1", estado: "pendiente", anchor: null, anchorLabel: "", autor: "A", fecha: "2026-07-01", motivo: "", mejora: "", description: "texto", comments: [], ...p };
}

describe("buildIdeasIndex", () => {
  it("lists every idea regardless of state, with frontmatter and a table", () => {
    const md = buildIdeasIndex("x.bpmn", "Validación", [
      idea({ id: "idea-3", estado: "haciendo", anchor: "Activity_1", anchorLabel: "Validar factura", autor: "Ana", description: "Avisar por mail" }),
      idea({ id: "idea-4", estado: "rechazado", motivo: "fuera de alcance", autor: "Ana", description: "Migrar de motor" }),
      idea({ id: "idea-5", estado: "hecho", mejora: "mejora-2", anchor: "G_1", anchorLabel: "¿OK?", description: "Falta duplicada" }),
    ]);
    expect(md).toContain("diagram: x.bpmn");
    expect(md).toContain("# Ideas — Validación");
    expect(md).toContain("| Avisar por mail | haciendo | Validar factura | Ana | [idea-3](ideas/idea-3.md) |");
    expect(md).toContain("fuera de alcance"); // rejected motivo shown
    expect(md).toContain("[mejora-2](mejoras/mejora-2.md)"); // promoted link shown
  });

  it("shows 'general' for unanchored ideas and escapes pipes", () => {
    const md = buildIdeasIndex("x.bpmn", "P", [idea({ description: "a | b" })]);
    expect(md).toContain("| general |");
    expect(md).toContain("a \\| b");
  });
});
