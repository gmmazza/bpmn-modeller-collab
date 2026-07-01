import { describe, it, expect } from "vitest";
import { createDocsClient } from "./docsClient";
import { createFsClient } from "../fsClient";
import { createFakeDir } from "../testHelpers/fakeDir";

function client() {
  const fs = createFsClient(createFakeDir());
  return createDocsClient(fs);
}

describe("docsClient", () => {
  it("writes and reads an element note", async () => {
    const c = client();
    await c.writeNote("x.bpmn", "Activity_1", "hola");
    expect(await c.readNote("x.bpmn", "Activity_1")).toBe("hola");
  });

  it("returns null for a missing note", async () => {
    expect(await client().readNote("x.bpmn", "Nope")).toBeNull();
  });

  it("writes/reads the process note and the index", async () => {
    const c = client();
    await c.writeProcessNote("x.bpmn", "overview");
    await c.writeIndex("x.bpmn", "# idx");
    expect(await c.readProcessNote("x.bpmn")).toBe("overview");
  });

  it("lists documented element ids excluding _proceso/_index", async () => {
    const c = client();
    await c.writeNote("x.bpmn", "Activity_1", "a");
    await c.writeNote("x.bpmn", "Gateway_2", "b");
    await c.writeProcessNote("x.bpmn", "ov");
    await c.writeIndex("x.bpmn", "idx");
    expect((await c.listDocumentedIds("x.bpmn")).sort()).toEqual(["Activity_1", "Gateway_2"]);
  });

  it("deletes a note", async () => {
    const c = client();
    await c.writeNote("x.bpmn", "Activity_1", "a");
    await c.deleteNote("x.bpmn", "Activity_1");
    expect(await c.readNote("x.bpmn", "Activity_1")).toBeNull();
  });

  it("writes, lists and reads a binary asset", async () => {
    const c = client();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await c.writeAsset("x.bpmn", "imagen-1.png", bytes);
    expect(await c.listAssets("x.bpmn")).toEqual(["imagen-1.png"]);
    const back = await c.readAsset("x.bpmn", "imagen-1.png");
    expect(back && Array.from(back)).toEqual([1, 2, 3, 4]);
  });
});
