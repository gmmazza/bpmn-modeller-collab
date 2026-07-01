import { describe, it, expect } from "vitest";
import { buildWidgetDom } from "./mdWidgets";

describe("buildWidgetDom", () => {
  it("builds an <img> for an image widget with the asset src and alt", () => {
    const el = buildWidgetDom({ type: "image", src: "assets/x.png", alt: "diagrama" });
    const img = el.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("assets/x.png");
    expect(img.getAttribute("alt")).toBe("diagrama");
  });

  it("builds an <iframe> for a whitelisted video host", () => {
    const el = buildWidgetDom({ type: "video", src: "https://www.youtube.com/embed/abc" });
    const f = el.querySelector("iframe")!;
    expect(f.getAttribute("src")).toBe("https://www.youtube.com/embed/abc");
  });

  it("does not build an iframe for a non-whitelisted host", () => {
    const el = buildWidgetDom({ type: "video", src: "https://evil.example.com/x" });
    expect(el.querySelector("iframe")).toBeNull();
  });

  it("builds a bullet glyph span", () => {
    const el = buildWidgetDom({ type: "bullet" });
    expect(el.tagName).toBe("SPAN");
    expect(el.className).toContain("cm-md-bullet");
    expect(el.textContent).toContain("•");
  });

  it("builds a disabled unchecked checkbox for an open task", () => {
    const el = buildWidgetDom({ type: "task", checked: false }) as HTMLInputElement;
    expect(el.tagName).toBe("INPUT");
    expect(el.type).toBe("checkbox");
    expect(el.disabled).toBe(true);
    expect(el.checked).toBe(false);
  });

  it("builds a checked checkbox for a done task", () => {
    const el = buildWidgetDom({ type: "task", checked: true }) as HTMLInputElement;
    expect(el.checked).toBe(true);
    expect(el.disabled).toBe(true);
  });
});

describe("widget types eq()", () => {
  it("bullet widgets are equal; task widgets compare checked state", async () => {
    const { BulletWidgetType, TaskWidgetType } = await import("./mdWidgets");
    expect(new BulletWidgetType().eq(new BulletWidgetType())).toBe(true);
    expect(new TaskWidgetType(true).eq(new TaskWidgetType(true))).toBe(true);
    expect(new TaskWidgetType(true).eq(new TaskWidgetType(false))).toBe(false);
  });
});
