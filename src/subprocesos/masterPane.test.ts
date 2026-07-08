import { describe, it, expect } from "vitest";
import { badgeLabel } from "./masterPane";

describe("badgeLabel", () => {
  it("maps link states to badge glyphs", () => {
    expect(badgeLabel("resolved")).toBe("🗺");
    expect(badgeLabel("unresolved")).toBe("⚠");
    expect(badgeLabel("ambiguous")).toBe("⚠");
  });
});
