// Provenance of a .bpmn file: who wrote its current content. BPMN 2.0 defines the
// `exporter` attribute on <definitions> exactly for this ("what tool wrote this file"),
// so identity travels INSIDE the artifact and survives sync/copies. The app stamps its
// own exporter on publish; agents are asked (AGENTS.md contract) to sign theirs.

export const APP_EXPORTER = "BPMN compartida";

// Opening <definitions> tag, any namespace prefix, possibly spanning multiple lines.
const DEFS_TAG = /<(?:[\w.-]+:)?definitions\b[^>]*>/i;
const EXPORTER_ATTR = /\sexporter="([^"]*)"/i;

const unescapeXml = (s: string): string =>
  s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const escapeXml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function readExporter(xml: string): string | null {
  const tag = xml.match(DEFS_TAG)?.[0];
  const raw = tag?.match(EXPORTER_ATTR)?.[1];
  return raw == null ? null : unescapeXml(raw);
}

// Set (or replace) the exporter attribute on the definitions opening tag. Anything
// without a definitions tag is returned untouched — nothing sensible to stamp.
export function stampExporter(xml: string, exporter: string): string {
  const m = xml.match(DEFS_TAG);
  if (!m || m.index == null) return xml;
  const tag = m[0];
  const attr = ` exporter="${escapeXml(exporter)}"`;
  const stamped = EXPORTER_ATTR.test(tag)
    ? tag.replace(EXPORTER_ATTR, attr)
    : tag.replace(/(\/?>)$/, `${attr}$1`);
  return xml.slice(0, m.index) + stamped + xml.slice(m.index + tag.length);
}

// IA signature convention (AGENTS.md contract): exporter="IA — <agent>" or plain "IA".
const IA_SIGNATURE = /^IA(\s*[—–-]\s*(.+))?$/;

// Author label for a revision captured from an EXTERNAL write (content that appeared on
// disk without going through Publicar). A foreign signature identifies the writer; the
// app's own exporter (or none) tells us nothing about who edited outside → "externo".
// An IA signature combines with the capturing app user ("Claude-Matias"): the agent ran
// on that user's machine at their request. Non-IA tools and unsigned content do NOT get
// the user appended — they may be a teammate's edit that merely synced in.
export function externalAuthorOf(xml: string, capturedBy?: string): string {
  const exporter = readExporter(xml);
  if (!exporter || exporter === APP_EXPORTER) return "externo";
  const ia = exporter.match(IA_SIGNATURE);
  if (ia && capturedBy) return `${ia[2]?.trim() || "IA"}-${capturedBy}`;
  return exporter;
}
