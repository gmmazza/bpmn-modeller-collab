import { describe, it, expect } from "vitest";
import { parseIdeaNote, serializeIdeaNote, type IdeaNote } from "./ideaNote";

const SAMPLE = `---
id: idea-3
estado: haciendo
ancla: Activity_1
ancla-nombre: Validar factura
autor: Ana
fecha: 2026-07-01
motivo:
mejora: mejora-2
---
Avisar por mail si tarda +2 días.

## Comentarios
- Beto, 2026-07-02: y en el dashboard`;

describe("ideaNote", () => {
  it("parses an idea note into structured fields", () => {
    const n = parseIdeaNote(SAMPLE);
    expect(n.id).toBe("idea-3");
    expect(n.estado).toBe("haciendo");
    expect(n.anchor).toBe("Activity_1");
    expect(n.anchorLabel).toBe("Validar factura");
    expect(n.autor).toBe("Ana");
    expect(n.mejora).toBe("mejora-2");
    expect(n.description).toBe("Avisar por mail si tarda +2 días.");
    expect(n.comments).toEqual([{ author: "Beto", date: "2026-07-02", text: "y en el dashboard" }]);
  });

  it("maps ancla 'general' to a null anchor", () => {
    const n = parseIdeaNote("---\nid: idea-1\nestado: pendiente\nancla: general\nautor: Ana\nfecha: 2026-07-01\n---\nuna idea general");
    expect(n.anchor).toBeNull();
    expect(n.anchorLabel).toBe("");
  });

  it("defaults an unknown estado to pendiente", () => {
    const n = parseIdeaNote("---\nid: idea-1\nestado: raro\nancla: general\nautor: A\nfecha: 2026-07-01\n---\nx");
    expect(n.estado).toBe("pendiente");
  });

  it("round-trips through serialize", () => {
    const n = parseIdeaNote(SAMPLE);
    expect(parseIdeaNote(serializeIdeaNote(n))).toEqual(n);
  });

  it("writes ancla 'general' and omits empty motivo/mejora values as blank", () => {
    const n: IdeaNote = { id: "idea-1", estado: "pendiente", anchor: null, anchorLabel: "", autor: "Ana", fecha: "2026-07-01", motivo: "", mejora: "", description: "x", comments: [] };
    const md = serializeIdeaNote(n);
    expect(md).toContain("ancla: general");
    expect(md).toContain("estado: pendiente");
  });
});
