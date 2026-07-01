import { describe, it, expect, afterEach } from "vitest";
import { createMarkdownEditor, type MarkdownEditor } from "./cmEditor";

// Mount a real CodeMirror EditorView and inspect the rendered content DOM, to
// verify the live-preview actually shows bullets, numbers and checkboxes (the
// pure decoration tests don't prove the DOM). Line 1 holds the cursor by default,
// so keep the list items on later lines where their widgets render.

let ed: MarkdownEditor | null = null;
let host: HTMLElement | null = null;

function mount(doc: string): HTMLElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  ed = createMarkdownEditor(host, { doc, onChange: () => {} });
  return host.querySelector(".cm-content") as HTMLElement;
}

afterEach(() => {
  ed?.destroy();
  ed = null;
  host?.remove();
  host = null;
});

describe("live-preview rendered DOM", () => {
  it("renders a checkbox per task and hides the raw [ ]/[x]", () => {
    const content = mount("titulo\n\n- [ ] pendiente\n- [x] hecha");
    const boxes = content.querySelectorAll<HTMLInputElement>("input[type=checkbox]");
    expect(boxes.length).toBe(2);
    expect(boxes[0].checked).toBe(false);
    expect(boxes[1].checked).toBe(true);
    // the literal markers must not be shown as text on those (non-cursor) lines
    expect(content.textContent).not.toContain("[ ]");
    expect(content.textContent).not.toContain("[x]");
    // the bullet "- " is not shown as literal text either
    expect(content.textContent).toContain("pendiente");
    expect(content.textContent).toContain("hecha");
  });

  it("renders a bullet glyph for '- ' items", () => {
    const content = mount("titulo\n\n- primero\n- segundo");
    expect(content.querySelectorAll(".cm-md-bullet").length).toBe(2);
    expect(content.textContent).toContain("•");
    expect(content.textContent).toContain("primero");
  });

  it("keeps the number visible for ordered items", () => {
    const content = mount("titulo\n\n1. uno\n2. dos");
    // the numbers are kept (styled), not hidden
    expect(content.textContent).toContain("1.");
    expect(content.textContent).toContain("2.");
    expect(content.querySelectorAll(".cm-list-number").length).toBe(2);
  });

  it("does not render [x] as a link (regression: was styled as cm-link)", () => {
    const content = mount("titulo\n\n- [x] hecha");
    expect(content.querySelector(".cm-link")).toBeNull();
    expect(content.querySelector("input[type=checkbox]")).not.toBeNull();
  });

  it("reveals the raw markdown on the cursor's line (line 1)", () => {
    // cursor defaults to position 0 → line 1 active → its markup is revealed
    const content = mount("- [ ] en la linea del cursor");
    // on the active line the checkbox widget is dropped and the raw text shows
    expect(content.textContent).toContain("[ ]");
    expect(content.querySelector("input[type=checkbox]")).toBeNull();
  });

  it("renders headings, bullets, tasks and numbers together without error", () => {
    const content = mount("# Título\n\n- viñeta\n- [ ] tarea\n\n1. primero\n2. segundo\n\n~~tachado~~");
    expect(content.querySelectorAll("input[type=checkbox]").length).toBe(1);
    expect(content.querySelectorAll(".cm-md-bullet").length).toBe(1); // task line has no bullet
    expect(content.querySelectorAll(".cm-list-number").length).toBe(2);
    expect(content.querySelector(".cm-strike")).not.toBeNull();
  });
});
