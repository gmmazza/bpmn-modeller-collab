import { describe, it, expect } from "vitest";
import { IDEA_STATES, isIdeaState, isActive, isClosed, requiresMotivo } from "./ideaState";

describe("ideaState", () => {
  it("lists the five states in order", () => {
    expect(IDEA_STATES).toEqual(["pendiente", "haciendo", "pausado", "hecho", "rechazado"]);
  });
  it("validates a state string", () => {
    expect(isIdeaState("haciendo")).toBe(true);
    expect(isIdeaState("nope")).toBe(false);
  });
  it("classifies active vs closed", () => {
    expect(["pendiente", "haciendo", "pausado"].every(isActive)).toBe(true);
    expect(["hecho", "rechazado"].every(isClosed)).toBe(true);
    expect(isActive("hecho")).toBe(false);
  });
  it("requires a motivo only for pausado and rechazado", () => {
    expect(requiresMotivo("pausado")).toBe(true);
    expect(requiresMotivo("rechazado")).toBe(true);
    expect(requiresMotivo("pendiente")).toBe(false);
    expect(requiresMotivo("hecho")).toBe(false);
  });
});
