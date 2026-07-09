import { lintRule } from "../lintHarness";
const rule = require("../../../bpmnlint-plugin-bpmncompartida/rules/single-none-start");

const wrap = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="x">
  <bpmn:process id="p" isExecutable="false">${inner}</bpmn:process></bpmn:definitions>`;

describe("single-none-start", () => {
  it("flags a process with two start events", async () => {
    const reports = await lintRule(
      rule,
      wrap('<bpmn:startEvent id="s1"/><bpmn:startEvent id="s2"/>')
    );
    expect(reports.map((r) => r.id)).toEqual(["p"]);
    expect(reports[0].message).toBe("Un subproceso llamado debe tener exactamente un inicio simple (none).");
  });
  it("flags a process with a single typed (non-none) start", async () => {
    const reports = await lintRule(
      rule,
      wrap('<bpmn:startEvent id="s1"><bpmn:timerEventDefinition/></bpmn:startEvent>')
    );
    expect(reports.map((r) => r.id)).toEqual(["p"]);
    expect(reports[0].message).toBe("Un subproceso llamado debe tener exactamente un inicio simple (none).");
  });
  it("does not flag a process with one plain start", async () => {
    const reports = await lintRule(rule, wrap('<bpmn:startEvent id="s1"/>'));
    expect(reports).toEqual([]);
  });
  it("does not flag a master with a call activity even with two starts", async () => {
    const reports = await lintRule(
      rule,
      wrap(
        '<bpmn:startEvent id="s1"/><bpmn:startEvent id="s2"/>' +
          '<bpmn:callActivity id="ca1" calledElement="sub1"/>'
      )
    );
    expect(reports).toEqual([]);
  });
});
