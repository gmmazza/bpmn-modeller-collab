// Profile type badges (A.3): a small icon+label for precise task types and curated event
// types, surfaced in the stage editor so non-technical readers see "Usuario"/"Plazo"
// rather than decoding symbols. Pure mapping. Task-type badges may feed the automation-
// maturity layer.
export interface TypeBadge { icon: string; label: string }

const TASK_BADGES: Record<string, TypeBadge> = {
  "bpmn:UserTask": { icon: "🙍", label: "Usuario" },
  "bpmn:ManualTask": { icon: "✋", label: "Manual" },
  "bpmn:ServiceTask": { icon: "⚙", label: "Servicio" },
  "bpmn:SendTask": { icon: "📤", label: "Enviar" },
  "bpmn:ReceiveTask": { icon: "📥", label: "Recibir" },
  "bpmn:BusinessRuleTask": { icon: "📐", label: "Regla" },
  "bpmn:ScriptTask": { icon: "📜", label: "Script" },
};

const EVENT_DEF_BADGES: Array<{ match: string; badge: TypeBadge }> = [
  { match: "TimerEventDefinition", badge: { icon: "⏱", label: "Temporizador" } },
  { match: "MessageEventDefinition", badge: { icon: "✉", label: "Mensaje" } },
  { match: "ErrorEventDefinition", badge: { icon: "❗", label: "Error" } },
  { match: "EscalationEventDefinition", badge: { icon: "↗", label: "Escalación" } },
  { match: "TerminateEventDefinition", badge: { icon: "⛔", label: "Terminación" } },
];

export function typeBadgeFor(
  el: { type: string; eventDefinitions?: { $type?: string }[]; cancelActivity?: boolean; attachedToRef?: unknown },
): TypeBadge | null {
  const type = el.type ?? "";
  if (type in TASK_BADGES) return TASK_BADGES[type];

  const defType = (el.eventDefinitions ?? [])[0]?.$type ?? "";
  if (defType) {
    // A timer boundary event is a deadline: label it "Plazo" rather than "Temporizador".
    if (defType.endsWith("TimerEventDefinition") && type.endsWith("BoundaryEvent") && el.attachedToRef) {
      return { icon: "⏱", label: "Plazo" };
    }
    for (const { match, badge } of EVENT_DEF_BADGES) if (defType.endsWith(match)) return badge;
  }
  return null;
}
