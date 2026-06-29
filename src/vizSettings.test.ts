import { describe, it, expect, beforeEach } from "vitest";
import { getVizSettings, setVizSettings } from "./vizSettings";

describe("vizSettings", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to all-off when nothing stored", () => {
    expect(getVizSettings()).toEqual({ sketchy: false, heatmap: false });
  });

  it("persists and reads back", () => {
    setVizSettings({ sketchy: true, heatmap: false });
    expect(getVizSettings()).toEqual({ sketchy: true, heatmap: false });
  });

  it("falls back to defaults on corrupt JSON", () => {
    localStorage.setItem("bpmn-compartida.viz", "{not json");
    expect(getVizSettings()).toEqual({ sketchy: false, heatmap: false });
  });
});
