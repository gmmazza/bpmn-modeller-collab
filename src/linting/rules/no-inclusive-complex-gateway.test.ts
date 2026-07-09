import { lintRule } from "../lintHarness";
const rule = require("../../../bpmnlint-plugin-bpmncompartida/rules/no-inclusive-complex-gateway");

const wrap = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="x">
  <bpmn:process id="p" isExecutable="false">${inner}</bpmn:process></bpmn:definitions>`;

describe("no-inclusive-complex-gateway", () => {
  it("flags an inclusive gateway", async () => {
    const reports = await lintRule(rule, wrap('<bpmn:inclusiveGateway id="gw1"/>'));
    expect(reports.map((r) => r.id)).toEqual(["gw1"]);
    expect(reports[0].message).toBe("Las compuertas inclusivas y complejas no están permitidas en el perfil.");
  });
  it("flags a complex gateway", async () => {
    const reports = await lintRule(rule, wrap('<bpmn:complexGateway id="gw2"/>'));
    expect(reports.map((r) => r.id)).toEqual(["gw2"]);
    expect(reports[0].message).toBe("Las compuertas inclusivas y complejas no están permitidas en el perfil.");
  });
  it("does not flag an exclusive or parallel gateway", async () => {
    const reports = await lintRule(
      rule,
      wrap('<bpmn:exclusiveGateway id="gw3"/><bpmn:parallelGateway id="gw4"/>')
    );
    expect(reports).toEqual([]);
  });
});
