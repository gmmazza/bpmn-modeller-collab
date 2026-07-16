// A.5 UX regressions. Runs against the WEB dev build with the in-memory File
// System Access mock (headed — headless is known-broken in this project).
//
// Task 10 (Fuentes empty-render): the reported symptom was that the Fuentes tab
// rendered "totalmente sin contenido" after opening a master. Proven root cause:
// enterMasterMode never set `docsFileId`, so renderFuentes() early-returned on
// `!docsFileId` and renderFuentesPanel never ran (the pane stayed blank — not even
// the dropzone). Task 4's focusMasterPane() -> loadDocsSidecarsForFocus() now sets
// docsFileId to the master file and re-invokes renderFuentes. This spec guards that
// wiring, which the unit layer can't reach (it lives in main.ts's closure).
import { test, expect, type Page } from "@playwright/test";
import { installFsMock } from "./fsMock";

// Master: one process with a single call activity linking out to P_etapa1.
const MAPA_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_mapa" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P_mapa" isExecutable="false">
    <bpmn:callActivity id="CallActivity_1" name="Etapa 1" calledElement="P_etapa1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="P_mapa">
      <bpmndi:BPMNShape id="CallActivity_1_di" bpmnElement="CallActivity_1"><dc:Bounds x="200" y="80" width="100" height="80"/></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

// Stage: its own process, id matching the master's calledElement.
const ETAPA1_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_etapa1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P_etapa1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_Etapa1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_2">
    <bpmndi:BPMNPlane id="BPMNPlane_2" bpmnElement="P_etapa1">
      <bpmndi:BPMNShape id="StartEvent_Etapa1_di" bpmnElement="StartEvent_Etapa1"><dc:Bounds x="156" y="81" width="36" height="36"/></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

async function openApp(page: Page, files: Record<string, string>): Promise<void> {
  await installFsMock(page, { files });
  await page.goto("/");
  await page.getByRole("button", { name: "Elegir carpeta" }).click();
  await expect(page.locator("#save")).toBeVisible(); // toolbar mounted
}

// Clicks a rail icon by its data-tab id (e.g. "fuentes", "datos"). The rail is
// always-visible activity-bar UI, not part of the reflow-protected toolbar
// group — unlike the old toolbar jump-buttons it replaced, it never gets
// pushed into "⋯" overflow.
async function openInspectorTab(page: Page, tabId: string): Promise<void> {
  await page.locator(`.inspector-tab[data-tab="${tabId}"]`).click();
}

async function openFuentes(page: Page): Promise<void> {
  await openInspectorTab(page, "fuentes");
}

// A third, unrelated plain diagram (its own process/start-event ids) for the panel-resize,
// datos and IA specs below — none of them need the master/stage pair above.
const PLAIN_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_plano" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P_plano" isExecutable="false">
    <bpmn:startEvent id="StartEvent_Plano"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_3">
    <bpmndi:BPMNPlane id="BPMNPlane_3" bpmnElement="P_plano">
      <bpmndi:BPMNShape id="StartEvent_Plano_di" bpmnElement="StartEvent_Plano"><dc:Bounds x="156" y="81" width="36" height="36"/></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

test("opening a master as the first file renders its Fuentes (not a blank pane)", async ({ page }) => {
  await openApp(page, {
    "mapa.bpmn": MAPA_BPMN,
    "mapa.fuentes/mapasrc.pdf": "contenido",
    "etapa1.bpmn": ETAPA1_BPMN,
  });

  // Master is the VERY FIRST file opened → docsFileId was "" before this. The bug
  // left it empty, so the Fuentes pane rendered nothing at all.
  await page.getByText("📄 mapa.bpmn").click();
  await expect(page.locator("#master-canvas .djs-container")).toBeVisible();

  await openFuentes(page);

  // The panel actually rendered (dropzone always present) AND it points at the
  // master's own sources (the seeded pending file shows).
  await expect(page.locator(".fuente-dropzone")).toBeVisible();
  await expect(page.locator('[data-estado="pendiente"] [data-name="mapasrc.pdf"]')).toBeVisible();
});

