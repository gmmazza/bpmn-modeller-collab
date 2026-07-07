// E2E for the Fase B external-terminal launcher toolbar wiring.
//   - Web build (no window.termapi): the terminal group stays hidden.
//   - Electron-like build (termapi mocked) + a seeded preset: the group is visible,
//     the selector lists the preset, "Lanzar" calls openExternal with the preset's
//     command, "Abrir terminal" calls it with null, and the presets modal opens.
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
  // the wiring has executed before asserting on the terminal group.
  await expect(page.locator("#canvas .djs-container")).toBeVisible();
}

test("web build (no termapi): terminal group stays hidden", async ({ page }) => {
  await openApp(page);
  const hidden = await page.evaluate(() => {
    const g = document.getElementById("terminal-group");
    return g ? (g as HTMLElement).hidden : "missing";
  });
  expect(hidden, "group must remain hidden without window.termapi").toBe(true);
});

test("with termapi mocked + a preset: group visible, run/term call openExternal correctly", async ({ page }) => {
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

  // group unhidden, select populated with the preset label
  const state = await page.evaluate(() => {
    const g = document.getElementById("terminal-group") as HTMLElement | null;
    const sel = document.getElementById("llm-preset") as HTMLSelectElement | null;
    return { hidden: g?.hidden, options: sel ? Array.from(sel.options).map((o) => o.textContent) : null, value: sel?.value };
  });
  expect(state.hidden, "group visible when termapi present").toBe(false);
  expect(state.options, "select shows the seeded preset").toEqual(["Claude Code"]);

  // Run → openExternal called with the preset's command; Term → called with null.
  await page.evaluate(() => (document.getElementById("llm-run") as HTMLButtonElement).click());
  await page.evaluate(() => (document.getElementById("llm-term") as HTMLButtonElement).click());
  const calls = await page.evaluate(() => (window as unknown as { __calls: unknown[] }).__calls);
  expect(calls, "run sends the command, term sends null").toEqual(["claude", null]);

  // Presets modal opens on demand.
  await page.evaluate(() => (document.getElementById("llm-presets") as HTMLButtonElement).click());
  await expect(page.locator(".gate-card h2")).toContainText("presets");
});
