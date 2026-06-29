// bpmn-moddle ships without type declarations.
// @ts-expect-error no type declarations published
import { BpmnModdle } from "bpmn-moddle";
// bpmn-js-differ ships without types; declare the minimal surface we use.
// @ts-expect-error no type declarations published
import { diff } from "bpmn-js-differ";

export interface BpmnChanges {
  added: string[];
  removed: string[];
  changed: string[];
  layoutChanged: string[];
}

export async function computeDiff(oldXml: string, newXml: string): Promise<BpmnChanges> {
  const moddle = new BpmnModdle();
  const a = (await moddle.fromXML(oldXml)).rootElement;
  const b = (await moddle.fromXML(newXml)).rootElement;
  const r = diff(a, b) as {
    _added?: Record<string, unknown>;
    _removed?: Record<string, unknown>;
    _changed?: Record<string, unknown>;
    _layoutChanged?: Record<string, unknown>;
  };
  return {
    added: Object.keys(r._added ?? {}),
    removed: Object.keys(r._removed ?? {}),
    changed: Object.keys(r._changed ?? {}),
    layoutChanged: Object.keys(r._layoutChanged ?? {}),
  };
}