test("a master with no stage open fills the full height (no empty bottom split); the hint is a floating pill", async ({ page }) => {
  await openApp(page, { "mapa.bpmn": MAPA_BPMN, "etapa1.bpmn": ETAPA1_BPMN });

  // No stage drilled in — master-no-stage should be active.
  await page.getByText("📄 mapa.bpmn").click();
  await expect(page.locator("#master-canvas .djs-container")).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/master-no-stage/);

  const area = await page.locator("#canvasarea").boundingBox();
  const master = await page.locator("#master-canvas").boundingBox();
  // Master canvas fills (near) the full canvas area height — no bottom pane stealing ~half.
  expect(master!.height).toBeGreaterThan(area!.height * 0.9);
  await expect(page.locator("#master-split-resizer")).toBeHidden();
  await expect(page.locator("#stage-hint")).toBeVisible();
  await expect(page.locator("#stage-hint")).toHaveText("Doble-clic en una etapa para abrirla");
});

test("drilling into a stage re-points Fuentes at the stage's own sources", async ({ page }) => {
  await openApp(page, {
    "mapa.bpmn": MAPA_BPMN,
    "mapa.fuentes/mapasrc.pdf": "contenido",
    "etapa1.bpmn": ETAPA1_BPMN,
    "etapa1.fuentes/etapasrc.pdf": "contenido",
  });

  await page.getByText("📄 mapa.bpmn").click();
  await expect(page.locator("#master-canvas .djs-container")).toBeVisible();

  // Master full-screen: Fuentes shows the master's sources.
  await openFuentes(page);
  await expect(page.locator('[data-name="mapasrc.pdf"]')).toBeVisible();

  // Drill into the linked stage — the focused file becomes the stage. Fuentes stays
  // the active AND visible rail tab across the drill (drilling doesn't touch the
  // inspector), so openFile's own `void renderFuentes()` call re-points the already-
  // open pane on its own — no extra tab click needed (clicking the rail icon again
  // while it's already active+visible would just collapse it, per the rail's
  // toggle-to-collapse behavior).
  await page.locator("#master-canvas .subproc-badge.subproc-resolved").click();
  await expect(page.locator('#canvas [data-element-id="StartEvent_Etapa1"]')).toBeVisible();

  await expect(page.locator('[data-name="etapasrc.pdf"]')).toBeVisible();
  await expect(page.locator('[data-name="mapasrc.pdf"]')).toHaveCount(0);
});

// --- Task 11: remaining §8 spec flows (master drill+split, panel resize + open-file
// highlight, free-text tool with suggestions, unified IA modal web-degrade). ---

test("master is editable and double-clicking a call activity drills into the stage below, then the split divider drags", async ({ page }) => {
  await openApp(page, { "mapa.bpmn": MAPA_BPMN, "etapa1.bpmn": ETAPA1_BPMN });
  await page.getByText("📄 mapa.bpmn").click();
  await expect(page.locator("body.master-mode")).toHaveCount(1);
  // The old "Editar el mapa" round-trip button is gone — the master is directly editable.
  await expect(page.getByRole("button", { name: "Editar el mapa" })).toHaveCount(0);
  // Editable: the master canvas hosts a full modeler (palette present). Wait for it before
  // the double-click below, or the dblclick can race the modeler's own import/render.
  await expect(page.locator("#master-canvas .djs-palette")).toBeVisible();

  // Double-click the linked call activity → drills into its stage (vetoes native rename).
  await page.locator('#master-canvas .djs-element[data-element-id="CallActivity_1"]').dblclick();
  await expect(page.locator('#canvas [data-element-id="StartEvent_Etapa1"]')).toBeVisible();
  await expect(page.locator(".master-crumb")).toContainText("etapa1");

  // The split divider is now visible (a stage is open) and draggable — dragging it down
  // grows the master pane's share of the vertical split.
  const resizer = page.locator("#master-split-resizer");
  await expect(resizer).toBeVisible();
  const before = await page.locator("#master-canvas").boundingBox();
  await resizer.hover();
  await page.mouse.down();
  await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height + 60);
  await page.waitForTimeout(50);
  await page.mouse.up();
  const after = await page.locator("#master-canvas").boundingBox();
  expect(after!.height).toBeGreaterThan(before!.height);
});

