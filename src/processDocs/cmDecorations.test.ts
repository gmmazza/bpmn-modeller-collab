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

  it("hides the quote mark", () => {
    expect(hides("> cita").some((h) => h.from === 0 && h.to === 2)).toBe(true);
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

const widgets = (t: string) => computeMarkdownDecorations(t).filter((d) => d.kind === "widget");

describe("lists, tasks and strikethrough", () => {
  // ---- bullet lists ----
  it("renders a bullet widget for a '- ' item (replacing the marker, not hiding it)", () => {
    const specs = computeMarkdownDecorations("- item uno");
    expect(specs.some((s) => s.kind === "widget" && s.widget?.type === "bullet" && s.from === 0 && s.to === 2)).toBe(true);
    // the marker is NOT a bare hide (that was the bug: bullet disappeared)
    expect(specs.some((s) => s.kind === "hide" && s.from === 0)).toBe(false);
  });

  it("renders bullet widgets for '*' and '+' markers too", () => {
    expect(widgets("* item").some((s) => s.widget?.type === "bullet")).toBe(true);
    expect(widgets("+ item").some((s) => s.widget?.type === "bullet")).toBe(true);
  });

  it("renders a bullet widget for a nested list item", () => {
    const specs = computeMarkdownDecorations("- a\n  - b");
    expect(specs.filter((s) => s.kind === "widget" && s.widget?.type === "bullet")).toHaveLength(2);
  });

  // ---- ordered lists ----
  it("keeps the number of an ordered item visible (marks it, does not hide)", () => {
    const specs = computeMarkdownDecorations("1. item uno");
    expect(specs.some((s) => s.kind === "mark" && s.cls === "cm-list-number" && s.from === 0 && s.to === 2)).toBe(true);
    expect(specs.some((s) => s.kind === "hide" && s.from === 0)).toBe(false);
    expect(specs.some((s) => s.kind === "widget")).toBe(false);
  });

  it("handles multi-digit ordered markers", () => {
    const specs = computeMarkdownDecorations("10. diez");
    expect(specs.some((s) => s.kind === "mark" && s.cls === "cm-list-number" && s.from === 0 && s.to === 3)).toBe(true);
  });

  // ---- task lists (the core bug) ----
  it("renders an unchecked checkbox for '- [ ] ' and hides the bullet", () => {
    const specs = computeMarkdownDecorations("- [ ] pendiente");
    // bullet "- " (0..2) hidden so the checkbox stands in
    expect(specs.some((s) => s.kind === "hide" && s.from === 0 && s.to === 2)).toBe(true);
    // checkbox widget over the "[ ]" (2..5), unchecked
    expect(specs.some((s) => s.kind === "widget" && s.widget?.type === "task" && (s.widget as { checked: boolean }).checked === false && s.from === 2 && s.to === 5)).toBe(true);
    // NO bullet widget for a task item (that was the "bullet before task" bug)
    expect(specs.some((s) => s.kind === "widget" && s.widget?.type === "bullet")).toBe(false);
  });

  it("renders a checked checkbox for '- [x] ' and does NOT treat [x] as a link", () => {
    const specs = computeMarkdownDecorations("- [x] hecha");
    expect(specs.some((s) => s.kind === "widget" && s.widget?.type === "task" && (s.widget as { checked: boolean }).checked === true)).toBe(true);
    // the old bug parsed [x] as a Link → cm-link mark. Must be gone.
    expect(specs.some((s) => s.kind === "mark" && s.cls === "cm-link")).toBe(false);
  });

  it("accepts uppercase [X] as checked", () => {
    const specs = computeMarkdownDecorations("- [X] hecha");
    expect(specs.some((s) => s.widget?.type === "task" && (s.widget as { checked: boolean }).checked === true)).toBe(true);
  });

  it("renders a checkbox per task in a multi-line task list", () => {
    const specs = computeMarkdownDecorations("- [ ] a\n- [x] b\n- [ ] c");
    const tasks = specs.filter((s) => s.widget?.type === "task");
    expect(tasks).toHaveLength(3);
    expect(tasks.map((t) => (t.widget as { checked: boolean }).checked)).toEqual([false, true, false]);
  });

  // ---- strikethrough (GFM) ----
  it("hides the ~~ marks and styles the text as cm-strike", () => {
    const specs = computeMarkdownDecorations("~~tachado~~");
    expect(specs.some((s) => s.kind === "mark" && s.cls === "cm-strike")).toBe(true);
    expect(specs.filter((s) => s.kind === "hide")).toHaveLength(2); // both ~~
  });

  // ---- mixed content sanity: no overlapping replace, everything represented ----
  it("handles a mixed document: bullets, numbers, tasks, emphasis together", () => {
    const doc = "# Título\n\n- viñeta con **negrita**\n- [ ] tarea\n\n1. primero\n2. segundo";
    const specs = computeMarkdownDecorations(doc);
    expect(specs.some((s) => s.cls === "cm-heading-1")).toBe(true);
    expect(specs.filter((s) => s.widget?.type === "bullet")).toHaveLength(1); // only the first "- viñeta" (the task has no bullet)
    expect(specs.some((s) => s.widget?.type === "task")).toBe(true);
    expect(specs.filter((s) => s.cls === "cm-list-number")).toHaveLength(2);
    expect(specs.some((s) => s.cls === "cm-strong")).toBe(true);
  });
});
