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
});
