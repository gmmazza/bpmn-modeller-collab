import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
// The generated config is committed; import it and confirm rules were packed.
// It is an ES module (bpmnlint-pack-config -t es): `export { config, bundle as
// default, moddleExtensions, resolver }`, so the default import is the bundle
// = { resolver, config, moddleExtensions }.
import packed from "./bpmnlintConfig.js";

describe("packed bpmnlint config", () => {
  it("is a non-empty object with packed rules", () => {
    expect(packed).toBeTypeOf("object");
    // The bundle carries a config.rules object with at least the recommended rule names.
    const rules = (packed as { config: { rules: Record<string, string> } }).config.rules;
    expect(typeof rules).toBe("object");
    const ruleNames = Object.keys(rules);
    expect(ruleNames.length).toBeGreaterThan(0);
    // Spot-check: a well-known recommended rule must be present.
    // Keys in config.rules are unprefixed (e.g. "end-event-required").
    expect(ruleNames).toContain("end-event-required");
  });

  it("is an ES module, not CommonJS (CJS `exports` in src crashes the Vite browser bundle → white screen)", () => {
    const source = readFileSync("src/linting/bpmnlintConfig.js", "utf8");
    expect(source).toMatch(/^\s*export\b|\bexport \{/m);
    expect(source).not.toMatch(/module\.exports/);
    expect(source).not.toMatch(/^\s*exports\./m);
  });
});
