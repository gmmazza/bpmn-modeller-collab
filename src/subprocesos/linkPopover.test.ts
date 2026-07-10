import { describe, it, expect, vi } from "vitest";
import { renderLinkPopover, type LinkPopoverDeps } from "./linkPopover";

function deps(over: Partial<LinkPopoverDeps> = {}): LinkPopoverDeps {
  return {
    element: { id: "A", name: "2 · Diagnóstico" },
    processes: [{ processId: "P_diag", file: "rep_2.bpmn" }],
    onLinkExisting: vi.fn(), onCreateNew: vi.fn(), onUnlink: vi.fn(),
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

  it("offers only Desvincular when linked (drilling is double-click now)", () => {
    const d = deps({ element: { id: "A", name: "x", calledElement: "P_diag" } });
    const el = renderLinkPopover(new DOMRect(0, 0, 0, 0), d);
    expect(el.querySelector('[data-act="desvincular"]')).toBeTruthy();
    expect(el.querySelector('[data-act="ir"]')).toBeNull();
    expect(el.querySelector('[data-act="vincular"]')).toBeNull();
  });

  it("does not render an 'Ir al subproceso' control (drilling is double-click now)", () => {
    const el = renderLinkPopover(new DOMRect(0, 0, 10, 10), {
      element: { id: "CA_1", name: "Etapa", calledElement: "P_1" },
      processes: [{ processId: "P_1", file: "p1.bpmn", name: "P1" } as any],
      onLinkExisting: vi.fn(),
      onCreateNew: vi.fn(),
      onUnlink: vi.fn(),
    });
    expect(el.textContent).not.toContain("Ir al subproceso");
    document.body.appendChild(el);
    expect(Array.from(el.querySelectorAll("button")).some((b) => /ir al subproceso/i.test(b.textContent ?? ""))).toBe(false);
    el.remove();
  });
});
