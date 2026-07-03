#!/usr/bin/env node
// QA seed: generates a realistic working folder so you can point the app at it and
// immediately exercise the collaboration features (drafts, publish/conflict, an
// existing foreign reservation, history-to-restore, ideas, hidden sidecars).
//
//   node scripts/qa-seed.mjs [carpeta-destino]     (default: ./qa-workspace)
//
// It writes .bpmn diagrams, their .docs sidecars, a .history with restorable
// revisions, an active <file>.bpmn.lock reserved by someone else (expires in 2h),
// ideas, and an independent empty folder. It deliberately does NOT write AGENTS.md
// so you can verify the app auto-creates it on first open.
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";

const target = path.resolve(process.argv[2] ?? "qa-workspace");

// A valid BPMN 2.0 diagram: start → task → end, with DI so it renders and has
// documentable elements. `variant` lets us make distinguishable history revisions.
function bpmn(procId, taskName, variant = "") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_${procId}" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="${procId}" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Inicio"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="Activity_1" name="${taskName}${variant}"><bpmn:incoming>Flow_1</bpmn:incoming><bpmn:outgoing>Flow_2</bpmn:outgoing></bpmn:task>
    <bpmn:endEvent id="EndEvent_1" name="Fin"><bpmn:incoming>Flow_2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1"/>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="EndEvent_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${procId}">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="156" y="81" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1"><dc:Bounds x="250" y="59" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1"><dc:Bounds x="412" y="81" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="192" y="99"/><di:waypoint x="250" y="99"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="350" y="99"/><di:waypoint x="412" y="99"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

const procesoMd = (name) => `---
proceso: ${name}
dueño: Equipo QA
---
# ${name}

Proceso de ejemplo para QA. Editá esta nota desde el panel de Documentación.
`;

const elementMd = (diagram, name) => `---
element: Activity_1
name: ${name}
type: bpmn:Task
diagram: ${diagram}
---
Nota del paso «${name}». Sirve para probar la edición de notas (siempre compartidas).
`;

const ideaMd = `---
id: idea-1
estado: haciendo
ancla: Activity_1
ancla-nombre: Validar
autor: Ana
fecha: 2026-07-01
---
¿Podemos automatizar este paso?

## Comentarios
- Beto, 2026-07-02: Buena idea, sumemos un ejemplo.
`;

async function write(rel, content) {
  const full = path.join(target, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
}

async function main() {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });

  // --- Root diagram WITH a live foreign reservation + restorable history ---
  await write("Compras.bpmn", bpmn("Proceso_Compras", "Recibir pedido"));
  await write("Compras.docs/_proceso.md", procesoMd("Compras"));
  await write("Compras.docs/Activity_1.md", elementMd("Compras.bpmn", "Recibir pedido"));

  // An ACTIVE reservation by someone else, expiring in 2h → the app shows
  // "🔒 Reservado por Otro hasta HH:MM" and you can still edit/publish (advisory).
  const now = Date.now();
  await write(
    "Compras.bpmn.lock",
    JSON.stringify({
      lockedBy: "Otro",
      lockedByEmail: "Otro",
      lockedByName: "Otro",
      lockedAt: new Date(now).toISOString(),
      lockedUntil: new Date(now + 2 * 3600_000).toISOString(),
    }),
  );

  // Two restorable revisions (spaced so decay-pruning keeps both). Filename format
  // the app expects: <rid>~<author>.bpmn under .history/<basename>/.
  const t1 = now - 48 * 3600_000;
  const t2 = now - 24 * 3600_000;
  await write(`.history/Compras/${t1}~Ana.bpmn`, bpmn("Proceso_Compras", "Recibir pedido", " (v1)"));
  await write(`.history/Compras/${t2}~Beto.bpmn`, bpmn("Proceso_Compras", "Recibir pedido", " (v2)"));

  // --- Independent folder with a diagram + docs + an idea ---
  await write("Ventas/B2B.bpmn", bpmn("Proceso_B2B", "Cotizar"));
  await write("Ventas/B2B.docs/_proceso.md", procesoMd("Ventas B2B"));
  await write("Ventas/B2B.docs/ideas/idea-1.md", ideaMd);

  // --- A second independent diagram, and an EMPTY independent folder ---
  await write("RRHH.bpmn", bpmn("Proceso_RRHH", "Onboarding"));
  await mkdir(path.join(target, "Proyectos"), { recursive: true });

  console.log("QA workspace listo en: " + target);
  console.log("Contenido:");
  console.log("  Compras.bpmn            (con .lock de «Otro» activo 2h + 2 revisiones en historial)");
  console.log("  Compras.docs/           (sidecar OCULTO en la vista)");
  console.log("  Ventas/B2B.bpmn         (carpeta independiente, con idea)");
  console.log("  RRHH.bpmn");
  console.log("  Proyectos/              (carpeta independiente vacía)");
  console.log("");
  console.log("Abrí la app y elegí esta carpeta. En la vista NO deben verse .docs ni .history.");
  console.log("(AGENTS.md NO está: verificá que la app lo crea al abrir la carpeta.)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
