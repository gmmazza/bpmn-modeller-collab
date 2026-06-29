import { describe, it, expect } from "vitest";
import { createFsClient } from "../fsClient";
import { createFakeDir } from "../testHelpers/fakeDir";
import { createTemplatesClient } from "./layerTemplates";
import { addColorDimension, type LayerFile } from "./layerModel";

function clientOverFakeDir() {
  const dir = createFakeDir();
  const fs = createFsClient(dir as unknown as FileSystemDirectoryHandle);
  return createTemplatesClient(fs);
}

describe("templates client", () => {
  it("returns [] when the templates folder is absent", async () => {
    const t = clientOverFakeDir();
    expect(await t.list()).toEqual([]);
    expect(await t.load("nope")).toBeNull();
  });

  it("saves (stripping assignments), lists, loads, and removes", async () => {
    const t = clientOverFakeDir();
    const lf: LayerFile = addColorDimension({ version: 1, dimensions: [] }, "Madurez").lf;
    const withAssign: LayerFile = {
      version: 1,
      dimensions: [{ ...(lf.dimensions[0] as any), assignments: { E1: "categoria-1" } }],
    };
    await t.save("Mi plantilla", withAssign.dimensions);

    const list = await t.list();
    expect(list).toEqual([{ slug: "mi-plantilla", name: "Mi plantilla" }]);

    const loaded = await t.load("mi-plantilla");
    expect(loaded?.name).toBe("Mi plantilla");
    expect(loaded?.dimensions[0].assignments).toEqual({}); // stripped

    await t.remove("mi-plantilla");
    expect(await t.list()).toEqual([]);
  });

  it("strips assignments when loading a template written directly (bypassing save)", async () => {
    const dir = createFakeDir();
    const fs = createFsClient(dir as unknown as FileSystemDirectoryHandle);
    const t = createTemplatesClient(fs);

    // Build a dimension with assignments
    const lf = addColorDimension({ version: 1, dimensions: [] }, "Categoría");
    const dimWithAssign = {
      ...(lf.lf.dimensions[0] as any),
      assignments: { E1: "categoria-1" },
    };

    // Write directly to storage, bypassing save (which would strip)
    const payload = { version: 1, name: "External Template", dimensions: [dimWithAssign] };
    await fs.writePath(".layer-templates/external.json", JSON.stringify(payload));

    // Load should strip assignments even though they're in the file
    const loaded = await t.load("external");
    expect(loaded).not.toBeNull();
    expect(loaded?.name).toBe("External Template");
    expect(loaded?.dimensions[0].assignments).toEqual({}); // must be stripped on load
  });
});
