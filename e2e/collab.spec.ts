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
  // Checking a SINGLE revision (nth 0 is "Actual") previews it — no "Vista previa" button.
  const revCheck = page.locator("#history .history-check").nth(1);
  await revCheck.check();

  // Preview: banner + indigo frame, publish disabled, the OLD revision loaded, 👁 badge.
  await expect(page.locator(".preview-bar")).toContainText("versión anterior");
  await expect(page.locator("body.app-previewing")).toHaveCount(1);
  await expect(page.locator("#save")).toBeDisabled();
  await expect(page.locator('[data-element-id="Task_DRAFT"]')).toBeVisible();
  await expect(page.locator("#history .history-side.preview")).toHaveText("👁");
  await expect(revCheck).toBeChecked();

  // "↩ Restaurar esta versión" lives in the preview bar (not the row).
  await expect(page.locator(".preview-restore")).toBeVisible();

  // Read-only is really enforced: trying to DRAG the shape must NOT move it, and the
  // palette (editing chrome) is hidden. (Regression: setReadOnly used to be a no-op.)
  await expect(page.locator("#canvas .djs-palette")).toBeHidden();
  const shape = page.locator('#canvas .djs-element[data-element-id="Task_DRAFT"]');
  const posBefore = (await shape.boundingBox())!;
  await page.mouse.move(posBefore.x + posBefore.width / 2, posBefore.y + posBefore.height / 2);
  await page.mouse.down();
  await page.mouse.move(posBefore.x + 140, posBefore.y + 90, { steps: 8 });
  await page.mouse.up();
  const posAfter = (await shape.boundingBox())!;
  expect(Math.abs(posAfter.x - posBefore.x) + Math.abs(posAfter.y - posBefore.y)).toBeLessThan(3); // did not move
  await expect(page.locator("#save")).toBeDisabled(); // and nothing became publishable

  // "Volver" → banner/frame gone, current version back, and the checkbox unticks.
  await page.locator(".preview-exit").click();
  await expect(page.locator(".preview-bar")).toHaveCount(0);
  await expect(page.locator("body.app-previewing")).toHaveCount(0);
  await expect(page.locator('[data-element-id="Task_DRAFT"]')).toHaveCount(0);
  await expect(page.locator("#history .history-check").nth(1)).not.toBeChecked();
});

test("preview: 'Restaurar esta versión' brings the revision into the draft and enables Publicar", async ({ page }) => {
  await openApp(page, {
    "test.bpmn": SEED_BPMN,
    ".history/test/1782700000000~Beto.bpmn": DRAFT_BPMN,
  });
  await page.getByText("📄 test.bpmn").click();
  await page.locator(".inspector").getByRole("button", { name: "Historial" }).click();
  await page.locator("#history .history-check").nth(1).check(); // preview the revision
  await expect(page.locator("body.app-previewing")).toHaveCount(1);

  // Restaurar from the preview bar → revision becomes the editable draft; leaves preview.
  await page.locator(".preview-restore").click();
  await expect(page.locator("body.app-previewing")).toHaveCount(0);
  await expect(page.locator(".preview-bar")).toHaveCount(0);
  await expect(page.locator('[data-element-id="Task_DRAFT"]')).toBeVisible(); // restored content stays
  await expect(page.locator("#save")).toBeEnabled(); // it's an unpublished draft now
  await expect(page.locator("#history .history-check").nth(1)).not.toBeChecked();
});

