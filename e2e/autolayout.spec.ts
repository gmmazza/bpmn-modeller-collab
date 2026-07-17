// D · Auto-layout (D-lite). Drives the real web app (headed — headless is
// known-broken here) through the in-memory FS mock and exercises the toolbar
// "Auto-organizar" button end-to-end: the unit tests cover the pure layouter
// (src/autoLayout.test.ts); this guards the main.ts wiring (coarse-undo snapshot,
// pool guard, enablement) that the unit layer can't reach.
import { test, expect, type Page } from "@playwright/test";
import { installFsMock } from "./fsMock";

// A single-process diagram whose DI stacks start/task/end all at (500,500) — a mess
// only a re-layout untangles. Ids let us read positions back out of the canvas.
const MESSY_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_messy" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P_messy" isExecutable="false">
    <bpmn:startEvent id="Start_M" name="Inicio"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="Task_M" name="Hacer algo"><bpmn:incoming>F1</bpmn:incoming><bpmn:outgoing>F2</bpmn:outgoing></bpmn:task>
    <bpmn:endEvent id="End_M" name="Fin"><bpmn:incoming>F2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="Start_M" targetRef="Task_M"/>
    <bpmn:sequenceFlow id="F2" sourceRef="Task_M" targetRef="End_M"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_M">
    <bpmndi:BPMNPlane id="BPMNPlane_M" bpmnElement="P_messy">
      <bpmndi:BPMNShape id="Start_M_di" bpmnElement="Start_M"><dc:Bounds x="500" y="500" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_M_di" bpmnElement="Task_M"><dc:Bounds x="500" y="500" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_M_di" bpmnElement="End_M"><dc:Bounds x="500" y="500" width="36" height="36"/></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

// A two-pool collaboration — out of scope for bpmn-auto-layout, which would silently
// drop a participant. The guard must refuse it and leave the diagram intact.
const POOLS_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_pools" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collab_P">
    <bpmn:participant id="Part_A" name="Cliente" processRef="Proc_PA"/>
    <bpmn:participant id="Part_B" name="Empresa" processRef="Proc_PB"/>
  </bpmn:collaboration>
  <bpmn:process id="Proc_PA" isExecutable="false"><bpmn:startEvent id="S_PA"/></bpmn:process>
  <bpmn:process id="Proc_PB" isExecutable="false"><bpmn:task id="T_PB"/></bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_P">
    <bpmndi:BPMNPlane id="BPMNPlane_P" bpmnElement="Collab_P">
      <bpmndi:BPMNShape id="Part_A_di" bpmnElement="Part_A" isHorizontal="true"><dc:Bounds x="120" y="80" width="400" height="120"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="S_PA_di" bpmnElement="S_PA"><dc:Bounds x="180" y="120" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Part_B_di" bpmnElement="Part_B" isHorizontal="true"><dc:Bounds x="120" y="220" width="400" height="120"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="T_PB_di" bpmnElement="T_PB"><dc:Bounds x="180" y="250" width="100" height="80"/></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

// A master (2 overlapping call activities) + its two stage files, so opening the master
// enters master mode and auto-organize can run on the master pane.
const MASTER_MESSY = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_master" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P_master" isExecutable="false">
    <bpmn:callActivity id="CA1" name="Etapa 1" calledElement="P_e1"><bpmn:outgoing>mf</bpmn:outgoing></bpmn:callActivity>
    <bpmn:callActivity id="CA2" name="Etapa 2" calledElement="P_e2"><bpmn:incoming>mf</bpmn:incoming></bpmn:callActivity>
    <bpmn:sequenceFlow id="mf" sourceRef="CA1" targetRef="CA2"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_master"><bpmndi:BPMNPlane id="BPMNPlane_master" bpmnElement="P_master">
    <bpmndi:BPMNShape id="CA1_di" bpmnElement="CA1"><dc:Bounds x="300" y="300" width="100" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="CA2_di" bpmnElement="CA2"><dc:Bounds x="300" y="300" width="100" height="80"/></bpmndi:BPMNShape>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;
const STAGE = (proc: string, ev: string) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_${proc}" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="${proc}" isExecutable="false"><bpmn:startEvent id="${ev}"/></bpmn:process>
  <bpmndi:BPMNDiagram id="D_${proc}"><bpmndi:BPMNPlane id="PL_${proc}" bpmnElement="${proc}">
    <bpmndi:BPMNShape id="${ev}_di" bpmnElement="${ev}"><dc:Bounds x="156" y="81" width="36" height="36"/></bpmndi:BPMNShape>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>`;

async function openApp(page: Page, files: Record<string, string>): Promise<void> {
  await installFsMock(page, { files });
  await page.goto("/");
  await page.getByRole("button", { name: "Elegir carpeta" }).click();
  await expect(page.locator("#save")).toBeVisible();
}

// The on-canvas x of a semantic element, read from its rendered gfx bounding box.
async function elementX(page: Page, id: string): Promise<number> {
  const box = await page.locator(`#canvas .djs-element[data-element-id="${id}"]`).boundingBox();
  return box!.x;
}

