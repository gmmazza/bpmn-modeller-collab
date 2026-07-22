/**
 * Layout QA harness.
 *
 * For every real diagram it renders the AUTHORED layout (before) and the auto-organized layout
 * (after `layoutDiagramElk`, the same entry the app's Auto-organizar button calls) with REAL
 * bpmn-js in headless chromium, extracts the live scene (geometry + connection waypoints + REAL
 * rendered label bboxes via SVG getBBox — the DI 14px height hints lie, wrapped labels measure
 * ~28px), and scores it with `computeMetrics` from src/layoutMetrics.ts.
 *
 * Gate:
 *  - HARD rules (absolute, tolerance 0, never baselined away): lanes.violations, overlaps.*,
 *    clips.vertical. Any nonzero -> the run fails (exit 1).
 *  - SOFT metrics (ratchet vs committed layout-qa/baseline.json, keyed per diagram): crossings,
 *    clips.horizontal, straightness, cohesion. A regression beyond tolerance -> the run fails.
 * Missing diagrams (in the baseline but not found this run) are SKIPPED and reported, never
 * treated as passing. First run creates the baseline; `--update-baseline` rewrites it.
 *
 * Outputs to layout-qa/out/ (gitignored): <name>.before.png, <name>.after.png, report.md,
 * report.json. The committed baseline lives at layout-qa/baseline.json.
 *
 * Flags:
 *  --update-baseline   rewrite layout-qa/baseline.json from this run's AFTER metrics
 *  --emit-fixture      write src/__fixtures__/scene-novotec-matrix.json (a real AFTER scene for
 *                      the metrics test suite) and exit; does not run the sweep or need metrics
 *
 * Run: npm run layout:qa  (== npx vite-node scripts/layout-qa.ts)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { resolve, join, basename, relative, sep } from "node:path";
import { chromium, type Browser } from "playwright";
// @ts-expect-error no type declarations published
import { BpmnModdle } from "bpmn-moddle";
import { layoutDiagramElk } from "../src/layoutElk";
// Type-only import: erased at runtime, so --emit-fixture works before layoutMetrics.ts lands.
// The value (computeMetrics) is loaded lazily via dynamic import inside runSweep().
import type { Scene, MetricsReport, SceneNode, SceneEdge, SceneLane, SceneLabel } from "../src/layoutMetrics";

const ROOT = process.cwd();
const VIEWER = resolve(ROOT, "node_modules/bpmn-js/dist/bpmn-viewer.production.min.js");
const OUT = resolve(ROOT, "layout-qa/out");
const BASELINE_PATH = resolve(ROOT, "layout-qa/baseline.json");
const FIXTURE_BPMN = resolve(ROOT, "src/__fixtures__/novotec-matrix.bpmn");
const FIXTURE_SCENE = resolve(ROOT, "src/__fixtures__/scene-novotec-matrix.json");
const MAX_PX = 8000; // cap screenshot dimensions so a very wide diagram can't produce a huge PNG
const AREA_TOL = 0.02; // cohesion may grow up to 2% before it counts as a regression
const PCT_TOL = 0.5; // straightPct may drop up to 0.5 percentage points before it's a regression

// ---------------------------------------------------------------------------------------------
// Rendering + scene extraction (real bpmn-js in headless chromium)
// ---------------------------------------------------------------------------------------------

interface GeomScene {
  nodes: SceneNode[];
  edges: SceneEdge[];
  lanes: SceneLane[];
  labels: SceneLabel[];
  inner: { x: number; y: number; width: number; height: number };
  warnings: number;
}

/**
 * Load a self-contained page (no dev server) and inject the bundled bpmn-js viewer by CONTENT
 * (read from disk via addScriptTag path) rather than navigating to a file:// URL — this sidesteps
 * the headless net::ERR_ABORTED failure mode entirely, so no headed fallback is needed. Imports
 * the XML, extracts the live scene, and (optionally) writes a fit-to-diagram screenshot.
 */
