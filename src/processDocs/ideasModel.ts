export interface Idea {
  done: boolean;
  anchor: string | null;   // elementId or null for a general idea
  anchorLabel: string;     // element name (display only), "" for general
  text: string;
  author: string;
  date: string;            // YYYY-MM-DD
}

const LINE = /^- \[([ xX])\] \(([^)]*)\) (.*) — ([^,]+), (\d{4}-\d{2}-\d{2})\s*$/;

export function parseIdeas(md: string): Idea[] {
  const out: Idea[] = [];
  for (const raw of md.split("\n")) {
    const m = raw.match(LINE);
    if (!m) continue;
    const done = m[1].toLowerCase() === "x";
    const anchorRaw = m[2].trim();
    let anchor: string | null = null;
    let anchorLabel = "";
    if (anchorRaw !== "general") {
      const dot = anchorRaw.indexOf(" · ");
      if (dot >= 0) { anchor = anchorRaw.slice(0, dot).trim(); anchorLabel = anchorRaw.slice(dot + 3).trim(); }
      else { anchor = anchorRaw; }
    }
    out.push({ done, anchor, anchorLabel, text: m[3].trim(), author: m[4].trim(), date: m[5] });
  }
  return out;
}

function anchorText(i: Idea): string {
  if (!i.anchor) return "general";
  return i.anchorLabel ? `${i.anchor} · ${i.anchorLabel}` : i.anchor;
}

export function serializeIdeas(processName: string, ideas: Idea[]): string {
  const lines = ideas.map((i) => `- [${i.done ? "x" : " "}] (${anchorText(i)}) ${i.text} — ${i.author}, ${i.date}`);
  return `# Ideas sueltas — ${processName}\n\n${lines.join("\n")}\n`;
}

export function addIdea(ideas: Idea[], idea: Idea): Idea[] {
  return [...ideas, idea];
}

export function toggleIdea(ideas: Idea[], index: number): Idea[] {
  return ideas.map((i, n) => (n === index ? { ...i, done: !i.done } : i));
}

export function anchoredCounts(ideas: Idea[]): Array<{ elementId: string; count: number }> {
  const map = new Map<string, number>();
  for (const i of ideas) if (!i.done && i.anchor) map.set(i.anchor, (map.get(i.anchor) ?? 0) + 1);
  return [...map.entries()].map(([elementId, count]) => ({ elementId, count }));
}
