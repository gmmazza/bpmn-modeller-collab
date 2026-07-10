import { describe, it, expect } from "vitest";
import {
  defaultDatosFile,
  normalizeDatosFile,
  addEntry,
  removeEntry,
  setAnchoredId,
  distinctTools,
} from "./datosModel";

describe("defaultDatosFile", () => {
  it("starts with no elements", () => {
    expect(defaultDatosFile()).toEqual({ version: 1, elementos: {} });
  });
});

describe("normalizeDatosFile", () => {
  it("returns the default on invalid/missing shape", () => {
    expect(normalizeDatosFile(null)).toEqual({ version: 1, elementos: {} });
    expect(normalizeDatosFile({})).toEqual({ version: 1, elementos: {} });
    expect(normalizeDatosFile({ elementos: "nope" })).toEqual({ version: 1, elementos: {} });
  });

  it("keeps free-text tools and only drops entries with an empty nombre", () => {
    const raw = {
      version: 1,
      elementos: {
        t1: {
          formularios: [
            { id: "a", tool: "JotForm", nombre: "Recepción", url: "https://x" },
            { id: "b", tool: "Google Forms", nombre: "Alta", url: "" }, // free text → kept
            { id: "c", tool: "otro", nombre: "", url: "" }, // empty nombre → dropped
          ],
          almacenamiento: [],
          herramientas: [],
        },
      },
    };
    const nf = normalizeDatosFile(raw);
    expect(nf.elementos.t1.formularios.map((e) => e.tool)).toEqual(["JotForm", "Google Forms"]);
  });

  it("drops an element entry entirely once all its categories are empty", () => {
    const raw = { version: 1, elementos: { t1: { formularios: [], almacenamiento: [], herramientas: [] } } };
    expect(normalizeDatosFile(raw)).toEqual({ version: 1, elementos: {} });
  });

  it("preserves anchoredId when present", () => {
    const raw = {
      version: 1,
      elementos: { t1: { formularios: [{ id: "a", tool: "jotform", nombre: "R", url: "", anchoredId: "DOR_1" }], almacenamiento: [], herramientas: [] } },
    };
    expect(normalizeDatosFile(raw).elementos.t1.formularios[0].anchoredId).toBe("DOR_1");
  });
});

describe("addEntry", () => {
  it("adds a first entry to a fresh element and category", () => {
    const { file, entry } = addEntry(defaultDatosFile(), "t1", "formularios", { tool: "jotform", nombre: "Recepción", url: "https://x" });
    expect(entry).toEqual({ id: "recepcion", tool: "jotform", nombre: "Recepción", url: "https://x" });
    expect(file.elementos.t1.formularios).toEqual([entry]);
  });

  it("dedupes the generated id by suffixing -2 when two different nombres slug to the same base", () => {
    let file = defaultDatosFile();
    const first = addEntry(file, "t1", "formularios", { tool: "jotform", nombre: "Recepción!", url: "" });
    file = first.file;
    const second = addEntry(file, "t1", "formularios", { tool: "jotform", nombre: "Recepción?", url: "" });
    expect(first.entry.id).toBe("recepcion");
    expect(second.entry.id).toBe("recepcion-2");
  });

  it("rejects an empty nombre", () => {
    expect(() => addEntry(defaultDatosFile(), "t1", "formularios", { tool: "otro", nombre: "   ", url: "" })).toThrow();
  });

  it("rejects a case/whitespace-insensitive duplicate nombre within the same element+category", () => {
    let file = defaultDatosFile();
    file = addEntry(file, "t1", "formularios", { tool: "jotform", nombre: "Recepción", url: "" }).file;
    expect(() => addEntry(file, "t1", "formularios", { tool: "clickup", nombre: "  recepción  ", url: "" })).toThrow();
  });

  it("allows the same nombre in a different category or a different element", () => {
    let file = defaultDatosFile();
    file = addEntry(file, "t1", "formularios", { tool: "jotform", nombre: "Recepción", url: "" }).file;
    expect(() => addEntry(file, "t1", "almacenamiento", { tool: "clickup", nombre: "Recepción", url: "" })).not.toThrow();
    expect(() => addEntry(file, "t2", "formularios", { tool: "jotform", nombre: "Recepción", url: "" })).not.toThrow();
  });
});

describe("removeEntry", () => {
  it("removes an entry and drops the element key once every category is empty", () => {
    let file = defaultDatosFile();
    const added = addEntry(file, "t1", "formularios", { tool: "jotform", nombre: "Recepción", url: "" });
    file = added.file;
    file = removeEntry(file, "t1", "formularios", added.entry.id);
    expect(file.elementos.t1).toBeUndefined();
  });

  it("is a no-op for an unknown element or entry id", () => {
    const file = defaultDatosFile();
    expect(removeEntry(file, "ghost", "formularios", "x")).toEqual(file);
  });
});

describe("setAnchoredId", () => {
  it("stamps the anchored diagram element id onto the matching entry", () => {
    let file = defaultDatosFile();
    const added = addEntry(file, "t1", "formularios", { tool: "jotform", nombre: "Recepción", url: "" });
    file = added.file;
    file = setAnchoredId(file, "t1", "formularios", added.entry.id, "DataObjectReference_1");
    expect(file.elementos.t1.formularios[0].anchoredId).toBe("DataObjectReference_1");
  });
});

describe("distinctTools", () => {
  it("collects distinct non-empty tools across files, sorted, case-insensitively deduped", () => {
    const f1 = normalizeDatosFile({ version: 1, elementos: { t1: { formularios: [{ id: "a", tool: "JotForm", nombre: "R", url: "" }], almacenamiento: [{ id: "b", tool: "ClickUp", nombre: "S", url: "" }], herramientas: [] } } });
    const f2 = normalizeDatosFile({ version: 1, elementos: { t2: { formularios: [{ id: "c", tool: "jotform", nombre: "T", url: "" }], almacenamiento: [], herramientas: [{ id: "d", tool: "Airtable", nombre: "U", url: "" }] } } });
    expect(distinctTools([f1, f2])).toEqual(["Airtable", "ClickUp", "JotForm"]);
  });
  it("ignores empty tools", () => {
    const f = normalizeDatosFile({ version: 1, elementos: { t1: { formularios: [{ id: "a", tool: "", nombre: "R", url: "" }], almacenamiento: [], herramientas: [] } } });
    expect(distinctTools([f])).toEqual([]);
  });
});
