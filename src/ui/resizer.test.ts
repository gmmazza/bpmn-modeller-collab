import { describe, it, expect } from "vitest";
import { clampSize } from "./resizer";

describe("clampSize", () => {
  it("returns the value when within bounds", () => {
    expect(clampSize(300, 220, 760)).toBe(300);
  });
  it("clamps below min up to min", () => {
    expect(clampSize(100, 220, 760)).toBe(220);
  });
  it("clamps above max down to max", () => {
    expect(clampSize(999, 220, 760)).toBe(760);
  });
  it("returns min when min === max", () => {
    expect(clampSize(500, 240, 240)).toBe(240);
  });
});
