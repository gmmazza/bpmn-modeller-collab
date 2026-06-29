import { describe, it, expect } from "vitest";
import { createLayersClient } from "./layersClient";
import { defaultLayerFile } from "./layerModel";

function fakeApi(initial: Record<string, string> = {}) {
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

describe("layersClient", () => {
  it("load returns defaults when no sidecar", async () => {
    const lc = createLayersClient(fakeApi());
    const lf = await lc.load("proceso.bpmn");
    expect(lf.dimensions.map((d) => d.id)).toEqual(["madurez", "actores", "docs"]);
  });

  it("load parses+normalizes an existing sidecar", async () => {
    const api = fakeApi({
      "proceso.bpmn:layers.json": JSON.stringify({
        version: 1,
        dimensions: [{ id: "n", label: "N", type: "annotation", assignments: { e1: "hi" } }],
      }),
    });
    const lf = await createLayersClient(api).load("proceso.bpmn");
    expect(lf.dimensions.map((d) => d.id)).toEqual(["n"]);
  });

  it("load falls back to defaults on invalid JSON", async () => {
    const api = fakeApi({ "proceso.bpmn:layers.json": "{not json" });
    const lf = await createLayersClient(api).load("proceso.bpmn");
    expect(lf.dimensions.map((d) => d.id)).toEqual(["madurez", "actores", "docs"]);
  });

  it("save writes the sidecar JSON", async () => {
    const api = fakeApi();
    await createLayersClient(api).save("proceso.bpmn", defaultLayerFile());
    const stored = api.store.get("proceso.bpmn:layers.json")!;
    expect(JSON.parse(stored).dimensions[0].id).toBe("madurez");
  });
});
