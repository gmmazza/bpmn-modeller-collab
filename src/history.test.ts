import { describe, it, expect } from "vitest";
import { keepSet, diffPins } from "./history";
import type { Revision } from "./types";

const HOUR = 60 * 60 * 1000;
const now = Date.parse("2026-06-23T12:00:00Z");

function rev(id: string, ageHours: number, keepForever = false): Revision {
  return { id, modifiedTime: new Date(now - ageHours * HOUR).toISOString(), keepForever };
}

describe("keepSet", () => {
  it("returns empty for no revisions", () => {
    expect(keepSet([], now).size).toBe(0);
  });

  it("always keeps the newest (head) revision", () => {
    const revs = [rev("head", 0), rev("a", 1), rev("b", 5)];
    expect(keepSet(revs, now).has("head")).toBe(true);
  });

  it("thins exponentially: keeps fewer points as age grows", () => {
    const revs: Revision[] = [];
    for (let h = 0; h <= 256; h++) revs.push(rev(`r${h}`, h));
    const kept = keepSet(revs, now);
    // recent hours are individually addressable; far past collapses to sparse points
    const keptAges = revs.filter((r) => kept.has(r.id)).map((r) => (now - Date.parse(r.modifiedTime)) / HOUR);
    keptAges.sort((a, b) => a - b);
    // gaps between successive kept points should generally grow
    const firstGap = keptAges[2] - keptAges[1];
    const lastGap = keptAges[keptAges.length - 1] - keptAges[keptAges.length - 2];
    expect(lastGap).toBeGreaterThan(firstGap);
  });

  // Regression (2026-07-23): an active session publishes every few minutes; ALL of
  // those versions must survive prune — before the fix, anything younger than 1h
  // (except head) fell outside every decay target and was deleted on the next publish.
  it("keeps every revision of an active session (all younger than baseMs)", () => {
    const minutes = [0, 5, 12, 20, 40];
    const revs = minutes.map((m) => rev(`m${m}`, m / 60));
    const kept = keepSet(revs, now);
    for (const m of minutes) expect(kept.has(`m${m}`), `m${m} should survive`).toBe(true);
  });

  it("keeps recent revisions even when the history also has old ones", () => {
    const revs = [rev("head", 0), rev("m10", 10 / 60), rev("m30", 30 / 60), rev("h5", 5), rev("h50", 50)];
    const kept = keepSet(revs, now);
    expect(kept.has("m10")).toBe(true);
    expect(kept.has("m30")).toBe(true);
  });

  it("never exceeds the pin budget", () => {
    const revs: Revision[] = [];
    for (let h = 0; h <= 10000; h++) revs.push(rev(`r${h}`, h));
    expect(keepSet(revs, now, { budget: 50 }).size).toBeLessThanOrEqual(50);
  });
});

describe("diffPins", () => {
  it("pins wanted-unpinned and unpins unwanted-pinned", () => {
    const current = [rev("a", 0, false), rev("b", 1, true), rev("c", 2, true)];
    const desired = new Set(["a", "b"]);
    const { pin, unpin } = diffPins(current, desired);
    expect(pin).toEqual(["a"]);
    expect(unpin).toEqual(["c"]);
  });
});
