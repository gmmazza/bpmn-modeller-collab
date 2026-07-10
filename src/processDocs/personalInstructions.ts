import { personalOverlayPath } from "./agentsFile";

type Api = {
  readPath(rel: string): Promise<string | null>;
  writePath(rel: string, text: string): Promise<void>;
  deletePath(rel: string): Promise<void>;
};

const HEADER = `# Instrucciones personales para la IA
<!-- Tuyas, para este proyecto. La app no las comparte como convención de equipo; viven junto al
     proyecto (visibles para quien abra la carpeta). Editalas desde "Instrucciones personales para la
     IA" en la app. Ver precedencia en AGENTS.md. -->

`;

export async function readPersonalInstructions(api: Api, name: string | null): Promise<string> {
  const path = personalOverlayPath(name);
  if (!path) return "";
  const raw = await api.readPath(path);
  if (raw === null) return "";
  return raw.startsWith(HEADER) ? raw.slice(HEADER.length) : raw;
}

export async function savePersonalInstructions(
  api: Api,
  name: string | null,
  text: string,
): Promise<"saved" | "deleted" | "no-name"> {
  const path = personalOverlayPath(name);
  if (!path) return "no-name";
  if (text.trim() === "") {
    await api.deletePath(path);
    return "deleted";
  }
  await api.writePath(path, HEADER + text.trim() + "\n");
  return "saved";
}
