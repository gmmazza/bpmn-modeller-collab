import { test, expect, type Page } from "@playwright/test";
import { installFsMock } from "./fsMock";

// Master: a call activity linking out to P_etapa (same folder as the master — the tree
// only nests same-folder subs, see masterSubsIndex.ts).
const MAPA_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_mapa" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P_mapa" isExecutable="false">
    <bpmn:callActivity id="CallActivity_1" name="Etapa" calledElement="P_etapa"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="P_mapa">
      <bpmndi:BPMNShape id="CallActivity_1_di" bpmnElement="CallActivity_1"><dc:Bounds x="200" y="80" width="100" height="80"/></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

// Stage: its own process, id matching the master's calledElement, same folder.
const ETAPA_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_etapa" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P_etapa" isExecutable="false">
    <bpmn:startEvent id="StartEvent_Etapa"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_2">
    <bpmndi:BPMNPlane id="BPMNPlane_2" bpmnElement="P_etapa">
      <bpmndi:BPMNShape id="StartEvent_Etapa_di" bpmnElement="StartEvent_Etapa"><dc:Bounds x="156" y="81" width="36" height="36"/></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

// Mirrors maestro.spec.ts's openApp — no shared export exists since each spec seeds
// different files.
async function openApp(page: Page, files: Record<string, string>): Promise<void> {
  await installFsMock(page, { files });
  await page.goto("/");
  await page.getByRole("button", { name: "Elegir carpeta" }).click();
  await expect(page.locator("#save")).toBeVisible(); // toolbar mounted
}

test("a master shows its same-folder subprocess nested; the toggle collapses it", async ({ page }) => {
  await openApp(page, { "mapa.bpmn": MAPA_BPMN, "etapa.bpmn": ETAPA_BPMN });

  // The nested index is rebuilt asynchronously (refreshMastersCache → getFolderIndex →
  // rebuildMasterSubs → a follow-up renderTree) — poll for the master's nesting toggle
  // rather than asserting on the very first (possibly flat) render.
  const masterRow = page.locator('.ft-row[data-path="mapa.bpmn"]');
  const masterToggle = masterRow.locator(".ft-toggle");
  await expect(masterToggle).toBeVisible();

  const subRow = page.locator('.ft-row[data-path="etapa.bpmn"]');
  await expect(subRow).toBeVisible(); // nested under the master, not a stray top-level row

  await masterToggle.click(); // collapse
  await expect(subRow).toHaveCount(0); // hidden while collapsed

  await masterToggle.click(); // expand again
  await expect(subRow).toBeVisible();
});
