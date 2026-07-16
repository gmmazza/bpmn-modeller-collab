// E2E for the Configuraciones modal (src/configModal.ts) + its deep-links from the toolbar:
// the gear (#settings), the IA menu's "Administrar presets" (-> Config -> IA), and the header
// name chip (#userbtn) (-> Config -> Generales). Folder chip (#folderchip) deep-links to the
// same "generales" pane via the same openConfigModal("generales") call as #userbtn, so it isn't
// re-tested separately here.
// Runs against the WEB dev build with the in-memory File System Access mock (headed — headless
// is known-broken in this project).
import { test, expect, type Page } from "@playwright/test";
import { installFsMock } from "./fsMock";

async function openApp(page: Page): Promise<void> {
  await installFsMock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Elegir carpeta" }).click();
  await expect(page.locator("#save")).toBeVisible();
  // The toolbar's #settings/#ai-config/#userbtn handlers are wired AFTER `await mountModeler()`
  // inside startApp — wait for the modeler before clicking any of them.
  await expect(page.locator("#canvas .djs-container")).toBeVisible();
}

test("gear opens Configuraciones with 4 sections, Visualización active by default; clicking Versión switches panes", async ({ page }) => {
  await openApp(page);
  await page.locator("#settings").click();

  const modal = page.locator(".config-modal");
  await expect(modal).toBeVisible();
  await expect(page.locator(".config-nav button")).toHaveText([
    "Visualización",
    "IA",
    "Generales",
    "Versión y actualizaciones",
  ]);

  await expect(page.locator('.config-pane[data-pane="visualizacion"]')).toBeVisible();
  await expect(page.locator('.config-pane[data-pane="version"]')).toBeHidden();
  await expect(page.locator('.config-nav button[data-section="visualizacion"]')).toHaveClass(/active/);

  await page.locator('.config-nav button[data-section="version"]').click();
  await expect(page.locator('.config-pane[data-pane="version"]')).toBeVisible();
  await expect(page.locator('.config-pane[data-pane="visualizacion"]')).toBeHidden();
  await expect(page.locator('.config-nav button[data-section="version"]')).toHaveClass(/active/);
});

test("the IA menu's 'Administrar presets' deep-links to Configuraciones -> IA", async ({ page }) => {
  await openApp(page);
  await page.locator("#ai-config").click();
  await page.locator(".ia-group .menu-pop").getByRole("button", { name: "Administrar presets" }).click();

  const modal = page.locator(".config-modal");
  await expect(modal).toBeVisible();
  await expect(page.locator('.config-pane[data-pane="ia"]')).toBeVisible();
  await expect(page.locator('.config-nav button[data-section="ia"]')).toHaveClass(/active/);
  // Preset editing + personal instructions live here (curated even on web).
  await expect(page.locator(".cfg-instructions-text")).toBeVisible();
  await expect(page.locator(".cfg-preset-add")).toBeVisible();
});

test("the IA menu dismisses on an outside click (does not stay persistent)", async ({ page }) => {
  await openApp(page);
  const menu = page.locator(".ia-group .menu-pop");

  await page.locator("#ai-config").click();
  await expect(menu).toBeVisible();

  // Click a neutral element outside the .ia-group (the "Compartido" group label) — the
  // anchored menu must close. (Avoid the canvas: with no file open its pointerdown
  // interceptor preventDefaults, which would suppress the outside mousedown in this fixture.)
  await page.locator("#sharedgroup .glabel").click();
  await expect(menu).toHaveCount(0);
});

test("the name chip opens Configuraciones -> Generales with the current name pre-filled", async ({ page }) => {
  await openApp(page); // installFsMock seeds the name "Ana"
  await page.locator("#userbtn").click();

  const modal = page.locator(".config-modal");
  await expect(modal).toBeVisible();
  await expect(page.locator('.config-pane[data-pane="generales"]')).toBeVisible();
  await expect(page.locator('.config-nav button[data-section="generales"]')).toHaveClass(/active/);
  await expect(page.locator(".cfg-name-input")).toHaveValue("Ana");
});

test("the Configuraciones modal dismisses via .config-close", async ({ page }) => {
  await openApp(page);
  await page.locator("#settings").click();
  await expect(page.locator(".config-modal")).toBeVisible();

  await page.locator(".config-close").click();
  await expect(page.locator(".config-modal")).toHaveCount(0);
});