async function renderScene(browser: Browser, xml: string, screenshotPath: string | null): Promise<GeomScene> {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  try {
    await page.setContent(
      '<!doctype html><meta charset="utf-8"><style>*{margin:0;padding:0}html,body{width:100%;height:100%}#canvas{position:absolute;inset:0;background:#fff}</style><div id="canvas"></div>',
      { waitUntil: "load" }
    );
    await page.addScriptTag({ path: VIEWER });
    const scene = await page.evaluate(async (xmlStr: string) => {
      const w = window as any;
      const viewer = new w.BpmnJS({ container: document.getElementById("canvas") });
      w.__viewer = viewer;
      const res = await viewer.importXML(xmlStr);
      const registry = viewer.get("elementRegistry");
      const canvas = viewer.get("canvas");
      canvas.zoom("fit-viewport", "auto");
      // Containers/structure that must not count as flow nodes.
      const SKIP = new Set([
        "label", "bpmn:Lane", "bpmn:Participant", "bpmn:Group",
        "bpmn:Collaboration", "bpmn:Process", "bpmn:SubProcess",
      ]);
      const nodes: any[] = [], edges: any[] = [], lanes: any[] = [], labels: any[] = [];
      registry.forEach((el: any) => {
        const t = el.type;
        if (el.waypoints) {
          if (t === "bpmn:SequenceFlow" || t === "bpmn:MessageFlow" || t === "bpmn:Association")
            edges.push({
              id: el.id,
              source: el.source && el.source.id,
              target: el.target && el.target.id,
              waypoints: el.waypoints.map((p: any) => ({ x: p.x, y: p.y })),
            });
          return;
        }
        if (t === "label") {
          // Real rendered bbox: diagram-js translates each gfx group to (el.x, el.y) and draws the
          // (possibly wrapped) text at local coords, so diagram-space bbox = el.{x,y} + getBBox().
          let x = el.x, y = el.y, wd = el.width, h = el.height;
          try {
            const b = registry.getGraphics(el).getBBox();
            x = el.x + b.x; y = el.y + b.y; wd = b.width; h = b.height;
          } catch (e) { /* unrendered / empty label — fall back to model bounds */ }
          labels.push({ id: el.id, owner: el.labelTarget && el.labelTarget.id, x, y, width: wd, height: h });
          return;
        }
        if (t === "bpmn:Lane") { lanes.push({ id: el.id, x: el.x, y: el.y, width: el.width, height: el.height }); return; }
        if (SKIP.has(t) || typeof el.x !== "number" || !el.parent) return;
        nodes.push({ id: el.id, x: el.x, y: el.y, width: el.width, height: el.height, type: t });
      });
      return { nodes, edges, lanes, labels, inner: canvas.viewbox().inner, warnings: (res.warnings || []).length };
    }, xml);

    if (screenshotPath) {
      const pad = 20;
      const W = Math.min(MAX_PX, Math.max(400, Math.ceil(scene.inner.width) + pad * 2));
      const H = Math.min(MAX_PX, Math.max(300, Math.ceil(scene.inner.height) + pad * 2));
      await page.setViewportSize({ width: W, height: H });
      // bpmn-js caches the container size; after resizing the viewport it must re-read it before
      // a fresh fit-viewport, otherwise it re-fits into the OLD size and renders into a corner.
      await page.evaluate(() => { const c = (window as any).__viewer.get("canvas"); c.resized(); c.zoom("fit-viewport", "auto"); });
      await page.screenshot({ path: screenshotPath, clip: { x: 0, y: 0, width: W, height: H } });
    }
    return scene as GeomScene;
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------------------------------------
// Model parse: lane membership + boundary hosts (from the semantic model, per the metrics contract)
// ---------------------------------------------------------------------------------------------

async function parseModel(xml: string): Promise<{ laneAssignment: Record<string, string>; boundaryHosts: Record<string, string> }> {
  const laneAssignment: Record<string, string> = {};
  const boundaryHosts: Record<string, string> = {};
  const { rootElement } = await new BpmnModdle().fromXML(xml);
  const walkLanes = (lanes: any[]) => {
    for (const lane of lanes ?? []) {
      for (const ref of lane.flowNodeRef ?? []) if (ref?.id) laneAssignment[ref.id] = lane.id;
      if (lane.childLaneSet?.lanes) walkLanes(lane.childLaneSet.lanes);
    }
  };
  const walkFlow = (elems: any[]) => {
    for (const fe of elems ?? []) {
      if (fe.$type === "bpmn:BoundaryEvent" && fe.attachedToRef?.id) boundaryHosts[fe.id] = fe.attachedToRef.id;
      if (fe.flowElements) walkFlow(fe.flowElements);
    }
  };
  for (const r of rootElement.rootElements ?? []) {
    if (r.$type !== "bpmn:Process") continue;
    for (const ls of r.laneSets ?? []) walkLanes(ls.lanes);
    walkFlow(r.flowElements ?? []);
  }
  return { laneAssignment, boundaryHosts };
}

async function buildScene(browser: Browser, xml: string, screenshotPath: string | null): Promise<{ scene: Scene; inner: GeomScene["inner"]; warnings: number }> {
  const geom = await renderScene(browser, xml, screenshotPath);
  const { laneAssignment, boundaryHosts } = await parseModel(xml);
  const scene: Scene = { nodes: geom.nodes, edges: geom.edges, lanes: geom.lanes, labels: geom.labels, laneAssignment, boundaryHosts };
  return { scene, inner: geom.inner, warnings: geom.warnings };
}

// ---------------------------------------------------------------------------------------------
// Diagram discovery
// ---------------------------------------------------------------------------------------------

function walkBpmn(dir: string): string[] {
  const out: string[] = [];
  const rec = (d: string) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      if (ent.isDirectory()) {
        if (ent.name !== ".history" && ent.name !== "_bpmn-design") rec(join(d, ent.name));
      } else if (ent.isFile() && ent.name.endsWith(".bpmn") && !/\.bak/i.test(ent.name)) {
        out.push(join(d, ent.name));
      }
    }
  };
  rec(dir);
  return out.sort();
}

