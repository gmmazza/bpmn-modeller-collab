import { describe, it, expect, vi } from "vitest";
import { renderFuentesPanel, type FuentesPanelDeps } from "./fuentesPanel";
import { createFuentesClient, type FuentesFs } from "./fuentesClient";

// The click handler kicks off a promise chain several awaits deep (client call
// -> internal fs calls -> refresh -> re-list). A couple of `await Promise.resolve()`
// ticks aren't enough to drain it; a macrotask tick flushes the whole microtask
// queue regardless of depth.
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function stubFs(seed: Record<string, number[]> = {}): FuentesFs {
  const files = new Map<string, Uint8Array>(Object.entries(seed).map(([k, v]) => [k, new Uint8Array(v)]));
  const children = (rel: string) => {
    const prefix = rel === "" ? "" : rel + "/";
    const out: { name: string; kind: "file" | "directory" }[] = [];
    const dirs = new Set<string>();
    for (const key of files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length); const s = rest.indexOf("/");
      if (s < 0) out.push({ name: rest, kind: "file" }); else dirs.add(rest.slice(0, s));
    }
    for (const d of dirs) out.push({ name: d, kind: "directory" });
    return out;
  };
  return {
    async listDir(rel) { return children(rel); },
    async writeBinary(rel, d) { files.set(rel, d); },
    async readBinary(rel) { return files.get(rel) ?? null; },
    async deletePath(rel) { files.delete(rel); },
    async movePath(from, to) { const b = files.get(from)!; files.set(to, b); files.delete(from); },
  };
}

function deps(over: Partial<FuentesPanelDeps> = {}): FuentesPanelDeps {
  return {
    client: createFuentesClient(stubFs({ "d.fuentes/a.docx": [1], "d.fuentes/procesado/old.pdf": [2] }), "d.bpmn"),
    canOpenExternal: true,
    openExternal: vi.fn(async () => {}),
    download: vi.fn(),
    confirmOpen: vi.fn(async () => true),
    onError: vi.fn(),
    ...over,
  };
}

describe("renderFuentesPanel", () => {
  it("lists pendientes and procesadas in their sections", async () => {
    const host = document.createElement("div");
    await renderFuentesPanel(host, deps());
    expect(host.querySelector('[data-estado="pendiente"] [data-name="a.docx"]')).toBeTruthy();
    expect(host.querySelector('[data-estado="procesada"] [data-name="old.pdf"]')).toBeTruthy();
  });

  it("Procesar moves a pendiente into procesadas and re-renders", async () => {
    const host = document.createElement("div");
    const d = deps();
    await renderFuentesPanel(host, d);
    (host.querySelector('[data-name="a.docx"] [data-act="procesar"]') as HTMLButtonElement).click();
    await flush();
    expect(host.querySelector('[data-estado="procesada"] [data-name="a.docx"]')).toBeTruthy();
    expect(host.querySelector('[data-estado="pendiente"] [data-name="a.docx"]')).toBeNull();
  });

  it("Abrir on an office file confirms then calls openExternal with the rel path", async () => {
    const host = document.createElement("div");
    const d = deps();
    await renderFuentesPanel(host, d);
    (host.querySelector('[data-name="a.docx"] [data-act="abrir"]') as HTMLButtonElement).click();
    await flush();
    expect(d.confirmOpen).toHaveBeenCalledOnce();
    expect(d.openExternal).toHaveBeenCalledWith("d.fuentes/a.docx");
  });

  it("Previsualizar appears only for previewable types, not for office files", async () => {
    const host = document.createElement("div");
    const d = deps({
      client: createFuentesClient(
        stubFs({ "d.fuentes/img.png": [1, 2, 3], "d.fuentes/a.docx": [1] }),
        "d.bpmn",
      ),
    });
    await renderFuentesPanel(host, d);
    expect(host.querySelector('[data-name="img.png"] [data-act="previsualizar"]')).toBeTruthy();
    expect(host.querySelector('[data-name="a.docx"] [data-act="previsualizar"]')).toBeNull();
  });

  it("toggles an inline image preview open and closed", async () => {
    const host = document.createElement("div");
    const d = deps({
      client: createFuentesClient(stubFs({ "d.fuentes/img.png": [1, 2, 3] }), "d.bpmn"),
    });
    await renderFuentesPanel(host, d);
    const btn = host.querySelector('[data-name="img.png"] [data-act="previsualizar"]') as HTMLButtonElement;
    btn.click();
    await flush();
    expect(host.querySelector('[data-name="img.png"] [data-role="preview"] img')).toBeTruthy();
    btn.click();
    await flush();
    expect(host.querySelector('[data-name="img.png"] [data-role="preview"]')).toBeNull();
  });

  it("renders an html preview inside a script-sandboxed iframe", async () => {
    const host = document.createElement("div");
    const d = deps({
      client: createFuentesClient(stubFs({ "d.fuentes/page.html": [1, 2, 3] }), "d.bpmn"),
    });
    await renderFuentesPanel(host, d);
    const btn = host.querySelector('[data-name="page.html"] [data-act="previsualizar"]') as HTMLButtonElement;
    btn.click();
    await flush();
    const iframe = host.querySelector('[data-name="page.html"] [data-role="preview"] iframe') as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    expect(iframe.hasAttribute("sandbox")).toBe(true);
    // Exact match, not just "doesn't mention allow-scripts" — catches any
    // future widening (e.g. accidentally adding allow-same-origin) too.
    expect(iframe.getAttribute("sandbox")).toBe("");
  });

  it("Ver ideas calls onVerIdeas with the row's filename", async () => {
    const host = document.createElement("div");
    const onVerIdeas = vi.fn();
    const d = deps({ onVerIdeas });
    await renderFuentesPanel(host, d);
    (host.querySelector('[data-name="a.docx"] [data-act="ver-ideas"]') as HTMLButtonElement).click();
    expect(onVerIdeas).toHaveBeenCalledWith("a.docx");
  });

  it("Ver ideas button is absent when onVerIdeas is not provided", async () => {
    const host = document.createElement("div");
    await renderFuentesPanel(host, deps());
    expect(host.querySelector('[data-name="a.docx"] [data-act="ver-ideas"]')).toBeNull();
  });

  it("a second click while the preview read is still in flight does not leak a duplicate preview", async () => {
    const host = document.createElement("div");
    let resolveRead!: (bytes: Uint8Array | null) => void;
    const pendingRead = new Promise<Uint8Array | null>((resolve) => { resolveRead = resolve; });
    const baseClient = createFuentesClient(stubFs({ "d.fuentes/img.png": [1, 2, 3] }), "d.bpmn");
    const d = deps({
      client: {
        ...baseClient,
        readBytes: vi.fn(() => pendingRead),
      },
    });
    await renderFuentesPanel(host, d);
    const btn = host.querySelector('[data-name="img.png"] [data-act="previsualizar"]') as HTMLButtonElement;

    // Two clicks land while the read is still pending (readBytes hasn't
    // resolved yet) — this is the race from the double-click bug.
    btn.click();
    btn.click();
    resolveRead(new Uint8Array([1, 2, 3]));
    await flush();

    const previews = host.querySelectorAll('[data-name="img.png"] [data-role="preview"]');
    expect(previews.length).toBeLessThanOrEqual(1);
  });
});
