import { describe, it, expect } from "vitest";
import { createFsClient } from "./fsClient";
import { createFakeDir } from "./testHelpers/fakeDir";

async function seedDoc(fs: ReturnType<typeof createFsClient>, base: string) {
  await fs.writePath(`${base}.docs/Activity_1.md`, "nota");
}

describe("fsClient carries the .docs sidecar", () => {
  it("rename moves the .docs folder", async () => {
    const fs = createFsClient(createFakeDir());
    await fs.createFile("x.bpmn", "<xml/>");
    await seedDoc(fs, "x");
    await fs.renameFile("x.bpmn", "y.bpmn");
    expect(await fs.readPath("y.docs/Activity_1.md")).toBe("nota");
    expect(await fs.readPath("x.docs/Activity_1.md")).toBeNull();
  });

  it("copy duplicates the .docs folder", async () => {
    const fs = createFsClient(createFakeDir());
    await fs.createFile("x.bpmn", "<xml/>");
    await seedDoc(fs, "x");
    const newId = await fs.copyFile("x.bpmn", "", "z");
    expect(await fs.readPath("z.docs/Activity_1.md")).toBe("nota");
    expect(await fs.readPath("x.docs/Activity_1.md")).toBe("nota");
    expect(newId).toBe("z.bpmn");
  });

  it("delete removes the .docs folder", async () => {
    const fs = createFsClient(createFakeDir());
    await fs.createFile("x.bpmn", "<xml/>");
    await seedDoc(fs, "x");
    await fs.deleteFile("x.bpmn");
    expect(await fs.readPath("x.docs/Activity_1.md")).toBeNull();
  });
});
