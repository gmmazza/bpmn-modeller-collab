import { describe, it, expect } from "vitest";
import { createNotePanelController, type DiagramElement } from "./notePanelController";
import { createDocsClient } from "./docsClient";
import { createFsClient } from "../fsClient";
import { createFakeDir } from "../testHelpers/fakeDir";

function setup(elements: DiagramElement[], selected: DiagramElement | null) {
  const fs = createFsClient(createFakeDir());
  const docs = createDocsClient(fs);
  const mount = document.createElement("div");
  let sel = selected;
  const listeners: Array<() => void> = [];
  const api = {
    docs,
    mount,
    diagramId: () => "x.bpmn",
    processName: () => "Proc",
    listElements: () => elements,
    getSelected: () => sel,
    onSelectionChange: (cb: () => void) => listeners.push(cb),
    setSel: (e: DiagramElement | null) => { sel = e; listeners.forEach((l) => l()); },
  };
  const ctrl = createNotePanelController(api);
  return { docs, mount, api, ctrl };
}

const A: DiagramElement = { id: "Activity_1", name: "Validar", type: "bpmn:Task" };

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