function findDiagrams(): { root: string; fallback: boolean; files: string[] } {
  const qa = resolve(ROOT, "qa-workspace");
  if (existsSync(qa)) return { root: qa, fallback: false, files: walkBpmn(qa) };
  return { root: resolve(ROOT, "src/__fixtures__"), fallback: true, files: walkBpmn(resolve(ROOT, "src/__fixtures__")) };
}

/** Stable, filesystem-safe key per file: basename when unique, else the relative path. */
function deriveNames(files: string[], root: string): Map<string, string> {
  const byBase = new Map<string, number>();
  for (const f of files) byBase.set(basename(f, ".bpmn"), (byBase.get(basename(f, ".bpmn")) ?? 0) + 1);
  const names = new Map<string, string>();
  for (const f of files) {
    const b = basename(f, ".bpmn");
    const raw = (byBase.get(b) ?? 0) > 1 ? relative(root, f).replace(/\.bpmn$/i, "").split(sep).join("__") : b;
    names.set(f, raw.replace(/[^\w.-]+/g, "-"));
  }
  return names;
}

// ---------------------------------------------------------------------------------------------
// Ratchet
// ---------------------------------------------------------------------------------------------

interface Baseline { generatedAt: string; note: string; diagrams: Record<string, MetricsReport> }

function loadBaseline(): Baseline | null {
  if (!existsSync(BASELINE_PATH)) return null;
  try { return JSON.parse(readFileSync(BASELINE_PATH, "utf8")); } catch { return null; }
}

interface HardViolation { rule: string; count: number }
function hardViolations(m: MetricsReport): HardViolation[] {
  const v: HardViolation[] = [];
  if (m.lanes.violations > 0) v.push({ rule: "lanes.violations", count: m.lanes.violations });
  if (m.overlaps.total > 0) v.push({ rule: "overlaps.total", count: m.overlaps.total });
  if (m.clips.vertical > 0) v.push({ rule: "clips.vertical", count: m.clips.vertical });
  return v;
}

