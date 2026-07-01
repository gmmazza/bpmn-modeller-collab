import type { IdeaNote } from "./ideaNote";
import type { MejoraNote } from "./mejoraNote";

export function buildMejora(idea: IdeaNote, mejoraId: string, fecha: string): { mejora: MejoraNote; idea: IdeaNote } {
  const mejora: MejoraNote = {
    id: mejoraId,
    desdeIdea: idea.id,
    estado: "propuesta",
    anchor: idea.anchor,
    anchorLabel: idea.anchorLabel,
    autor: idea.autor,
    fecha,
    description: idea.description,
    comments: [],
  };
  return { mejora, idea: { ...idea, mejora: mejoraId } };
}
