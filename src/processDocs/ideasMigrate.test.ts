import { describe, it, expect } from "vitest";
import { migrateV1ToNotes } from "./ideasMigrate";

const V1 = `# Ideas sueltas — P

- [ ] (Activity_1 · Validar factura) avisar por mail — Ana, 2026-06-30
- [x] (general) automatizar OCR — Beto, 2026-06-29
`;

describe("migrateV1ToNotes", () => {
  it("converts each v1 line into an idea note record", () => {
    const notes = migrateV1ToNotes(V1);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ id: "idea-1", estado: "pendiente", anchor: "Activity_1", anchorLabel: "Validar factura", autor: "Ana", fecha: "2026-06-30", description: "avisar por mail" });
    expect(notes[1]).toMatchObject({ id: "idea-2", estado: "hecho", anchor: null, autor: "Beto", description: "automatizar OCR" });
    expect(notes[0].comments).toEqual([]);
    expect(notes[0].motivo).toBe("");
  });

  it("returns an empty list for an empty/no-ideas file", () => {
    expect(migrateV1ToNotes("# Ideas sueltas — P\n\n")).toEqual([]);
  });
});