interface SoftRegression { metric: string; baseline: number; after: number; delta: number }
function softRegressions(after: MetricsReport, base: MetricsReport): SoftRegression[] {
  const r: SoftRegression[] = [];
  const upBad = (metric: string, a: number, b: number, factor = 1) => { if (a > b * factor) r.push({ metric, baseline: b, after: a, delta: round(a - b) }); };
  upBad("crossings.total", after.crossings.total, base.crossings.total);
  upBad("clips.horizontal", after.clips.horizontal, base.clips.horizontal);
  if (after.straightness.straightPct < base.straightness.straightPct - PCT_TOL)
    r.push({ metric: "straightness.straightPct", baseline: base.straightness.straightPct, after: after.straightness.straightPct, delta: round(after.straightness.straightPct - base.straightness.straightPct) });
  upBad("straightness.sameRowBends", after.straightness.sameRowBends, base.straightness.sameRowBends);
  upBad("straightness.dodges", after.straightness.dodges, base.straightness.dodges);
  upBad("cohesion.meanEdgeLength", after.cohesion.meanEdgeLength, base.cohesion.meanEdgeLength, 1 + AREA_TOL);
  upBad("cohesion.bboxArea", after.cohesion.bboxArea, base.cohesion.bboxArea, 1 + AREA_TOL);
  return r;
}

// ---------------------------------------------------------------------------------------------
// Report rendering
// ---------------------------------------------------------------------------------------------

const round = (n: number) => Math.round(n * 100) / 100;

interface DiagramResult {
  name: string;
  file: string;
  kind: string;
  laneCount: number;
  screenshots: { before: string; after: string };
  before: MetricsReport | null;
  after: MetricsReport | null;
  baseline: MetricsReport | null;
  hard: HardViolation[];
  soft: SoftRegression[];
  renderError: string | null;
  warnings: number;
}

// Rows for the per-diagram table: [label, path into MetricsReport, kind]. HARD rows have no baseline.
const METRIC_ROWS: { label: string; get: (m: MetricsReport) => number; hard?: boolean; soft?: boolean }[] = [
  { label: "crossings.total", get: (m) => m.crossings.total, soft: true },
  { label: "crossings.hv", get: (m) => m.crossings.hv },
  { label: "crossings.hh", get: (m) => m.crossings.hh },
  { label: "crossings.vv", get: (m) => m.crossings.vv },
  { label: "clips.horizontal", get: (m) => m.clips.horizontal, soft: true },
  { label: "clips.vertical", get: (m) => m.clips.vertical, hard: true },
  { label: "overlaps.total", get: (m) => m.overlaps.total, hard: true },
  { label: "overlaps.nodeNode", get: (m) => m.overlaps.nodeNode },
  { label: "overlaps.labelLabel", get: (m) => m.overlaps.labelLabel },
  { label: "overlaps.labelNode", get: (m) => m.overlaps.labelNode },
  { label: "lanes.violations", get: (m) => m.lanes.violations, hard: true },
  { label: "lanes.outOfLane", get: (m) => m.lanes.outOfLane },
  { label: "lanes.bandOverlaps", get: (m) => m.lanes.bandOverlaps },
  { label: "lanes.missingLaneShapes", get: (m) => m.lanes.missingLaneShapes },
  { label: "straightness.straightPct", get: (m) => m.straightness.straightPct, soft: true },
  { label: "straightness.sameRowBends", get: (m) => m.straightness.sameRowBends, soft: true },
  { label: "straightness.dodges", get: (m) => m.straightness.dodges, soft: true },
  { label: "cohesion.meanEdgeLength", get: (m) => m.cohesion.meanEdgeLength, soft: true },
  { label: "cohesion.totalEdgeLength", get: (m) => m.cohesion.totalEdgeLength },
  { label: "cohesion.bboxArea", get: (m) => m.cohesion.bboxArea, soft: true },
];

