import { parseFrontmatter, serializeFrontmatter } from "./frontmatter";
import { splitBody, joinBody, type Comment } from "./ideaComments";

export type MejoraState = "propuesta" | "aprobada" | "implementada";
const MEJORA_STATES: MejoraState[] = ["propuesta", "aprobada", "implementada"];

export interface MejoraNote {
  id: string;
  desdeIdea: string;
  estado: MejoraState;
  anchor: string | null;
  anchorLabel: string;
  autor: string;
  fecha: string;
  description: string;
  comments: Comment[];
}

export function parseMejoraNote(md: string): MejoraNote {
  const { meta, body } = parseFrontmatter(md);
  const { description, comments } = splitBody(body);
  const anclaRaw = (meta["ancla"] ?? "general").trim();
  const estadoRaw = (meta["estado"] ?? "propuesta").trim();
  return {
    id: meta["id"] ?? "",
    desdeIdea: (meta["desde-idea"] ?? "").trim(),
    estado: (MEJORA_STATES as string[]).includes(estadoRaw) ? (estadoRaw as MejoraState) : "propuesta",
    anchor: anclaRaw === "general" || anclaRaw === "" ? null : anclaRaw,
    anchorLabel: (meta["ancla-nombre"] ?? "").trim(),
    autor: (meta["autor"] ?? "").trim(),
    fecha: (meta["fecha"] ?? "").trim(),
    description,
    comments,
  };
}

export function serializeMejoraNote(n: MejoraNote): string {
  const meta: Record<string, string> = {
    id: n.id,
    "desde-idea": n.desdeIdea,
    estado: n.estado,
    ancla: n.anchor ?? "general",
    "ancla-nombre": n.anchorLabel,
    autor: n.autor,
    fecha: n.fecha,
  };
  return serializeFrontmatter(meta, joinBody(n.description, n.comments));
}
