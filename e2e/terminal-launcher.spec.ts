// E2E for the unified "IA" toolbar entry point + its Electron-only quick-launch (▶) (Task 9).
//   - Web build (no window.termapi): the quick-launch button stays hidden; the "IA" modal opens
//     with only the instructions section.
//   - Electron-like build (termapi mocked) + a seeded preset: the quick-launch button is visible
//     and its title reflects the last-used preset; clicking it calls openExternal with the
//     preset's command; the "IA" modal also renders the launcher section.
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

test("web build (no termapi): quick-launch stays hidden; modal shows only instructions", async ({ page }) => {
  await openApp(page);
  const hidden = await page.evaluate(() => {
    const q = document.getElementById("ai-quicklaunch");
    return q ? (q as HTMLElement).hidden : "missing";
  });
  expect(hidden, "quick-launch must remain hidden without window.termapi").toBe(true);

  await page.locator("#ai-config").click();
  await expect(page.locator(".ai-section-instructions")).toBeVisible();
  await expect(page.locator(".ai-section-launcher")).toHaveCount(0);
  await page.locator(".ai-close").click();
});

test("with termapi mocked + a preset: quick-launch visible, launches the last-used preset, modal shows launcher section", async ({ page }) => {
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

  // The "IA" modal renders the launcher section with the seeded preset.
  await page.locator("#ai-config").click();
  await expect(page.locator(".ai-section-launcher")).toBeVisible();
  await expect(page.locator(".ai-preset-select option")).toHaveText(["Claude Code"]);
  await page.locator(".ai-close").click();
});
