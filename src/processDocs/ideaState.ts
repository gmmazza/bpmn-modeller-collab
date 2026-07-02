// src/processDocs/ideaState.ts
export type IdeaState = "pendiente" | "haciendo" | "pausado" | "hecho" | "rechazado";

export const IDEA_STATES: IdeaState[] = ["pendiente", "haciendo", "pausado", "hecho", "rechazado"];

// Glyph per state — shown in the state chip and idea rows.
export const STATE_GLYPH: Record<IdeaState, string> = {
  pendiente: "○", haciendo: "◑", pausado: "⏸", hecho: "●", rechazado: "✕",
};

export function isIdeaState(s: string): s is IdeaState {
  return (IDEA_STATES as string[]).includes(s);
}
export function isActive(s: IdeaState): boolean {
  return s === "pendiente" || s === "haciendo" || s === "pausado";
}
export function isClosed(s: IdeaState): boolean {
  return s === "hecho" || s === "rechazado";
}
export function requiresMotivo(s: IdeaState): boolean {
  return s === "pausado" || s === "rechazado";
}
