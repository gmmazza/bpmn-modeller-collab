import { describe, it, expect } from "vitest";
import { icon } from "./icons";

const names = [
  "new", "undo", "redo", "save", "layers", "properties", "settings",
  "download", "sun", "moon", "user", "folder", "check", "close", "chevron",
  "panelLeft", "panelRight", "help",
] as const;

describe("icon", () => {
  it("returns an inline svg for every name", () => {
    for (const n of names) {
      const svg = icon(n);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain("currentColor");
      expect(svg.length).toBeGreaterThan(20);
    }
  });
});
