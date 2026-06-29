import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { resolveWithinRoot } = require("./pathGuard.cjs");

describe("resolveWithinRoot", () => {
  it("allows the root itself (rel = '')", () => {
    expect(resolveWithinRoot("/data", "")).toBe(path.resolve("/data"));
  });
  it("allows a nested relative path", () => {
    const p = resolveWithinRoot("/data", "a/b.bpmn");
    expect(p).toContain("b.bpmn");
  });
  it("allows a nested history path", () => {
    expect(() => resolveWithinRoot("/data", ".history/x/1.bpmn")).not.toThrow();
  });
  it("rejects a parent escape", () => {
    expect(() => resolveWithinRoot("/data", "../secret")).toThrow();
  });
  it("rejects an absolute path outside root", () => {
    expect(() => resolveWithinRoot("/data", "/etc/passwd")).toThrow();
  });
});
