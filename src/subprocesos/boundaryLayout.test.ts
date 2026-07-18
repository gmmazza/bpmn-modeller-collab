import { describe, it, expect } from "vitest";
import { distributeBoundaries, BOUNDARY_LABEL_STEP } from "./boundaryLayout";

const HOST = { x: 220, y: 178, width: 120, height: 80 }; // a Call Activity box

describe("distributeBoundaries", () => {
  it("centres a lone boundary on the host's bottom edge", () => {
    const [s] = distributeBoundaries(HOST, 1);
    expect(s.cx).toBe(HOST.x + HOST.width / 2);
    expect(s.cy).toBe(HOST.y + HOST.height);
  });

  it("spreads the circles so they never overlap (≥ diameter apart), centred on the host", () => {
    const size = 36;
    const slots = distributeBoundaries(HOST, 4, size);
    for (let i = 1; i < slots.length; i++)
      expect(slots[i].cx - slots[i - 1].cx, "circles closer than one diameter → they overlap")
        .toBeGreaterThanOrEqual(size - 0.001);
    // Symmetric about the host centre.
    const mid = (slots[0].cx + slots[slots.length - 1].cx) / 2;
    expect(mid).toBeCloseTo(HOST.x + HOST.width / 2, 5);
  });

  it("cascades labels a row lower each so N outcome names don't overprint", () => {
    const slots = distributeBoundaries(HOST, 4);
    for (let i = 1; i < slots.length; i++)
      expect(slots[i].labelY - slots[i - 1].labelY).toBe(BOUNDARY_LABEL_STEP);
    // The step must clear a WRAPPED label (long names render ~2 lines ≈ 28px, not the 14px hint),
    // or the names still overprint on screen — the defect the first 16px cut left visible.
    expect(BOUNDARY_LABEL_STEP).toBeGreaterThanOrEqual(28);
  });

  it("all circles ride the bottom edge (same cy)", () => {
    const slots = distributeBoundaries(HOST, 5);
    for (const s of slots) expect(s.cy).toBe(HOST.y + HOST.height);
  });
});
