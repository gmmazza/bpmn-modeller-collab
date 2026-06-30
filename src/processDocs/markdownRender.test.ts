import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./markdownRender";

describe("renderMarkdown", () => {
  it("renders headings and ordered lists", () => {
    const html = renderMarkdown("# Título\n\n1. uno\n2. dos");
    expect(html).toContain("<h1>Título</h1>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>uno</li>");
  });

  it("strips script tags (XSS)", () => {
    const html = renderMarkdown('texto <script>alert(1)</script> más');
    expect(html).not.toContain("<script");
  });

  it("turns a bare YouTube URL into a whitelisted iframe", () => {
    const html = renderMarkdown("https://www.youtube.com/watch?v=abc123XYZ_-");
    expect(html).toContain("<iframe");
    expect(html).toContain("https://www.youtube.com/embed/abc123XYZ_-");
  });

  it("removes an iframe pointing at a non-whitelisted host", () => {
    const html = renderMarkdown('<iframe src="https://evil.example.com/x"></iframe>');
    expect(html).not.toContain("evil.example.com");
  });

  it("renders task-list checkboxes from - [ ] / - [x]", () => {
    const html = renderMarkdown("- [ ] pendiente\n- [x] hecha");
    expect(html).toContain('type="checkbox"');
  });
});
