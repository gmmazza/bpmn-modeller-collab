import { describe, it, expect } from "vitest";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter";

describe("frontmatter", () => {
  it("parses a frontmatter block and body", () => {
    const text = "---\nelement: Activity_1\nname: Validar factura\n---\nCuerpo libre\ncon dos líneas";
    const { meta, body } = parseFrontmatter(text);
    expect(meta).toEqual({ element: "Activity_1", name: "Validar factura" });
    expect(body).toBe("Cuerpo libre\ncon dos líneas");
  });

  it("returns empty meta and full text as body when there is no frontmatter", () => {
    const { meta, body } = parseFrontmatter("solo cuerpo");
    expect(meta).toEqual({});
    expect(body).toBe("solo cuerpo");
  });

  it("round-trips through serialize", () => {
    const out = serializeFrontmatter({ element: "Gateway_1", type: "bpmn:ExclusiveGateway" }, "texto");
    expect(out).toBe("---\nelement: Gateway_1\ntype: bpmn:ExclusiveGateway\n---\ntexto");
    expect(parseFrontmatter(out).meta).toEqual({ element: "Gateway_1", type: "bpmn:ExclusiveGateway" });
  });

  it("treats a malformed frontmatter (no closing fence) as plain body", () => {
    const text = "---\nelement: X\nsin cierre";
    const { meta, body } = parseFrontmatter(text);
    expect(meta).toEqual({});
    expect(body).toBe(text);
  });
});
