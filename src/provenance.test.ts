import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readExporter, stampExporter, externalAuthorOf, APP_EXPORTER } from "./provenance";

// Real AI-generated diagram (multiline <bpmn:definitions> tag, no exporter) — the file
// whose original version was silently lost, which motivated this module.
const rep4 = readFileSync(
  join(process.cwd(), "qa-workspace/Procesos Novotec BPMN/rep_4_reparacion.bpmn"),
  "utf8",
);

describe("readExporter", () => {
  it("returns null for a real AI-generated file without exporter (rep_4)", () => {
    expect(readExporter(rep4)).toBeNull();
  });

  it("reads the exporter attribute back after stamping", () => {
    expect(readExporter(stampExporter(rep4, "IA — Claude"))).toBe("IA — Claude");
  });
});

describe("stampExporter", () => {
  it("adds exporter to a multiline definitions tag without breaking the rest", () => {
    const out = stampExporter(rep4, APP_EXPORTER);
    expect(out).toContain(`exporter="${APP_EXPORTER}"`);
    // everything else untouched: same length + stamp, still one definitions tag
    expect(out.replace(` exporter="${APP_EXPORTER}"`, "")).toBe(rep4);
  });

  it("replaces an existing exporter instead of duplicating it", () => {
    const once = stampExporter(rep4, "IA — Claude");
    const twice = stampExporter(once, APP_EXPORTER);
    expect(twice.match(/exporter=/g)).toHaveLength(1);
    expect(readExporter(twice)).toBe(APP_EXPORTER);
  });

  it("escapes quotes in the exporter value", () => {
    const out = stampExporter(rep4, 'IA "beta"');
    expect(readExporter(out)).toBe('IA "beta"');
  });

  it("returns the xml unchanged when there is no definitions tag", () => {
    expect(stampExporter("<foo/>", "x")).toBe("<foo/>");
  });
});

describe("externalAuthorOf", () => {
  it("is 'externo' when the file has no exporter (rep_4 as found on disk)", () => {
    expect(externalAuthorOf(rep4)).toBe("externo");
  });

  it("is the exporter value when a foreign tool/agent signed it", () => {
    expect(externalAuthorOf(stampExporter(rep4, "IA — Claude"))).toBe("IA — Claude");
  });

  it("is 'externo' when the exporter is the app itself (not a foreign edit signature)", () => {
    expect(externalAuthorOf(stampExporter(rep4, APP_EXPORTER))).toBe("externo");
  });
});
