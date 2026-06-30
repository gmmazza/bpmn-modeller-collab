import { describe, it, expect } from "vitest";
import { parser } from "@lezer/markdown";

describe("lezer markdown parser", () => {
  it("parses a heading and exposes node names with positions", () => {
    const tree = parser.parse("# Hola");
    const names: string[] = [];
    tree.iterate({ enter: (n) => { names.push(n.name); } });
    expect(names).toContain("ATXHeading1");
    expect(names).toContain("HeaderMark");
  });

  it("parses strong emphasis", () => {
    const tree = parser.parse("**bold**");
    const names: string[] = [];
    tree.iterate({ enter: (n) => { names.push(n.name); } });
    expect(names).toContain("StrongEmphasis");
    expect(names).toContain("EmphasisMark");
  });
});
