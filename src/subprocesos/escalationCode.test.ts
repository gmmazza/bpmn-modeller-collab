import { outcomeSlug, escalationCodeFor, resolveEscalations } from "./escalationCode";
import type { EscalationEnd } from "./boundaryLinks";
import type { MasterBoundary } from "./boundaryLinks";

describe("outcomeSlug", () => {
  it("accent-strips, lowercases and keeps only [a-z0-9_]", () => {
    expect(outcomeSlug("Devuelto sin reparar")).toBe("devuelto_sin_reparar");
    expect(outcomeSlug("No cubre")).toBe("no_cubre");
    expect(outcomeSlug("Garantía / Ámbito 2b")).toBe("garantia_ambito_2b");
  });
});

describe("escalationCodeFor", () => {
  it("joins process id and outcome slug with a double underscore", () => {
    expect(escalationCodeFor("proc_rep_3", "Devuelto sin reparar")).toBe("proc_rep_3__devuelto_sin_reparar");
  });
});

describe("resolveEscalations", () => {
  it("pairs ends to boundaries by code and reports unpaired ends", () => {
    const ends: EscalationEnd[] = [
      { endId: "E_dev", name: "Devuelto", escalationCode: "proc_rep_3__devuelto" },
      { endId: "E_other", name: "Otro", escalationCode: "proc_rep_3__otro" },
    ];
    const bs: MasterBoundary[] = [
      { boundaryId: "B1", callActivityId: "s3", escalationCode: "proc_rep_3__devuelto", interrupting: true, outgoingTargetId: "dest_dev" },
    ];
    expect(resolveEscalations(ends, bs)).toEqual([
      { escalationCode: "proc_rep_3__devuelto", endId: "E_dev", outcomeName: "Devuelto", boundaryId: "B1", outgoingTargetId: "dest_dev" },
      { escalationCode: "proc_rep_3__otro", endId: "E_other", outcomeName: "Otro", boundaryId: null, outgoingTargetId: null },
    ]);
  });
});
