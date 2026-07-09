// E2E for the "Datos y herramientas" tab: seeding a diagram with a Task element, adding a
// JotForm form + a ClickUp store from the panel, verifying the badge + openable link render,
// then running "Mostrar en el diagrama" and asserting the standard anchor lands in the
// published .bpmn. Runs against the WEB dev build with the in-memory File System Access mock.
import { test, expect, type Page } from "@playwright/test";
import { installFsMock, SEED_BPMN } from "./fsMock";

// SEED_BPMN only has a StartEvent — add a Task so there's something to attach data/tools to.
const TASK_BPMN = SEED_BPMN.replace(
  '<bpmn:startEvent id="StartEvent_1"/>',
  '<bpmn:startEvent id="StartEvent_1"/><bpmn:task id="Task_1" name="Recepción"/>',
).replace(
  "</bpmndi:BPMNPlane>",
  '<bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1"><dc:Bounds x="260" y="59" width="100" height="80"/></bpmndi:BPMNShape></bpmndi:BPMNPlane>',
);

async function openApp(page: Page, files: Record<string, string>): Promise<void> {
  await installFsMock(page, { files });
  await page.goto("/");
  await page.getByRole("button", { name: "Elegir carpeta" }).click();
  await expect(page.locator("#save")).toBeVisible(); // toolbar mounted
}

test("Datos y herramientas: add form + store, see the badge, anchor it in the diagram", async ({ page }) => {
  await openApp(page, { "d.bpmn": TASK_BPMN });
  await page.getByText("📄 d.bpmn").click();
  await expect(page.locator("#canvas .djs-container")).toBeVisible();

  // Select the Task on the canvas.
  await page.locator('[data-element-id="Task_1"]').click();

  await page.locator("#tab-datos").click();
  await expect(page.locator('[data-pane="datos"]')).not.toHaveAttribute("hidden", "");

  // Add a JotForm form.
  const formularios = page.locator('[data-pane="datos"] section[data-category="formularios"]');
  await formularios.locator(".dato-add-nombre").fill("Recepción — alta de motor");
  await formularios.locator(".dato-add-tool").selectOption("jotform");
  await formularios.locator(".dato-add-url").fill("https://form.jotform.com/example");
  await formularios.locator('button[type="submit"]').click();
  await expect(formularios.locator('[data-entry-id] .dato-name')).toHaveText("Recepción — alta de motor");

  // Add a ClickUp store.
  const almacenamiento = page.locator('[data-pane="datos"] section[data-category="almacenamiento"]');
  await almacenamiento.locator(".dato-add-nombre").fill("Lista Reparaciones");
  await almacenamiento.locator(".dato-add-tool").selectOption("clickup");
  await almacenamiento.locator(".dato-add-url").fill("https://app.clickup.com/example");
  await almacenamiento.locator('button[type="submit"]').click();
  await expect(almacenamiento.locator('[data-entry-id] .dato-name')).toHaveText("Lista Reparaciones");

  // The diagram badge appears on the Task now that it has documented data/tools.
  // bpmn-js overlays are appended into a `.djs-overlays` container tagged with
  // `data-container-id` (NOT `data-element-id`, which lives on the shape's own <g>) —
  // see diagram-js/lib/features/overlays/Overlays.js `_updateOverlayContainer`.
  const badge = page.locator('[data-container-id="Task_1"] .dato-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toContainText("📄");
  await expect(badge).toContainText("🗄");

  // "Mostrar en el diagrama" for the form: publishes a standard anchor, hides the button.
  await formularios.locator('[data-act="mostrar"]').click();
  await expect(formularios.locator('[data-act="mostrar"]')).toHaveCount(0);
  await expect(page.getByText("Publicado")).toBeVisible();

  // Verify the standard anchor landed on the canvas: bpmn-js assigns the new
  // bpmn:DataObjectReference shape a generated id like "DataObjectReference_09f3v8y",
  // and a separate label element with the "_label" suffix — exclude the label so the
  // locator resolves to exactly the shape.
  await expect(
    page.locator('.djs-shape[data-element-id^="DataObjectReference"]:not([data-element-id$="_label"])'),
  ).toBeVisible();
});
