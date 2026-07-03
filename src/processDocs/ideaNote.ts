import { parseFrontmatter, serializeFrontmatter } from "./frontmatter";
import { splitBody, joinBody, type Comment } from "./ideaComments";
import { isIdeaState, type IdeaState } from "./ideaState";

export interface IdeaNote {
  id: string;
  estado: IdeaState;
  anchor: string | null;
  anchorLabel: string;
  autor: string;
  fecha: string;
  motivo: string;
  mejora: string;
  description: string;
  comments: Comment[];
}

export function parseIdeaNote(md: string): IdeaNote {
  const { meta, body } = parseFrontmatter(md);
  const { description, comments } = splitBody(body);
  const anclaRaw = (meta["ancla"] ?? "general").trim();
  const anchor = anclaRaw === "general" || anclaRaw === "" ? null : anclaRaw;
  const estadoRaw = (meta["estado"] ?? "pendiente").trim();
  return {
    id: meta["id"] ?? "",
    estado: isIdeaState(estadoRaw) ? estadoRaw : "pendiente",
    anchor,
    anchorLabel: (meta["ancla-nombre"] ?? "").trim(),
    autor: (meta["autor"] ?? "").trim(),
    fecha: (meta["fecha"] ?? "").trim(),
    motivo: (meta["motivo"] ?? "").trim(),
    mejora: (meta["mejora"] ?? "").trim(),
    description,
    comments,
  };
}

export function serializeIdeaNote(n: IdeaNote): string {
  const meta: Record<string, string> = {
    id: n.id,
    estado: n.estado,
    ancla: n.anchor ?? "general",
    "ancla-nombre": n.anchorLabel,
    autor: n.autor,
    fecha: n.fecha,
    motivo: n.motivo,
    mejora: n.mejora,
  };
  return serializeFrontmatter(meta, joinBody(n.description, n.comments));
}
