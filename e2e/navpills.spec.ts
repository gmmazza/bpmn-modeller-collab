import { test, expect, type Page } from "@playwright/test";
import { installFsMock } from "./fsMock";

// Master (P_mapa): start → s1 (Etapa A / P_a) → gw (gateway) → s2 (Etapa B / P_b) → end.
// The gateway BETWEEN the two stages mirrors the real Novotec map — the "▶ va a" of stage A
// must walk through it to stage B (so the green pill opens, not just highlights). Semantic
// only — the master is never rendered in these tests, only read for its call links.
const MAPA_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_mapa" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P_mapa" isExecutable="false">
    <bpmn:startEvent id="m_start"><bpmn:outgoing>mf0</bpmn:outgoing></bpmn:startEvent>
    <bpmn:callActivity id="s1" name="Etapa A" calledElement="P_a"><bpmn:incoming>mf0</bpmn:incoming><bpmn:outgoing>mf1</bpmn:outgoing></bpmn:callActivity>
    <bpmn:exclusiveGateway id="gw" name="Revisar"><bpmn:incoming>mf1</bpmn:incoming><bpmn:outgoing>mfg</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:callActivity id="s2" name="Etapa B" calledElement="P_b"><bpmn:incoming>mfg</bpmn:incoming><bpmn:outgoing>mf2</bpmn:outgoing></bpmn:callActivity>
    <bpmn:endEvent id="m_end"><bpmn:incoming>mf2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="mf0" sourceRef="m_start" targetRef="s1"/>
    <bpmn:sequenceFlow id="mf1" sourceRef="s1" targetRef="gw"/>
    <bpmn:sequenceFlow id="mfg" sourceRef="gw" targetRef="s2"/>
    <bpmn:sequenceFlow id="mf2" sourceRef="s2" targetRef="m_end"/>
  </bpmn:process>
</bpmn:definitions>`;

// Stage A (P_a): none-start → task → normal end. Rendered in #canvas, so it needs DI.
const ETAPA_A_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_a" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P_a" isExecutable="false">
    <bpmn:startEvent id="st_a"><bpmn:outgoing>af0</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="t_a" name="Hacer A"><bpmn:incoming>af0</bpmn:incoming><bpmn:outgoing>af1</bpmn:outgoing></bpmn:task>
    <bpmn:endEvent id="en_a"><bpmn:incoming>af1</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="af0" sourceRef="st_a" targetRef="t_a"/>
    <bpmn:sequenceFlow id="af1" sourceRef="t_a" targetRef="en_a"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="dia_a"><bpmndi:BPMNPlane id="plane_a" bpmnElement="P_a">
    <bpmndi:BPMNShape id="st_a_di" bpmnElement="st_a"><dc:Bounds x="160" y="100" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="t_a_di" bpmnElement="t_a"><dc:Bounds x="260" y="78" width="100" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="en_a_di" bpmnElement="en_a"><dc:Bounds x="420" y="100" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="af0_di" bpmnElement="af0"><di:waypoint x="196" y="118"/><di:waypoint x="260" y="118"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="af1_di" bpmnElement="af1"><di:waypoint x="360" y="118"/><di:waypoint x="420" y="118"/></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

// Stage B (P_b): none-start → end. The target of stage A's "▶ va a".
const ETAPA_B_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_b" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P_b" isExecutable="false">
    <bpmn:startEvent id="st_b"><bpmn:outgoing>bf0</bpmn:outgoing></bpmn:startEvent>
    <bpmn:endEvent id="en_b"><bpmn:incoming>bf0</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="bf0" sourceRef="st_b" targetRef="en_b"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="dia_b"><bpmndi:BPMNPlane id="plane_b" bpmnElement="P_b">
    <bpmndi:BPMNShape id="st_b_di" bpmnElement="st_b"><dc:Bounds x="160" y="100" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="en_b_di" bpmnElement="en_b"><dc:Bounds x="260" y="100" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="bf0_di" bpmnElement="bf0"><di:waypoint x="196" y="118"/><di:waypoint x="260" y="118"/></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const FILES = { "mapa.bpmn": MAPA_BPMN, "etapaA.bpmn": ETAPA_A_BPMN, "etapaB.bpmn": ETAPA_B_BPMN };

async function openApp(page: Page): Promise<void> {
  await installFsMock(page, { files: FILES });
  await page.goto("/");
  await page.getByRole("button", { name: "Elegir carpeta" }).click();
  await expect(page.locator("#save")).toBeVisible(); // toolbar mounted
}

test("bug #1: a subprocess opened standalone renders its navigation pills + shows the toggle", async ({ page }) => {
  await openApp(page);

  // Open the stage DIRECTLY from the tree (not by drilling from the master).
  await page.getByText("📄 etapaA.bpmn").click();
  await expect(page.locator('#canvas [data-element-id="st_a"]')).toBeVisible();

  // The "▶ va a: Etapa B" pill renders on the stage's end event — even with no master pane.
  const exitPill = page.locator("#canvas .stage-exit-badge");
  await expect(exitPill).toBeVisible();
  await expect(exitPill).toContainText("Etapa B");

  // The floating show/hide toggle becomes relevant → visible.
  await expect(page.locator("#navpills-toggle")).toBeVisible();
});

test("bug #2: clicking '▶ va a' on a standalone stage opens the target stage", async ({ page }) => {
  await openApp(page);
  await page.getByText("📄 etapaA.bpmn").click();
  await expect(page.locator('#canvas [data-element-id="st_a"]')).toBeVisible();

  await page.locator("#canvas .stage-exit-badge").click();

  // The bottom editor now shows stage B's own content (openFile jumped to etapaB.bpmn).
  await expect(page.locator('#canvas [data-element-id="st_b"]')).toBeVisible();
  await expect(page.locator('#canvas [data-element-id="st_a"]')).toHaveCount(0);
});

test("the toggle hides and shows the navigation pills, and the choice persists", async ({ page }) => {
  await openApp(page);
  await page.getByText("📄 etapaA.bpmn").click();
  const exitPill = page.locator("#canvas .stage-exit-badge");
  await expect(exitPill).toBeVisible();

  // Hide.
  await page.locator("#navpills-toggle").click();
  await expect(page.locator("body.nav-pills-hidden")).toHaveCount(1);
  await expect(exitPill).toBeHidden();

  // Show again.
  await page.locator("#navpills-toggle").click();
  await expect(page.locator("body.nav-pills-hidden")).toHaveCount(0);
  await expect(exitPill).toBeVisible();

  // Hide, then reload → the hidden choice survives (localStorage).
  await page.locator("#navpills-toggle").click();
  await expect(page.locator("body.nav-pills-hidden")).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: "Elegir carpeta" }).click();
  await page.getByText("📄 etapaA.bpmn").click();
  await expect(page.locator("#canvas .stage-exit-badge")).toBeHidden();
});