test("Auto-organizar re-lays a messy diagram left-to-right and Ctrl+Z reverts it", async ({ page }) => {
  await openApp(page, { "messy.bpmn": MESSY_BPMN });
  await page.getByText("📄 messy.bpmn").click();
  await expect(page.locator("#canvas .djs-container")).toBeVisible();

  // Before: all three shapes were authored at the same coords, so they overlap.
  const before = {
    start: await elementX(page, "Start_M"),
    task: await elementX(page, "Task_M"),
    end: await elementX(page, "End_M"),
  };
  expect(Math.abs(before.start - before.end)).toBeLessThan(5); // overlapping

  await page.locator("#autolayout").click();
  await expect(page.locator(".toast")).toContainText("reorganizado");

  // After: a clean flow — start left of task left of end.
  const after = {
    start: await elementX(page, "Start_M"),
    task: await elementX(page, "Task_M"),
    end: await elementX(page, "End_M"),
  };
  expect(after.start).toBeLessThan(after.task);
  expect(after.task).toBeLessThan(after.end);

  // The re-layout is a coarse-undo snapshot: Ctrl+Z collapses the shapes back.
  await page.locator("#canvas").click(); // focus the canvas for the keyboard handler
  await page.keyboard.press("Control+z");
  await expect(page.locator(".toast").last()).toContainText("deshiz");
  const reverted = {
    start: await elementX(page, "Start_M"),
    end: await elementX(page, "End_M"),
  };
  expect(Math.abs(reverted.start - reverted.end)).toBeLessThan(5); // overlapping again
});

test("the elk beta button re-lays a plain diagram left-to-right", async ({ page }) => {
  await openApp(page, { "messy.bpmn": MESSY_BPMN });
  await page.getByText("📄 messy.bpmn").click();
  await expect(page.locator("#canvas .djs-container")).toBeVisible();

  await page.locator("#autolayout-elk").click();
  await expect(page.locator(".toast")).toContainText("beta");

  const start = await elementX(page, "Start_M");
  const task = await elementX(page, "Task_M");
  const end = await elementX(page, "End_M");
  expect(start).toBeLessThan(task);
  expect(task).toBeLessThan(end);
});

test("the elk beta button refuses pools (beta scope) without destroying them", async ({ page }) => {
  await openApp(page, { "pools.bpmn": POOLS_BPMN });
  await page.getByText("📄 pools.bpmn").click();
  await expect(page.locator("#canvas .djs-container")).toBeVisible();

  await page.locator("#autolayout-elk").click();
  await expect(page.locator(".toast")).toContainText("beta todavía no");
  await expect(page.locator('#canvas .djs-element[data-element-id="Part_A"]')).toBeVisible();
  await expect(page.locator('#canvas .djs-element[data-element-id="Part_B"]')).toBeVisible();
});

test("Auto-organizar is enabled on the master map and re-lays it (with Ctrl+Z revert)", async ({ page }) => {
  await openApp(page, {
    "mapa.bpmn": MASTER_MESSY,
    "e1.bpmn": STAGE("P_e1", "S_e1"),
    "e2.bpmn": STAGE("P_e2", "S_e2"),
  });
  await page.getByText("📄 mapa.bpmn").click();
  await expect(page.locator("#master-canvas .djs-container")).toBeVisible();

  // The button is enabled in master mode (not greyed as it used to be).
  await expect(page.locator("#autolayout")).toBeEnabled();

  const mx = async (id: string) =>
    (await page.locator(`#master-canvas .djs-element[data-element-id="${id}"]`).boundingBox())!.x;
  const beforeGap = Math.abs((await mx("CA1")) - (await mx("CA2")));
  expect(beforeGap).toBeLessThan(5); // authored overlapping

  await page.locator("#autolayout").click();
  await expect(page.locator(".toast")).toContainText("Mapa reorganizado");
  expect(await mx("CA1")).toBeLessThan(await mx("CA2")); // separated left-to-right

  // Ctrl+Z reverts the master re-layout (the pane's own one-slot snapshot).
  await page.locator("#master-canvas").click();
  await page.keyboard.press("Control+z");
  await expect(page.locator(".toast").last()).toContainText("deshizo la reorganización del mapa");
  expect(Math.abs((await mx("CA1")) - (await mx("CA2")))).toBeLessThan(5); // overlapping again
});

test("Auto-organizar refuses a diagram with pools instead of destroying it", async ({ page }) => {
  await openApp(page, { "pools.bpmn": POOLS_BPMN });
  await page.getByText("📄 pools.bpmn").click();
  await expect(page.locator("#canvas .djs-container")).toBeVisible();
  // Both pools render before.
  await expect(page.locator('#canvas .djs-element[data-element-id="Part_A"]')).toBeVisible();
  await expect(page.locator('#canvas .djs-element[data-element-id="Part_B"]')).toBeVisible();

  await page.locator("#autolayout").click();

  await expect(page.locator(".toast")).toContainText("carriles (pools)");
  // Both pools are STILL there — the diagram was left untouched.
  await expect(page.locator('#canvas .djs-element[data-element-id="Part_A"]')).toBeVisible();
  await expect(page.locator('#canvas .djs-element[data-element-id="Part_B"]')).toBeVisible();
});