test("opening a plain file highlights it in the tree immediately", async ({ page }) => {
  // Fix for A.5 final review: a PLAIN (non-master) openFile() never called
  // renderTree(lastTree), so a normally-opened file's ".ft-open" marker only
  // appeared after the next incidental refresh. No master interaction here —
  // this guards the plain path specifically (the test above already covers the
  // master-mode transitions, which called renderTree(lastTree) from the start).
  await openApp(page, { "plano.bpmn": PLAIN_BPMN });
  await page.getByText("📄 plano.bpmn").click();
  await expect(page.locator("#canvas .djs-container")).toBeVisible();
  await expect(page.locator('.ft-row[data-path="plano.bpmn"].ft-open')).toBeVisible();
});

test("left panel resizes and the open file is highlighted in the tree", async ({ page }) => {
  // The "abierto" (.ft-open) marker is wired via the master/stage split-pane tracking
  // (openPathsNow() + the explicit renderTree(lastTree) calls in enter/exitMasterMode and
  // openStage/closeStage — see main.ts ~1932). A master file's row gets it as soon as
  // enterMasterMode runs, so open a master here rather than a plain file.
  await openApp(page, { "mapa.bpmn": MAPA_BPMN, "etapa1.bpmn": ETAPA1_BPMN });
  await page.getByText("📄 mapa.bpmn").click();
  await expect(page.locator("#master-canvas .djs-container")).toBeVisible();
  await expect(page.locator('.ft-row[data-path="mapa.bpmn"].ft-open')).toBeVisible();

  const files = page.locator("#files");
  const w0 = (await files.boundingBox())!.width;
  const handle = page.locator(".files-resizer");
  const hb = (await handle.boundingBox())!;
  await handle.hover();
  await page.mouse.down();
  await page.mouse.move(hb.x + 80, hb.y + hb.height / 2);
  await page.waitForTimeout(50);
  await page.mouse.up();
  const w1 = (await files.boundingBox())!.width;
  expect(w1).toBeGreaterThan(w0);
});

test("data/tool is free text with workspace suggestions", async ({ page }) => {
  await openApp(page, { "plano.bpmn": PLAIN_BPMN });
  await page.getByText("📄 plano.bpmn").click();
  await page.locator('#canvas [data-element-id="StartEvent_Plano"]').click();
  await openInspectorTab(page, "datos");

  const toolInput = page.locator('section[data-category="formularios"] .dato-add-tool');
  await expect(toolInput).toHaveAttribute("list", /dato-tools-formularios/);
  await toolInput.fill("Google Forms"); // free text accepted, not a closed enum
  await page.locator('section[data-category="formularios"] .dato-add-nombre').fill("Alta");
  await page.locator('section[data-category="formularios"] form button[type="submit"]').click();
  await expect(page.locator('[data-category="formularios"][data-entry-id] .dato-tool-tag')).toContainText("Google Forms");
});

test("the operational IA menu opens with only 'Administrar presets' on web; launch controls and quick-launch are absent/hidden", async ({ page }) => {
  await openApp(page, { "plano.bpmn": PLAIN_BPMN });
  // The IA wiring (ai-config click handler, quick-launch refresh) runs AFTER `await
  // mountModeler()` inside startApp; #save is part of startApp's synchronous initial
  // innerHTML and can be visible well before that await resolves. Wait for the modeler
  // itself (mirrors terminal-launcher.spec.ts's openApp) so the wiring is attached
  // before we click #ai-config.
  await expect(page.locator("#canvas .djs-container")).toBeVisible();
  await page.locator("#ai-config").click();
  const menu = page.locator(".ia-group .menu-pop");
  await expect(menu).toBeVisible();
  // hasTermApi() is false in the web e2e (no window.termapi) — web-degrade contract:
  // the preset select / Lanzar / open-terminal controls aren't rendered at all; only the
  // "Administrar presets" deep-link (-> Configuraciones -> IA) is present.
  await expect(menu.locator(".ai-menu-preset")).toHaveCount(0);
  await expect(menu.locator(".ai-menu-launch")).toHaveCount(0);
  await expect(menu.locator(".ai-menu-terminal")).toHaveCount(0);
  await expect(menu.getByRole("button", { name: "Administrar presets" })).toBeVisible();
  // #ai-quicklaunch is display:none when hidden on web. Its `hidden` attribute alone lost
  // the cascade to `.btn { display: inline-flex }` (an author rule); app.css carries an
  // explicit `#ai-quicklaunch[hidden] { display: none; }` override — like the other
  // [hidden]-toggled elements that collide with an author display rule — so it is truly hidden.
  await expect(page.locator("#ai-quicklaunch")).toBeHidden();
});

