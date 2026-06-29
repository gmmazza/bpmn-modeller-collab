import { describe, it, expect, vi } from "vitest";
import { exportSvg, exportPng } from "./exporters";

function fakeModeler(svg: string) {
  return { async saveSVG() { return { svg }; } } as any;
}

describe("exporters", () => {
  it("exportSvg downloads the SVG with a .svg filename", async () => {
    const download = vi.fn();
    await exportSvg(fakeModeler("<svg/>"), "proceso", download);
    expect(download).toHaveBeenCalledWith("<svg/>", "proceso.svg", "image/svg+xml");
  });

  it("exportPng converts to a PNG blob and downloads with .png", async () => {
    const download = vi.fn();
    const blob = new Blob(["x"], { type: "image/png" });
    const toBlob = vi.fn().mockResolvedValue(blob);
    await exportPng(fakeModeler("<svg/>"), "proceso", download, toBlob);
    expect(toBlob).toHaveBeenCalledWith("<svg/>");
    expect(download).toHaveBeenCalledWith(blob, "proceso.png", "image/png");
  });

  it("exportPng throws when conversion yields null", async () => {
    const toBlob = vi.fn().mockResolvedValue(null);
    await expect(exportPng(fakeModeler("<svg/>"), "p", vi.fn(), toBlob)).rejects.toThrow();
  });
});
