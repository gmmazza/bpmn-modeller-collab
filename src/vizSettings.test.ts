import { describe, it, expect, beforeEach } from "vitest";
import { getVizSettings, setVizSettings } from "./vizSettings";

describe("vizSettings", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to all-off when nothing stored", () => {
    expect(getVizSettings()).toEqual({ sketchy: false, heatmap: false, canon: false });
  });

  it("persists and reads back", () => {
    setVizSettings({ sketchy: true, heatmap: false, canon: false });
    expect(getVizSettings()).toEqual({ sketchy: true, heatmap: false, canon: false });
  });

  it("falls back to defaults on corrupt JSON", () => {
    localStorage.setItem("bpmn-compartida.viz", "{not json");
    expect(getVizSettings()).toEqual({ sketchy: false, heatmap: false, canon: false });
  });

  // Canon-BPMN profile flag (#REF INTERNAL STAGE 2 / WO) — additive, default off.
  it("canon flag defaults to false when omitted from a stored settings object", () => {
    localStorage.setItem("bpmn-compartida.viz", JSON.stringify({ sketchy: true, heatmap: true }));
    expect(getVizSettings()).toEqual({ sketchy: true, heatmap: true, canon: false });
  });

  it("persists canon: true and reads it back", () => {
    setVizSettings({ sketchy: false, heatmap: false, canon: true });
    expect(getVizSettings()).toEqual({ sketchy: false, heatmap: false, canon: true });
  });
});
