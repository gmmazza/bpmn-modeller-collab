export type WikiTarget =
  | { kind: "idea"; ref: string }
  | { kind: "element"; process: string; element: string }
  | { kind: "bare"; text: string };

export function parseWikilinkTarget(raw: string): WikiTarget {
  const t = raw.trim();
  if (t.toLowerCase().startsWith("idea:")) return { kind: "idea", ref: t.slice(5).trim() };
  const hash = t.indexOf("#");
  if (hash > 0) return { kind: "element", process: t.slice(0, hash).trim(), element: t.slice(hash + 1).trim() };
  return { kind: "bare", text: t };
}
