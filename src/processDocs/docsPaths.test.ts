import { describe, it, expect } from "vitest";
import { docsDir, notePath, processNotePath, indexPath, assetsDir, ideasPath } from "./docsPaths";

describe("docsPaths", () => {
  it("derives the sidecar dir from a diagram id (root)", () => {
    expect(docsDir("mi-proceso.bpmn")).toBe("mi-proceso.docs");
  });
  it("keeps the subfolder prefix", () => {
    expect(docsDir("sub/area/mi-proceso.bpmn")).toBe("sub/area/mi-proceso.docs");
  });
  it("builds note, process, index and assets paths", () => {
    expect(notePath("x.bpmn", "Activity_1")).toBe("x.docs/Activity_1.md");
    expect(processNotePath("x.bpmn")).toBe("x.docs/_proceso.md");
    expect(indexPath("x.bpmn")).toBe("x.docs/_index.md");
    expect(assetsDir("x.bpmn")).toBe("x.docs/assets");
  });
  it("builds the ideas path", () => {
    // import ideasPath at the top with the others
    expect(ideasPath("x.bpmn")).toBe("x.docs/_ideas.md");
  });
});
