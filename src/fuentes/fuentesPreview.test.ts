import { describe, it, expect } from "vitest";
import { previewModeFor } from "./fuentesPreview";

describe("previewModeFor", () => {
  it("maps safe types to inline preview modes", () => {
    expect(previewModeFor("png")).toEqual({ kind: "image", mime: "image/png" });
    expect(previewModeFor("svg")).toEqual({ kind: "image", mime: "image/svg+xml" });
    expect(previewModeFor("pdf")).toEqual({ kind: "pdf" });
    expect(previewModeFor("html")).toEqual({ kind: "html" });
    expect(previewModeFor("md")).toEqual({ kind: "markdown" });
    expect(previewModeFor("txt")).toEqual({ kind: "text" });
  });
  it("maps office docs to the office mode (open externally / download)", () => {
    for (const e of ["docx", "pptx", "xlsx", "doc", "ppt", "xls"]) {
      expect(previewModeFor(e)).toEqual({ kind: "office" });
    }
  });
  it("maps unknown/executable extensions to download (never inline, never office)", () => {
    for (const e of ["exe", "bat", "ps1", "unknownext", ""]) {
      expect(previewModeFor(e)).toEqual({ kind: "download" });
    }
  });
});
