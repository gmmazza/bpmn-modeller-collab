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

  it("saving a different name that slugifies the same does not overwrite the other", async () => {
    const t = clientOverFakeDir();
    const lf: LayerFile = addColorDimension({ version: 1, dimensions: [] }, "Madurez").lf;

    // Save first template
    await t.save("Mi Plantilla", lf.dimensions);

    // Save second template with different name but same base slug
    await t.save("mi plantilla", lf.dimensions);

    const list = await t.list();
    expect(list).toHaveLength(2);
    expect(new Set(list.map((x) => x.name))).toEqual(new Set(["Mi Plantilla", "mi plantilla"]));

    // Verify each can be loaded by slug and retains correct name
    const loaded1 = await t.load("mi-plantilla");
    const loaded2 = await t.load("mi-plantilla-2");
    expect(loaded1?.name).toBe("Mi Plantilla");
    expect(loaded2?.name).toBe("mi plantilla");
  });

  it("saving the same name updates in place (one file)", async () => {
    const t = clientOverFakeDir();
    const lf1: LayerFile = addColorDimension({ version: 1, dimensions: [] }, "Madurez").lf;
    const lf2: LayerFile = addColorDimension({ version: 1, dimensions: [] }, "Urgencia").lf;

    // Save first version
    await t.save("Base", lf1.dimensions);

    // Save again with same name but different dimensions
    await t.save("Base", lf2.dimensions);

    const list = await t.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Base");
    expect(list[0].slug).toBe("base");

    // Load and verify it has the second dimensions (the update)
    const loaded = await t.load("base");
    expect(loaded?.name).toBe("Base");
    expect(loaded?.dimensions).toHaveLength(1);
    expect(loaded?.dimensions[0].label).toBe("Urgencia");
  });
});
