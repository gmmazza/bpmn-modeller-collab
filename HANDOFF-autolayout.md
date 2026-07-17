# Auto-organization (Auto-organizar) — WIP handoff

**Status:** work-in-progress on branch **`feat/autolayout-d`** (27 commits on top of `main` = `30d6ae0`).
NOT merged to `main`. Pushed to `origin` as a WIP branch. Resume here in a clean context.

**Feature D from the backlog** ("Auto-organizar"): a toolbar button that re-lays the current
`.bpmn` diagram. Fully working end-to-end (browser + Electron), verified across 15 refinement
rounds against the real Novotec diagram. This doc is the concise handoff — the blow-by-blow
history lives in the auto-memory `d-autolayout-status.md` if you need it.

---

## 1. What ships today (all working, all tested)

- **Primary button `#autolayout` = elkjs engine.** bpmn-auto-layout was demoted to a
  **"Modo rápido (backup)"** menu item. The caret `▾` (`#autolayout-caret`) opens the
  **"opciones de organización"** dropdown: variants (Flujo horizontal / vertical / Árbol —
  remembered in `localStorage` key `bpmn.autolayout.elkVariant`), **"Reorganizar solo la
  selección"**, and the backup.
- **Three diagram shapes handled:**
  - **Plain single process** → elk layered layout (clean, high quality).
  - **Swimlanes (pools/lanes, no phase groups)** → `renderProcess` (elk seeded-Y).
  - **Matrix (lanes × phase groups)** → `renderMatrix` (custom, elk can't do 2-D matrices).
- **Undoable** everywhere: coarse-undo snapshot in the main editor; one-slot snapshot in the
  master pane; `modeling.moveElements` (native) for reorganize-selection. `Ctrl+Z` reverts.
- **Preserves:** shape colors (`bioc:fill`/`stroke` — reuses old DI shapes), `bpmn:Group`
  phase boxes (rebuilt by membership), pools/lanes.
- Enabled on the editable **master pane** too.

**Known engine gap:** the **backup (bpmn-auto-layout)** engine still drops colors/groups
(emits fresh DI). For styled diagrams, use the primary (elk). Fixable in `layoutTidy.ts` if wanted.

---

## 2. Architecture / where things live

- `src/autoLayout.ts` — `layoutDiagram(xml)` (bpmn-auto-layout backup + `tidyLayout`),
  `UnsupportedLayoutError`.
- `src/layoutTidy.ts` — quick-wins for the backup engine (restore box sizes, `labelNearSource`).
- **`src/layoutElk.ts`** — the main engine. Key functions:
  - `layoutDiagramElk(xml, variantId)` — entry; dispatches collaboration → `layoutCollaborationElk`.
  - `ELK_VARIANTS`, `resolveElkVariant`, `DEFAULT_ELK_VARIANT`.
  - `renderProcess(...)` — single process / plain swimlane (elk seeded-Y + INTERACTIVE nodePlacement).
  - **`renderMatrix(process, groups, ...)`** — the matrix layouter (see §3). This is where the
    active refinement is.
  - `layoutCollaborationElk(...)` — pools; picks `renderMatrix` when groups exist, else `renderProcess`.
  - `emitGroups(...)` — phase boxes for the non-matrix path (membership inference).
  - `branchLabelPos(...)` — stacks a gateway's Sí/No labels down its right side.
  - `layoutSubgraphElk(...)` — reorganize-selection.
- `src/main.ts` — toolbar HTML (`#autolayout`, `#autolayout-caret`, `#autolayout-pop`),
  `doAutoLayout(engine)`, `doAutoLayoutMaster(engine)`, `reorganizeSelection()`, variant
  persistence, the dropdown wiring, coarse-undo, master one-slot undo.
- `src/icons.ts` — `autoLayout` icon.
- **Tests:** `src/layoutElk.test.ts` (synthetic units), `src/layoutTidy.test.ts`,
  `src/autoLayout.test.ts`, `src/contextMenu.test.ts`, and — the important one —
  **`src/layoutElkReal.test.ts`** which runs on the REAL fixture (see §5).
  E2E: `e2e/autolayout.spec.ts`.
- **Fixture:** `src/__fixtures__/novotec-matrix.bpmn` — committed copy of the real Novotec
  matrix (7 lanes × 6 phase groups, colored). `qa-workspace/` is gitignored, hence the copy.

---

## 3. The matrix layouter + top-exit channel router (the current focus)

`renderMatrix` places each node in its **cell** (column = its phase group, ordered by old x;
row = its lane), then routes edges. This is what preserves the 2-D matrix (elk destroys it —
verified: elk moves nodes ~409px avg).

- **Placement:** cell members side by side (horizontal flow reads left→right). Columns widen to
  the widest cell; lane bands fit the tallest node + `PAD`; each lane also reserves a top
  **channel strip** (`laneExtra`) for horizontal connector tracks.
- **Routing (`routeCell` was replaced by a planned two-phase channel router):** every
  non-straight edge **leaves its source from the TOP** into the source lane's (empty) channel
  strip, runs across that strip to a **column gutter**, **drops through the gutter** (empty
  between columns) to the target lane's strip, runs across, and **enters the target from the
  top**. Straight = same lane + same/adjacent column (the main flow).
- **Tracks:** each connector gets its own track in the strips it uses and the gutter it drops
  through; **gutters/strips widen to fit their tracks** (connectors act as spacers → decompression).
- **Result on the real fixture:** 2 edge-through-node crossings (was 14 for the naive router),
  0 node/lane/group overlaps, width 1.5k→2.7k (decompressed), horizontal flow preserved.

**Key probe result to remember:** elk (`layered` + all-INTERACTIVE strategies) routes at ~3
crossings but re-layouts nodes (~409px drift) → cannot be used to route on fixed matrix
positions. The top-exit channel router replicates the clean-routing idea on the fixed matrix.

---

## 4. Open refinement items (pick up here)

1. **Channel bands look dense.** All non-straight edges pile into the lane top strips, so the
   strip band above a busy lane has many parallel horizontals. Ideas: reuse a track when two
   edges don't overlap in x; route some edges through the strip BELOW a lane; cap strip height.
2. **2 residual crossings** on the real fixture. Investigate with the XML analysis in §5;
   likely a boundary-event edge or a same-cell case the top-exit doesn't cover.
3. **Backup engine (bpmn-auto-layout) loses colors/groups** — port the old-shape-reuse trick
   from `layoutElk` into `layoutTidy` if the backup needs parity.
4. **Vertical variant + matrix**: the variant menu (horizontal/vertical/tree) only affects the
   plain/swimlane path; matrix is always horizontal. Decide if vertical matrix is wanted.
5. **Reorganize-selection happy path** is only unit-tested (`layoutSubgraphElk`); the e2e tests
   the guard (clicking bpmn-js shapes in e2e is flaky — the Token Simulation `.bts-toggle-mode`
   overlays the top-left). If you want an e2e happy path, drive selection via evaluate/hook.

---

## 5. How to verify (do this, don't trust green tests alone)

**QA rule for this account:** validate against the REAL fixture and inspect the real generated
output — synthetic green tests hid real defects here (see git history). Techniques:

- **Full checks:** `npm test` (Vitest), `npm run typecheck`, `npm run build`.
- **Real-fixture regression:** `npx vitest run src/layoutElkReal.test.ts` — asserts: a shape per
  node, an edge per flow, a label per named flow, **0 node/lane/group overlaps**, non-overlapping
  lane bands + phase columns, separated gateway labels, and **edge-through-node crossings ≤ 4**
  (2 today). This is the test that catches the real bugs.
- **Inspect the real output** (the analysis workflow used all session): run
  `layoutDiagramElk` on `src/__fixtures__/novotec-matrix.bpmn` via `npx vite-node`, parse the
  output with `bpmn-moddle`, and measure: node-node overlaps, lane/group X/Y overlaps, and
  **edge segments crossing non-endpoint node rectangles** (axis-aligned segment-vs-rect). This
  is how every routing regression was found — measure, don't eyeball.
- **Screenshot the real diagram:** temp Playwright config on an **isolated port** (see gotchas)
  + `installFsMock` loading the fixture, click `#autolayout`, screenshot `#canvas`, then `Read`
  the PNG. This is the only reliable visual check.

---

## 6. Gotchas (all real, all cost time this session)

- **e2e port collision:** the **Pivotara** project's Vite dev server often holds **:5173**, and
  Playwright's `reuseExistingServer` then connects to the wrong app (the "Elegir carpeta" gate
  never appears; all specs fail identically). Fix: run with a temp config on `--port 5178
  --strictPort` + `reuseExistingServer:false`. Do NOT kill the user's other dev server.
