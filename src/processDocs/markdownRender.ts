// src/processDocs/markdownRender.ts
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

const ALLOWED_EMBED_HOSTS = ["www.youtube.com", "youtube.com", "player.vimeo.com", "vimeo.com", "www.loom.com", "loom.com"];

const md = new MarkdownIt({ html: true, linkify: true, breaks: true });

// DOMPurify hook: after parsing, remove any iframe whose src host is not allowlisted.
// This is parse-based enforcement — immune to string-level regex bypass — and is the
// primary security mechanism in production browsers where DOMPurify's NodeIterator
// traverses the full tree. Deleting "iframe" from data.allowedTags for this node causes
// DOMPurify's own tag-check to call _sanitizeDisallowedNode, avoiding manual removeChild
// (which would make DOMPurify's subsequent _forceRemove throw on a null parent).
DOMPurify.addHook("uponSanitizeElement", (node, data) => {
  if (data.tagName !== "iframe") return;
  const src = (node as Element).getAttribute("src") || "";
  let host = "";
  try { host = new URL(src).host; } catch { host = ""; }
  if (!ALLOWED_EMBED_HOSTS.includes(host)) {
    // Mark as disallowed for this sanitize pass so DOMPurify strips it natively.
    (data.allowedTags as Record<string, boolean>)["iframe"] = false;
  }
});

// Minimal task-list support: rewrite "[ ]"/"[x]" at the start of a list item.
function renderTaskLists(html: string): string {
  return html
    .replace(/<li>\s*\[ \]\s*/g, '<li class="task"><input type="checkbox" disabled> ')
    .replace(/<li>\s*\[[xX]\]\s*/g, '<li class="task"><input type="checkbox" disabled checked> ');
}

// Convert a standalone video URL line into an embeddable iframe before markdown parsing.
// The iframe src is constructed only from a validated id ([\w-]+ or \d+) plus a fixed
// allowlisted host — injection-safe by construction.
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

// Post-sanitize pass that strips any residual <script> or non-allowlisted <iframe> tags
// from the serialized HTML string. In production browsers DOMPurify handles both via its
// built-in script stripping and the uponSanitizeElement hook above; this pass is a
// compensating control for test environments (happy-dom) where DOMPurify's NodeIterator
// does not traverse children in WHOLE_DOCUMENT mode, and adds defence-in-depth elsewhere.
function postFilter(html: string): string {
  // Strip script tags and their content.
  let out = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  // Strip iframes pointing at non-allowlisted hosts.
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
  const html = renderTaskLists(md.render(embedVideos(input)));
  // WHOLE_DOCUMENT: true is required in happy-dom/jsdom environments where DOMPurify
  // parses inside a <div>; heading tags (h1–h6) get mis-parsed as <head> without it.
  // DOMPurify strips <script> natively in real browsers; the uponSanitizeElement hook
  // above enforces the iframe host allowlist after parsing.
  const full = DOMPurify.sanitize(html, {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "src"],
    WHOLE_DOCUMENT: true,
  });
  // Strip the <html><body>…</body></html> wrapper added by WHOLE_DOCUMENT.
  const bodyMatch = (full as string).match(/<body>([\s\S]*?)<\/body>/);
  const body = bodyMatch ? bodyMatch[1] : (full as string);
  // Apply post-filter as compensating control (no-op in production browsers where
  // DOMPurify and the hook have already handled scripts and non-allowlisted iframes).
  return postFilter(body);
}
