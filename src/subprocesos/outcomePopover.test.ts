import { renderOutcomePopover } from "./outcomePopover";

describe("renderOutcomePopover", () => {
  it("offers Marcar + a destination select when the end is normal", () => {
    const calls: string[] = [];
    const pop = renderOutcomePopover(new DOMRect(), {
      end: { id: "E_dev", name: "Devuelto sin reparar", isEscalation: false },
      destinations: [{ id: "s4", label: "Reparación" }, { id: "end_norep", label: "Devuelto sin reparar" }],
      onMarkAlternative: (destId) => { calls.push(`mark:${destId}`); },
      onRevertNormal: () => { calls.push("revert"); },
    });
    const mark = pop.querySelector('[data-act="marcar"]') as HTMLButtonElement;
    expect(mark.textContent).toBe("Marcar como resultado alternativo");
    const sel = pop.querySelector("select") as HTMLSelectElement;
    sel.value = "end_norep";
    mark.click();
    expect(calls).toEqual(["mark:end_norep"]);
    pop.remove();
  });

  it("offers Volver a resultado normal when the end is already an escalation", () => {
    const calls: string[] = [];
    const pop = renderOutcomePopover(new DOMRect(), {
      end: { id: "E_dev", name: "Devuelto", isEscalation: true },
      destinations: [],
      onMarkAlternative: () => { calls.push("mark"); },
      onRevertNormal: () => { calls.push("revert"); },
    });
    const revert = pop.querySelector('[data-act="volver"]') as HTMLButtonElement;
    expect(revert.textContent).toBe("Volver a resultado normal");
    revert.click();
    expect(calls).toEqual(["revert"]);
    pop.remove();
  });
});