- **e2e must run `--headed`** in this repo (headless aborts navigation, `net::ERR_ABORTED`).
- **Packaging is blocked while the exe is open:** `npm run pack:win` fails with `rmdir release/…`
  if a previously-packaged exe is running. Each round packaged to a fresh `release-rN/` via a
  one-off `packager({out:'release-rN'})`. **All `release*` dirs are gitignored.** There are ~15
  of them (~2.5 GB) — **CLEANUP TODO:** once the user closes all exes, delete `release-r*`/
  `release-new`, and either `npm run pack:win` fresh into `release/` or leave it.
- **bpmn-moddle has no types:** import with `// @ts-expect-error` + `import { BpmnModdle } from
  "bpmn-moddle"` (named export; the default export is not a constructor under Vitest/esbuild).
- **Reading the fixture in tests:** `readFileSync("src/__fixtures__/novotec-matrix.bpmn")`
  (cwd-relative). `new URL(..., import.meta.url)` did NOT load under Vitest.
- **`layoutSubgraphElk`/`resolveElkVariant`/`getElk`** are referenced before declaration in the
  file — fine (function hoisting), don't "fix" the order.

---

## 7. Closeout state

- Branch `feat/autolayout-d` pushed to `origin` (WIP). Working tree clean.
- `main` unchanged at `30d6ae0` (still the released 0.6.0). **Not merged** — decide merge +
  version bump + GitHub release when the routing is signed off.
- Latest exe for manual testing: `release-r15/BPMN compartida-win32-x64/BPMN compartida.exe`
  (regenerate with `npm run pack:win` after cleaning locked `release*` dirs).
- No version bump done. When merging: bump `package.json`, update `CHANGELOG`/`README`, tag,
  cut the GitHub release (self-update reads `/releases/latest` + the portable `.zip` asset).
