# Auto-organization (Auto-organizar) — WIP handoff

**Status:** SHIPPED in **v0.6.5** (2026-07-18) — `feat/autolayout-d` merged to `main` and released.
This doc is kept as the design/rationale record for the layouter; the blow-by-blow history lives
in the auto-memory `d-autolayout-status.md`.

**Feature D from the backlog** ("Auto-organizar"): a toolbar button that re-lays the current
`.bpmn` diagram. Fully working end-to-end (browser + Electron), verified across 15 refinement
rounds against the real Novotec diagram. This doc is the concise handoff — the blow-by-blow
history lives in the auto-memory `d-autolayout-status.md` if you need it.

---

## 1. What ships today (all working, all tested)

- **Primary button `#autolayout` = elkjs engine.** bpmn-auto-layout was demoted to a
  **"Modo rápido (backup)"** menu item. The caret `▾` (`#autolayout-caret`) opens the
  **"opciones de organización"** dropdown: **"Reorganizar solo la selección"** and the backup.
  Layout is **horizontal-only** — the earlier selectable vertical / árbol (tree) variants and
  their `localStorage` persistence were removed.
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
  - `layoutDiagramElk(xml)` — entry; dispatches collaboration → `layoutCollaborationElk`.
  - `LAYOUT_OPTIONS` — the single horizontal (left→right) elk option set (no variants).
  - `renderProcess(...)` — single process / plain swimlane (elk seeded-Y + INTERACTIVE nodePlacement).
  - **`renderMatrix(process, groups, ...)`** — the matrix layouter (see §3). This is where the
    active refinement is.
  - `layoutCollaborationElk(...)` — pools; picks `renderMatrix` when groups exist, else `renderProcess`.
  - `emitGroups(...)` — phase boxes for the non-matrix path (membership inference).
  - `branchLabelPos(...)` — stacks a gateway's Sí/No labels down its right side.
  - `layoutSubgraphElk(...)` — reorganize-selection.
- `src/main.ts` — toolbar HTML (`#autolayout`, `#autolayout-caret`, `#autolayout-pop`),
  `doAutoLayout(engine)`, `doAutoLayoutMaster(engine)`, `reorganizeSelection()`, the dropdown
  wiring, coarse-undo, master one-slot undo.
- `src/icons.ts` — `autoLayout` icon.
- **Tests:** `src/layoutElk.test.ts` (synthetic units), `src/layoutTidy.test.ts`,
  `src/autoLayout.test.ts`, `src/contextMenu.test.ts`, and — the important one —
  **`src/layoutElkReal.test.ts`** which runs on the REAL fixture (see §5).
  E2E: `e2e/autolayout.spec.ts`.
- **Fixture:** `src/__fixtures__/novotec-matrix.bpmn` — committed copy of the real Novotec
  matrix (7 lanes × 6 phase groups, colored). `qa-workspace/` is gitignored, hence the copy.

---

## 3. The matrix layouter — hybrid fine columns + compact side router (RONDA 17 — current)

`renderMatrix` places each node in a **fine column** (X) at its **lane band** (Y), then routes
edges. This preserves the 2-D matrix (elk destroys it — verified: elk moves nodes ~409px avg)
AND reads like the hand-authored flow.

- **Fine columns by FLOW GENERATION (RONDA 18):** each node's `gen` = longest-path depth in the
  sequence-flow graph (DFS, cycle-guarded; boundary events inherit the host's gen). Within each phase,
  nodes are bucketed by `gen` into *fine columns* (was old-x clustering in R17 — generations are the
  truth, so a successor lands STRICTLY later and nodes never stack at the same x). A phase's fine
  columns are **consecutive**, so its box stays one clean contiguous X band (no round-11 mush). Same-
  gen nodes in different lanes share a fine column (parallel branches align). Phase-boundary gutters get
  `+PHASE_GAP`. `phaseFc[p]` = the lo/hi fine-column range of phase p.
- **Placement:** each node centred in its fine cell; **lane bands fit the tallest node + `PAD`
  only** — no top channel strip.
- **Obstacle-aware router (RONDA 19-21):** the user's rule — max horizontality, stay INSIDE the lane,
  make the ONE vertical at the LAST moment (just before the target). Per cross-lane edge, `laneClear(a,b,lane)`
  (topological — is that lane empty in the fine columns between a and b, from `cells`) decides:
  **source lane clear → drop-late** (`kind:"gutter"`, vertical in the gutter beside the TARGET, horizontal
  at the source's row — stays in the source lane); **else target lane clear → drop-early** (vertical beside
  the source, horizontal at the target's row); **else → highway** (a clear INTER-LANE CHANNEL, 2 verticals,
  used by the few edges where both rows are blocked, so channels stay thin). Port-sides: forward exits EAST
  / enters WEST (gutter beside target, never past it). Port distribution: `exitY`/`entryY` spread an edge
  along a node's side ordered by the other endpoint's Y, so a gateway's branches never leave/enter one
  overprinted point. One-node-per-cell fine-column split so an edge never passes a cell-mate. Result on the
  fixture: 0 node crossings, 0 right-entries, 0 overprinted ports.
- **Why the change:** the old top-exit router piled all 30 non-straight edges into fat `laneExtra`
  strips above each lane → lanes **doubled** (890→1946 tall) and the diagram became edge spaghetti,
  even though the crossings metric was green (2). The user chose *compact like the authored diagram*
  over zero-crossings. Now the vertical-through-gutter part (the genuinely good idea) is kept — so
  **verticals never cross a node** — while horizontals run at node rows and may clip a same-row node.
- **Result on the real fixture (RONDA 18):** height **1082** (authored 890, +18% for the routing
  channels — not the 2× of the old strip), width **6582** (wide: every generation is a column, so the
  diagram is airy — tunable via `COL_GAP`/`CELL_GAP`/colW-min). No node stacking, flow steps left→right,
  phase columns clean & non-overlapping, connectors mostly short with the long ones in channels.
  **2 residual horizontal corner-clips** (0 vertical), down from 14. 0 node/lane/group overlaps.

**Key probe result to remember:** elk (`layered` + all-INTERACTIVE strategies) routes at ~3
crossings but re-layouts nodes (~409px drift) → cannot be used to route on fixed matrix positions.

---

## 4. Open refinement items (pick up here)

1. ~~**Channel bands look dense.**~~ **RESOLVED in RONDA 16** — replaced the top-exit channel
   router with compact side routing (see §3); lane bands no longer inflate.
2. **14 horizontal-clip crossings** on the real fixture (accepted trade-off for compactness).
   If zero crossings are wanted back WITHOUT inflating bands, the next step is a real
   obstacle-avoiding router (visibility-graph / A* over the gutter×row grid) — the big piece.
3. **Backup engine (bpmn-auto-layout) loses colors/groups** — port the old-shape-reuse trick
   from `layoutElk` into `layoutTidy` if the backup needs parity.
4. **Reorganize-selection happy path** is only unit-tested (`layoutSubgraphElk`); the e2e tests
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
