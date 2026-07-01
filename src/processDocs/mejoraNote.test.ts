import { describe, it, expect } from "vitest";
import { parseMejoraNote, serializeMejoraNote } from "./mejoraNote";

const SAMPLE = `---
id: mejora-2
desde-idea: idea-3
estado: propuesta
ancla: Activity_1
ancla-nombre: Validar factura
autor: Ana
fecha: 2026-07-02
---
Aviso por mail con SLA configurable.

## Comentarios
- Beto, 2026-07-03: +1`;

describe("mejoraNote", () => {
  it("parses a mejora note", () => {
    const n = parseMejoraNote(SAMPLE);
    expect(n.id).toBe("mejora-2");
    expect(n.desdeIdea).toBe("idea-3");
    expect(n.estado).toBe("propuesta");
    expect(n.anchor).toBe("Activity_1");
    expect(n.description).toBe("Aviso por mail con SLA configurable.");
    expect(n.comments).toEqual([{ author: "Beto", date: "2026-07-03", text: "+1" }]);
  });

  it("defaults an unknown estado to propuesta", () => {
    const n = parseMejoraNote("---\nid: mejora-1\ndesde-idea: idea-1\nestado: raro\nancla: general\nautor: A\nfecha: 2026-07-02\n---\nx");
    expect(n.estado).toBe("propuesta");
    expect(n.anchor).toBeNull();
  });

  it("round-trips", () => {
    const n = parseMejoraNote(SAMPLE);
    expect(parseMejoraNote(serializeMejoraNote(n))).toEqual(n);
  });
});
