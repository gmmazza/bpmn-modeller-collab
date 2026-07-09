// "Mostrar en el diagrama" (design spec §3.1/§5): creates a STANDARD bpmn:DataObjectReference
// (forms) or bpmn:DataStoreReference (storage) anchored to the given activity via a standard
// bpmn:DataInputAssociation/bpmn:DataOutputAssociation. Only the human-readable `nombre` crosses
// into the .bpmn — the tool-specific url/id stay in the datos.json sidecar (see datosModel.ts).
//
// bpmn-js API verified directly against node_modules before writing this module:
// - Modeling.createShape(shape, position, parent) — diagram-js/lib/features/modeling/Modeling.d.ts.
// - Modeling.connect(source, target, attrs) — same file; internally calls createConnection(source,
//   target, attrs, source.parent).
// - Creating a 'bpmn:DataObjectReference' shape auto-creates its linked bpmn:DataObject via
//   bpmn-js's CreateDataObjectBehavior (preExecute on 'shape.create') — no manual DataObject needed.
// - Association direction (bpmn-js/lib/features/modeling/BpmnUpdater.js):
//   dataInputAssociation  → connect(dataObjectShape, activityShape, { type: 'bpmn:DataInputAssociation' })
//   dataOutputAssociation → connect(activityShape, dataStoreShape, { type: 'bpmn:DataOutputAssociation' })

export interface DatosAnchorModeler {
  get(service: string): any;
}
interface ActivityLike {
  x: number;
  y: number;
  width: number;
  height: number;
  parent: any;
}

export function anchorLabel(category: "formularios" | "almacenamiento", nombre: string): string {
  const prefix = category === "formularios" ? "Formulario" : "Almacenamiento";
  return `${prefix}: ${nombre}`;
}

// Centered below the activity, far enough not to overlap its label.
export function activityPosition(el: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
  return { x: el.x + el.width / 2, y: el.y + el.height + 80 };
}

export function anchorFormulario(modeler: DatosAnchorModeler, activity: ActivityLike, nombre: string): { id: string } {
  const bpmnFactory = modeler.get("bpmnFactory");
  const modeling = modeler.get("modeling");
  const bo = bpmnFactory.create("bpmn:DataObjectReference", { name: anchorLabel("formularios", nombre) });
  const shape = modeling.createShape({ type: "bpmn:DataObjectReference", businessObject: bo }, activityPosition(activity), activity.parent);
  modeling.connect(shape, activity, { type: "bpmn:DataInputAssociation" });
  return { id: shape.id };
}

export function anchorAlmacenamiento(modeler: DatosAnchorModeler, activity: ActivityLike, nombre: string): { id: string } {
  const bpmnFactory = modeler.get("bpmnFactory");
  const modeling = modeler.get("modeling");
  const bo = bpmnFactory.create("bpmn:DataStoreReference", { name: anchorLabel("almacenamiento", nombre) });
  const shape = modeling.createShape({ type: "bpmn:DataStoreReference", businessObject: bo }, activityPosition(activity), activity.parent);
  modeling.connect(activity, shape, { type: "bpmn:DataOutputAssociation" });
  return { id: shape.id };
}
