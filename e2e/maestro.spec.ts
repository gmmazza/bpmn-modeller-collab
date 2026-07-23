import { test, expect, type Page } from "@playwright/test";
import { installFsMock, readMockFile, SEED_BPMN } from "./fsMock";

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

  // Master mode entered: the top EDITABLE map pane is shown, body flagged.
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

test("publishing a master succeeds even after a different file was opened first (openHeadRevisionId set on entry)", async ({ page }) => {
  await openApp(page, { "plano.bpmn": SEED_BPMN, "mapa.bpmn": MAPA_BPMN, "etapa1.bpmn": ETAPA1_BPMN });

  // Open an unrelated plain diagram FIRST — before the fix this pinned openHeadRevisionId
  // to plano.bpmn's revision, and entering master mode right after never overwrote it.
  await page.getByText("📄 plano.bpmn").click();
  await expect(page.locator("#save")).toBeDisabled();

  // Now enter the master. If enterMasterMode doesn't refresh openHeadRevisionId to the
  // master's own revision, publishMaster's conflict guard below compares against plano's
  // stale id (they never match) and Publicar silently refuses with "El mapa cambió...".
  await page.getByText("📄 mapa.bpmn").click();
  await expect(page.locator("#master-canvas .djs-container")).toBeVisible();

  // Edit the master: place a task on the top (full-screen) canvas, away from the
  // existing call activity box.
  await page.locator('#master-canvas .djs-palette [title="Create task"]').click();
  const box = await page.locator("#master-canvas").boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width * 0.15, box!.y + box!.height * 0.25);

  await expect(page.locator("#save")).toBeEnabled(); // the master edit registered

  // Publicar the master (no confirm dialog — publishMaster is a direct programmatic write,
  // same precedent as linkMasterBox/mostrarEnDiagrama).
  await page.locator("#save").click();

  await expect.poll(async () => (await readMockFile(page, "mapa.bpmn"))?.includes("bpmn:task")).toBe(true);
  await expect(page.locator("#save")).toBeDisabled(); // published — nothing pending anymore
});

test("publishing a master succeeds after drilling into a stage and closing it (masterHeadRevisionId isn't clobbered by the stage)", async ({ page }) => {
  await openApp(page, { "mapa.bpmn": MAPA_BPMN, "etapa1.bpmn": ETAPA1_BPMN });

  // Enter the master.
  await page.getByText("📄 mapa.bpmn").click();
  await expect(page.locator("#master-canvas .djs-container")).toBeVisible();

  // Drill into the linked stage — openFile(stage) overwrites openHeadRevisionId with the
  // stage's own revision (see openStage/openFile). Before the fix, publishMaster read that
  // same shared variable as its conflict baseline.
  const badge = page.locator("#master-canvas .subproc-badge.subproc-resolved");
  await badge.click();
  await expect(page.locator(".master-crumb")).toContainText("etapa1");
  await expect(page.locator('#canvas [data-element-id="StartEvent_Etapa1"]')).toBeVisible();

  // Return to the full-screen master. closeStage() never restored openHeadRevisionId —
  // it stayed pinned to etapa1.bpmn's revision.
  await page.getByRole("button", { name: "Cerrar subproceso" }).click();
  await expect(page.locator(".master-crumb")).not.toContainText("▸");

  // Edit the master map itself.
  await page.locator('#master-canvas .djs-palette [title="Create task"]').click();
  const box = await page.locator("#master-canvas").boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width * 0.15, box!.y + box!.height * 0.25);
  await expect(page.locator("#save")).toBeEnabled();

  // Publicar. Before the fix, publishMaster compared meta.headRevisionId (mapa.bpmn's real
  // revision) against openHeadRevisionId (etapa1.bpmn's revision) — they never match, so it
  // silently refused with "El mapa cambió en el equipo — reabrilo para integrar" instead of
  // publishing.
  await page.locator("#save").click();

  await expect.poll(async () => (await readMockFile(page, "mapa.bpmn"))?.includes("bpmn:task")).toBe(true);
  await expect(page.locator("#save")).toBeDisabled(); // published — nothing pending anymore
});

