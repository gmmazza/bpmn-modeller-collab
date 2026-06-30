import { describe, it, expect } from "vitest";
import { ensureAgentsFile, AGENTS_MD } from "./agentsFile";
import { createFsClient } from "../fsClient";
import { createFakeDir } from "../testHelpers/fakeDir";

describe("ensureAgentsFile", () => {
  it("writes AGENTS.md at the root when absent", async () => {
    const fs = createFsClient(createFakeDir());
    await ensureAgentsFile(fs);
    expect(await fs.readPath("AGENTS.md")).toBe(AGENTS_MD);
  });

  it("does not overwrite an existing AGENTS.md", async () => {
    const fs = createFsClient(createFakeDir());
    await fs.writePath("AGENTS.md", "custom");
    await ensureAgentsFile(fs);
    expect(await fs.readPath("AGENTS.md")).toBe("custom");
  });
});
