import { describe, it, expect } from "vitest";
import { anchorLabel, activityPosition } from "./datosAnchor";

describe("anchorLabel", () => {
  it("prefixes the standard-BPMN anchor name per category", () => {
    expect(anchorLabel("formularios", "Recepción — alta de motor")).toBe("Formulario: Recepción — alta de motor");
    expect(anchorLabel("almacenamiento", "Lista Reparaciones")).toBe("Almacenamiento: Lista Reparaciones");
  });
});

describe("activityPosition", () => {
  it("places the anchor centered below the activity shape", () => {
    expect(activityPosition({ x: 100, y: 100, width: 100, height: 80 })).toEqual({ x: 150, y: 260 });
  });
});
