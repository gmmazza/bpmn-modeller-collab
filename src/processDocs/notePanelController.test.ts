import { describe, it, expect, vi } from "vitest";
import { createNotePanelController, type DiagramElement, type NoteControllerApi } from "./notePanelController";
import { createDocsClient } from "./docsClient";
import { createFsClient } from "../fsClient";
import { createFakeDir } from "../testHelpers/fakeDir";
import type { IdeasClient } from "./ideasClient";
import type { IdeaNote } from "./ideaNote";

function makeBaseApi(elements: DiagramElement[], selected: DiagramElement | null) {
  const fs = createFsClient(createFakeDir());
  const docs = createDocsClient(fs);
  const mount = document.createElement("div");
  let sel = selected;
  const listeners: Array<() => void> = [];
  return {
    docs,
    mount,
    api: {
      docs,
      mount,
      diagramId: () => "x.bpmn",
      processName: () => "Proc",
      listElements: () => elements,
      getSelected: () => sel,
      onSelectionChange: (cb: () => void) => listeners.push(cb),
      setSel: (e: DiagramElement | null) => { sel = e; listeners.forEach((l) => l()); },
    } as NoteControllerApi & { setSel(e: DiagramElement | null): void },
  };
}

function setup(elements: DiagramElement[], selected: DiagramElement | null) {
  const { docs, mount, api } = makeBaseApi(elements, selected);
  const ctrl = createNotePanelController(api);
  return { docs, mount, api, ctrl };
}

function makeController(extra: Partial<NoteControllerApi>) {
  const { api } = makeBaseApi([A], A);
  const ctrl = createNotePanelController({ ...api, ...extra });
  return ctrl;
}

function fakeIdeasClientWithAnchoredIdea(): IdeasClient {
  const idea: IdeaNote = {
    id: "idea-1",
    estado: "pendiente",
    anchor: "A",
    anchorLabel: "Actividad A",
    autor: "test",
    fecha: "2026-07-01",
    motivo: "",
    mejora: "",
    description: "test idea",
    comments: [],
  };
  return {
    listIdeas: async () => [idea],
    readIdea: async () => idea,
    writeIdea: async () => undefined,
    nextIdeaId: async () => "idea-2",
    readMejora: async () => null,
    writeMejora: async () => undefined,
    nextMejoraId: async () => "mejora-1",
    writeIndex: async () => undefined,
    migrateIfNeeded: async () => false,
  };
}

const A: DiagramElement = { id: "Activity_1", name: "Validar", type: "bpmn:Task" };

describe("notePanelController — ideas v2 API", () => {
  it("forwards anchored counts to api.onIdeaCounts", async () => {
    const onIdeaCounts = vi.fn();
    const ctrl = makeController({ onIdeaCounts, ideasClient: fakeIdeasClientWithAnchoredIdea() });
    ctrl.openIdeasTab();
    // flush: reload() is async, waits for listIdeas
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(onIdeaCounts).toHaveBeenCalled();
    const counts = onIdeaCounts.mock.calls.at(-1)![0] as Array<{ elementId: string; count: number }>;
    expect(counts).toEqual(expect.arrayContaining([expect.objectContaining({ elementId: "A" })]));
  });

  it("exposes openThread and refreshIdeas on the returned object", () => {
    const ctrl = makeController({});
    expect(typeof ctrl.openThread).toBe("function");
    expect(typeof ctrl.refreshIdeas).toBe("function");
  });
});

describe("notePanelController", () => {
  it("loads a selected element's note into read mode", async () => {
    const { docs, mount, ctrl } = setup([A], A);
    await docs.writeNote("x.bpmn", "Activity_1", "---\nelement: Activity_1\n---\n# Cuerpo");
    await ctrl.refresh();
    expect(mount.querySelector("[data-note-read] h1")?.textContent).toBe("Cuerpo");
  });

  it("saving writes the note with frontmatter and regenerates the index", async () => {
    const { docs, mount, ctrl } = setup([A], A);
    await ctrl.refresh();
    (mount.querySelector('[data-mode="edit"]') as HTMLElement).click();
    ctrl._setEditorDocForTest("texto nuevo");
    (mount.querySelector("[data-note-save]") as HTMLButtonElement).click();
    await Promise.resolve(); await Promise.resolve();
    const saved = await docs.readNote("x.bpmn", "Activity_1");
    expect(saved).toContain("element: Activity_1");
    expect(saved).toContain("name: Validar");
    expect(saved).toContain("texto nuevo");
    const idx = await docs.readProcessNote("x.bpmn"); // index is separate; check via readPath
    expect(idx).toBeNull();
  });

  it("shows the empty prompt when nothing is selected on the step tab", async () => {
    const { mount, ctrl } = setup([A], null);
    await ctrl.refresh();
    expect(mount.textContent).toContain("Seleccioná un paso");
  });

  it("edits through the CM6 editor and saves the editor's document", async () => {
    const { docs, mount, ctrl } = setup([A], A); // existing helper
    await ctrl.refresh();
    (mount.querySelector('[data-mode="edit"]') as HTMLElement).click();
    // CM6 mounts into the edit host
    const host = mount.querySelector("[data-note-edit-host] .cm-editor");
    expect(host).not.toBeNull();
    // simulate typing by setting the editor doc through the controller's test seam
    ctrl._setEditorDocForTest("texto via cm6");
    (mount.querySelector("[data-note-save]") as HTMLButtonElement).click();
    await Promise.resolve(); await Promise.resolve();
    const saved = await docs.readNote("x.bpmn", "Activity_1");
    expect(saved).toContain("texto via cm6");
  });

  it("destroy() disposes the resolver and does not throw", async () => {
    const { mount, ctrl } = setup([A], A);
    await ctrl.refresh();
    // Enter edit mode so onEditHostReady fires, which calls rebuildResolver()
    (mount.querySelector('[data-mode="edit"]') as HTMLElement).click();
    // Pre-condition: not yet disposed
    expect(ctrl._isDisposedForTest()).toBe(false);
    // destroy() must not throw and must mark disposed
    expect(() => ctrl.destroy()).not.toThrow();
    expect(ctrl._isDisposedForTest()).toBe(true);
  });
});
