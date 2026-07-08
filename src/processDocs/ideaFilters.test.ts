import { describe, it, expect } from "vitest";
import { filterIdeas, activeAnchoredCounts, type EstadoFilter, type ScopeFilter } from "./ideaFilters";
import type { IdeaNote } from "./ideaNote";

function n(p: Partial<IdeaNote>): IdeaNote {
  return { id: "idea-1", estado: "pendiente", anchor: null, anchorLabel: "", autor: "A", fecha: "2026-07-01", motivo: "", mejora: "", fuente: null, description: "x", comments: [], ...p };
}
const ideas = [
  n({ id: "idea-1", estado: "pendiente", anchor: "A" }),
  n({ id: "idea-2", estado: "haciendo", anchor: null }),
  n({ id: "idea-3", estado: "rechazado", anchor: "A" }),
  n({ id: "idea-4", estado: "hecho", anchor: "B" }),
];

function f(estado: EstadoFilter, scope: ScopeFilter) { return filterIdeas(ideas, { estado, scope }).map((i) => i.id); }

describe("filterIdeas", () => {
  it("filters by concrete state", () => { expect(f("pendiente", "todas")).toEqual(["idea-1"]); });
  it("filters by 'activas' and 'cerradas' groups", () => {
    expect(f("activas", "todas")).toEqual(["idea-1", "idea-2"]);
    expect(f("cerradas", "todas")).toEqual(["idea-3", "idea-4"]);
  });
  it("'todas' returns everything", () => { expect(f("todas", "todas")).toHaveLength(4); });
  it("filters by scope", () => {
    expect(f("todas", "generales")).toEqual(["idea-2"]);
    expect(f("todas", "ancladas")).toEqual(["idea-1", "idea-3", "idea-4"]);
  });
  it("combines state and scope", () => { expect(f("activas", "ancladas")).toEqual(["idea-1"]); });
});

describe("activeAnchoredCounts", () => {
  it("counts only active anchored ideas per element", () => {
    expect(activeAnchoredCounts(ideas)).toEqual([{ elementId: "A", count: 1 }]); // idea-1; idea-3 rechazado excluded, idea-4 hecho excluded
  });
});
