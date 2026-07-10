// A.5 UX regressions. Runs against the WEB dev build with the in-memory File
// System Access mock (headed — headless is known-broken in this project).
//
// Task 10 (Fuentes empty-render): the reported symptom was that the Fuentes tab
// rendered "totalmente sin contenido" after opening a master. Proven root cause:
// enterMasterMode never set `docsFileId`, so renderFuentes() early-returned on
// `!docsFileId` and renderFuentesPanel never ran (the pane stayed blank — not even
// the dropzone). Task 4's focusMasterPane() -> loadDocsSidecarsForFocus() now sets
// docsFileId to the master file and re-invokes renderFuentes. This spec guards that
// wiring, which the unit layer can't reach (it lives in main.ts's closure).
import { test, expect, type Page } from "@playwright/test";
import { installFsMock } from "./fsMock";

// Master: one process with a single call activity linking out to P_etapa1.
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

async function openApp(page: Page, files: Record<string, string>): Promise<void> {
  await installFsMock(page, { files });
  await page.goto("/");
  await page.getByRole("button", { name: "Elegir carpeta" }).click();
  await expect(page.locator("#save")).toBeVisible(); // toolbar mounted
}

// The inspector tab buttons live in a reflow-protected toolbar group; at this
// viewport (and especially in master mode) they can sit in the "⋯" overflow.
async function openFuentes(page: Page): Promise<void> {
  if (!(await page.locator("#tab-fuentes").isVisible())) await page.locator("#more").click();
  await page.locator("#tab-fuentes").click();
}

test("opening a master as the first file renders its Fuentes (not a blank pane)", async ({ page }) => {
  await openApp(page, {
    "mapa.bpmn": MAPA_BPMN,
    "mapa.fuentes/mapasrc.pdf": "contenido",
    "etapa1.bpmn": ETAPA1_BPMN,
  });

  // Master is the VERY FIRST file opened → docsFileId was "" before this. The bug
  // left it empty, so the Fuentes pane rendered nothing at all.
  await page.getByText("📄 mapa.bpmn").click();
  await expect(page.locator("#master-canvas .djs-container")).toBeVisible();

  await openFuentes(page);

  // The panel actually rendered (dropzone always present) AND it points at the
  // master's own sources (the seeded pending file shows).
  await expect(page.locator(".fuente-dropzone")).toBeVisible();
  await expect(page.locator('[data-estado="pendiente"] [data-name="mapasrc.pdf"]')).toBeVisible();
});

test("drilling into a stage re-points Fuentes at the stage's own sources", async ({ page }) => {
  await openApp(page, {
    "mapa.bpmn": MAPA_BPMN,
    "mapa.fuentes/mapasrc.pdf": "contenido",
    "etapa1.bpmn": ETAPA1_BPMN,
    "etapa1.fuentes/etapasrc.pdf": "contenido",
  });

  await page.getByText("📄 mapa.bpmn").click();
  await expect(page.locator("#master-canvas .djs-container")).toBeVisible();

  // Master full-screen: Fuentes shows the master's sources.
  await openFuentes(page);
  await expect(page.locator('[data-name="mapasrc.pdf"]')).toBeVisible();

  // Drill into the linked stage — the focused file becomes the stage.
  await page.locator("#master-canvas .subproc-badge.subproc-resolved").click();
  await expect(page.locator('#canvas [data-element-id="StartEvent_Etapa1"]')).toBeVisible();

  await openFuentes(page);
  await expect(page.locator('[data-name="etapasrc.pdf"]')).toBeVisible();
  await expect(page.locator('[data-name="mapasrc.pdf"]')).toHaveCount(0);
});
