// bpmn-moddle ships without type declarations; shape verified at runtime (see
// processDocs/diagramInfo.ts for the same pattern). For an Activity-like flow element:
// - dataInputAssociations[i].sourceRef is an ARRAY; [0] is the referenced Data
//   Object/Store Reference (the data flowing INTO the activity, e.g. a form).
// - dataOutputAssociations[i].targetRef is the referenced Data Object/Store Reference
//   (the data flowing OUT of the activity, e.g. what it persists).
// @ts-expect-error no type declarations published
import { BpmnModdle } from "bpmn-moddle";

export interface DatosAnchorRef {
  id: string;
  name: string;
}
export interface ElementDatosLinks {
  elementId: string;
  dataObjects: DatosAnchorRef[];
  dataStores: DatosAnchorRef[];
}

function isType(el: any, suffix: string): boolean {
  return typeof el?.$type === "string" && el.$type.endsWith(suffix);
}
function refOf(el: any): DatosAnchorRef | null {
  if (!el || typeof el.id !== "string") return null;
  return { id: el.id, name: typeof el.name === "string" ? el.name : "" };
}

export function parseDatosLinks(defs: any): ElementDatosLinks[] {
  const rootElements: any[] = defs.rootElements ?? [];
  const process = rootElements.find((r) => (r.$type ?? "").endsWith("Process"));
  const flow: any[] = process?.flowElements ?? [];
  const out: ElementDatosLinks[] = [];

  for (const fe of flow) {
    const inputAssocs: any[] = fe.dataInputAssociations ?? [];
    const outputAssocs: any[] = fe.dataOutputAssociations ?? [];
    if (!inputAssocs.length && !outputAssocs.length) continue;

    const dataObjects: DatosAnchorRef[] = [];
    const dataStores: DatosAnchorRef[] = [];

    for (const assoc of inputAssocs) {
      const src = (assoc.sourceRef ?? [])[0];
      const ref = refOf(src);
      if (!ref) continue;
      if (isType(src, "DataObjectReference")) dataObjects.push(ref);
      else if (isType(src, "DataStoreReference")) dataStores.push(ref);
    }
    for (const assoc of outputAssocs) {
      const tgt = assoc.targetRef;
      const ref = refOf(tgt);
      if (!ref) continue;
      if (isType(tgt, "DataObjectReference")) dataObjects.push(ref);
      else if (isType(tgt, "DataStoreReference")) dataStores.push(ref);
    }

    if (dataObjects.length || dataStores.length) {
      out.push({ elementId: fe.id, dataObjects, dataStores });
    }
  }
  return out;
}

export async function parseDatosLinksFromXml(xml: string): Promise<ElementDatosLinks[]> {
  const moddle = new BpmnModdle();
  const { rootElement } = await (moddle as any).fromXML(xml);
  return parseDatosLinks(rootElement);
}
