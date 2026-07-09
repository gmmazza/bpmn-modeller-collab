import { test, expect, type Page } from "@playwright/test";
import { installFsMock } from "./fsMock";

const MAPA = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_mapa" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:escalation id="Esc_dev" name="Devuelto" escalationCode="proc_rep_3__devuelto"/>
  <bpmn:process id="P_mapa" isExecutable="false">
    <bpmn:startEvent id="se_map"><bpmn:outgoing>f0</bpmn:outgoing></bpmn:startEvent>
    <bpmn:callActivity id="s3" name="Presupuesto" calledElement="proc_rep_3"><bpmn:incoming>f0</bpmn:incoming><bpmn:outgoing>f_ok</bpmn:outgoing></bpmn:callActivity>
    <bpmn:endEvent id="end_ok" name="Aprobado"><bpmn:incoming>f_ok</bpmn:incoming></bpmn:endEvent>
    <bpmn:boundaryEvent id="b_s3_dev" name="Devuelto" attachedToRef="s3" cancelActivity="true"><bpmn:outgoing>f_dev</bpmn:outgoing><bpmn:escalationEventDefinition escalationRef="Esc_dev"/></bpmn:boundaryEvent>
    <bpmn:endEvent id="end_dev" name="Devuelto sin reparar"><bpmn:incoming>f_dev</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="f0" sourceRef="se_map" targetRef="s3"/>
    <bpmn:sequenceFlow id="f_ok" sourceRef="s3" targetRef="end_ok"/>
    <bpmn:sequenceFlow id="f_dev" sourceRef="b_s3_dev" targetRef="end_dev"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="dg"><bpmndi:BPMNPlane id="pl" bpmnElement="P_mapa">
    <bpmndi:BPMNShape id="se_map_di" bpmnElement="se_map"><dc:Bounds x="150" y="100" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="s3_di" bpmnElement="s3"><dc:Bounds x="240" y="78" width="100" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="end_ok_di" bpmnElement="end_ok"><dc:Bounds x="400" y="100" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="b_s3_dev_di" bpmnElement="b_s3_dev"><dc:Bounds x="272" y="140" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="end_dev_di" bpmnElement="end_dev"><dc:Bounds x="272" y="240" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="f0_di" bpmnElement="f0"><di:waypoint x="186" y="118"/><di:waypoint x="240" y="118"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="f_ok_di" bpmnElement="f_ok"><di:waypoint x="340" y="118"/><di:waypoint x="400" y="118"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="f_dev_di" bpmnElement="f_dev"><di:waypoint x="290" y="176"/><di:waypoint x="290" y="240"/></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const REP3 = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_rep3" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:escalation id="Esc_dev" name="Devuelto" escalationCode="proc_rep_3__devuelto"/>
  <bpmn:process id="proc_rep_3" isExecutable="false">
    <bpmn:startEvent id="S1"><bpmn:outgoing>g1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:userTask id="T_rev" name="Revisar presupuesto"><bpmn:incoming>g1</bpmn:incoming><bpmn:outgoing>g2</bpmn:outgoing></bpmn:userTask>
    <bpmn:endEvent id="E_ok" name="Presupuesto aprobado"><bpmn:incoming>g2</bpmn:incoming></bpmn:endEvent>
    <bpmn:endEvent id="E_dev" name="Devuelto sin reparar"><bpmn:escalationEventDefinition escalationRef="Esc_dev"/></bpmn:endEvent>
    <bpmn:sequenceFlow id="g1" sourceRef="S1" targetRef="T_rev"/>
    <bpmn:sequenceFlow id="g2" sourceRef="T_rev" targetRef="E_ok"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="dg2"><bpmndi:BPMNPlane id="pl2" bpmnElement="proc_rep_3">
    <bpmndi:BPMNShape id="S1_di" bpmnElement="S1"><dc:Bounds x="150" y="100" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="T_rev_di" bpmnElement="T_rev"><dc:Bounds x="240" y="78" width="100" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="E_ok_di" bpmnElement="E_ok"><dc:Bounds x="400" y="100" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="E_dev_di" bpmnElement="E_dev"><dc:Bounds x="400" y="240" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="g1_di" bpmnElement="g1"><di:waypoint x="186" y="118"/><di:waypoint x="240" y="118"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="g2_di" bpmnElement="g2"><di:waypoint x="340" y="118"/><di:waypoint x="400" y="118"/></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

async function openApp(page: Page, files: Record<string, string>): Promise<void> {
  await installFsMock(page, { files });
  await page.goto("/");
  await page.getByRole("button", { name: "Elegir carpeta" }).click();
  await expect(page.locator("#save")).toBeVisible();
}

test("drill shows overlays, outcome badge navigates, and a type badge renders", async ({ page }) => {
  await openApp(page, { "mapa.bpmn": MAPA, "rep_3.bpmn": REP3 });

  await page.getByText("📄 mapa.bpmn").click();
  await expect(page.locator("body.master-mode")).toHaveCount(1);

  // Master outcome badge shows the plain-language destination for the escalation boundary.
  await expect(page.locator("#master-canvas .subproc-outcome-badge")).toContainText("Devuelto sin reparar");

  // Drill into the stage via the resolved link badge.
  await page.locator("#master-canvas .subproc-badge.subproc-resolved").first().click();
  await expect(page.locator('#canvas [data-element-id="S1"]')).toBeVisible();

  // Stage overlays: "◀ viene de" on the none-start and "▶ va a" on the ends.
  await expect(page.locator("#canvas .stage-entry-badge")).toContainText("viene de");
  await expect(page.locator("#canvas .stage-exit-escalation")).toContainText("va a");

  // Type badge on the user task. Scoped with hasText: the stage also carries "↗
  // Escalación" badges on its escalation-typed end events, so an unscoped
  // `.subproc-type-badge` locator resolves to 3 elements (strict-mode violation).
  await expect(page.locator('#canvas .subproc-type-badge', { hasText: "Usuario" })).toContainText("Usuario");
});

test("authoring: marking a normal end as alternative updates both files", async ({ page }) => {
  await openApp(page, { "mapa.bpmn": MAPA, "rep_3.bpmn": REP3 });
  await page.getByText("📄 mapa.bpmn").click();
  await page.locator("#master-canvas .subproc-badge.subproc-resolved").first().click();
  await expect(page.locator('#canvas [data-element-id="E_ok"]')).toBeVisible();

  // Open the outcome popover on the normal end and mark it alternative → destination end_ok.
  await page.locator('#canvas [data-element-id="E_ok"]').click();
  const pop = page.locator(".outcome-pop");
  await expect(pop.locator('[data-act="marcar"]')).toHaveText("Marcar como resultado alternativo");
  await pop.locator("select").selectOption({ label: "Aprobado" });
  await pop.locator('[data-act="marcar"]').click();

  // After the round-trip, re-drilling shows a second escalation exit (E_ok now escalates).
  await expect(page.locator("#canvas .stage-exit-escalation")).toHaveCount(2);
});
