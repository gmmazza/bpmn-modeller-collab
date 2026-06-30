import { describe, it, expect } from "vitest";
import { visibleSpecs } from "./livePreview";
import type { DecoSpec } from "./cmDecorations";

const specs: DecoSpec[] = [
  { kind: "hide", from: 0, to: 2 },                 // "# " on line at 0..5
  { kind: "mark", from: 0, to: 5, cls: "cm-heading-1" },
  { kind: "hide", from: 10, to: 12 },               // "# " on a different line
];

describe("visibleSpecs", () => {
  it("drops hide specs intersecting an active range (reveal markup on the cursor line)", () => {
    const out = visibleSpecs(specs, [{ from: 0, to: 5 }]);
    expect(out.find((s) => s.kind === "hide" && s.from === 0)).toBeUndefined(); // revealed
    expect(out.find((s) => s.kind === "hide" && s.from === 10)).toBeDefined();  // still hidden
    expect(out.find((s) => s.kind === "mark")).toBeDefined();                   // marks always kept
  });

  it("keeps all hides when no range is active", () => {
    expect(visibleSpecs(specs, []).filter((s) => s.kind === "hide").length).toBe(2);
  });
});