test("compare mode: split with diff on both panes (incl. moved), orientation toggle + draggable separator, exit restores", async ({ page }) => {
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
  // Select "Actual (editable)" + the revision (checkboxes) → 2 checked enters compare.
  await page.locator('#history [data-compare="actual"]').check();
  await page.locator("#history .history-check").nth(1).check();

  // Split + compare bar + a mounted second viewer.
  await expect(page.locator("#canvasarea.split")).toHaveCount(1);
  await expect(page.locator(".compare-bar")).toBeVisible();
  await expect(page.locator("#canvas2 .djs-container")).toBeVisible();
  // The checked history rows are highlighted; side-by-side badges read izq / der.
  await expect(page.locator('#history [data-compare="actual"]').locator("xpath=ancestor::div[contains(@class,'history-row')]")).toHaveClass(/checked/);
  await expect(page.locator("#history .history-side.izq")).toHaveText("izq");
  await expect(page.locator("#history .history-side.der")).toHaveText("der");
  // Left (current/new): End added, TaskA moved. Right (revision/old): TaskB removed, TaskA moved.
  await expect(page.locator('#canvas .djs-element.diff-added[data-element-id="End"]')).toHaveCount(1);
  await expect(page.locator('#canvas .djs-element.diff-moved[data-element-id="TaskA"]')).toHaveCount(1);
  await expect(page.locator('#canvas2 .djs-element.diff-removed[data-element-id="TaskB"]')).toHaveCount(1);
  await expect(page.locator('#canvas2 .djs-element.diff-moved[data-element-id="TaskA"]')).toHaveCount(1);
  // Compare is pure visualization → both panes read-only, so Publicar stays disabled.
  await expect(page.locator("#save")).toBeDisabled();
  await expect(page.locator("#canvasarea.vertical")).toHaveCount(0);

  // Orientation toggle → stacks the panes (adds .vertical); button relabels AND the
  // History badges switch from izq/der to arriba/abajo.
  await page.locator(".compare-orient").click();
  await expect(page.locator("#canvasarea.vertical")).toHaveCount(1);
  await expect(page.locator(".compare-orient")).toContainText("Lado a lado");
  await expect(page.locator("#history .history-side.izq")).toHaveText("arriba");
  await expect(page.locator("#history .history-side.der")).toHaveText("abajo");
  await page.locator(".compare-orient").click(); // back to side-by-side
  await expect(page.locator("#canvasarea.vertical")).toHaveCount(0);
  await expect(page.locator("#history .history-side.izq")).toHaveText("izq");

  // Draggable separator → dragging #canvassplit changes the --split ratio.
  const splitBefore = await page.locator("#canvasarea").evaluate((el) => getComputedStyle(el).getPropertyValue("--split").trim());
  const sep = (await page.locator("#canvassplit").boundingBox())!;
  await page.mouse.move(sep.x + sep.width / 2, sep.y + sep.height / 2);
  await page.mouse.down();
  await page.mouse.move(sep.x - 120, sep.y + sep.height / 2, { steps: 6 });
  await page.mouse.up();
  const splitAfter = await page.locator("#canvasarea").evaluate((el) => getComputedStyle(el).getPropertyValue("--split").trim());
  expect(splitAfter).not.toBe(splitBefore);

  // Exit → single canvas back, no split, no overflow.
  await page.locator(".compare-exit").click();
  await expect(page.locator(".compare-bar")).toHaveCount(0);
  await expect(page.locator("#canvasarea.split")).toHaveCount(0);
  await expect(page.locator("#canvas2")).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("compare: left pane read-only, right pane pans, and selecting + copying a historical element lands it in the current draft", async ({ page }) => {
  const shape = (id: string, x: number, y: number, w = 100, h = 80) =>
    `<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"><dc:Bounds x="${x}" y="${y}" width="${w}" height="${h}"/></bpmndi:BPMNShape>`;
  const wrap = (proc: string, di: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="D" targetNamespace="x"><bpmn:process id="P" isExecutable="false">${proc}</bpmn:process><bpmndi:BPMNDiagram id="Dg"><bpmndi:BPMNPlane id="Pl" bpmnElement="P">${di}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>`;
  const CUR = wrap(`<bpmn:startEvent id="Start"/><bpmn:task id="TaskA" name="Recibir"/>`, shape("Start", 156, 81, 36, 36) + shape("TaskA", 250, 59));
  const REV = wrap(
    `<bpmn:startEvent id="Start"/><bpmn:task id="TaskA" name="Recibir"/><bpmn:task id="TaskB" name="Paso viejo"><bpmn:documentation>nota</bpmn:documentation></bpmn:task>`,
    shape("Start", 156, 81, 36, 36) + shape("TaskA", 250, 59) + shape("TaskB", 250, 200, 120),
  );
  await openApp(page, { "test.bpmn": CUR, ".history/test/1782700000000~Beto.bpmn": REV });
  await page.getByText("📄 test.bpmn").click();
  await page.locator(".inspector").getByRole("button", { name: "Historial" }).click();
  await page.locator('#history [data-compare="actual"]').check();
  await page.locator("#history .history-check").nth(1).check();
  await expect(page.locator("#canvas2 .djs-container")).toBeVisible();

  // Copy button is present (comparing "Actual") but disabled until something is selected.
  await expect(page.locator(".compare-copy")).toBeVisible();
  await expect(page.locator(".compare-copy")).toBeDisabled();
  await expect(page.locator("#save")).toBeDisabled();
  await expect(page.locator("#canvas .djs-palette")).toBeHidden();

  // The LEFT ("Actual") pane is read-only: dragging TaskA must NOT move it.
  const taskABefore = (await page.locator('#canvas .djs-element[data-element-id="TaskA"]').boundingBox())!;
  await page.mouse.move(taskABefore.x + taskABefore.width / 2, taskABefore.y + taskABefore.height / 2);
  await page.mouse.down();
  await page.mouse.move(taskABefore.x + 120, taskABefore.y + 70, { steps: 8 });
  await page.mouse.up();
  const taskAStill = (await page.locator('#canvas .djs-element[data-element-id="TaskA"]').boundingBox())!;
  expect(Math.abs(taskAStill.x - taskABefore.x) + Math.abs(taskAStill.y - taskABefore.y)).toBeLessThan(3);

  // A PLAIN drag on the right pane's empty canvas PANS it (drag-hand preserved), and the
  // sync mirrors the pan to the left pane. Start top-center, away from the watermark link.
  const before = (await page.locator('#canvas2 .djs-element[data-element-id="TaskB"]').boundingBox())!;
  const leftBefore = (await page.locator('#canvas .djs-element[data-element-id="TaskA"]').boundingBox())!;
  const pane = (await page.locator("#canvas2 .djs-container").boundingBox())!;
  await page.mouse.move(pane.x + pane.width / 2, pane.y + 15);
  await page.mouse.down();
  await page.mouse.move(pane.x + pane.width / 2, pane.y + 145, { steps: 8 });
  await page.mouse.up();
  const after = (await page.locator('#canvas2 .djs-element[data-element-id="TaskB"]').boundingBox())!;
  expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeGreaterThan(20); // it panned
  const leftAfter = (await page.locator('#canvas .djs-element[data-element-id="TaskA"]').boundingBox())!;
  expect(Math.abs(leftAfter.y - leftBefore.y)).toBeGreaterThan(20); // left mirrored the pan

  // Select TaskB in the historical pane (a plain click selects one element) → copy enables.
  const shapesBefore = await page.locator("#canvas .djs-element[data-element-id]").count();
  await page.locator('#canvas2 .djs-element[data-element-id="TaskB"] .djs-hit').click({ force: true });
  await expect(page.locator(".compare-copy")).toBeEnabled();
  await page.locator(".compare-copy").click();

  // The element lands in the current diagram (one more shape) and it becomes publishable.
  await expect.poll(async () => page.locator("#canvas .djs-element[data-element-id]").count()).toBe(shapesBefore + 1);
  await expect(page.locator("#save")).toBeEnabled();

  // Exit → single canvas back; the copied element stays and Publicar is still enabled.
  await page.locator(".compare-exit").click();
  await expect(page.locator("#canvasarea.split")).toHaveCount(0);
  await expect(page.locator("#save")).toBeEnabled();
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

test("toolbar dropdowns (Ajustes ⚙, Más ⋯) open UNCLIPPED below the bar", async ({ page }) => {
  // Regression: #toolbar had `overflow: hidden` (for reflowToolbar), which clipped the
  // .popover/.menu-pop dropdowns (position:absolute; top:100%, dropping below the ~44px bar).
  // The Ajustes and Más menus opened (hidden=false) but were invisible. Guard against the
  // clip returning: elementFromPoint returns the element the USER would actually hit, so a
  // clipped popover fails even though Playwright's toBeVisible (layout-only) would pass.
  await page.setViewportSize({ width: 900, height: 700 });
  await openApp(page);
  // The toolbar handlers (incl. #settings/#more) are wired AFTER `await mountModeler()` in
  // startApp, so wait for the modeler before clicking — else the handler isn't attached yet.
  await expect(page.locator("#canvas .djs-container")).toBeVisible();

  // The toolbar must not use a clipping overflow (that would cut off its dropdowns).
  const overflowY = await page.locator("#toolbar").evaluate((el) => getComputedStyle(el).overflowY);
  expect(overflowY, "toolbar overflow-y must not clip its dropdowns").toBe("visible");

  // Ajustes (⚙) → the settings popover content is actually painted, not clipped.
  await page.locator("#settings").click();
  const settings = await page.evaluate(() => {
    const cb = document.getElementById("set-sketchy");
    const viz = document.getElementById("vizsettings");
    if (!cb || !viz) return { painted: false, belowBar: false };
    const r = cb.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    const tb = document.getElementById("toolbar")!.getBoundingClientRect();
    return { painted: !!(hit && viz.contains(hit)), belowBar: r.top >= tb.bottom };
  });
  expect(settings.painted, "settings popover content must be painted (not clipped)").toBe(true);
  expect(settings.belowBar, "popover drops below the toolbar").toBe(true);

  // Más (⋯) → when reflow has moved groups into it, its content is painted too.
  if (await page.locator("#more").isVisible()) {
    await page.locator("#more").click();
    const morePainted = await page.evaluate(() => {
      const pop = document.getElementById("morepop");
      if (!pop || pop.hidden) return false;
      const first = pop.querySelector("button, .tgroup") as HTMLElement | null;
      if (!first) return false;
      const r = first.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!(hit && pop.contains(hit));
    });
    expect(morePainted, "more-menu content must be painted (not clipped)").toBe(true);
  }
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
