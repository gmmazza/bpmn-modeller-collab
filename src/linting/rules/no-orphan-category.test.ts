import { lintRule } from "../lintHarness";
const rule = require("../../../bpmnlint-plugin-bpmncompartida/rules/no-orphan-category");

const wrap = (roots: string, inner: string) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="x">
  ${roots}
  <bpmn:process id="p" isExecutable="false">${inner}</bpmn:process></bpmn:definitions>`;

describe("no-orphan-category", () => {
  it("flags a category with no referring group", async () => {
    const xml = wrap(
      '<bpmn:category id="cat_presupuesto"><bpmn:categoryValue id="cv1"/></bpmn:category>',
      '<bpmn:task id="t1"/>'
    );
    const reports = await lintRule(rule, xml);
    expect(reports.map((r) => r.id)).toEqual(["cat_presupuesto"]);
    expect(reports[0].message).toBe("Hay una categoría sin uso; eliminala.");
  });
  it("does not flag a category referenced by a group", async () => {
    const xml = wrap(
      '<bpmn:category id="cat_presupuesto"><bpmn:categoryValue id="cv1"/></bpmn:category>',
      '<bpmn:task id="t1"/><bpmn:group id="g1" categoryValueRef="cv1"/>'
    );
    const reports = await lintRule(rule, xml);
    expect(reports).toEqual([]);
  });
});