test("clicking a pane in split view moves the toolbar/docs focus to THAT pane", async ({ page }) => {
  // Dual-history contract (2026-07-23): the last-clicked pane is the active one — the
  // toolbar AND the docs/manual follow it. (The old data-loss hazard this spec used to
  // pin — "Mostrar en el diagrama" saving the stage's XML over the master via a stolen
  // docsFileId — is now guarded inside mostrarEnDiagrama itself, which hard-returns
  // when the master is the active pane and always saves to state.fileId.)
  await openApp(page, { "mapa.bpmn": MAPA_BPMN, "etapa1.bpmn": ETAPA1_BPMN });

  await page.getByText("📄 mapa.bpmn").click();
  const badge = page.locator("#master-canvas .subproc-badge.subproc-resolved");
  await badge.click(); // drill into etapa1 → split view, stage is the focused/editing target

  await expect(page.locator(".master-crumb")).toContainText("etapa1");

  // Click an empty spot in the master pane → the master becomes the active pane and the
  // filechip reflects it.
  const mc = await page.locator("#master-canvas").boundingBox();
  expect(mc).not.toBeNull();
  await page.mouse.click(mc!.x + mc!.width * 0.08, mc!.y + mc!.height * 0.15);
  await expect(page.locator("#filechip")).toContainText("mapa.bpmn");

  // Click back into the stage pane → focus (and the chip) return to the stage.
  const sc = await page.locator("#canvas").boundingBox();
  await page.mouse.click(sc!.x + sc!.width * 0.9, sc!.y + sc!.height * 0.9);
  await expect(page.locator("#filechip")).toContainText("etapa1.bpmn");

  // The manual follows the focused (stage) pane.
  if (!(await page.locator("#manual").isVisible())) await page.locator("#more").click();
  await page.locator("#manual").click();
  await expect(page.locator(".manual-body")).toContainText("etapa1");
  await expect(page.locator(".manual-body")).not.toContainText("Manual: mapa");
});

// ---- Dual history (2026-07-23): each pane resolves its Historial independently ----

// Older revisions carry an extra task so previewed/restored content is distinguishable.
const MAPA_OLD = MAPA_BPMN
  .replace("</bpmn:process>", '<bpmn:task id="Task_OLD_MAPA" name="Viejo"/></bpmn:process>')
  .replace(
    "</bpmndi:BPMNPlane>",
    '<bpmndi:BPMNShape id="Task_OLD_MAPA_di" bpmnElement="Task_OLD_MAPA"><dc:Bounds x="360" y="80" width="100" height="80"/></bpmndi:BPMNShape></bpmndi:BPMNPlane>',
  );
const ETAPA_OLD = ETAPA1_BPMN
  .replace("</bpmn:process>", '<bpmn:task id="Task_OLD_ETAPA" name="Paso viejo"/></bpmn:process>')
  .replace(
    "</bpmndi:BPMNPlane>",
    '<bpmndi:BPMNShape id="Task_OLD_ETAPA_di" bpmnElement="Task_OLD_ETAPA"><dc:Bounds x="250" y="200" width="100" height="80"/></bpmndi:BPMNShape></bpmndi:BPMNPlane>',
  );

