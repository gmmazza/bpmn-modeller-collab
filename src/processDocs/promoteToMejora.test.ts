import { describe, it, expect } from "vitest";
import { buildMejora } from "./promoteToMejora";
import type { IdeaNote } from "./ideaNote";

const idea: IdeaNote = {
  id: "idea-3", estado: "haciendo", anchor: "Activity_1", anchorLabel: "Validar", autor: "Ana",
  fecha: "2026-07-01", motivo: "", mejora: "", description: "avisar por mail", comments: [{ author: "Beto", date: "2026-07-02", text: "sí" }],
};

describe("buildMejora", () => {
  it("creates a mejora from the idea and links both ways", () => {
    const { mejora, idea: updated } = buildMejora(idea, "mejora-2", "2026-07-03");
    expect(mejora).toEqual({
      id: "mejora-2", desdeIdea: "idea-3", estado: "propuesta", anchor: "Activity_1", anchorLabel: "Validar",
      autor: "Ana", fecha: "2026-07-03", description: "avisar por mail", comments: [],
    });
    expect(updated.mejora).toBe("mejora-2");
    expect(updated).not.toBe(idea); // immutable
    expect(idea.mejora).toBe(""); // original untouched
  });
});
