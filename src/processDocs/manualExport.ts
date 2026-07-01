const STYLE = `body{font-family:system-ui,Segoe UI,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#1f2937}
h1,h2{line-height:1.25}h2{margin-top:2rem;border-top:1px solid #e5e7eb;padding-top:1rem}
img{max-width:100%}iframe{width:100%;aspect-ratio:16/9;border:0}code{background:#f3f4f6;padding:0 3px;border-radius:3px}
blockquote{border-left:3px solid #e5e7eb;margin:0;padding-left:12px;color:#6b7280}`;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function manualHtmlDocument(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title><style>${STYLE}</style></head>
<body>${bodyHtml}</body></html>`;
}

export async function inlineImages(html: string, toDataUri: (ref: string) => Promise<string | null>): Promise<string> {
  const refs = new Set<string>();
  const re = /<img\b[^>]*\bsrc="(assets\/[^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) refs.add(m[1]);
  let out = html;
  for (const ref of refs) {
    const uri = await toDataUri(ref);
    if (uri) out = out.split(`src="${ref}"`).join(`src="${uri}"`);
  }
  return out;
}
