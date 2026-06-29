import { describe, it, expect, beforeEach } from "vitest";
import { getTheme, setTheme, applyTheme, toggleTheme } from "./theme";

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("defaults to light", () => {
    expect(getTheme()).toBe("light");
  });
  it("persists and reads dark", () => {
    setTheme("dark");
    expect(getTheme()).toBe("dark");
  });
  it("treats any non-dark stored value as light", () => {
    localStorage.setItem("bpmn-compartida.theme", "weird");
    expect(getTheme()).toBe("light");
  });
  it("applyTheme sets the data-theme attribute", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
  it("toggleTheme flips, persists, and applies", () => {
    setTheme("light");
    const next = toggleTheme();
    expect(next).toBe("dark");
    expect(getTheme()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