function diagramTable(d: DiagramResult): string {
  if (!d.after || !d.before) return `_Not scored: ${d.renderError ?? "render/layout failure"}._\n`;
  const soft = new Map(d.soft.map((s) => [s.metric, s]));
  const lines = ["| metric | before | after | baseline | Δ vs base | status |", "|---|--:|--:|--:|--:|---|"];
  for (const row of METRIC_ROWS) {
    const before = round(row.get(d.before));
    const after = round(row.get(d.after));
    const base = d.baseline ? round(row.get(d.baseline)) : null;
    const delta = base === null ? "" : fmtDelta(after - base);
    let status = "";
    if (row.hard) status = after > 0 ? "✗ HARD" : "ok";
    else if (row.soft) status = soft.has(row.label) ? "⚠ regression" : (base === null ? "new" : "ok");
    const label = row.hard ? `${row.label} (HARD)` : row.soft ? `${row.label} (soft)` : row.label;
    lines.push(`| ${label} | ${before} | ${after} | ${base ?? "—"} | ${delta} | ${status} |`);
  }
  return lines.join("\n") + "\n";
}

const fmtDelta = (n: number) => { const r = round(n); return r > 0 ? `+${r}` : `${r}`; };

function renderMarkdown(ctx: ReportContext): string {
  const { results, skipped, source, mode, exitCode, generatedAt } = ctx;
  const scored = results.filter((r) => r.after);
  const hardDiagrams = scored.filter((r) => r.hard.length);
  const softDiagrams = scored.filter((r) => r.soft.length);
  const failed = results.filter((r) => r.renderError);
  const L: string[] = [];
  L.push("# Layout QA report", "");
  L.push(`- Generated: ${generatedAt}`);
  L.push(`- Source: \`${source.dir}\`${source.fallback ? " **(FALLBACK — qa-workspace absent; scanned src/__fixtures__)**" : ""} — ${results.length} diagram(s)`);
  L.push(`- Mode: **${mode}**`);
  L.push("- Render: real bpmn-js (chromium headless); viewer injected via addScriptTag (no file:// nav, no headed fallback needed)");
  L.push(`- Result: **${exitCode === 0 ? "PASS" : "FAIL"}** (exit ${exitCode}) — ${hardDiagrams.length} diagram(s) with hard violations, ${softDiagrams.length} with soft regressions`);
  L.push("");
  L.push("## Totals", "");
  L.push("| | count |", "|---|--:|");
  L.push(`| diagrams processed | ${results.length} |`);
  L.push(`| diagrams with hard violations | ${hardDiagrams.length} |`);
  L.push(`| diagrams with soft regressions | ${softDiagrams.length} |`);
  L.push(`| skipped (in baseline, not found) | ${skipped.length} |`);
  L.push(`| render/layout failures | ${failed.length} |`);
  L.push("");
  if (hardDiagrams.length) {
    L.push("## Hard violations (absolute — never baselined away)", "");
    for (const d of hardDiagrams) L.push(`- **${d.name}**: ${d.hard.map((h) => `${h.rule}=${h.count}`).join(", ")}`);
    L.push("");
  }
  if (softDiagrams.length) {
    L.push("## Soft regressions (vs baseline)", "");
    for (const d of softDiagrams) L.push(`- **${d.name}**: ${d.soft.map((s) => `${s.metric} ${s.baseline}→${s.after} (${fmtDelta(s.delta)})`).join(", ")}`);
    L.push("");
  }
  if (skipped.length) { L.push("## Skipped (present in baseline, not found this run — never counted as passing)", ""); for (const s of skipped) L.push(`- ${s}`); L.push(""); }
  if (failed.length) { L.push("## Render / layout failures", ""); for (const d of failed) L.push(`- **${d.name}**: ${d.renderError}`); L.push(""); }
  L.push("## Per-diagram", "");
  for (const d of results) {
    L.push(`### ${d.name}  \`[${d.kind}]\`${d.warnings ? ` — ${d.warnings} import warning(s)` : ""}`);
    L.push(`Screenshots: \`${d.screenshots.before}\` · \`${d.screenshots.after}\``);
    L.push("");
    L.push(diagramTable(d));
  }
  return L.join("\n");
}

