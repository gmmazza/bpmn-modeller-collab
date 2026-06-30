// src/processDocs/markdownRender.ts
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

const ALLOWED_EMBED_HOSTS = ["www.youtube.com", "youtube.com", "player.vimeo.com", "vimeo.com", "www.loom.com", "loom.com"];

const md = new MarkdownIt({ html: true, linkify: true, breaks: true });

// Minimal task-list support: rewrite "[ ]"/"[x]" at the start of a list item.
function renderTaskLists(html: string): string {
  return html
    .replace(/<li>\s*\[ \]\s*/g, '<li class="task"><input type="checkbox" disabled> ')
    .replace(/<li>\s*\[[xX]\]\s*/g, '<li class="task"><input type="checkbox" disabled checked> ');
}

// Convert a standalone video URL line into an embeddable iframe before markdown parsing.
function embedVideos(src: string): string {
  return src
    .split("\n")
    .map((line) => {
      const yt = line.match(/^\s*https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([\w-]+)\s*$/);
      if (yt) return `<iframe src="https://www.youtube.com/embed/${yt[1]}" allowfullscreen frameborder="0"></iframe>`;
      const ytShort = line.match(/^\s*https?:\/\/youtu\.be\/([\w-]+)\s*$/);
      if (ytShort) return `<iframe src="https://www.youtube.com/embed/${ytShort[1]}" allowfullscreen frameborder="0"></iframe>`;
      const vimeo = line.match(/^\s*https?:\/\/(?:www\.)?vimeo\.com\/(\d+)\s*$/);
      if (vimeo) return `<iframe src="https://player.vimeo.com/video/${vimeo[1]}" allowfullscreen frameborder="0"></iframe>`;
      return line;
    })
    .join("\n");
}

// Pre-filter dangerous tags and non-whitelisted iframes at string level before DOM
// parsing. In happy-dom, WHOLE_DOCUMENT mode connects nodes to a live document, so
// script tags fire and iframe srcs are fetched before DOMPurify can remove them.
function preFilter(html: string): string {
  // Strip all script tags (and their content) before any DOM parsing.
  let out = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  // Strip iframes pointing at non-whitelisted hosts.
  out = out.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>|<iframe\b[^>]*\/>/gi, (match) => {
    const srcMatch = match.match(/\bsrc=["']([^"']*)["']/i);
    if (!srcMatch) return "";
    const src = srcMatch[1];
    let host = "";
    try { host = new URL(src).host; } catch { return ""; }
    return ALLOWED_EMBED_HOSTS.includes(host) ? match : "";
  });
  return out;
}

export function renderMarkdown(input: string): string {
  const preHtml = preFilter(renderTaskLists(md.render(embedVideos(input))));
  // WHOLE_DOCUMENT: true is required in happy-dom/jsdom environments where DOMPurify
  // parses inside a <div>; heading tags (h1–h6) get mis-parsed as <head> without it.
  const full = DOMPurify.sanitize(preHtml, {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "src", "target"],
    WHOLE_DOCUMENT: true,
  });
  // Strip the <html><body>…</body></html> wrapper added by WHOLE_DOCUMENT.
  const bodyMatch = (full as string).match(/<body>([\s\S]*?)<\/body>/);
  return bodyMatch ? bodyMatch[1] : (full as string);
}