test("master-only mode: the Historial works — preview in the master pane, Restaurar + Ctrl+Z", async ({ page }) => {
  await openApp(page, {
    "mapa.bpmn": MAPA_BPMN,
    "etapa1.bpmn": ETAPA1_BPMN,
    ".history/mapa/1782700000000~Beto.bpmn": MAPA_OLD,
  });
  await page.getByText("📄 mapa.bpmn").click();
  await expect(page.locator("#master-canvas .djs-container")).toBeVisible();

  // The Historial tab shows the MASTER section (app state is "browsing", but the pane works).
  await page.locator(".inspector").getByRole("button", { name: "Historial" }).click();
  await expect(page.locator("#history-master summary")).toContainText("Maestro: mapa");

  // Check Beto's revision → preview INSIDE the master wrap (indigo frame + its bar).
  await page.locator("#history-master .history-row", { hasText: "Beto" }).locator(".history-check").check();
  await expect(page.locator("#master-wrap.pane-previewing")).toHaveCount(1);
  await expect(page.locator("#master-wrap .preview-bar")).toContainText("versión anterior");
  await expect(page.locator('#master-canvas [data-element-id="Task_OLD_MAPA"]')).toBeVisible();

  // Restaurar → the old content becomes the master draft; Publicar arms.
  await page.locator("#master-wrap .preview-restore").click();
  await expect(page.locator("#master-wrap.pane-previewing")).toHaveCount(0);
  await expect(page.locator('#master-canvas [data-element-id="Task_OLD_MAPA"]')).toBeVisible();
  await expect(page.locator("#save")).toBeEnabled();

  // Ctrl+Z (master focused) reverts the restore via the master coarse stack.
  await page.locator("#master-canvas").click();
  await page.keyboard.press("Control+z");
  await expect(page.locator(".toast").last()).toContainText("deshizo el cambio del mapa");
  await expect(page.locator('#master-canvas [data-element-id="Task_OLD_MAPA"]')).toHaveCount(0);
});

test("split view: two stacked sections; master compare inside its wrap while the stage previews — independent exits", async ({ page }) => {
  await openApp(page, {
    "mapa.bpmn": MAPA_BPMN,
    "etapa1.bpmn": ETAPA1_BPMN,
    ".history/mapa/1782700000000~Beto.bpmn": MAPA_OLD,
    ".history/etapa1/1782700000001~Beto.bpmn": ETAPA_OLD,
  });
  await page.getByText("📄 mapa.bpmn").click();
  await page.locator("#master-canvas .subproc-badge.subproc-resolved").click(); // drill etapa1

  await page.locator(".inspector").getByRole("button", { name: "Historial" }).click();
  // Two titled sections, one "Actual (editable)" row EACH.
  await expect(page.locator("#history-master summary")).toContainText("Maestro: mapa");
  await expect(page.locator("#history-stage summary")).toContainText("Subproceso: etapa1");
  await expect(page.locator('#history [data-compare="actual"]')).toHaveCount(2);

  // MASTER compare: actual + Beto → split INSIDE #master-wrap; the stage pane intact below.
  await page.locator('#history-master [data-compare="actual"]').check();
  await page.locator("#history-master .history-row", { hasText: "Beto" }).locator(".history-check").check();
  await expect(page.locator("#master-split.split")).toHaveCount(1);
  await expect(page.locator("#master-canvas2 .djs-container")).toBeVisible();
  await expect(page.locator("#master-wrap .compare-bar")).toBeVisible();
  await expect(page.locator('#master-canvas2 [data-element-id="Task_OLD_MAPA"]')).toBeVisible();
  await expect(page.locator("#stage-split.split")).toHaveCount(0); // stage untouched
  await expect(page.locator("#canvas .djs-container")).toBeVisible();

  // SIMULTANEOUSLY preview an old stage revision in the stage pane.
  await page.locator("#history-stage .history-row", { hasText: "Beto" }).locator(".history-check").check();
  await expect(page.locator("#stage-wrap.pane-previewing")).toHaveCount(1);
  await expect(page.locator('#canvas [data-element-id="Task_OLD_ETAPA"]')).toBeVisible();
  await expect(page.locator("#master-wrap .compare-bar")).toBeVisible(); // master still comparing

  // Exit the MASTER compare → the stage preview must survive.
  await page.locator("#master-wrap .compare-exit").click();
  await expect(page.locator("#master-split.split")).toHaveCount(0);
  await expect(page.locator("#stage-wrap.pane-previewing")).toHaveCount(1);
  await expect(page.locator('#canvas [data-element-id="Task_OLD_ETAPA"]')).toBeVisible();

  // And exiting the stage preview returns everything to working state.
  await page.locator("#stage-wrap .preview-exit").click();
  await expect(page.locator("#stage-wrap.pane-previewing")).toHaveCount(0);
  await expect(page.locator("body.app-previewing")).toHaveCount(0);
  await expect(page.locator("body.app-comparing")).toHaveCount(0);
});
