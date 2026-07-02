import { describe, it, expect, afterEach } from "vitest";
import { isAiAuthor, aiAuthorName, aiAuthors } from "./aiIdentity";

afterEach(() => { try { localStorage.removeItem("bpmn-compartida.aiAuthors"); } catch { /* */ } });

describe("aiIdentity", () => {
  it("recognizes the default IA author (case-insensitive)", () => {
    expect(isAiAuthor("IA")).toBe(true);
    expect(isAiAuthor("ia")).toBe(true);
    expect(isAiAuthor("Ana")).toBe(false);
    expect(isAiAuthor("")).toBe(false);
  });
  it("honors extra configured AI authors", () => {
    localStorage.setItem("bpmn-compartida.aiAuthors", "Claude, Cowork");
    expect(aiAuthors()).toContain("Claude");
    expect(isAiAuthor("cowork")).toBe(true);
    expect(isAiAuthor("Claude")).toBe(true);
  });
  it("aiAuthorName defaults to IA", () => {
    expect(aiAuthorName()).toBe("IA");
  });
});
