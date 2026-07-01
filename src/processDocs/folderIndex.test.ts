import { describe, it, expect } from "vitest";
import { buildFolderIndex, baseNameOf, type IndexSource } from "./folderIndex";

const XML = (pid: string, called: string) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D">
  <bpmn:process id="${pid}"><bpmn:callActivity id="CA" name="c" calledElement="${called}" /></bpmn:process>
</bpmn:definitions>`;

describe("folderIndex", () => {
  it("derives base name from a nested path", () => {
    expect(baseNameOf("sub/area/ventas.bpmn")).toBe("ventas");
  });
  it("builds a DiagramInfo per bpmn file with its process id and refs", async () => {
    const src: IndexSource = {
      listBpmnFiles: async () => ["ventas.bpmn", "sub/compras.bpmn"],
      readXml: async (f) => (f === "ventas.bpmn" ? XML("Process_Ventas", "Process_Compras") : XML("Process_Compras", "X")),
    };
    const idx = await buildFolderIndex(src);
    expect(idx).toHaveLength(2);
    const ventas = idx.find((d) => d.file === "ventas.bpmn")!;
    expect(ventas.processId).toBe("Process_Ventas");
    expect(ventas.baseName).toBe("ventas");
    expect(ventas.refs.calls[0].calledElement).toBe("Process_Compras");
  });
});
