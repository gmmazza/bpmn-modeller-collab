import { describe, it, expect } from "vitest";
import { compareVersions, checkLatestBpmnJs } from "./version";

describe("compareVersions", () => {
  it("orders by numeric parts", () => {
    expect(compareVersions("18.1.0", "18.0.9")).toBeGreaterThan(0);
    expect(compareVersions("17.11.1", "18.0.0")).toBeLessThan(0);
    expect(compareVersions("18.0.0", "18.0.0")).toBe(0);
  });
  it("handles differing lengths", () => {
    expect(compareVersions("18.1", "18.1.0")).toBe(0);
    expect(compareVersions("18.1.1", "18.1")).toBeGreaterThan(0);
  });
});

describe("checkLatestBpmnJs", () => {
  it("flags outdated when latest is newer than bundled", async () => {
    const r = await checkLatestBpmnJs(async () => "999.0.0");
    expect(r.latest).toBe("999.0.0");
    expect(r.isOutdated).toBe(true);
  });
  it("not outdated when latest equals bundled", async () => {
    const { BUNDLED_BPMN_JS_VERSION } = await import("./version");
    const r = await checkLatestBpmnJs(async () => BUNDLED_BPMN_JS_VERSION);
    expect(r.isOutdated).toBe(false);
  });
  it("throws on an invalid latest", async () => {
    await expect(checkLatestBpmnJs(async () => "" as string)).rejects.toThrow();
  });
});
