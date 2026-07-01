// src/processDocs/cmDecorations.ts
import { parser as baseParser, GFM } from "@lezer/markdown";

// Configure the markdown parser with GFM so task lists (`- [ ]`), strikethrough
// (`~~`), tables and autolinks are recognized. Without this, the base parser
// mis-parses `- [x]` as a link and never yields a task marker.
const mdParser = baseParser.configure(GFM);

export type DecoKind = "hide" | "mark" | "widget";
export interface ImageWidget { type: "image"; src: string; alt: string }
export interface VideoWidget { type: "video"; src: string }
export interface BulletWidget { type: "bullet" }
export interface TaskWidget { type: "task"; checked: boolean }
export type Widget = ImageWidget | VideoWidget | BulletWidget | TaskWidget;
export interface DecoSpec {
  kind: DecoKind;
  from: number;
  to: number;
  cls?: string;
  widget?: Widget;
}

const HEADING_CLASS: Record<string, string> = {
  ATXHeading1: "cm-heading-1", ATXHeading2: "cm-heading-2", ATXHeading3: "cm-heading-3",
  ATXHeading4: "cm-heading-4", ATXHeading5: "cm-heading-5", ATXHeading6: "cm-heading-6",
};

// Build a safe video embed src from a bare provider URL, or null if not a video URL.
function videoEmbed(line: string): string | null {
  const yt = line.match(/^\s*https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([\w-]+)\s*$/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const ytShort = line.match(/^\s*https?:\/\/youtu\.be\/([\w-]+)\s*$/);
  if (ytShort) return `https://www.youtube.com/embed/${ytShort[1]}`;
  const vimeo = line.match(/^\s*https?:\/\/(?:www\.)?vimeo\.com\/(\d+)\s*$/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

export function computeMarkdownDecorations(text: string): DecoSpec[] {
  const specs: DecoSpec[] = [];

  // Wikilinks: [[target]] — lezer doesn't parse these, so scan by regex.
  const wikiRanges: Array<{ from: number; to: number }> = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let wm: RegExpExecArray | null;
  while ((wm = re.exec(text)) !== null) {
    const from = wm.index;
    const to = from + wm[0].length;
    wikiRanges.push({ from, to });
    specs.push({ kind: "hide", from, to: from + 2 });                 // "[["
    specs.push({ kind: "hide", from: to - 2, to });                   // "]]"
    specs.push({ kind: "mark", from: from + 2, to: to - 2, cls: "cm-wikilink" });
  }
  const insideWiki = (a: number, b: number) => wikiRanges.some((r) => a >= r.from && b <= r.to);

  const tree = mdParser.parse(text);
  const treeSpecs: DecoSpec[] = [];

  // Hide a range plus a single trailing space, so the rendered line starts flush.
  const hideWithSpace = (from: number, to: number) => {
    const end = text[to] === " " ? to + 1 : to;
    treeSpecs.push({ kind: "hide", from, to: end });
  };

  tree.iterate({
    enter: (node) => {
      const name = node.name;
      const from = node.from;
      const to = node.to;

      if (HEADING_CLASS[name]) {
        treeSpecs.push({ kind: "mark", from, to, cls: HEADING_CLASS[name] });
        return;
      }
      if (name === "StrongEmphasis") { treeSpecs.push({ kind: "mark", from, to, cls: "cm-strong" }); return; }
      if (name === "Emphasis") { treeSpecs.push({ kind: "mark", from, to, cls: "cm-em" }); return; }
      if (name === "Strikethrough") { treeSpecs.push({ kind: "mark", from, to, cls: "cm-strike" }); return; }
      if (name === "InlineCode") { treeSpecs.push({ kind: "mark", from, to, cls: "cm-inline-code" }); return; }
      if (name === "Blockquote") { treeSpecs.push({ kind: "mark", from, to, cls: "cm-quote" }); return; }

      // Markdown links: mark the whole Link node and hide the URL.
      if (name === "Link") { treeSpecs.push({ kind: "mark", from, to, cls: "cm-link" }); return; }
      if (name === "URL") { treeSpecs.push({ kind: "hide", from, to }); return; }

      // List markers: render a real bullet, keep ordered numbers, or (for a task
      // item) hide the bullet so the checkbox from the TaskMarker stands in.
      if (name === "ListMark") {
        const isTask = !!node.node.parent?.getChild("Task");
        const markText = text.slice(from, to);
        const isOrdered = /^\d+[.)]$/.test(markText);
        if (isTask) {
          hideWithSpace(from, to);                                     // "- " before a checkbox
        } else if (isOrdered) {
          treeSpecs.push({ kind: "mark", from, to, cls: "cm-list-number" }); // keep "1." visible
        } else {
          const end = text[to] === " " ? to + 1 : to;
          treeSpecs.push({ kind: "widget", from, to: end, widget: { type: "bullet" } }); // "- " -> "•"
        }
        return;
      }
      // Task checkbox: replace "[ ]"/"[x]" with a rendered checkbox.
      if (name === "TaskMarker") {
        const checked = /\[[xX]\]/.test(text.slice(from, to));
        treeSpecs.push({ kind: "widget", from, to, widget: { type: "task", checked } });
        return;
      }

      // Markup punctuation to hide.
      if (name === "HeaderMark" || name === "EmphasisMark" || name === "CodeMark" ||
          name === "QuoteMark" || name === "LinkMark" || name === "StrikethroughMark") {
        if (name === "HeaderMark" || name === "QuoteMark") hideWithSpace(from, to);
        else treeSpecs.push({ kind: "hide", from, to });
        return;
      }

      if (name === "Image") {
        const raw = text.slice(from, to);
        const m = raw.match(/^!\[([^\]]*)\]\(([^)]*)\)$/);
        if (m) treeSpecs.push({ kind: "widget", from, to, widget: { type: "image", src: m[2], alt: m[1] } });
        return false;
      }
    },
  });

  for (const s of treeSpecs) if (!insideWiki(s.from, s.to)) specs.push(s);

  // Bare video URL line → video widget (one per matching line).
  let offset = 0;
  for (const line of text.split("\n")) {
    const src = videoEmbed(line);
    if (src) specs.push({ kind: "widget", from: offset, to: offset + line.length, widget: { type: "video", src } });
    offset += line.length + 1;
  }

  return specs.sort((a, b) => a.from - b.from || a.to - b.to);
}
