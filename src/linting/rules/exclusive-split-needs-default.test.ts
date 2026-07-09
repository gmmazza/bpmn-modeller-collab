import { lintRule } from "../lintHarness";
const rule = require("../../../bpmnlint-plugin-bpmncompartida/rules/exclusive-split-needs-default");

const wrap = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="x">
  <bpmn:process id="p" isExecutable="false">${inner}</bpmn:process></bpmn:definitions>`;

const split = (attrs: string) => wrap(`
  <bpmn:exclusiveGateway id="gw" ${attrs}><bpmn:outgoing>a</bpmn:outgoing><bpmn:outgoing>b</bpmn:outgoing></bpmn:exclusiveGateway>
  <bpmn:task id="t1"/><bpmn:task id="t2"/>
  <bpmn:sequenceFlow id="a" sourceRef="gw" targetRef="t1"/>
  <bpmn:sequenceFlow id="b" sourceRef="gw" targetRef="t2"/>`);

describe("exclusive-split-needs-default", () => {
  it("flags a diverging exclusive gateway without a default flow", async () => {
    const reports = await lintRule(rule, split(""));
    expect(reports.map((r) => r.id)).toEqual(["gw"]);
    expect(reports[0].message).toBe("La compuerta exclusiva que se abre debe tener un camino por defecto.");
  });
  it("passes when a default flow is set", async () => {
    expect(await lintRule(rule, split('default="a"'))).toEqual([]);
  });
});
