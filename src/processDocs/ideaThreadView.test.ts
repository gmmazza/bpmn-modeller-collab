import { describe, it, expect, vi } from "vitest";
import { renderIdeaThread, type ThreadHandlers } from "./ideaThreadView";
import type { IdeaNote } from "./ideaNote";

function handlers(): ThreadHandlers {
  return { onBack: vi.fn(), onSaveDescription: vi.fn(), onComment: vi.fn(), onSetState: vi.fn(), onPromote: vi.fn() };
}
const idea: IdeaNote = {
  id: "idea-3", estado: "haciendo", anchor: "A", anchorLabel: "Val", autor: "Ana", fecha: "2026-07-01",
  motivo: "", mejora: "", description: "avisar por mail",
  comments: [{ author: "Beto", date: "2026-07-02", text: "y en el dashboard" }],
};

describe("renderIdeaThread", () => {
  it("shows the description and each comment", () => {
    const c = document.createElement("div");
    renderIdeaThread(c, idea, handlers());
    expect(c.querySelector<HTMLTextAreaElement>("[data-thread-desc]")!.value).toBe("avisar por mail");
    expect(c.textContent).toContain("Beto");
    expect(c.textContent).toContain("y en el dashboard");
  });

  it("adds a comment", () => {
    const c = document.createElement("div"); const h = handlers();
    renderIdeaThread(c, idea, h);
    const box = c.querySelector<HTMLInputElement>("[data-thread-comment]")!;
    box.value = "buena idea";
    (c.querySelector("[data-thread-comment-add]") as HTMLButtonElement).click();
    expect(h.onComment).toHaveBeenCalledWith("buena idea");
  });

  it("changes state and promotes and goes back", () => {
    const c = document.createElement("div"); const h = handlers();
    renderIdeaThread(c, idea, h);
    const st = c.querySelector<HTMLSelectElement>("[data-thread-state]")!;
    st.value = "hecho"; st.dispatchEvent(new Event("change"));
    expect(h.onSetState).toHaveBeenCalledWith("hecho");
    (c.querySelector("[data-thread-promote]") as HTMLButtonElement).click();
    expect(h.onPromote).toHaveBeenCalled();
    (c.querySelector("[data-thread-back]") as HTMLButtonElement).click();
    expect(h.onBack).toHaveBeenCalled();
  });

  it("shows the mejora link when the idea was promoted", () => {
    const c = document.createElement("div");
    renderIdeaThread(c, { ...idea, mejora: "mejora-2" }, handlers());
    expect(c.textContent).toContain("mejora-2");
  });
});
