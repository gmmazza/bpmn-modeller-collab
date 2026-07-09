import { describe, it, expect } from "vitest";
import { createDatosClient } from "./datosClient";
import type { SidecarApi } from "../layers/layersClient";

function fakeApi(initial: Record<string, string> = {}): SidecarApi & { store: Map<string, string> } {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    async readSidecar(id: string, suffix: string) {
      return store.get(`${id}:${suffix}`) ?? null;
    },
    async writeSidecar(id: string, suffix: string, text: string) {
      store.set(`${id}:${suffix}`, text);
    },
  };
}

describe("datosClient.load", () => {
  it("returns the default file when there's no sidecar yet", async () => {
    const c = createDatosClient(fakeApi(), "proceso.bpmn");
    expect(await c.load()).toEqual({ version: 1, elementos: {} });
  });

  it("falls back to defaults on invalid JSON", async () => {
    const c = createDatosClient(fakeApi({ "proceso.bpmn:datos.json": "{not json" }), "proceso.bpmn");
    expect(await c.load()).toEqual({ version: 1, elementos: {} });
  });
});

describe("datosClient.list", () => {
  it("returns an empty ElementoDatos for an element with nothing documented", async () => {
    const c = createDatosClient(fakeApi(), "proceso.bpmn");
    expect(await c.list("t1")).toEqual({ formularios: [], almacenamiento: [], herramientas: [] });
  });
});

describe("datosClient.add / list", () => {
  it("adds an entry and persists it under the sidecar path <diagramId>:datos.json", async () => {
    const api = fakeApi();
    const c = createDatosClient(api, "proceso.bpmn");
    const entry = await c.add("t1", "formularios", { tool: "jotform", nombre: "Recepción", url: "https://x" });
    expect(entry.nombre).toBe("Recepción");
    expect((await c.list("t1")).formularios).toEqual([entry]);
    const stored = JSON.parse(api.store.get("proceso.bpmn:datos.json")!);
    expect(stored.elementos.t1.formularios[0].nombre).toBe("Recepción");
  });

  it("rejects a duplicate nombre in the same element+category", async () => {
    const c = createDatosClient(fakeApi(), "proceso.bpmn");
    await c.add("t1", "formularios", { tool: "jotform", nombre: "Recepción", url: "" });
    await expect(c.add("t1", "formularios", { tool: "clickup", nombre: "recepción", url: "" })).rejects.toThrow();
  });
});

describe("datosClient.remove", () => {
  it("removes an entry", async () => {
    const c = createDatosClient(fakeApi(), "proceso.bpmn");
    const entry = await c.add("t1", "almacenamiento", { tool: "clickup", nombre: "Reparaciones", url: "" });
    await c.remove("t1", "almacenamiento", entry.id);
    expect((await c.list("t1")).almacenamiento).toEqual([]);
  });
});

describe("datosClient.markAnchored", () => {
  it("stamps anchoredId on the entry and persists it", async () => {
    const c = createDatosClient(fakeApi(), "proceso.bpmn");
    const entry = await c.add("t1", "formularios", { tool: "jotform", nombre: "Recepción", url: "" });
    await c.markAnchored("t1", "formularios", entry.id, "DataObjectReference_1");
    expect((await c.list("t1")).formularios[0].anchoredId).toBe("DataObjectReference_1");
  });
});
