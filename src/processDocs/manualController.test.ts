import { describe, it, expect } from "vitest";
import { buildManual, exportManualHtml, type ManualDeps } from "./manualController";
import type { FlowGraph } from "./flowOrder";

function deps(): ManualDeps {
  const graph: FlowGraph = {
    nodes: [{ id: "S", name: "inicio", type: "bpmn:StartEvent" }, { id: "A", name: "Validar", type: "bpmn:Task" }],
    edges: [{ source: "S", target: "A" }],
    starts: ["S"],
  };
  return {
    graph: () => graph,
    processName: () => "Proc",
    readProcessNote: async () => "Intro del proceso.",
    readNote: async (id) => (id === "A" ? "---\nelement: A\n---\nContenido con ![](assets/x.png)" : null),
    readAsset: async (name) => (name === "x.png" ? new Uint8Array([1, 2, 3]) : null),
  };
}

describe("manualController", () => {
  it("builds a manual with intro, ordered steps and rendered html", async () => {
    const { markdown, html } = await buildManual(deps());
    expect(markdown).toContain("# Manual: Proc");
    expect(markdown).toContain("Intro del proceso.");
    expect(markdown).toContain("## 1. inicio");
    expect(markdown).toContain("## 2. Validar");
    expect(markdown).toContain("Contenido con"); // frontmatter stripped, body kept
    expect(html).toContain("<h1>Manual: Proc</h1>");
  });

  it("exports a standalone HTML with the asset inlined as a data URI", async () => {
    const doc = await exportManualHtml(deps());
    expect(doc).toContain("<!DOCTYPE html>");
    expect(doc).toContain("data:image/png;base64,"); // x.png inlined
    expect(doc).not.toContain('src="assets/x.png"');
  });
});
