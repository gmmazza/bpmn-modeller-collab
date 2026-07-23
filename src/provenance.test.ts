import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readExporter, stampExporter, externalAuthorOf, APP_EXPORTER } from "./provenance";

// Real AI-generated diagram (multiline <bpmn:definitions> tag, no exporter) — the
// ORIGINAL content of the file whose first version was silently lost, which motivated
// this module. Committed copy: the live qa-workspace file mutates as the app is used
// (it already gained an exporter on its first post-feature publish).
const rep4 = readFileSync(
  join(process.cwd(), "src/__fixtures__/rep_4_reparacion.original.bpmn"),
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

  // An AI edit runs on the app user's machine at their request — the capture combines
  // the agent name with the operating user: "Claude-Matias".
  it("combines an IA signature with the capturing app user", () => {
    expect(externalAuthorOf(stampExporter(rep4, "IA — Claude"), "Matias")).toBe("Claude-Matias");
  });

  it("uses IA-<user> when the signature has no distinct agent name", () => {
    expect(externalAuthorOf(stampExporter(rep4, "IA"), "Matias")).toBe("IA-Matias");
  });

  it("does NOT attribute the user to a non-IA foreign tool (could be a teammate's edit)", () => {
    expect(externalAuthorOf(stampExporter(rep4, "Camunda Modeler"), "Matias")).toBe("Camunda Modeler");
  });

  it("does NOT attribute the user to unsigned external content", () => {
    expect(externalAuthorOf(rep4, "Matias")).toBe("externo");
  });
});
