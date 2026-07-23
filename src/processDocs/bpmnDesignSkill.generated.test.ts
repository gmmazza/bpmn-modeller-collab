import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { BPMN_DESIGN_FILES, BPMN_DESIGN_VERSION } from "./bpmnDesignSkill.generated";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

describe("bpmnDesignSkill.generated", () => {
  it("matches the vendored sources byte-for-byte (run `npm run pack:bpmn-design` if this fails)", () => {
    const sources: [string, string][] = [["bpmn-design", ""], ["bpmn-design-app", "app/"]];
    const expected: Record<string, string> = {};
    for (const [dir, prefix] of sources) {
      for (const abs of walk(dir)) {
        const rel = relative(dir, abs).split("\\").join("/");
        expected[prefix + rel] = readFileSync(abs, "utf8");
      }
    }
    expect(BPMN_DESIGN_FILES).toEqual(expected);
  });

  it("includes the three layers", () => {
    expect(Object.keys(BPMN_DESIGN_FILES)).toContain("SKILL.md");
    expect(Object.keys(BPMN_DESIGN_FILES)).toContain("app/documentation.md");
    expect(Object.keys(BPMN_DESIGN_FILES)).toContain("app/cross-layer-workflows.md");
  });

  it("exposes a stable non-empty version", () => {
    expect(BPMN_DESIGN_VERSION).toMatch(/^[0-9a-f]{12}$/);
  });

  it("is ESM, not CJS", () => {
    const src = readFileSync("src/processDocs/bpmnDesignSkill.generated.ts", "utf8");
    expect(src).toMatch(/^export const/m);
    expect(src).not.toMatch(/module\.exports/);
    expect(src).not.toMatch(/^\s*exports\./m);
  });

  it("documentation.md teaches coverage, templates, wikilinks and the manual rule", () => {
    const doc = BPMN_DESIGN_FILES["app/documentation.md"];
    expect(doc).toContain("Elemento significativo");
    expect(doc).toContain("## Plantilla: `_proceso.md`");
    expect(doc).toContain("## Plantilla: nota de paso");
    expect(doc).toContain("[[proceso#elementId]]");
    expect(doc).toContain("[[idea:idea-3]]");
    expect(doc).toMatch(/orden de flujo/);
    expect(doc).toMatch(/Nunca.*`_index\.md`/s);
  });
});
