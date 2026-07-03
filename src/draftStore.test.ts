import { describe, it, expect, beforeEach } from "vitest";
import { saveDraft, loadDraft, hasDraft, clearDraft } from "./draftStore";

const F = "C:/proj-a"; // a shared-folder id

describe("draftStore", () => {
  beforeEach(() => localStorage.clear());

  it("has no draft for an untouched file", () => {
    expect(hasDraft(F, "a.bpmn")).toBe(false);
    expect(loadDraft(F, "a.bpmn")).toBeNull();
  });

  it("saves and reads back a draft", () => {
    saveDraft(F, "a.bpmn", "<xml/>");
    expect(hasDraft(F, "a.bpmn")).toBe(true);
    expect(loadDraft(F, "a.bpmn")).toBe("<xml/>");
  });

  it("keeps drafts separate per file (including nested paths)", () => {
    saveDraft(F, "a.bpmn", "<a/>");
    saveDraft(F, "sub/b.bpmn", "<b/>");
    expect(loadDraft(F, "a.bpmn")).toBe("<a/>");
    expect(loadDraft(F, "sub/b.bpmn")).toBe("<b/>");
    expect(hasDraft(F, "other.bpmn")).toBe(false);
  });

  it("namespaces by folder: same relative path in two projects does not collide", () => {
    saveDraft("C:/proj-a", "procesos/ventas.bpmn", "<a/>");
    saveDraft("C:/proj-b", "procesos/ventas.bpmn", "<b/>");
    expect(loadDraft("C:/proj-a", "procesos/ventas.bpmn")).toBe("<a/>");
    expect(loadDraft("C:/proj-b", "procesos/ventas.bpmn")).toBe("<b/>");
    // switching to a third project sees no draft for that path
    expect(hasDraft("C:/proj-c", "procesos/ventas.bpmn")).toBe(false);
  });

  it("clears a draft", () => {
    saveDraft(F, "a.bpmn", "<xml/>");
    clearDraft(F, "a.bpmn");
    expect(hasDraft(F, "a.bpmn")).toBe(false);
    expect(loadDraft(F, "a.bpmn")).toBeNull();
  });

  it("overwrites an existing draft", () => {
    saveDraft(F, "a.bpmn", "<one/>");
    saveDraft(F, "a.bpmn", "<two/>");
    expect(loadDraft(F, "a.bpmn")).toBe("<two/>");
  });
});
