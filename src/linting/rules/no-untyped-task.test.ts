import { lintRule } from "../lintHarness";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const rule = require("../../../bpmnlint-plugin-bpmncompartida/rules/no-untyped-task");

const wrap = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="x">
  <bpmn:process id="p" isExecutable="false">${inner}</bpmn:process></bpmn:definitions>`;

describe("no-untyped-task", () => {
  it("flags a bare bpmn:task", async () => {
    const reports = await lintRule(rule, wrap('<bpmn:task id="T1"/>'));
    expect(reports.map((r) => r.id)).toContain("T1");
    expect(reports[0].message).toBe("La tarea no tiene un tipo preciso (usá manual, de usuario o de servicio).");
  });
  it("does not flag a typed task", async () => {
    const reports = await lintRule(rule, wrap('<bpmn:userTask id="T2"/>'));
    expect(reports).toEqual([]);
  });
});
