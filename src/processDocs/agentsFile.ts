// AGENTS.md es APP-OWNED: orquestador generado (self-heal). Las instrucciones del usuario NO van
// acá — van en los overlays (AGENTS.local.md de equipo, AGENTS.<slug>.md personal). El marcador de
// versión permite actualizar AGENTS.md viejos en carpetas existentes.
const AGENTS_MARKER = "<!-- bpmn-compartida:agents v2 -->";

export const AGENTS_MD = `# Workspace BPMN-compartida — guía para agentes IA
${AGENTS_MARKER}

> **No edites este archivo.** Es generado por la app y se reescribe al abrir el proyecto. Tus
> instrucciones van en \`AGENTS.local.md\` (equipo) o en \`AGENTS.<tu-nombre>.md\` (personal, desde la
> acción "Instrucciones personales para la IA" en la app).

Este es un workspace de procesos BPMN colaborativo. Trabajás sobre **tres capas**:

## Mapa de capas

- **Diseñar / revisar diagramas** (\`.bpmn\`): leé \`_bpmn-design/SKILL.md\`. Las rutas internas de ese
  archivo son relativas a \`_bpmn-design/\`. Material profundo en \`_bpmn-design/references/\`.
- **Documentar** procesos (\`.docs/\`): leé \`_bpmn-design/app/documentation.md\`.
- **Ideas y mejoras**: leé \`_bpmn-design/app/ideas.md\`.
- **Trabajar entre capas** (agregar elemento → nota; hallazgo → idea; idea → mejora): leé
  \`_bpmn-design/app/cross-layer-workflows.md\`.

## Protocolo de colaboración (.bpmn): borrador/publicar y reservas

La app usa un modelo **optimista**: cada persona edita un **borrador local privado** y **Publica**
cuando quiere. La edición nunca requiere un bloqueo. El \`.lock\` no es un candado duro: es una
**reserva** *advisory* con vencimiento opcional (\`lockedUntil\`). **Nunca te bloquea técnicamente.**

Tu flujo principal como agente es **proponer → que el humano revise y publique**:

- Preferí dejar tus aportes como **ideas/comentarios** para que la persona los revise y publique.
- Podés **editar el \`<nombre>.bpmn\` directo** cuando corresponde: la app detecta el cambio externo y
  lo recarga (si la persona tiene trabajo sin publicar, le muestra un diff — no pierde nada).

Respetá las reservas de humanos:

- Si existe \`<nombre>.bpmn.lock\` (JSON con \`lockedByName\`) y su \`lockedUntil\` no venció, alguien lo
  reservó. No estás bloqueado, pero **evitá pisar**: preferí proponer.
- Para pedir el turno, escribí \`<nombre>.bpmn.req\` con
  \`{ "by": "IA", "name": "IA", "at": "<fecha ISO>", "kind": "edit" }\` (\`"kind": "publish"\` si querés
  que publique). Cuando el \`.lock\` desaparezca o venza, editá y borrá tu \`.req\`.

Firmá tus entradas de markdown como autor \`IA\` (ver \`_bpmn-design/app/ideas.md\`).

## Precedencia de instrucciones (mayor autoridad primero)

1. **Protocolo de colaboración** (arriba) — no negociable; la app lo enforcea mecánicamente.
2. **Perfil/canon del proyecto** (\`_bpmn-design/\`) — el proyecto gana; la app lintea al publicar.
3. **\`AGENTS.local.md\`** — overlay de equipo/proyecto (convención compartida: nombres, términos).
4. **\`AGENTS.<tu-nombre>.md\`** — overlay personal (tu estilo de trabajo; refina lo que 3 deja abierto).
5. **Tu skill/agente BPMN personal** — usalo para el oficio general, **mientras cumpla 1–4**.

Si tu entorno ya trae una skill BPMN, este proyecto **tiene precedencia** en perfil/canon, convención
de nombres y capas docs/ideas. Producí como quieras; para **publicar**, el diagrama debe pasar el
lint del proyecto.

Leé también \`AGENTS.local.md\` y, si existe, \`AGENTS.<tu-nombre>.md\`.
`;

export const AGENTS_LOCAL_MD = `# Instrucciones del proyecto para la IA (equipo)
<!-- Este archivo es TUYO. La app NO lo sobrescribe. Escribí acá las convenciones compartidas del
     equipo para este proyecto: terminología, criterios de nombres, dominio, restricciones. Tiene
     precedencia sobre las instrucciones personales y sobre skills BPMN personales (ver AGENTS.md),
     pero no relaja el protocolo de colaboración ni el canon. -->

(escribí acá las instrucciones de tu equipo)
`;

export async function ensureAgentsFile(api: {
  readPath(rel: string): Promise<string | null>;
  writePath(rel: string, text: string): Promise<void>;
}): Promise<void> {
  const existing = await api.readPath("AGENTS.md");
  if (existing !== null && existing.includes(AGENTS_MARKER)) return;
  // Vamos a sobrescribir un AGENTS.md legacy (sin marcador): resguardamos el contenido viejo por si
  // alguien lo editó a mano, sin pisar un backup ya existente de una corrida anterior.
  if (existing !== null && existing.trim() !== "") {
    const existingBackup = await api.readPath("AGENTS.pre-v2.md");
    if (existingBackup === null) {
      await api.writePath("AGENTS.pre-v2.md", existing);
    }
  }
  await api.writePath("AGENTS.md", AGENTS_MD);
}

export async function ensureLocalOverlay(api: {
  readPath(rel: string): Promise<string | null>;
  writePath(rel: string, text: string): Promise<void>;
}): Promise<void> {
  if ((await api.readPath("AGENTS.local.md")) !== null) return;
  await api.writePath("AGENTS.local.md", AGENTS_LOCAL_MD);
}

// Deriva el nombre de archivo del overlay personal a partir del nombre del usuario. Slug
// filesystem-safe: minúsculas, sin tildes, [a-z0-9-]. Devuelve null si no queda nada usable.
export function personalOverlayPath(name: string | null): string | null {
  if (!name) return null;
  const slug = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // saca tildes/acentos (property-escape Unicode)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return null;
  // "local" está reservado para AGENTS.local.md (overlay de equipo, ver ensureLocalOverlay): un
  // usuario llamado "Local" no debe pisarlo.
  const safeSlug = slug === "local" ? "local-user" : slug;
  return `AGENTS.${safeSlug}.md`;
}