interface ReportContext {
  results: DiagramResult[];
  skipped: string[];
  source: { dir: string; fallback: boolean };
  mode: string;
  exitCode: number;
  generatedAt: string;
}

// ---------------------------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------------------------

async function runSweep(browser: Browser, opts: { updateBaseline: boolean }): Promise<number> {
  const { computeMetrics } = await import("../src/layoutMetrics");
  const { root, fallback, files } = findDiagrams();
  const names = deriveNames(files, root);
  const baseline = loadBaseline();
  const mode = opts.updateBaseline ? "baseline-updated" : baseline ? "ratchet" : "baseline-created";
  console.log(`layout-qa: ${files.length} diagram(s) from ${root}${fallback ? " (FALLBACK)" : ""}; mode=${mode}`);

  const results: DiagramResult[] = [];
  for (const file of files) {
    const name = names.get(file)!;
    const beforePng = resolve(OUT, `${name}.before.png`);
    const afterPng = resolve(OUT, `${name}.after.png`);
    const result: DiagramResult = {
      name, file, kind: "?", laneCount: 0,
      screenshots: { before: relative(ROOT, beforePng), after: relative(ROOT, afterPng) },
      before: null, after: null, baseline: baseline?.diagrams[name] ?? null,
      hard: [], soft: [], renderError: null, warnings: 0,
    };
    try {
      const src = readFileSync(file, "utf8");
      const afterXml = await layoutDiagramElk(src);
      const beforeScene = await buildScene(browser, src, beforePng);
      const afterScene = await buildScene(browser, afterXml, afterPng);
      result.laneCount = afterScene.scene.lanes.length;
      result.kind = afterScene.scene.lanes.length ? `lanes×${afterScene.scene.lanes.length}` : "process";
      result.warnings = afterScene.warnings;
      result.before = computeMetrics(beforeScene.scene);
      result.after = computeMetrics(afterScene.scene);
      result.hard = hardViolations(result.after);
      if (!opts.updateBaseline && result.baseline) result.soft = softRegressions(result.after, result.baseline);
      const flags = [result.hard.length ? `HARD:${result.hard.map((h) => h.rule).join("+")}` : "", result.soft.length ? `SOFT:${result.soft.length}` : ""].filter(Boolean).join(" ");
      console.log(`  ${name.padEnd(40)} ${result.kind.padEnd(10)} ${flags || "ok"}`);
    } catch (e) {
      result.renderError = e instanceof Error ? e.message : String(e);
      console.log(`  ${name.padEnd(40)} RENDER/LAYOUT ERROR: ${result.renderError}`);
    }
    results.push(result);
  }

  // Diagrams present in the baseline but absent this run are skipped, never treated as passing.
  const foundNames = new Set(results.map((r) => r.name));
  const skipped = baseline ? Object.keys(baseline.diagrams).filter((n) => !foundNames.has(n)) : [];

  const anyHard = results.some((r) => r.hard.length);
  const anySoft = results.some((r) => r.soft.length);
  const anyError = results.some((r) => r.renderError);
  const exitCode = anyHard || anySoft || anyError || skipped.length > 0 ? 1 : 0;

  // Baseline write: first run creates it; --update-baseline rewrites it. Only scored diagrams.
  if (!baseline || opts.updateBaseline) {
    const diagrams: Record<string, MetricsReport> = {};
    for (const r of results) if (r.after) diagrams[r.name] = r.after;
    const out: Baseline = {
      generatedAt: new Date().toISOString(),
      note: "Soft-metric ratchet baseline for layout-qa (per diagram). Hard rules are absolute and never stored here.",
      diagrams,
    };
    writeFileSync(BASELINE_PATH, JSON.stringify(out, null, 2) + "\n");
    console.log(`layout-qa: ${baseline ? "updated" : "created"} baseline ${relative(ROOT, BASELINE_PATH)} (${Object.keys(diagrams).length} diagrams)`);
  }

  const generatedAt = new Date().toISOString();
  const ctx: ReportContext = { results, skipped, source: { dir: relative(ROOT, root) || root, fallback }, mode, exitCode, generatedAt };
  writeFileSync(resolve(OUT, "report.md"), renderMarkdown(ctx));
  writeFileSync(resolve(OUT, "report.json"), JSON.stringify({
    generatedAt, mode, exitCode,
    source: { dir: relative(ROOT, root) || root, fallback, count: files.length },
    totals: {
      processed: results.length,
      hardViolationDiagrams: results.filter((r) => r.hard.length).length,
      softRegressionDiagrams: results.filter((r) => r.soft.length).length,
      skipped: skipped.length,
      renderFailures: results.filter((r) => r.renderError).length,
    },
    diagrams: Object.fromEntries(results.map((r) => [r.name, {
      file: relative(ROOT, r.file), kind: r.kind, laneCount: r.laneCount, warnings: r.warnings,
      screenshots: r.screenshots, before: r.before, after: r.after, baseline: r.baseline,
      hardViolations: r.hard, softRegressions: r.soft, renderError: r.renderError,
    }])),
    skipped,
  }, null, 2) + "\n");

  console.log(`layout-qa: wrote report.md + report.json to ${relative(ROOT, OUT)}. exit=${exitCode}`);
  if (exitCode !== 0) {
    if (anyHard) console.log(`  ${results.filter((r) => r.hard.length).length} diagram(s) have HARD violations (see report).`);
    if (anySoft) console.log(`  ${results.filter((r) => r.soft.length).length} diagram(s) have SOFT regressions vs baseline.`);
    if (skipped.length) console.log(`  ${skipped.length} baseline diagram(s) missing this run.`);
    if (anyError) console.log(`  ${results.filter((r) => r.renderError).length} diagram(s) failed to render/layout.`);
  }
  return exitCode;
}

