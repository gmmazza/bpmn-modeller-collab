import { BPMN_DESIGN_FILES, BPMN_DESIGN_VERSION } from "./bpmnDesignSkill.generated";

const ROOT = "_bpmn-design";

// Escribe el skill vendorizado + capa de integración en la carpeta del usuario, con self-heal por
// versión: si el VERSION en disco coincide con el bundleado, no toca nada (evita churn de sync en
// carpetas compartidas). Contenido idéntico para todos en la misma versión de app → converge.
export async function ensureBpmnDesignSkill(api: {
  readPath(rel: string): Promise<string | null>;
  writePath(rel: string, text: string): Promise<void>;
}): Promise<void> {
  const current = await api.readPath(`${ROOT}/VERSION`);
  if (current === BPMN_DESIGN_VERSION) return;
  // Self-heal aditivo: reescribe el set de claves actual de BPMN_DESIGN_FILES, pero no borra
  // archivos que una versión futura elimine del bundle. Seguro mientras el set de archivos sea
  // estable; si algún día se quitan archivos del bundle, esto dejará huérfanos en disco.
  for (const [rel, text] of Object.entries(BPMN_DESIGN_FILES)) {
    await api.writePath(`${ROOT}/${rel}`, text);
  }
  await api.writePath(`${ROOT}/VERSION`, BPMN_DESIGN_VERSION);
}
