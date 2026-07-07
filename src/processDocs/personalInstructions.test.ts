import { describe, it, expect } from "vitest";
import { readPersonalInstructions, savePersonalInstructions } from "./personalInstructions";
import { createFsClient } from "../fsClient";
import { createFakeDir } from "../testHelpers/fakeDir";

describe("personal instructions I/O", () => {
  it("returns '' when no overlay exists", async () => {
    const fs = createFsClient(createFakeDir());
    expect(await readPersonalInstructions(fs, "Ana")).toBe("");
  });

  it("saves non-empty content to the slug path and reads it back", async () => {
    const fs = createFsClient(createFakeDir());
    const r = await savePersonalInstructions(fs, "Ana Pérez", "sé conciso");
    expect(r).toBe("saved");
    expect(await fs.readPath("AGENTS.ana-perez.md")).toContain("sé conciso");
    expect(await readPersonalInstructions(fs, "Ana Pérez")).toContain("sé conciso");
  });

  it("deletes the overlay when saved empty", async () => {
    const fs = createFsClient(createFakeDir());
    await savePersonalInstructions(fs, "Ana", "algo");
    const r = await savePersonalInstructions(fs, "Ana", "   ");
    expect(r).toBe("deleted");
    expect(await fs.readPath("AGENTS.ana.md")).toBeNull();
  });

  it("refuses when there is no usable name", async () => {
    const fs = createFsClient(createFakeDir());
    expect(await savePersonalInstructions(fs, "", "x")).toBe("no-name");
  });
});
