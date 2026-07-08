import { test, expect, type Page } from "@playwright/test";
import { installFsMock } from "./fsMock";

// Master: one process (P_mapa) with a single call activity linking out to P_etapa1.
const MAPA_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_mapa" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P_mapa" isExecutable="false">
    <bpmn:callActivity id="CallActivity_1" name="Etapa 1" calledElement="P_etapa1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="P_mapa">
      <bpmndi:BPMNShape id="CallActivity_1_di" bpmnElement="CallActivity_1"><dc:Bounds x="200" y="80" width="100" height="80"/></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

// Stage: its own process, id matching the master's calledElement.
const ETAPA1_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_etapa1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P_etapa1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_Etapa1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_2">
    <bpmndi:BPMNPlane id="BPMNPlane_2" bpmnElement="P_etapa1">
      <bpmndi:BPMNShape id="StartEvent_Etapa1_di" bpmnElement="StartEvent_Etapa1"><dc:Bounds x="156" y="81" width="36" height="36"/></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

// Install the FS mock, load the app and pass the folder gate (mirrors collab.spec.ts's
// openApp — no shared export exists for this since each spec seeds different files).
async function openApp(page: Page, files: Record<string, string>): Promise<void> {
  await installFsMock(page, { files });
  await page.goto("/");
  await page.getByRole("button", { name: "Elegir carpeta" }).click();
  await expect(page.locator("#save")).toBeVisible(); // toolbar mounted
}

test("opening a master enters master mode; drilling into a resolved stage opens it below and highlights the box", async ({ page }) => {
  await openApp(page, { "mapa.bpmn": MAPA_BPMN, "etapa1.bpmn": ETAPA1_BPMN });

  await page.getByText("📄 mapa.bpmn").click();

  // Master mode entered: the top read-only map pane is shown, body flagged.
  await expect(page.locator("#master-canvas")).toBeVisible();
  await expect(page.locator("body.master-mode")).toHaveCount(1);
  await expect(page.locator("#master-canvas .djs-container")).toBeVisible();

  // The call activity resolves against the registry (etapa1.bpmn declares P_etapa1) →
  // a clickable 🗺 drill-down badge renders over it.
  const badge = page.locator("#master-canvas .subproc-badge.subproc-resolved");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText("🗺");

  // Drill down.
  await badge.click();

  // Signal 1: the breadcrumb now shows "Mapa: mapa ▸ etapa1" (shortName strips ".bpmn").
  await expect(page.locator(".master-crumb")).toContainText("▸");
  await expect(page.locator(".master-crumb")).toContainText("etapa1");

  // Signal 2: the bottom editor loaded the stage's own content.
  await expect(page.locator('#canvas [data-element-id="StartEvent_Etapa1"]')).toBeVisible();

  // Signal 3: the master box got the "current stage" marker.
  await expect(page.locator('#master-canvas .djs-element[data-element-id="CallActivity_1"]')).toHaveClass(/subproc-current/);
});