// ---------------------------------------------------------------------------------------------
// Fixture emit (real AFTER scene for the metrics test suite) — independent of computeMetrics
// ---------------------------------------------------------------------------------------------

/** Round every numeric coord to 2dp so the committed fixture stays diff-friendly. */
function roundScene(scene: Scene): Scene {
  const rn = (n: number) => Math.round(n * 100) / 100;
  return {
    nodes: scene.nodes.map((n) => ({ ...n, x: rn(n.x), y: rn(n.y), width: rn(n.width), height: rn(n.height) })),
    edges: scene.edges.map((e) => ({ ...e, waypoints: e.waypoints.map((w) => ({ x: rn(w.x), y: rn(w.y) })) })),
    lanes: scene.lanes.map((l) => ({ ...l, x: rn(l.x), y: rn(l.y), width: rn(l.width), height: rn(l.height) })),
    labels: scene.labels.map((l) => ({ ...l, x: rn(l.x), y: rn(l.y), width: rn(l.width), height: rn(l.height) })),
    laneAssignment: scene.laneAssignment,
    boundaryHosts: scene.boundaryHosts,
  };
}

async function emitSceneFixture(browser: Browser): Promise<void> {
  const src = readFileSync(FIXTURE_BPMN, "utf8");
  const afterXml = await layoutDiagramElk(src);
  const { scene } = await buildScene(browser, afterXml, null);
  writeFileSync(FIXTURE_SCENE, JSON.stringify(roundScene(scene), null, 2) + "\n");
  console.log(`layout-qa: wrote real-scene fixture ${relative(ROOT, FIXTURE_SCENE)} (nodes=${scene.nodes.length}, edges=${scene.edges.length}, lanes=${scene.lanes.length}, labels=${scene.labels.length})`);
}

// ---------------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    if (args.includes("--emit-fixture")) { await emitSceneFixture(browser); return; }
    const code = await runSweep(browser, { updateBaseline: args.includes("--update-baseline") });
    process.exitCode = code;
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error("layout-qa failed:", e); process.exit(1); });
