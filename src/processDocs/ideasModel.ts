export interface Idea {
  done: boolean;
  anchor: string | null;   // elementId or null for a general idea
  anchorLabel: string;     // element name (display only), "" for general
  text: string;
  author: string;
  date: string;            // YYYY-MM-DD
}

const LINE = /^- \[([ xX])\] \(([^)]*)\) (.*) — ([^,]+), (\d{4}-\d{2}-\d{2})\s*$/;

export function isIdeaLine(line: string): boolean {
  return LINE.test(line);
}

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

export function serializeIdeaLine(i: Idea): string {
  const anchor = !i.anchor ? "general" : (i.anchorLabel ? `${i.anchor} · ${i.anchorLabel}` : i.anchor);
  return `- [${i.done ? "x" : " "}] (${anchor}) ${i.text} — ${i.author}, ${i.date}`;
}

export function serializeIdeas(processName: string, ideas: Idea[]): string {
  const lines = ideas.map(serializeIdeaLine);
  return `# Ideas sueltas — ${processName}\n\n${lines.join("\n")}\n`;
}

// Rewrites `original` preserving every non-idea line in place, replacing the Nth
// idea line with ideas[N], and appending any ideas beyond the original idea-line
// count. If `original` has no content, falls back to a fresh doc.
export function mergeIdeas(original: string, processName: string, ideas: Idea[]): string {
  if (original.trim().length === 0) return serializeIdeas(processName, ideas);
  const lines = original.split("\n");
  const out: string[] = [];
  let i = 0;
  for (const line of lines) {
    if (isIdeaLine(line)) {
      if (i < ideas.length) { out.push(serializeIdeaLine(ideas[i])); i++; }
      // extra original idea lines beyond model count are dropped (deleted ideas)
    } else {
      out.push(line);
    }
  }
  for (; i < ideas.length; i++) out.push(serializeIdeaLine(ideas[i]));
  return out.join("\n");
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
