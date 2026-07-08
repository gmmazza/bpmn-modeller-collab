export type PreviewMode =
  | { kind: "image"; mime: string }
  | { kind: "pdf" }
  | { kind: "html" }
  | { kind: "markdown" }
  | { kind: "text" }
  | { kind: "office" }
  | { kind: "download" };

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};
const OFFICE = new Set(["doc", "docx", "ppt", "pptx", "xls", "xlsx", "odt", "ods", "odp"]);

// Extensions safe to hand to the OS "open with default app" path. Anything not
// here falls back to download-only and is REJECTED by the shell:openPath guard.
// NOTE: This OPENABLE_EXTS set must MIRROR the allowlist in electron/openPathGuard.cjs
// that Task 4 will create. Keep the extension set exactly as defined.
export const OPENABLE_EXTS: ReadonlySet<string> = new Set([
  ...Object.keys(IMAGE_MIME),
  "pdf", "html", "htm", "md", "txt", "csv",
  ...OFFICE,
]);

export function previewModeFor(ext: string): PreviewMode {
  const e = ext.toLowerCase();
  if (e in IMAGE_MIME) return { kind: "image", mime: IMAGE_MIME[e] };
  if (e === "pdf") return { kind: "pdf" };
  if (e === "html" || e === "htm") return { kind: "html" };
  if (e === "md") return { kind: "markdown" };
  if (e === "txt" || e === "csv") return { kind: "text" };
  if (OFFICE.has(e)) return { kind: "office" };
  return { kind: "download" };
}
