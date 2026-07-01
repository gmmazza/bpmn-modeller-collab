import { describe, it, expect, vi } from "vitest";
import { ideaBadge, createIdeaOverlays } from "./ideasOverlays";
import type { Idea } from "./ideasModel";

describe("ideasOverlays", () => {
  it("builds a badge element with the count", () => {
    const el = ideaBadge(3);
    expect(el.textContent).toContain("3");
    expect(el.className).toContain("idea-badge");
  });

  it("adds one overlay per anchored element and clears previous on re-render", () => {
    const added: string[] = [];
    let n = 0;
    const host = {
      add: vi.fn((elementId: string) => { added.push(elementId); return `o${n++}`; }),
      remove: vi.fn(),
    };
    const ov = createIdeaOverlays(host);
    const ideas: Idea[] = [
      { done: false, anchor: "A", anchorLabel: "x", text: "a", author: "u", date: "d" },
      { done: false, anchor: "A", anchorLabel: "x", text: "b", author: "u", date: "d" },
      { done: false, anchor: "B", anchorLabel: "y", text: "c", author: "u", date: "d" },
    ];
    ov.render(ideas);
    expect(host.add).toHaveBeenCalledTimes(2); // A and B
    ov.render([]); // re-render clears the two previous overlays
    expect(host.remove).toHaveBeenCalledTimes(2);
  });
});
