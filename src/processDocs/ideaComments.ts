export interface Comment {
  author: string;
  date: string;
  text: string;
}

const HEADING = "## Comentarios";
const LINE = /^-\s+(.+?),\s*(\d{4}-\d{2}-\d{2}):\s*(.*)$/;

export function splitBody(body: string): { description: string; comments: Comment[] } {
  const idx = body.indexOf(`\n${HEADING}`);
  const hasAtStart = body.startsWith(HEADING);
  if (idx < 0 && !hasAtStart) return { description: body.trim(), comments: [] };
  const cut = hasAtStart ? 0 : idx + 1;
  const description = body.slice(0, cut).trim();
  const block = body.slice(cut);
  const comments: Comment[] = [];
  for (const line of block.split("\n")) {
    const m = line.match(LINE);
    if (m) comments.push({ author: m[1].trim(), date: m[2], text: m[3].trim() });
  }
  return { description, comments };
}

export function joinBody(description: string, comments: Comment[]): string {
  if (comments.length === 0) return description.trim();
  const lines = comments.map((c) => `- ${c.author}, ${c.date}: ${c.text}`);
  return `${description.trim()}\n\n${HEADING}\n${lines.join("\n")}`;
}

export function addComment(comments: Comment[], c: Comment): Comment[] {
  return [...comments, c];
}
