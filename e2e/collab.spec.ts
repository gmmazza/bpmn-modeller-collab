import { test, expect, type Page } from "@playwright/test";
import { installFsMock, readMockFile, SEED_BPMN, DRAFT_BPMN, FOLDER_NAME } from "./fsMock";

const DRAFT_KEY = `bpmn-compartida.draft.${FOLDER_NAME}::test.bpmn`;

// Install the FS mock, load the app and pass the folder gate. Returns collected
// uncaught page errors so a test can assert the app booted clean.
async function openApp(page: Page, files?: Record<string, string>): Promise<{ pageErrors: string[] }> {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await installFsMock(page, files ? { files } : undefined);
  await page.goto("/");
  await page.getByRole("button", { name: "Elegir carpeta" }).click();
  await expect(page.locator("#save")).toBeVisible(); // toolbar mounted
  return { pageErrors };
}

test("boots, opens a diagram, shows Publicar + Reservar, no uncaught errors", async ({ page }) => {
  const { pageErrors } = await openApp(page);
  await page.getByText("📄 test.bpmn").click();
  await expect(page.locator("#save")).toBeDisabled(); // nothing to publish yet
  await expect(page.locator("#editmode")).toHaveText(/Reservar/);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});

test("reserving writes a .lock with lockedUntil and updates the chip/button", async ({ page }) => {
  await openApp(page);
  await page.getByText("📄 test.bpmn").click();
  await page.locator("#editmode").click(); // Reservar
  await page.getByRole("button", { name: "10 min" }).click();

  const raw = await readMockFile(page, "test.bpmn.lock");
  expect(raw, "a .lock sidecar should exist").not.toBeNull();
  const lock = JSON.parse(raw!);
  expect(lock.lockedByName).toBe("Ana");
  const span = Date.parse(lock.lockedUntil) - Date.parse(lock.lockedAt);
  expect(Math.abs(span - 10 * 60_000)).toBeLessThan(5_000); // ~10 minutes

  await expect(page.locator("#editmode")).toHaveText(/Liberar reserva/);
  await expect(page.locator("#filechip")).toContainText("Reservado por vos");
});

test("resuming a draft loads it and publishing writes it to the shared file", async ({ page }) => {
  await openApp(page);
  // Seed a private, folder-namespaced draft for test.bpmn, then open it.
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [DRAFT_KEY, DRAFT_BPMN] as const);
  await page.getByText("📄 test.bpmn").click();

  // Resume prompt → accept → the draft's distinguishing task renders.
  await expect(page.locator(".modal-msg")).toContainText("borrador sin publicar");
  await page.locator(".modal-ok").click();
  await expect(page.locator('[data-element-id="Task_DRAFT"]')).toBeVisible();
  await expect(page.locator("#save")).toBeEnabled();

  // Publicar → confirm → the shared file now carries the task and the draft is cleared.
  await page.locator("#save").click();
  await expect(page.locator(".modal-msg")).toContainText("Publicar");
  await page.locator(".modal-ok").click();

  await expect.poll(async () => (await readMockFile(page, "test.bpmn"))?.includes("Task_DRAFT")).toBe(true);
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), DRAFT_KEY)).toBeNull();
  await expect(page.locator("#save")).toBeDisabled();
});

test("hides .docs sidecar folders in the file view", async ({ page }) => {
  await openApp(page, {
    "Compras.bpmn": SEED_BPMN,
    "Compras.docs/_proceso.md": "# doc",
    "Ventas/B2B.bpmn": SEED_BPMN,
  });
  await expect(page.locator('[data-path="Compras.bpmn"]')).toBeVisible();
  await expect(page.locator('[data-path="Ventas"]')).toBeVisible();
  await expect(page.locator('[data-path="Compras.docs"]')).toHaveCount(0);
});

test("editing enables Publicar and autosaves a namespaced draft", async ({ page }) => {
  await openApp(page);
  await page.getByText("📄 test.bpmn").click();
  await expect(page.locator("#save")).toBeDisabled();

  // Place a task: activate the palette tool, then click an empty spot on the canvas
  // (center-ish, away from the left palette and the top-right lint/minimap overlays).
  await page.locator('.djs-palette [title="Create task"]').click();
  const box = await page.locator("#canvas").boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width * 0.55, box!.y + box!.height * 0.55);

  await expect(page.locator("#save")).toBeEnabled(); // an edit registered
  await expect(page.locator("#filechip")).toContainText("Borrador sin publicar");
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), DRAFT_KEY)).not.toBeNull();
});
