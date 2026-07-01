import { describe, it, expect } from "vitest";
import { parseIdeas, serializeIdeas, addIdea, toggleIdea, anchoredCounts } from "./ideasModel";

const SAMPLE = `# Ideas sueltas — Validación

- [ ] (Activity_1 · Validar factura) avisar por mail si tarda — Ana, 2026-06-30
- [x] (general) automatizar OCR — Beto, 2026-06-29
`;

describe("ideasModel", () => {
  it("parses anchored and general ideas with done flags", () => {
    const ideas = parseIdeas(SAMPLE);
    expect(ideas).toHaveLength(2);
    expect(ideas[0]).toEqual({ done: false, anchor: "Activity_1", anchorLabel: "Validar factura", text: "avisar por mail si tarda", author: "Ana", date: "2026-06-30" });
    expect(ideas[1]).toEqual({ done: true, anchor: null, anchorLabel: "", text: "automatizar OCR", author: "Beto", date: "2026-06-29" });
  });

  it("round-trips through serialize", () => {
    const ideas = parseIdeas(SAMPLE);
    const out = serializeIdeas("Validación", ideas);
    expect(parseIdeas(out)).toEqual(ideas);
    expect(out).toContain("# Ideas sueltas — Validación");
  });

  it("adds an idea and toggles done", () => {
    let ideas: Idea[] = [];
    ideas = addIdea(ideas, { done: false, anchor: "G_1", anchorLabel: "¿OK?", text: "falta caso duplicado", author: "Ana", date: "2026-07-01" });
    expect(ideas).toHaveLength(1);
    ideas = toggleIdea(ideas, 0);
    expect(ideas[0].done).toBe(true);
  });

  it("counts only pending ideas per anchored element", () => {
    const ideas = [
      { done: false, anchor: "A", anchorLabel: "x", text: "a", author: "u", date: "d" },
      { done: false, anchor: "A", anchorLabel: "x", text: "b", author: "u", date: "d" },
      { done: true, anchor: "A", anchorLabel: "x", text: "c", author: "u", date: "d" },
      { done: false, anchor: null, anchorLabel: "", text: "d", author: "u", date: "d" },
    ];
    expect(anchoredCounts(ideas)).toEqual([{ elementId: "A", count: 2 }]);
  });
});
import type { Idea } from "./ideasModel";
