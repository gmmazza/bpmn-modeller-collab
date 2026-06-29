import { describe, it, expect } from "vitest";
import { config } from "./config";

describe("config", () => {
  it("exports the appName", () => {
    expect(config.appName).toBe("BPMN compartida");
  });
});
