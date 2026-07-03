// Which authors count as "IA" (LLM agents editing the markdown outside the app).
// Default is just "IA"; extra names can be configured (comma-separated) in
// localStorage under `bpmn-compartida.aiAuthors` (e.g. "Claude, Cowork").
const DEFAULT_AI = ["IA"];

export function aiAuthors(): string[] {
  let extra: string[] = [];
  try {
    const raw = localStorage.getItem("bpmn-compartida.aiAuthors") ?? "";
    extra = raw.split(",").map((s) => s.trim()).filter(Boolean);
  } catch { /* no localStorage (tests/SSR) */ }
  return [...DEFAULT_AI, ...extra];
}

export function isAiAuthor(name: string): boolean {
  const n = name.trim().toLowerCase();
  return !!n && aiAuthors().some((a) => a.toLowerCase() === n);
}

// The name the app uses when it attributes an external edit to the IA bucket.
export function aiAuthorName(): string {
  return aiAuthors()[0];
}
