import { parseIdeas } from "./ideasModel";
import type { IdeaNote } from "./ideaNote";

export function migrateV1ToNotes(v1md: string): IdeaNote[] {
  return parseIdeas(v1md).map((idea, n) => ({
    id: `idea-${n + 1}`,
    estado: idea.done ? "hecho" : "pendiente",
    anchor: idea.anchor,
    anchorLabel: idea.anchorLabel,
    autor: idea.author,
    fecha: idea.date,
    motivo: "",
    mejora: "",
    description: idea.text,
    comments: [],
  }));
}
