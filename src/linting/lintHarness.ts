// Test-only helper: run a single bpmnlint rule factory against a .bpmn XML string and
// return the reported element ids + messages. Uses bpmnlint's Linter with an inline
// resolver so we test rules without the packed config.
// bpmnlint has an ambient `any`-typed module declaration in src/vendor.d.ts.
import { Linter } from "bpmnlint";
// @ts-expect-error no type declarations published
import { BpmnModdle } from "bpmn-moddle";

export interface LintReport { id: string; message: string }

export async function lintRule(ruleFactory: () => any, xml: string): Promise<LintReport[]> {
  const moddle = new BpmnModdle();
  const { rootElement } = await (moddle as any).fromXML(xml);
  const linter = new Linter({
    config: { rules: { "test/rule": "error" } },
    resolver: {
      resolveRule: () => ruleFactory,
      resolveConfig: () => { throw new Error("no configs in test"); },
    },
  });
  const results = await linter.lint(rootElement);
  const flat: LintReport[] = [];
  for (const arr of Object.values(results) as any[]) {
    for (const r of arr) flat.push({ id: r.id, message: r.message });
  }
  return flat;
}
