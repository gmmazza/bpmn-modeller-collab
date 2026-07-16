// E2E for the unified "IA" toolbar entry point + its Electron-only quick-launch (▶).
//   - Web build (no window.termapi): the quick-launch button stays hidden; the operational IA
//     menu (#ai-config -> .menu-pop, built by buildAiMenu) shows only "Administrar presets" —
//     no preset select / Lanzar / open-terminal controls.
//   - Electron-like build (termapi mocked) + a seeded preset: the quick-launch button is visible
//     and its title reflects the last-used preset; clicking it calls openExternal with the
//     preset's command; the operational IA menu also renders the preset select + launch controls,
//     and choosing a preset then clicking "Lanzar" calls openExternal with that preset's command.
// Runs against the WEB dev build with the in-memory File System Access mock.
import { test, expect, type Page } from "@playwright/test";
import { installFsMock } from "./fsMock";

test.use({ viewport: { width: 1920, height: 900 } });

async function openApp(page: Page): Promise<void> {
  await installFsMock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Elegir carpeta" }).click();
  await expect(page.locator("#save")).toBeVisible();
  // The terminal wiring runs AFTER `await mountModeler()` in startApp; #save is
  // rendered before that (it's in startApp's innerHTML). Wait for the modeler so
  // the wiring has executed before asserting on the quick-launch button.
  await expect(page.locator("#canvas .djs-container")).toBeVisible();
}

test("web build (no termapi): quick-launch stays hidden; the IA menu shows only 'Administrar presets'", async ({ page }) => {
  await openApp(page);
  const hidden = await page.evaluate(() => {
    const q = document.getElementById("ai-quicklaunch");
    return q ? (q as HTMLElement).hidden : "missing";
  });
  expect(hidden, "quick-launch must remain hidden without window.termapi").toBe(true);

  await page.locator("#ai-config").click();
  const menu = page.locator(".ia-group .menu-pop");
  await expect(menu).toBeVisible();
  // hasTermApi() is false on web — launch controls are absent entirely (not just hidden).
  await expect(menu.locator(".ai-menu-preset")).toHaveCount(0);
  await expect(menu.locator(".ai-menu-launch")).toHaveCount(0);
  await expect(menu.locator(".ai-menu-terminal")).toHaveCount(0);
  await expect(menu.getByRole("button", { name: "Administrar presets" })).toBeVisible();
  await page.locator("#ai-config").click(); // toggle closed (same idiom as #userbtn)
  await expect(menu).toHaveCount(0);
});

test("with termapi mocked + a preset: quick-launch visible and launches it, the IA menu also lists and launches the preset", async ({ page }) => {
  // Inject a fake termapi + seed a preset BEFORE the app boots.
  await page.addInitScript(() => {
    (window as unknown as { __calls: unknown[] }).__calls = [];
    (window as unknown as { termapi: unknown }).termapi = {
      openExternal: (command: string | null) => {
        (window as unknown as { __calls: unknown[] }).__calls.push(command);
        return Promise.resolve({ ok: true, launched: "wt" });
      },
    };
    localStorage.setItem(
      "bpmn-compartida.llmPresets",
      JSON.stringify([{ id: "p1", label: "Claude Code", command: "claude" }]),
    );
  });
  await openApp(page);

  // Quick-launch unhidden, title reflects the preset (falls back to the first preset
  // when there is no last-used one yet).
  const state = await page.evaluate(() => {
    const q = document.getElementById("ai-quicklaunch") as HTMLElement | null;
    return { hidden: q?.hidden, title: q?.title };
  });
  expect(state.hidden, "quick-launch visible when termapi present and a preset exists").toBe(false);
  expect(state.title).toBe("Lanzar: Claude Code");

  // Clicking it calls openExternal with the preset's command.
  await page.locator("#ai-quicklaunch").click();
  const calls = await page.evaluate(() => (window as unknown as { __calls: unknown[] }).__calls);
  expect(calls, "quick-launch sends the last-used preset's command").toEqual(["claude"]);

  // The operational IA menu (#ai-config -> .menu-pop) lists the seeded preset and, when
  // "Lanzar" is clicked, sends its command too.
  await page.locator("#ai-config").click();
  const menu = page.locator(".ia-group .menu-pop");
  await expect(menu).toBeVisible();
  await expect(menu.locator(".ai-menu-preset option")).toHaveText(["Claude Code"]);
  await menu.locator(".ai-menu-launch").click();
  const calls2 = await page.evaluate(() => (window as unknown as { __calls: unknown[] }).__calls);
  expect(calls2, "the menu's Lanzar sends the selected preset's command too").toEqual(["claude", "claude"]);
});
