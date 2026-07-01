import { describe, it, expect } from "vitest";
import { parseWikilinkTarget } from "./wikilinks";

describe("parseWikilinkTarget", () => {
  it("parses an idea ref", () => {
    expect(parseWikilinkTarget("idea:abc")).toEqual({ kind: "idea", ref: "abc" });
  });
  it("parses process#element into an element target", () => {
    expect(parseWikilinkTarget("mi-proceso#Activity_1")).toEqual({ kind: "element", process: "mi-proceso", element: "Activity_1" });
  });
  it("treats a plain token as bare (resolved later against processes/elements)", () => {
    expect(parseWikilinkTarget("Validar factura")).toEqual({ kind: "bare", text: "Validar factura" });
  });
  it("trims surrounding whitespace", () => {
    expect(parseWikilinkTarget("  idea:x  ")).toEqual({ kind: "idea", ref: "x" });
  });
});
