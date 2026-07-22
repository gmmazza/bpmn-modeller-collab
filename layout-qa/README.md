# Layout QA harness

Permanent, real-render QA loop for the auto-layout engine (`Auto-organizar`,
`layoutDiagramElk` in `src/layoutElk.ts`). It replaced a manual "pack the exe, open it, look"
iteration loop with an automated one: every real workspace diagram gets rendered BEFORE and
AFTER auto-layout with real bpmn-js in headless Chromium, measured against objective
geometry metrics, and diffed against a committed ratchet baseline — plus PNGs for eyeball
review. The 12 rules the metrics encode are documented in **[`reglas.md`](reglas.md)**
(Spanish — the canonical, user-reviewable rule spec; edit rules there, not here).

## How to run

```bash
npm run layout:qa                       # ratchet run — measure vs. committed baseline
npm run layout:qa -- --update-baseline  # rewrite layout-qa/baseline.json from this run
npm run layout:qa -- --emit-fixture     # write src/__fixtures__/scene-novotec-matrix.json
                                         # (a real AFTER scene for the layoutMetrics test
                                         # suite) and exit — no sweep, no metrics
```

(`npm run layout:qa` itself is `npx vite-node scripts/layout-qa.ts` — see
`scripts/layout-qa.ts` for the exact flag parsing if this drifts.)

**`--emit-fixture` is a deliberate re-baseline, not a free read.** It overwrites the committed
`src/__fixtures__/scene-novotec-matrix.json` with whatever the CURRENT layouter produces, and
`src/layoutMetrics.test.ts` pins exact numbers against that file (element counts 42 nodes / 43
edges / 7 lanes / 35 labels, `crossings` = `{hv:10, hh:0, vv:0, total:10}`). If the layouter
has changed since the fixture was last captured, re-run `--emit-fixture` and update those
pinned values in `src/layoutMetrics.test.ts` in the SAME commit — otherwise the test silently
stops guarding the geometry it's meant to pin. (The fixture currently committed predates the
T6 round and still carries an `overlaps.labelNode` of 1 that was fixed live since — the test
deliberately does not assert an exact value there, to avoid pinning a number already known to
be stale.)

