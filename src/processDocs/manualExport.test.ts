import { describe, it, expect, vi } from "vitest";
import { manualHtmlDocument, inlineImages } from "./manualExport";

describe("manualExport", () => {
  it("wraps body html in a standalone document with the title", () => {
    const doc = manualHtmlDocument("Mi Proceso", "<h1>Hola</h1>");
    expect(doc).toContain("<!DOCTYPE html>");
    expect(doc).toContain("<title>Mi Proceso</title>");
    expect(doc).toContain("<h1>Hola</h1>");
    expect(doc).toContain("<style>");
  });

  it("inlines an assets/ image as a data URI", async () => {
    const toDataUri = vi.fn(async (ref: string) => (ref === "assets/x.png" ? "data:image/png;base64,AAAA" : null));
    const out = await inlineImages('<img src="assets/x.png"> <img src="https://ext/y.png">', toDataUri);
    expect(out).toContain('src="data:image/png;base64,AAAA"');
    expect(out).toContain('src="https://ext/y.png"'); // external left untouched
    expect(toDataUri).toHaveBeenCalledTimes(1);
  });
});
