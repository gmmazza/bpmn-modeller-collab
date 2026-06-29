import { describe, it, expect } from "vitest";
import { evaluateUpdate } from "./appUpdate";

describe("evaluateUpdate", () => {
  it("reports an available update when the feed is newer", () => {
    expect(evaluateUpdate("0.1.0", { version: "0.2.0", url: "http://x/app.zip" })).toEqual({
      updateAvailable: true,
      latest: "0.2.0",
      url: "http://x/app.zip",
    });
  });
  it("not available when feed equals current", () => {
    expect(evaluateUpdate("0.2.0", { version: "0.2.0", url: "u" }).updateAvailable).toBe(false);
  });
  it("not available for null/invalid feed", () => {
    expect(evaluateUpdate("0.1.0", null).updateAvailable).toBe(false);
    expect(evaluateUpdate("0.1.0", { version: 2 }).updateAvailable).toBe(false);
    expect(evaluateUpdate("0.1.0", { version: "0.2.0" }).updateAvailable).toBe(false); // no url
  });
});
