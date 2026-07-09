import { describe, it, expect } from "vitest";
import {
  ensureAgentsFile,
  ensureLocalOverlay,
  personalOverlayPath,
  AGENTS_MD,
  AGENTS_LOCAL_MD,
} from "./agentsFile";
import { createFsClient } from "../fsClient";
import { createFakeDir } from "../testHelpers/fakeDir";

describe("ensureAgentsFile (app-owned, self-heal)", () => {
  it("writes AGENTS.md when absent", async () => {
    const fs = createFsClient(createFakeDir());
    await ensureAgentsFile(fs);
    expect(await fs.readPath("AGENTS.md")).toBe(AGENTS_MD);
  });

  it("upgrades an old AGENTS.md that lacks the current marker", async () => {
    const fs = createFsClient(createFakeDir());
    await fs.writePath("AGENTS.md", "# convención vieja sin marcador");
    await ensureAgentsFile(fs);
    expect(await fs.readPath("AGENTS.md")).toBe(AGENTS_MD);
  });

  it("no-ops when the current marker is already present", async () => {
    const fs = createFsClient(createFakeDir());
    await ensureAgentsFile(fs);
    await fs.writePath("AGENTS.md", AGENTS_MD + "\n<!-- edición local -->");
    await ensureAgentsFile(fs);
    expect(await fs.readPath("AGENTS.md")).toContain("<!-- edición local -->");
  });

  it("never touches the overlays", async () => {
    const fs = createFsClient(createFakeDir());
    await fs.writePath("AGENTS.local.md", "team stuff");
    await fs.writePath("AGENTS.ana.md", "ana stuff");
    await fs.writePath("AGENTS.md", "old");
    await ensureAgentsFile(fs);
    expect(await fs.readPath("AGENTS.local.md")).toBe("team stuff");
    expect(await fs.readPath("AGENTS.ana.md")).toBe("ana stuff");
  });

  it("backs up a legacy AGENTS.md before overwriting it", async () => {
    const fs = createFsClient(createFakeDir());
    await fs.writePath("AGENTS.md", "# convención vieja sin marcador");
    await ensureAgentsFile(fs);
    expect(await fs.readPath("AGENTS.pre-v2.md")).toBe("# convención vieja sin marcador");
    expect(await fs.readPath("AGENTS.md")).toBe(AGENTS_MD);
  });

  it("does not create a backup on a fresh folder", async () => {
    const fs = createFsClient(createFakeDir());
    await ensureAgentsFile(fs);
    expect(await fs.readPath("AGENTS.pre-v2.md")).toBeNull();
  });

  it("does not create a backup when the marker is already present", async () => {
    const fs = createFsClient(createFakeDir());
    await fs.writePath("AGENTS.md", AGENTS_MD);
    await ensureAgentsFile(fs);
    expect(await fs.readPath("AGENTS.pre-v2.md")).toBeNull();
  });

  it("does not clobber an existing backup", async () => {
    const fs = createFsClient(createFakeDir());
    await fs.writePath("AGENTS.pre-v2.md", "old-backup");
    await fs.writePath("AGENTS.md", "# convención vieja sin marcador");
    await ensureAgentsFile(fs);
    expect(await fs.readPath("AGENTS.pre-v2.md")).toBe("old-backup");
  });
});

describe("AGENTS_MD orquestador (anti-duplicación)", () => {
  it("points at the three layers and declares precedence", () => {
    expect(AGENTS_MD).toContain("_bpmn-design/SKILL.md");
    expect(AGENTS_MD).toContain("_bpmn-design/app/documentation.md");
    expect(AGENTS_MD).toContain("_bpmn-design/app/ideas.md");
    expect(AGENTS_MD).toContain("_bpmn-design/app/cross-layer-workflows.md");
    expect(AGENTS_MD).toContain("Precedencia");
    expect(AGENTS_MD).toContain("AGENTS.local.md");
  });

  it("does NOT re-embed the relocated docs/ideas convention", () => {
    // guard: el ejemplo de frontmatter de nota vive ahora en app/documentation.md
    expect(AGENTS_MD).not.toContain("element: Activity_0x9f2");
    // guard: el frontmatter de idea vive ahora en app/ideas.md
    expect(AGENTS_MD).not.toContain("ancla: Activity_1");
  });

  it("keeps the collaboration protocol inline", () => {
    expect(AGENTS_MD).toContain("borrador");
    expect(AGENTS_MD).toContain(".req");
  });

  it("documents the fuentes protocol and the fuente idea field", () => {
    expect(AGENTS_MD).toContain("## Fuentes (material de origen)");
    expect(AGENTS_MD).toContain("procesado/");
    expect(AGENTS_MD).toContain("fuente:");
  });

  it("documents the datos.json sidecar and the Mostrar en el diagrama anchor", () => {
    expect(AGENTS_MD).toContain("## Datos y herramientas");
    expect(AGENTS_MD).toContain("datos.json");
    expect(AGENTS_MD).toContain("Mostrar en el diagrama");
  });
});

describe("ensureLocalOverlay (team, ensure-once)", () => {
  it("creates AGENTS.local.md when absent", async () => {
    const fs = createFsClient(createFakeDir());
    await ensureLocalOverlay(fs);
    expect(await fs.readPath("AGENTS.local.md")).toBe(AGENTS_LOCAL_MD);
  });
  it("does not overwrite an existing AGENTS.local.md", async () => {
    const fs = createFsClient(createFakeDir());
    await fs.writePath("AGENTS.local.md", "custom");
    await ensureLocalOverlay(fs);
    expect(await fs.readPath("AGENTS.local.md")).toBe("custom");
  });
});

describe("personalOverlayPath (slug filesystem-safe)", () => {
  it("slugifies a plain name", () => {
    expect(personalOverlayPath("Ana")).toBe("AGENTS.ana.md");
  });
  it("handles accents, spaces and symbols", () => {
    expect(personalOverlayPath("Ana Pérez!")).toBe("AGENTS.ana-perez.md");
  });
  it("returns null for empty/invalid names", () => {
    expect(personalOverlayPath("")).toBeNull();
    expect(personalOverlayPath(null)).toBeNull();
    expect(personalOverlayPath("   ")).toBeNull();
    expect(personalOverlayPath("***")).toBeNull();
  });
  it("reserves the 'local' slug to avoid colliding with the team overlay", () => {
    expect(personalOverlayPath("Local")).toBe("AGENTS.local-user.md");
    expect(personalOverlayPath("local")).toBe("AGENTS.local-user.md");
    expect(personalOverlayPath("Ana")).toBe("AGENTS.ana.md");
  });
});
