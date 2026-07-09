import type { DatosFile } from "./datosModel";

export interface OverlayHost {
  add(elementId: string, html: HTMLElement): string;
  remove(id: string): void;
}

export function datoBadge(forms: boolean, stores: boolean, onClick: () => void): HTMLElement {
  const el = document.createElement("div");
  el.className = "dato-badge";
  const icons = [forms ? "📄" : "", stores ? "🗄" : ""].filter(Boolean).join(" ");
  el.textContent = icons;
  el.title = "Datos y herramientas documentados — clic para ver el detalle";
  el.addEventListener("click", onClick);
  return el;
}

export function elementsWithDatos(file: DatosFile): Array<{ elementId: string; forms: boolean; stores: boolean }> {
  return Object.entries(file.elementos).map(([elementId, e]) => ({
    elementId,
    forms: e.formularios.length > 0,
    stores: e.almacenamiento.length > 0 || e.herramientas.length > 0,
  }));
}

export function createDatosOverlays(host: OverlayHost) {
  let ids: string[] = [];
  function clear(): void {
    for (const id of ids) host.remove(id);
    ids = [];
  }
  return {
    clear,
    render(file: DatosFile, onFocus: (elementId: string) => void): void {
      clear();
      for (const { elementId, forms, stores } of elementsWithDatos(file)) {
        try {
          ids.push(host.add(elementId, datoBadge(forms, stores, () => onFocus(elementId))));
        } catch {
          /* element not on canvas (e.g. deleted) — skip */
        }
      }
    },
  };
}
