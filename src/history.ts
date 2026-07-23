import type { Revision } from "./types";

export interface KeepSetOptions {
  budget?: number; // max pins (default 150, hard ceiling below Drive's 200)
  baseMs?: number; // smallest target age gap (default 1h)
  factor?: number; // geometric growth factor (default 2)
}

/**
 * Exponential-decay retention. Every revision younger than baseMs is kept
 * unconditionally (an active session publishes minutes apart — those are the
 * restore points that matter most); beyond that, keeps the revision nearest
 * each geometrically-growing target age. Result: dense recent restore points,
 * exponentially sparser going back, bounded by budget.
 */
export function keepSet(
  revisions: Revision[],
  nowMs: number,
  opts: KeepSetOptions = {},
): Set<string> {
  const budget = opts.budget ?? 150;
  const baseMs = opts.baseMs ?? 60 * 60 * 1000;
  const factor = opts.factor ?? 2;
  const keep = new Set<string>();
  if (revisions.length === 0) return keep;

  const sorted = [...revisions].sort(
    (a, b) => Date.parse(b.modifiedTime) - Date.parse(a.modifiedTime),
  );
  keep.add(sorted[0].id); // head always kept

  // Recent protection window: nothing younger than baseMs decays (newest-first,
  // so the break is safe; bounded by budget like everything else).
  for (const r of sorted) {
    if (keep.size >= budget) break;
    if (nowMs - Date.parse(r.modifiedTime) >= baseMs) break;
    keep.add(r.id);
  }

  const oldestAge = nowMs - Date.parse(sorted[sorted.length - 1].modifiedTime);
  for (let age = baseMs; age <= oldestAge && keep.size < budget; age *= factor) {
    const targetTime = nowMs - age;
    let best = sorted[0];
    let bestDelta = Infinity;
    for (const r of sorted) {
      const d = Math.abs(Date.parse(r.modifiedTime) - targetTime);
      if (d < bestDelta) {
        bestDelta = d;
        best = r;
      }
    }
    keep.add(best.id);
  }
  return keep;
}

export function diffPins(
  current: Revision[],
  desired: Set<string>,
): { pin: string[]; unpin: string[] } {
  const pin: string[] = [];
  const unpin: string[] = [];
  for (const r of current) {
    const want = desired.has(r.id);
    if (want && !r.keepForever) pin.push(r.id);
    if (!want && r.keepForever) unpin.push(r.id);
  }
  return { pin, unpin };
}
