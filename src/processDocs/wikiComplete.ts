export interface WikiCandidatesDeps {
  processes: string[];
  elements: Array<{ id: string; name: string }>;
  ideas?: string[];
}

export function wikiCandidates(query: string, deps: WikiCandidatesDeps): Array<{ label: string; insert: string }> {
  const q = query.trim().toLowerCase();
  const hit = (s: string) => q === "" || s.toLowerCase().includes(q);
  const out: Array<{ label: string; insert: string }> = [];
  for (const p of deps.processes) if (hit(p)) out.push({ label: `📄 ${p}`, insert: p });
  for (const e of deps.elements) if (hit(e.name) || hit(e.id)) out.push({ label: `▢ ${e.name} (${e.id})`, insert: e.name });
  for (const i of deps.ideas ?? []) if (hit(i)) out.push({ label: `💡 ${i}`, insert: `idea:${i}` });
  return out;
}
