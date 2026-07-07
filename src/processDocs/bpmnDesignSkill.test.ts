import { describe, it, expect, vi } from "vitest";
import { ensureBpmnDesignSkill } from "./bpmnDesignSkill";
import { BPMN_DESIGN_VERSION } from "./bpmnDesignSkill.generated";
import { createFsClient } from "../fsClient";
import { createFakeDir } from "../testHelpers/fakeDir";

describe("ensureBpmnDesignSkill", () => {
  it("writes the full skill tree and a VERSION marker on a fresh folder", async () => {
    const fs = createFsClient(createFakeDir());
    await ensureBpmnDesignSkill(fs);
    expect(await fs.readPath("_bpmn-design/SKILL.md")).toContain("BPMN");
    expect(await fs.readPath("_bpmn-design/app/cross-layer-workflows.md")).toContain("entre capas");
    expect(await fs.readPath("_bpmn-design/references/correctness.md")).not.toBeNull();
    expect(await fs.readPath("_bpmn-design/VERSION")).toBe(BPMN_DESIGN_VERSION);
  });

  it("is idempotent: same version does not rewrite", async () => {
    const fs = createFsClient(createFakeDir());
    await ensureBpmnDesignSkill(fs);
    const spy = vi.spyOn(fs, "writePath");
    await ensureBpmnDesignSkill(fs);
    expect(spy).not.toHaveBeenCalled();
  });

  it("self-heals: a stale VERSION triggers a rewrite", async () => {
    const fs = createFsClient(createFakeDir());
    await fs.writePath("_bpmn-design/VERSION", "deadbeef0000");
    await fs.writePath("_bpmn-design/SKILL.md", "stale");
    await ensureBpmnDesignSkill(fs);
    expect(await fs.readPath("_bpmn-design/VERSION")).toBe(BPMN_DESIGN_VERSION);
    expect(await fs.readPath("_bpmn-design/SKILL.md")).not.toBe("stale");
  });
});
