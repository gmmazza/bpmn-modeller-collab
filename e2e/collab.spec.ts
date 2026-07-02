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

test("previewing a revision shows a read-only banner + frame and exiting restores the current version", async ({ page }) => {
  // Seed the current diagram plus one older revision (a distinguishable task) under
  // .history/test/<rid>~<author>.bpmn — the format listRevisions expects.
  await openApp(page, {
    "test.bpmn": SEED_BPMN,
    ".history/test/1782700000000~Beto.bpmn": DRAFT_BPMN,
  });
  await page.getByText("📄 test.bpmn").click();
  await page.locator(".inspector").getByRole("button", { name: "Historial" }).click();
  await page.locator("#history").getByRole("button", { name: "Vista previa" }).first().click();

  // Preview: banner + indigo frame, publish disabled, and the OLD revision is loaded.
  await expect(page.locator(".preview-bar")).toContainText("versión anterior");
  await expect(page.locator("body.app-previewing")).toHaveCount(1);
  await expect(page.locator("#save")).toBeDisabled();
  await expect(page.locator('[data-element-id="Task_DRAFT"]')).toBeVisible();

  // Exit → banner/frame gone and the current version is back.
  await page.locator(".preview-exit").click();
  await expect(page.locator(".preview-bar")).toHaveCount(0);
  await expect(page.locator("body.app-previewing")).toHaveCount(0);
  await expect(page.locator('[data-element-id="Task_DRAFT"]')).toHaveCount(0);
});

test("compare mode: split with diff on both panes (incl. moved), radio switches to read-only, exit restores", async ({ page }) => {
  // current: Start, TaskA@250, End.  revision: Start, TaskA@350 (moved), TaskB (extra).
  const di = (id: string, x: number, y: number, w = 100, h = 80) =>
    `<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"><dc:Bounds x="${x}" y="${y}" width="${w}" height="${h}"/></bpmndi:BPMNShape>`;
  const wrap = (proc: string, di2: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="D" targetNamespace="x"><bpmn:process id="P" isExecutable="false">${proc}</bpmn:process><bpmndi:BPMNDiagram id="Dg"><bpmndi:BPMNPlane id="Pl" bpmnElement="P">${di2}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>`;
  const CUR = wrap(
    `<bpmn:startEvent id="Start"/><bpmn:task id="TaskA" name="Recibir"/><bpmn:endEvent id="End"/>`,
    di("Start", 156, 81, 36, 36) + di("TaskA", 250, 59) + di("End", 412, 81, 36, 36),
  );
  const REV = wrap(
    `<bpmn:startEvent id="Start"/><bpmn:task id="TaskA" name="Recibir"/><bpmn:task id="TaskB" name="Extra"/>`,
    di("Start", 156, 81, 36, 36) + di("TaskA", 350, 200) + di("TaskB", 250, 59),
  );
  await openApp(page, { "test.bpmn": CUR, ".history/test/1782700000000~Beto.bpmn": REV });
  await page.getByText("📄 test.bpmn").click();
  await page.locator(".inspector").getByRole("button", { name: "Historial" }).click();
  await page.locator("#history").getByRole("button", { name: "Comparar" }).first().click();

  // Split + compare bar + a mounted second viewer.
  await expect(page.locator("#canvasarea.split")).toHaveCount(1);
  await expect(page.locator(".compare-bar")).toBeVisible();
  await expect(page.locator("#canvas2 .djs-container")).toBeVisible();
  // Left (current/new): End added, TaskA moved. Right (revision/old): TaskB removed, TaskA moved.
  await expect(page.locator('#canvas .djs-element.diff-added[data-element-id="End"]')).toHaveCount(1);
  await expect(page.locator('#canvas .djs-element.diff-moved[data-element-id="TaskA"]')).toHaveCount(1);
  await expect(page.locator('#canvas2 .djs-element.diff-removed[data-element-id="TaskB"]')).toHaveCount(1);
  await expect(page.locator('#canvas2 .djs-element.diff-moved[data-element-id="TaskA"]')).toHaveCount(1);

  // Radio → "Versión más actual" makes the left pane read-only.
  await page.locator('input[name="cmp-base"]').nth(1).check();
  await expect(page.locator("#undo")).toBeDisabled();

  // Exit → single canvas back, no split, no overflow.
  await page.locator(".compare-exit").click();
  await expect(page.locator(".compare-bar")).toHaveCount(0);
  await expect(page.locator("#canvasarea.split")).toHaveCount(0);
  await expect(page.locator("#canvas2")).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("a wrapping toolbar (long reserved + draft chip) does not overflow the page vertically", async ({ page }) => {
  // Regression for the layout bug: on a narrower window the long chip
  // ("Reservado por Otro hasta HH:MM · Borrador sin publicar") plus Publicar /
  // Solicitar turno / Cerrar wraps the toolbar to a 2nd row; the canvas must shrink
  // to fill, NOT grow the page and force a scrollbar.
  await page.setViewportSize({ width: 1000, height: 700 });
  const lock = JSON.stringify({
    lockedBy: "Otro", lockedByEmail: "Otro", lockedByName: "Otro",
    lockedAt: new Date(Date.now()).toISOString(),
    lockedUntil: new Date(Date.now() + 2 * 3600_000).toISOString(),
  });
  await openApp(page, { "test.bpmn": SEED_BPMN, "test.bpmn.lock": lock });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [DRAFT_KEY, DRAFT_BPMN] as const);
  await page.getByText("📄 test.bpmn").click();
  await page.locator(".modal-ok").click(); // resume the draft
  await expect(page.locator("#filechip")).toContainText("Reservado por Otro");
  await expect(page.locator("#filechip")).toContainText("Borrador sin publicar");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  );
  expect(overflow, "page must not scroll vertically").toBeLessThanOrEqual(0);
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
