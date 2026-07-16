// E2E for the app self-update UI, now living in the Configuraciones modal's "Versión y
// actualizaciones" pane (Electron-only; window.appUpdate mocked here).
// Covers: current version shown, "update available" → install button calls downloadAndInstall
// with the .zip asset + reflects progress, "up to date" state, and the no-asset → "Ver release"
// fallback. The real download/swap/relaunch is Electron-native and smoke-tested manually.
import { test, expect, type Page } from "@playwright/test";
import { installFsMock } from "./fsMock";

test.use({ viewport: { width: 1400, height: 800 } });

async function boot(page: Page, feed: unknown): Promise<void> {
  await page.addInitScript((feedData) => {
    (window as any).__install = [];
    (window as any).__progressCb = null;
    (window as any).appUpdate = {
      currentVersion: () => Promise.resolve("0.4.0"),
      checkFeed: () => Promise.resolve(feedData),
      openDownload: (u: string) => (window as any).__install.push({ open: u }),
      // No URL arg: main re-derives the asset itself (security). Just record the call.
      downloadAndInstall: () => {
        (window as any).__install.push({ install: true });
        // simulate progress
        const cb = (window as any).__progressCb;
        if (cb) { cb({ phase: "download", received: 50, total: 100 }); cb({ phase: "extract" }); cb({ phase: "swap" }); }
        return Promise.resolve({ ok: true });
      },
      onProgress: (cb: any) => { (window as any).__progressCb = cb; return () => { (window as any).__progressCb = null; }; },
    };
  }, feed);
  await installFsMock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Elegir carpeta" }).click();
  await expect(page.locator("#save")).toBeVisible();
  await expect(page.locator("#canvas .djs-container")).toBeVisible(); // settings handler wired after mountModeler
  // #settings now opens the Configuraciones modal (default section: Visualización) — navigate
  // into "Versión y actualizaciones", where the app self-update block (window.appUpdate-gated) lives.
  await page.locator("#settings").click();
  await expect(page.locator(".config-modal")).toBeVisible();
  await page.locator('.config-nav button[data-section="version"]').click();
  await expect(page.locator('.config-pane[data-pane="version"]')).toBeVisible();
}

test("update available: shows version + install button, calls downloadAndInstall + progress", async ({ page }) => {
  await boot(page, { version: "0.5.0", url: "https://github.com/x/releases/tag/v0.5.0", asset: "https://github.com/x/app.zip" });
  await expect(page.locator("#app-version")).toHaveText("v0.4.0");

  await page.locator("#check-app").click();
  await expect(page.locator("#app-upd")).toContainText("Versión 0.5.0 disponible");
  const installBtn = page.locator("#app-upd button", { hasText: "Descargar e instalar" });
  await expect(installBtn).toBeVisible();

  await installBtn.click();
  // downloadAndInstall invoked (no URL arg — main re-derives it); progress reflected.
  const calls = await page.evaluate(() => (window as any).__install);
  expect(calls).toEqual([{ install: true }]);
  await expect(page.locator("#app-upd")).toContainText("Instalando y reiniciando");
});

test("up to date: no install button", async ({ page }) => {
  await boot(page, { version: "0.4.0", url: "u", asset: "" });
  await page.locator("#check-app").click();
  await expect(page.locator("#app-upd")).toContainText("última versión");
  await expect(page.locator("#app-upd button")).toHaveCount(0);
});

test("update available but no .zip asset: falls back to 'Ver release'", async ({ page }) => {
  await boot(page, { version: "0.5.0", url: "https://github.com/x/releases/tag/v0.5.0", asset: "" });
  await page.locator("#check-app").click();
  const openBtn = page.locator("#app-upd button", { hasText: "Ver release" });
  await expect(openBtn).toBeVisible();
  await openBtn.click();
  const calls = await page.evaluate(() => (window as any).__install);
  expect(calls).toEqual([{ open: "https://github.com/x/releases/tag/v0.5.0" }]);
});
