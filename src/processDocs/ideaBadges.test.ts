import { describe, it, expect, vi } from "vitest";
import { createIdeaBadges, type BadgeCount } from "./ideaBadges";
import type { OverlayHost } from "./ideasOverlays";

function fakeHost() {
  const added: Array<{ id: string; elementId: string; html: HTMLElement }> = [];
  const removed: string[] = [];
  let n = 0;
  const host: OverlayHost = {
    add(elementId, html) { const id = `ov-${n++}`; added.push({ id, elementId, html }); return id; },
    remove(id) { removed.push(id); },
  };
  return { host, added, removed };
}

describe("ideaBadges", () => {
  it("draws one badge per element with count > 0 and skips zero", () => {
    const { host, added } = fakeHost();
    const badges = createIdeaBadges(host, vi.fn());
    badges.render([{ elementId: "A", count: 2 }, { elementId: "B", count: 0 }] as BadgeCount[]);
    expect(added).toHaveLength(1);
    expect(added[0].elementId).toBe("A");
    expect(added[0].html.textContent).toContain("2");
  });

  it("fires onBadgeClick with the elementId and stops propagation", () => {
    const { host, added } = fakeHost();
    const onClick = vi.fn();
    const badges = createIdeaBadges(host, onClick);
    badges.render([{ elementId: "A", count: 1 }]);
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    const stop = vi.spyOn(ev, "stopPropagation");
    added[0].html.dispatchEvent(ev);
    expect(onClick).toHaveBeenCalledWith("A");
    expect(stop).toHaveBeenCalled();
  });

  it("clears previous overlays on re-render", () => {
    const { host, added, removed } = fakeHost();
    const badges = createIdeaBadges(host, vi.fn());
    badges.render([{ elementId: "A", count: 1 }]);
    badges.render([{ elementId: "B", count: 3 }]);
    expect(removed).toContain(added[0].id);
    expect(added[1].elementId).toBe("B");
  });

  it("clear() removes all badges", () => {
    const { host, added, removed } = fakeHost();
    const badges = createIdeaBadges(host, vi.fn());
    badges.render([{ elementId: "A", count: 1 }, { elementId: "B", count: 2 }]);
    badges.clear();
    expect(removed).toEqual(added.map((a) => a.id));
  });
});
