import { lintRule } from "../lintHarness";
const rule = require("../../../bpmnlint-plugin-bpmncompartida/rules/no-gateway-split-and-join");

const wrap = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="x">
  <bpmn:process id="p" isExecutable="false">${inner}</bpmn:process></bpmn:definitions>`;

// Build a gateway with real sequence flows AND explicit <incoming>/<outgoing> id refs —
// bpmn-moddle only populates node.incoming/node.outgoing from those child elements (IDREFs
// to declared bpmn:SequenceFlow elements), not by inferring them from sourceRef/targetRef.
const gw = (id: string, inCount: number, outCount: number) => {
  const sources = Array.from({ length: inCount }, (_, i) => `src${id}${i}`);
  const targets = Array.from({ length: outCount }, (_, i) => `tgt${id}${i}`);
  const inFlowIds = sources.map((_, i) => `fin${id}${i}`);
  const outFlowIds = targets.map((_, i) => `fout${id}${i}`);
  const tasks = [...sources, ...targets].map((t) => `<bpmn:task id="${t}"/>`).join("");
  const flowsIn = sources.map((s, i) => `<bpmn:sequenceFlow id="${inFlowIds[i]}" sourceRef="${s}" targetRef="${id}"/>`).join("");
  const flowsOut = targets.map((t, i) => `<bpmn:sequenceFlow id="${outFlowIds[i]}" sourceRef="${id}" targetRef="${t}"/>`).join("");
  const incomingTags = inFlowIds.map((f) => `<bpmn:incoming>${f}</bpmn:incoming>`).join("");
  const outgoingTags = outFlowIds.map((f) => `<bpmn:outgoing>${f}</bpmn:outgoing>`).join("");
  return `${tasks}<bpmn:parallelGateway id="${id}">${incomingTags}${outgoingTags}</bpmn:parallelGateway>${flowsIn}${flowsOut}`;
};

describe("no-gateway-split-and-join", () => {
  it("flags a gateway that both joins and splits (2 in, 2 out)", async () => {
    const xml = wrap(gw("gw1", 2, 2));
    const reports = await lintRule(rule, xml);
    expect(reports.map((r) => r.id)).toEqual(["gw1"]);
    expect(reports[0].message).toBe("Una compuerta debe abrir o cerrar caminos, no ambas cosas a la vez.");
  });
  it("does not flag a pure split (1 in, 2 out)", async () => {
    const xml = wrap(gw("gw2", 1, 2));
    expect(await lintRule(rule, xml)).toEqual([]);
  });
  it("does not flag a pure join (2 in, 1 out)", async () => {
    const xml = wrap(gw("gw3", 2, 1));
    expect(await lintRule(rule, xml)).toEqual([]);
  });
});
