// src/processDocs/manualController.ts
import { orderFlow, type FlowGraph, type FlowNode } from "./flowOrder";
import { buildManualMarkdown, type ManualStep } from "./manualBuild";
import { manualHtmlDocument, inlineImages } from "./manualExport";
import { renderMarkdown } from "./markdownRender";
import { parseFrontmatter } from "./frontmatter";
import { bytesToBase64 } from "./base64";

export interface ManualDeps {
  graph(): FlowGraph;
  processName(): string;
  readProcessNote(): Promise<string | null>;
  readNote(elementId: string): Promise<string | null>;
  readAsset(name: string): Promise<Uint8Array | null>;
}

async function assembleMarkdown(deps: ManualDeps): Promise<string> {
  const graph = deps.graph();
  const byId = new Map<string, FlowNode>(graph.nodes.map((n) => [n.id, n]));
  const order = orderFlow(graph);
  const processNoteRaw = await deps.readProcessNote();
  const processNote = processNoteRaw ? parseFrontmatter(processNoteRaw).body : null;
  const steps: ManualStep[] = [];
  for (const id of order) {
    const node = byId.get(id);
    if (!node) continue;
    const raw = await deps.readNote(id);
    steps.push({ name: node.name, type: node.type, note: raw ? parseFrontmatter(raw).body : null });
  }
  return buildManualMarkdown(deps.processName(), processNote, steps);
}

export async function buildManual(deps: ManualDeps): Promise<{ markdown: string; html: string }> {
  const markdown = await assembleMarkdown(deps);
  return { markdown, html: renderMarkdown(markdown) };
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" };

export async function exportManualHtml(deps: ManualDeps): Promise<string> {
  const { html } = await buildManual(deps);
  const inlined = await inlineImages(html, async (ref) => {
    const name = ref.replace(/^assets\//, "");
    const bytes = await deps.readAsset(name);
    if (!bytes) return null;
    const ext = name.split(".").pop()?.toLowerCase() ?? "png";
    return `data:${MIME[ext] ?? "application/octet-stream"};base64,${bytesToBase64(bytes)}`;
  });
  return manualHtmlDocument(`Manual: ${deps.processName()}`, inlined);
}