Each run:
1. Scans real `.bpmn` files (see **Fixture source** below).
2. For each, renders the AUTHORED diagram (before) and the auto-organized one (after
   `layoutDiagramElk` — the same entry point the app's `Auto-organizar` button calls) with
   real bpmn-js in headless Chromium.
3. Extracts the live scene: element geometry, connection waypoints, and REAL rendered label
   bounding boxes (`SVG getBBox()` — the DI's 14px height hint lies; a wrapped 2-line label
   measures ~28px).
4. Scores both scenes with `computeMetrics` (`src/layoutMetrics.ts`).
5. Gates the AFTER scene against hard rules and the committed baseline (see below).

## What it produces

- `layout-qa/out/` (gitignored, regenerated every run):
  - `<name>.before.png`, `<name>.after.png` — one pair per diagram, fit-to-diagram
    screenshots for eyeball review.
  - `report.md` — human-readable: totals, hard violations, soft regressions, then a full
    metric table per diagram (before / after / baseline / Δ / status).
  - `report.json` — the same data, structured, for tooling.
- `layout-qa/baseline.json` (**committed**) — one full `MetricsReport` per diagram, hard-rule
  fields included. It's the ratchet reference for SOFT metrics only: the hard-rule fields it
  stores are kept for reference, never used as a gate — hard rules are always checked against
  `0` directly (see `hardViolations()` in `scripts/layout-qa.ts`), not against this file.

## Hard vs. soft semantics

- **Hard rules** (`lanes.violations`, `overlaps.total`, `clips.vertical` — rules 1–3 in
  `reglas.md`): absolute, tolerance 0, checked against `0` every run — never against the
  baseline (the baseline stores these fields too, but only for reference; see "What it
  produces" above). Any diagram with a nonzero value fails the whole run (exit 1).
- **Soft metrics** (`crossings.total`, `clips.horizontal`, `straightness.straightPct`,
  `straightness.sameRowBends`, `straightness.dodges`, `cohesion.meanEdgeLength`,
  `cohesion.bboxArea` — rules 4, 7, 10–12): ratcheted per diagram against
  `layout-qa/baseline.json`. A value worse than the baseline (beyond a small tolerance —
  0.02 relative for cohesion area/length, 0.5 percentage points for `straightPct`) is a
  regression and fails the run. Missing diagrams (present in the baseline, absent this run)
  are **skipped and reported, never treated as passing** — that includes a fresh clone
  without `qa-workspace` (see below): it deliberately exits 1 rather than silently going
  green with zero diagrams checked.

## Ratchet workflow

1. **Measure**: `npm run layout:qa`. Read `report.md`'s "Hard violations" / "Soft
   regressions" sections first — they list only what's actually wrong.
2. **Fix**: change the layouter (`src/layoutElk.ts`) for the worst offender.
3. **Re-measure**: `npm run layout:qa` again.
4. **Eyeball the PNGs**: `layout-qa/out/<name>.before.png` / `.after.png`. The metrics catch
   what they're built to catch — they have caught real bugs synthetic tests missed before
   (see `graph-layout-ordering-principles` project memory), but a metrics-green diagram can
   still look wrong for a reason nobody encoded yet (e.g. an edge clipping a label's text —
   see Backlog). Always look at the render, not just the numbers.
5. **Update the baseline**: only once the run is green (no hard violations, no soft
   regressions) — `npm run layout:qa -- --update-baseline`. Never update the baseline to
   "clear" a regression that wasn't actually fixed; that defeats the ratchet.

## Fixture source

`findDiagrams()` in `scripts/layout-qa.ts` scans `qa-workspace/` if it exists — this is the
user's real, hand-laned Novotec/Compras/RRHH/B2B workspace, **strictly read-only** for this
harness (never write or seed into it; `npm run qa:seed` is a separate, destructive command
that must never run from here). If `qa-workspace/` is absent (a fresh clone — the folder is
gitignored), it falls back to `src/__fixtures__/`, a much smaller committed set. That
fallback run still exits 1 by design (skip-never-passes, see above) — it is not meant to be
a green CI gate, only a smoke check that the harness itself still runs.

## Round log

Round 0 is the pre-fix baseline capture; round 1 is the lane-dispatch fix. Both numbers below
are taken directly from the committed reports
(`.superpowers/sdd/t4-prefix-report.md`, `.superpowers/sdd/t5-postfix-report.md`) — not
re-derived. Round 2 is the parallel improvement round (T6, gateway-label overprint +
`flujo_reparaciones` overlaps + soft-metric tuning); its row is filled in by that task, not
here.

| round | date | scope | hard totals | key soft deltas | commit |
|---|---|---|---|---|---|
| 0 | 2026-07-22 | Harness lands; baseline captured pre-fix over 12 real diagrams | 2 diagrams hard-violating: `rep_2b_motor_donante` (`lanes.violations`=5, `overlaps.total`=2), `flujo_reparaciones_novotec` (`overlaps.total`=3) | — (baseline itself) | `3ecdf8e` |
| 1 | 2026-07-22 | T5 — dispatch all laned processes through `renderMatrix` (fixes lane containment) | `lanes.violations` 0 on all 12 diagrams (was 5 on `rep_2b_motor_donante`); 3 diagrams still hard-violating on `overlaps.total`=3 each: `flujo_reparaciones_novotec` (pre-existing, out of T5 scope), `rep_2_diagnostico` (**new** — `overlaps.labelNode` 0→3, exposed by the fix), `rep_2b_motor_donante` (`overlaps.labelLabel` 1→2) | Crossings/cohesion improved on most laned reps once lanes stopped scrambling them (e.g. `rep_2_diagnostico` crossings.total 21→0, `rep_2b_motor_donante` 8→4); one regression: `rep_5_pap_final` `cohesion.bboxArea` 66120→72960 (+6840) | `4413933` |
| 2 | 2026-07-22 | T6 — bounded improvement round: gateway branch-label column (real wrap-height stagger) + label-pad gutters; boundary-event re-spread + label-cascade clamp on the elk path; slot-hop bends on real gutter tracks + Y tiebreaks for X-tied fans; content-driven pool width | **0 on all 12 diagrams** (was 3 diagrams at `overlaps.total`=3); plain ratchet run exits 0 | `rep_2_diagnostico` overlaps 3→0; `rep_2b_motor_donante` overlaps 3→0 and crossings.total 4→2 (the 2 left are inherent same-gutter transit conflicts, see Backlog); `flujo_reparaciones_novotec` overlaps 3→0; `rep_5_pap_final` `cohesion.bboxArea` 72960→62720 (round-1 regression resolved, now under the old 66120 baseline). Cost accepted: label-pad gutters grow bboxArea where gateways have named branches (`rep_2` 374k→426k, `rep_2b` 847k→1023k — both far under their old baselines) | `803b51e`..`9b0ac12` |
| 3 | 2026-07-22 | Branch-label placement fix (exe-inspection feedback, two iterations). The original stack anchored at the tall row's top edge, floating labels ~40px above their gateway; a first pass centred the stack on the gateway, which dropped each lower branch's label straight onto its own horizontal exit connector (rep_2 "Sí, ya la tiene", rep_2b "Descartar"). Final: stack the whole column just ABOVE the gateway's highest outgoing exit line (exits fan out staggered from the centre downward), single-line row height + 8px gap, top clamped to the lane band. Result hugs the gateway AND clears every connector. Guarded by DI-level invariants in `layoutElkLanes.test.ts` (lowest label bottom within `[cy-24, cy]`; no label straddles an exit segment; ≥8px inter-label gap) | **0 on all 12 diagrams**; ratchet exits 0, no soft regressions (label geometry moved within existing diagram bounds — no metric shifted past its stored value) | Label geometry only; no measured soft-metric change. Visual: branch labels hug their gateway from just above the connector across every laned diagram | `9620c5c`, `bcf95da` |

## Backlog (deliberately deferred, not silently forgotten)

- **Edge×label clip metric.** `clips.*` only detects a connector clipping through a *node*.
  A connector that clips through a *label*'s rendered text isn't measured yet — the T4
  pre-fix diagnosis (real PNG inspection, see `.superpowers/sdd/progress.md`) found this
  visually on the pre-fix renders. It's a deliberate `MetricsReport` contract extension
  (needs coordination before touching `computeMetrics`'s shape), not an oversight — the T6
  orchestrator explicitly scoped it OUT of this round. Also noted in `reglas.md`.
- **Inherent same-gutter transit crossings (3 across the corpus, post-round-2).**
  `rep_2b_motor_donante` keeps 2 crossings and `flujo_reparaciones_novotec` 1. The rep_2b
  pair was proven order-unavoidable in the T6 analysis (`.superpowers/sdd/task-6-report.md`):
  two flows must both fully transit the same 40px gutter with overlapping vertical extents —
  every track assignment crosses once. Fixing them needs a router that can move a drop to a
  DIFFERENT gutter (or a sub-row detour), i.e. the obstacle-avoiding router below, not more
  sort keys.
- **Obstacle-avoiding router (visibility-graph / A*).** Today's router is a topology-decided
  heuristic (`laneClear`), not a full obstacle-avoiding pathfinder — see
  `HANDOFF-autolayout.md` §4 item 4 and `graph-layout-ordering-principles` (project memory)
  §3 for why a full router is the next big piece if zero `clips.horizontal` /
  `crossings.total` is ever required.
- **Backup engine (`bpmn-auto-layout`) parity.** The backup/"Modo rápido" engine still emits
  fresh DI and drops colors/groups — the old-shape-reuse trick that `layoutElk.ts` uses isn't
  ported to `layoutTidy.ts`. See `HANDOFF-autolayout.md` §4 item 5.
- **Mixed-collaboration `matrixMode` scoping (latent, unexercised).** In a collaboration with
  multiple participants, `layoutCollaborationElk` computes `matrixMode` from the
  collaboration's phase groups globally and can pass those groups into a participant that
  only has lanes, no groups of its own. Harmless today (no corpus diagram exercises mixed
  matrix+lanes-only pools in one collaboration) but worth a comment or a per-participant
  group filter before it is exercised.
