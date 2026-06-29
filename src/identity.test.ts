import { describe, it, expect, beforeEach } from "vitest";
import { getName, setName, clearName } from "./identity";

describe("identity", () => {
  beforeEach(() => localStorage.clear());
  it("persists and clears the display name", () => {
    expect(getName()).toBeNull();
    setName("Ana");
    expect(getName()).toBe("Ana");
    clearName();
    expect(getName()).toBeNull();
  });
});
