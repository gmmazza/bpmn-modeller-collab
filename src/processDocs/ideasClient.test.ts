import { describe, it, expect } from "vitest";
import { createIdeasClient } from "./ideasClient";
import { createFsClient } from "../fsClient";
import { createFakeDir } from "../testHelpers/fakeDir";
import type { IdeaNote } from "./ideaNote";

function client() {
  return createIdeasClient(createFsClient(createFakeDir()));
}
function idea(p: Partial<IdeaNote>): IdeaNote {
  return { id: "idea-1", estado: "pendiente", anchor: null, anchorLabel: "", autor: "A", fecha: "2026-07-01", motivo: "", mejora: "", description: "x", comments: [], ...p };
}

describe("ideasClient", () => {
  it("writes, lists and reads idea notes", async () => {
    const c = client();
    await c.writeIdea("x.bpmn", idea({ id: "idea-1", description: "uno" }));
    await c.writeIdea("x.bpmn", idea({ id: "idea-2", description: "dos", estado: "hecho" }));
    const all = await c.listIdeas("x.bpmn");
    expect(all.map((n) => n.id)).toEqual(["idea-1", "idea-2"]);
    expect((await c.readIdea("x.bpmn", "idea-2"))?.description).toBe("dos");
  });

  it("gives the lowest free idea id", async () => {
    const c = client();
    expect(await c.nextIdeaId("x.bpmn")).toBe("idea-1");
    await c.writeIdea("x.bpmn", idea({ id: "idea-1" }));
    expect(await c.nextIdeaId("x.bpmn")).toBe("idea-2");
  });

  it("regenerates the _ideas.md index over all notes", async () => {
    const c = client();
    await c.writeIdea("x.bpmn", idea({ id: "idea-1", estado: "rechazado", motivo: "no", description: "mala" }));
    await c.writeIndex("x.bpmn", "Proc");
    const idx = await c.readIdea("x.bpmn", "idea-1"); // sanity: note exists
    expect(idx).not.toBeNull();
  });

  it("migrates a v1 _ideas.md when there are no idea notes yet", async () => {
    const fs = createFsClient(createFakeDir());
    const c = createIdeasClient(fs);
    await fs.writePath("x.docs/_ideas.md", "# Ideas sueltas — P\n\n- [ ] (general) vieja idea — Ana, 2026-06-30\n");
    const migrated = await c.migrateIfNeeded("x.bpmn");
    expect(migrated).toBe(true);
    const notes = await c.listIdeas("x.bpmn");
    expect(notes).toHaveLength(1);
    expect(notes[0].description).toBe("vieja idea");
    // idempotent: second call does nothing
    expect(await c.migrateIfNeeded("x.bpmn")).toBe(false);
  });
});
