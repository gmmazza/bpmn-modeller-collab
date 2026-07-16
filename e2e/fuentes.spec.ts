// E2E for the Fuentes tab: seeding a diagram's `<name>.fuentes/` sidecar with a
// pending source and an already-processed one, then processing the pending file
// from the panel and asserting it moves sections.
// Runs against the WEB dev build with the in-memory File System Access mock.
import { test, expect, type Page } from "@playwright/test";
import { installFsMock, SEED_BPMN } from "./fsMock";

async function openApp(page: Page, files: Record<string, string>): Promise<void> {
  await installFsMock(page, { files });
  await page.goto("/");
  await page.getByRole("button", { name: "Elegir carpeta" }).click();
  await expect(page.locator("#save")).toBeVisible(); // toolbar mounted
}

test("fuentes tab lists pendientes/procesadas and processes a file", async ({ page }) => {
  await openApp(page, {
    "d.bpmn": SEED_BPMN,
    "d.fuentes/a.docx": "contenido pendiente",
    "d.fuentes/procesado/old.pdf": "contenido procesado",
  });
  await page.getByText("📄 d.bpmn").click();
  await expect(page.locator("#canvas .djs-container")).toBeVisible(); // diagram opened

  await page.locator('.inspector-tab[data-tab="fuentes"]').click();
  await expect(page.locator('[data-estado="pendiente"] [data-name="a.docx"]')).toBeVisible();
  await expect(page.locator('[data-estado="procesada"] [data-name="old.pdf"]')).toBeVisible();

  await page.locator('[data-name="a.docx"] [data-act="procesar"]').click();
  await expect(page.locator('[data-estado="procesada"] [data-name="a.docx"]')).toBeVisible();
  await expect(page.locator('[data-estado="pendiente"] [data-name="a.docx"]')).toHaveCount(0);
});