// Task 11 (deferred from the Fuentes render-fix): the real-world duplication trigger per the
// generation-token fix's commit message — "two overlapping renders (the Fuentes tab-click plus
// the master-focus path) both survived the last clear and stacked the list twice". Reproduce by
// opening a stage (priming docsFileId + an already-rendered, visible Fuentes pane), clicking the
// Fuentes tab again, and — without waiting for that render to settle — opening the master, whose
// own master-focus path (focusMasterPane -> loadDocsSidecarsForFocus -> renderFuentes) fires a
// second overlapping render on the SAME host. Guards the per-host generation token in
// renderFuentesPanel (src/fuentes/fuentesPanel.ts); before that fix this produced TWO
// [data-estado="pendiente"] sections instead of one.
test("Fuentes tab-click racing the master-focus path does not duplicate the Pendientes section", async ({ page }) => {
  await openApp(page, {
    "mapa.bpmn": MAPA_BPMN,
    "mapa.fuentes/mapasrc.pdf": "contenido",
    "etapa1.bpmn": ETAPA1_BPMN,
  });

  // Prime docsFileId + an already-visible, already-rendered Fuentes pane on a plain stage file.
  await page.getByText("📄 etapa1.bpmn").click();
  await expect(page.locator("#canvas .djs-container")).toBeVisible();
  await openFuentes(page);
  await expect(page.locator(".fuente-dropzone")).toBeVisible();

  // Fire a second, unawaited renderFuentes() on the SAME already-open Fuentes pane.
  // The rail icon itself can't do this anymore — re-clicking an already-active,
  // already-visible tab now collapses it instead of refiring (Task 4's toggle
  // behavior) — but collapsing then reopening the inspector hits the same
  // renderFuentes() call the old always-refire toolbar button used to (its reopen
  // path calls renderFuentes() directly, independent of the tab-change onChange).
  // Then immediately (no settle-wait) open the master — its own master-focus
  // renderFuentes() call can land while the first is mid-flight.
  await page.locator("#toggle-inspector").click(); // collapse
  await page.locator("#toggle-inspector").click(); // reopen -> refires renderFuentes()
  await page.getByText("📄 mapa.bpmn").click();

  await expect(page.locator("#master-canvas .djs-container")).toBeVisible();
  await expect(page.locator('[data-estado="pendiente"]')).toHaveCount(1);
  await expect(page.locator('[data-name="mapasrc.pdf"]')).toBeVisible();
});

// Task 4: the 5 toolbar panel-jump buttons (#tab-capas/#tab-props/#tab-docs/
// #tab-fuentes/#tab-datos) were removed — their job now belongs entirely to the
// always-visible inspector rail.
test("the inspector rail is always visible; clicking an icon opens its pane; the 5 toolbar jump-buttons are gone", async ({ page }) => {
  await openApp(page, { "plano.bpmn": PLAIN_BPMN });
  await page.getByText("📄 plano.bpmn").click();
  await expect(page.locator("#canvas .djs-container")).toBeVisible();

  await expect(page.locator("#tab-capas")).toHaveCount(0);
  await expect(page.locator("#tab-fuentes")).toHaveCount(0);
  const rail = page.locator(".inspector-rail");
  await expect(rail).toBeVisible();
  await page.locator('.inspector-tab[data-tab="fuentes"]').click();
  await expect(page.locator('.inspector-pane[data-pane="fuentes"]')).toBeVisible();
  // Rail persists when the panes collapse (click the active icon again).
  await page.locator('.inspector-tab[data-tab="fuentes"]').click();
  await expect(rail).toBeVisible();
});
