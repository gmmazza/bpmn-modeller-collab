import { describe, it, expect } from "vitest";
import { computeMarkdownDecorations } from "./cmDecorations";

const hides = (t: string) => computeMarkdownDecorations(t).filter((d) => d.kind === "hide");
const marks = (t: string) => computeMarkdownDecorations(t).filter((d) => d.kind === "mark");

describe("computeMarkdownDecorations", () => {
  it("hides the heading mark and styles the heading", () => {
    expect(hides("# Hola").some((h) => h.from === 0 && h.to === 2)).toBe(true); // "# "
    expect(marks("# Hola").some((m) => m.cls === "cm-heading-1")).toBe(true);
  });

  it("hides both ** marks and styles strong", () => {
    const h = hides("**bold**");
    expect(h.some((x) => x.from === 0 && x.to === 2)).toBe(true);
    expect(h.some((x) => x.from === 6 && x.to === 8)).toBe(true);
    expect(marks("**bold**").some((m) => m.cls === "cm-strong")).toBe(true);
  });

  it("styles emphasis and inline code", () => {
    expect(marks("*it*").some((m) => m.cls === "cm-em")).toBe(true);
    expect(marks("`code`").some((m) => m.cls === "cm-inline-code")).toBe(true);
  });

  it("emits an image widget with src and alt", () => {
    const w = computeMarkdownDecorations("![diagrama](assets/x.png)").find((d) => d.kind === "widget");
    expect(w?.widget).toEqual({ type: "image", src: "assets/x.png", alt: "diagrama" });
  });

  it("emits a video widget for a bare YouTube URL line", () => {
    const w = computeMarkdownDecorations("https://www.youtube.com/watch?v=abc123XYZ_-").find((d) => d.kind === "widget");
    expect(w?.widget).toEqual({ type: "video", src: "https://www.youtube.com/embed/abc123XYZ_-" });
  });

  it("hides the quote mark and the bullet list mark", () => {
    expect(hides("> cita").length).toBeGreaterThan(0);
    expect(hides("- item").length).toBeGreaterThan(0);
  });

  it("treats an image atomically: one widget spec, no hide specs inside it", () => {
    const specs = computeMarkdownDecorations("![a](b)");
    expect(specs.filter((s) => s.kind === "hide")).toHaveLength(0);
    expect(specs.filter((s) => s.kind === "widget")).toHaveLength(1);
  });
});

describe("wikilinks and markdown links", () => {
  it("hides [[ ]] and marks the inner text as cm-wikilink", () => {
    const specs = computeMarkdownDecorations("ver [[mi-proceso]]");
    // "[[" at 4..6, "]]" at 16..18, inner "mi-proceso" 6..16 marked
    expect(specs.some((s) => s.kind === "hide" && s.from === 4 && s.to === 6)).toBe(true);
    expect(specs.some((s) => s.kind === "hide" && s.from === 16 && s.to === 18)).toBe(true);
    expect(specs.some((s) => s.kind === "mark" && s.cls === "cm-wikilink" && s.from === 6 && s.to === 16)).toBe(true);
  });

  it("does not emit overlapping hides inside a wikilink (tree specs filtered)", () => {
    const specs = computeMarkdownDecorations("[[a#b]]");
    const hides = specs.filter((s) => s.kind === "hide");
    // only the [[ and ]] hides — no LinkMark hides from the tree inside the wikilink
    expect(hides).toHaveLength(2);
  });

  it("marks a markdown link as cm-link and hides its URL", () => {
    const specs = computeMarkdownDecorations("[docs](http://a.b)");
    expect(specs.some((s) => s.kind === "mark" && s.cls === "cm-link")).toBe(true);
    // the URL "http://a.b" (7..17) is hidden
    expect(specs.some((s) => s.kind === "hide" && s.from === 7 && s.to === 17)).toBe(true);
  });
});
