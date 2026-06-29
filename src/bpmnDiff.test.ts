import { describe, it, expect } from "vitest";
import { computeDiff } from "./bpmnDiff";

const base = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1"><bpmn:task id="Task_1" name="A"/></bpmn:process>
</bpmn:definitions>`;

const withAdded = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1"><bpmn:task id="Task_1" name="A"/><bpmn:task id="Task_2" name="B"/></bpmn:process>
</bpmn:definitions>`;

const withRenamed = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1"><bpmn:task id="Task_1" name="A-renamed"/></bpmn:process>
</bpmn:definitions>`;

describe("computeDiff", () => {
  it("detects an added element", async () => {
    const d = await computeDiff(base, withAdded);
    expect(d.added).toContain("Task_2");
    expect(d.removed).toHaveLength(0);
  });
  it("detects a removed element", async () => {
    const d = await computeDiff(withAdded, base);
    expect(d.removed).toContain("Task_2");
  });
  it("detects a changed element", async () => {
    const d = await computeDiff(base, withRenamed);
    expect(d.changed).toContain("Task_1");
  });
});
