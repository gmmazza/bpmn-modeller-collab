export interface RawEl {
  id: string;
  name: string;
  type: string;
  calledElement?: string;
  eventKind?: "message" | "signal" | "link";
  eventRefName?: string;
  isThrow?: boolean;
}

export interface CallRef {
  elementId: string;
  elementName: string;
  calledElement: string;
}

export interface EventRef {
  elementId: string;
  elementName: string;
  kind: "message" | "signal" | "link";
  direction: "throw" | "catch";
  refName: string;
}

export interface InterProcessRefs {
  calls: CallRef[];
  events: EventRef[];
}

export function extractInterProcessRefs(els: RawEl[]): InterProcessRefs {
  const calls: CallRef[] = [];
  const events: EventRef[] = [];

  for (const el of els) {
    // Extract call activities with calledElement
    if (el.type === "bpmn:CallActivity" && el.calledElement) {
      calls.push({
        elementId: el.id,
        elementName: el.name,
        calledElement: el.calledElement,
      });
    }

    // Extract message/signal events with refName
    if (el.eventKind && el.eventRefName) {
      events.push({
        elementId: el.id,
        elementName: el.name,
        kind: el.eventKind,
        direction: el.isThrow ? "throw" : "catch",
        refName: el.eventRefName,
      });
    }
  }

  return { calls, events };
}
