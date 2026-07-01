import { describe, it, expect } from "vitest";
import { wikiCandidates } from "./wikiComplete";

const deps = {
  processes: ["ventas", "compras"],
  elements: [{ id: "Activity_1", name: "Validar factura" }, { id: "Gateway_2", name: "¿OK?" }],
  ideas: ["ocr-facturas"],
};

describe("wikiCandidates", () => {
  it("matches processes by substring (case-insensitive)", () => {
    expect(wikiCandidates("vent", deps).some((c) => c.insert === "ventas")).toBe(true);
  });
  it("matches element by name and inserts process#id form", () => {
    const c = wikiCandidates("valid", deps).find((x) => x.label.includes("Validar factura"));
    expect(c?.insert).toBe("Validar factura");
  });
  it("matches ideas with the idea: prefix", () => {
    expect(wikiCandidates("ocr", deps).some((c) => c.insert === "idea:ocr-facturas")).toBe(true);
  });
  it("returns all candidates for an empty query", () => {
    expect(wikiCandidates("", deps).length).toBe(5); // 2 processes + 2 elements + 1 idea
  });
});
