import { lintRule } from "../lintHarness";
const rule = require("../../../bpmnlint-plugin-bpmncompartida/rules/message-needs-messageref");

const wrap = (inner: string, roots = "") => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="x">
  ${roots}
  <bpmn:process id="p" isExecutable="false">${inner}</bpmn:process></bpmn:definitions>`;

describe("message-needs-messageref", () => {
  it("flags a message start event without a messageRef", async () => {
    const reports = await lintRule(
      rule,
      wrap('<bpmn:startEvent id="s1"><bpmn:messageEventDefinition/></bpmn:startEvent>')
    );
    expect(reports.map((r) => r.id)).toEqual(["s1"]);
    expect(reports[0].message).toBe("El evento de mensaje debe declarar un mensaje (messageRef).");
  });
  it("does not flag a message event that references a declared message", async () => {
    const reports = await lintRule(
      rule,
      wrap(
        '<bpmn:startEvent id="s2"><bpmn:messageEventDefinition messageRef="M"/></bpmn:startEvent>',
        '<bpmn:message id="M"/>'
      )
    );
    expect(reports).toEqual([]);
  });
});
