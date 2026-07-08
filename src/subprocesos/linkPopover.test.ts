import { describe, it, expect, vi } from "vitest";
import { renderLinkPopover, type LinkPopoverDeps } from "./linkPopover";

function deps(over: Partial<LinkPopoverDeps> = {}): LinkPopoverDeps {
  return {
    element: { id: "A", name: "2 · Diagnóstico" },
    processes: [{ processId: "P_diag", file: "rep_2.bpmn" }],
    onLinkExisting: vi.fn(), onCreateNew: vi.fn(), onGoToSubprocess: vi.fn(), onUnlink: vi.fn(),
    ...over,
  };
}

describe("renderLinkPopover", () => {
  it("offers Vincular + Crear when the box is unlinked", () => {
    const el = renderLinkPopover(new DOMRect(0, 0, 0, 0), deps());
    expect(el.querySelector('[data-act="vincular"]')).toBeTruthy();
    expect(el.querySelector('[data-act="crear"]')).toBeTruthy();
    expect(el.querySelector('[data-act="ir"]')).toBeNull();
  });
  it("offers Ir + Desvincular when linked, and calls onGoToSubprocess", () => {
    const d = deps({ element: { id: "A", name: "x", calledElement: "P_diag" } });
    const el = renderLinkPopover(new DOMRect(0, 0, 0, 0), d);
    (el.querySelector('[data-act="ir"]') as HTMLButtonElement).click();
    expect(d.onGoToSubprocess).toHaveBeenCalledOnce();
    expect(el.querySelector('[data-act="vincular"]')).toBeNull();
  });
});
