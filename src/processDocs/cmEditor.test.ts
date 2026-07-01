import { describe, it, expect, vi } from "vitest";
import { createMarkdownEditor } from "./cmEditor";

describe("createMarkdownEditor", () => {
  it("initializes with the given doc and returns it via getDoc", () => {
    const parent = document.createElement("div");
    const ed = createMarkdownEditor(parent, { doc: "# Hola", onChange: vi.fn() });
    expect(ed.getDoc()).toBe("# Hola");
    ed.destroy();
  });

  it("setDoc replaces the document content", () => {
    const parent = document.createElement("div");
    const ed = createMarkdownEditor(parent, { doc: "a", onChange: vi.fn() });
    ed.setDoc("b");
    expect(ed.getDoc()).toBe("b");
    ed.destroy();
  });

  it("mounts the CM editor into the parent element", () => {
    const parent = document.createElement("div");
    const ed = createMarkdownEditor(parent, { doc: "x", onChange: vi.fn() });
    expect(parent.querySelector(".cm-editor")).not.toBeNull();
    ed.destroy();
  });

  it("accepts wiki options and still round-trips the doc", () => {
    const parent = document.createElement("div");
    const ed = createMarkdownEditor(parent, {
      doc: "[[x]]",
      onChange: () => {},
      wiki: { candidates: () => [{ label: "x", insert: "x" }], navigate: () => {} },
    });
    expect(ed.getDoc()).toBe("[[x]]");
    ed.destroy();
  });
});
