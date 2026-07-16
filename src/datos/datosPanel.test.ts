import { describe, it, expect, vi } from "vitest";
import { renderDatosPanel, type DatosPanelDeps } from "./datosPanel";
import { createDatosClient } from "./datosClient";
import type { SidecarApi } from "../layers/layersClient";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function fakeApi(initial: Record<string, string> = {}): SidecarApi {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    async readSidecar(id, suffix) { return store.get(`${id}:${suffix}`) ?? null; },
    async writeSidecar(id, suffix, text) { store.set(`${id}:${suffix}`, text); },
  };
}

function deps(over: Partial<DatosPanelDeps> = {}): DatosPanelDeps {
  return {
    client: createDatosClient(fakeApi(), "d.bpmn"),
    elementId: "t1",
    elementLabel: "Recepción",
    openExternalUrl: vi.fn(async () => {}),
    onError: vi.fn(),
    onMostrarEnDiagrama: vi.fn(async () => {}),
    ...over,
  };
}

describe("renderDatosPanel — no selection", () => {
  it("shows a placeholder when elementId is null", async () => {
    const host = document.createElement("div");
    await renderDatosPanel(host, deps({ elementId: null }));
    expect(host.querySelector(".dato-empty")).toBeTruthy();
    expect(host.querySelector("section")).toBeNull();
  });
});

describe("renderDatosPanel — with a selected element", () => {
  it("renders the three category sections, empty at first", async () => {
    const host = document.createElement("div");
    await renderDatosPanel(host, deps());
    expect(host.dataset.elementId).toBe("t1");
    expect(host.querySelector('section[data-category="formularios"] h4')?.textContent).toContain("(0)");
    expect(host.querySelector('section[data-category="almacenamiento"]')).toBeTruthy();
    expect(host.querySelector('section[data-category="herramientas"]')).toBeTruthy();
  });

  it("submitting the add-form for formularios creates an entry and re-renders", async () => {
    const host = document.createElement("div");
    const d = deps();
    await renderDatosPanel(host, d);
    const form = host.querySelector('section[data-category="formularios"] form') as HTMLFormElement;
    (form.querySelector(".dato-add-nombre") as HTMLInputElement).value = "Recepción — alta";
    (form.querySelector(".dato-add-tool") as HTMLInputElement).value = "Google Forms";
    (form.querySelector(".dato-add-url") as HTMLInputElement).value = "https://form.jotform.com/x";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    const nameEl = host.querySelector('[data-category="formularios"][data-entry-id] .dato-name');
    expect(nameEl?.textContent).toBe("Recepción — alta");
  });

  it("renders tool suggestions as <datalist> options from toolSuggestions", async () => {
    const host = document.createElement("div");
    await renderDatosPanel(host, deps({ toolSuggestions: ["Airtable", "JotForm"] }));
    const opts = Array.from(host.querySelectorAll('datalist#dato-tools-formularios option')).map((o) => (o as HTMLOptionElement).value);
    expect(opts).toEqual(["Airtable", "JotForm"]);
  });

  it("a duplicate nombre routes the error to onError instead of throwing", async () => {
    const host = document.createElement("div");
    const d = deps({ client: createDatosClient(fakeApi(), "d.bpmn") });
    await d.client.add("t1", "formularios", { tool: "jotform", nombre: "Recepción", url: "" });
    await renderDatosPanel(host, d);
    const form = host.querySelector('section[data-category="formularios"] form') as HTMLFormElement;
    (form.querySelector(".dato-add-nombre") as HTMLInputElement).value = "Recepción";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    expect(d.onError).toHaveBeenCalledOnce();
  });

  it("Abrir calls openExternalUrl with the entry's url", async () => {
    const host = document.createElement("div");
    const client = createDatosClient(fakeApi(), "d.bpmn");
    await client.add("t1", "almacenamiento", { tool: "clickup", nombre: "Reparaciones", url: "https://app.clickup.com/x" });
    const d = deps({ client });
    await renderDatosPanel(host, d);
    (host.querySelector('[data-category="almacenamiento"][data-entry-id] [data-act="abrir"]') as HTMLButtonElement).click();
    await flush();
    expect(d.openExternalUrl).toHaveBeenCalledWith("https://app.clickup.com/x");
  });

  it("Abrir is absent when the entry has no url", async () => {
    const host = document.createElement("div");
    const client = createDatosClient(fakeApi(), "d.bpmn");
    await client.add("t1", "herramientas", { tool: "otro", nombre: "WhatsApp Business", url: "" });
    await renderDatosPanel(host, deps({ client }));
    expect(host.querySelector('[data-category="herramientas"][data-entry-id] [data-act="abrir"]')).toBeNull();
  });

  it('"Mostrar en el diagrama" is offered for formularios/almacenamiento but not herramientas', async () => {
    const host = document.createElement("div");
    const client = createDatosClient(fakeApi(), "d.bpmn");
    await client.add("t1", "formularios", { tool: "jotform", nombre: "Recepción", url: "" });
    await client.add("t1", "herramientas", { tool: "otro", nombre: "WhatsApp", url: "" });
    await renderDatosPanel(host, deps({ client }));
    expect(host.querySelector('[data-category="formularios"][data-entry-id] [data-act="mostrar"]')).toBeTruthy();
    expect(host.querySelector('[data-category="herramientas"][data-entry-id] [data-act="mostrar"]')).toBeNull();
  });

  it('"Mostrar en el diagrama" calls onMostrarEnDiagrama and is hidden once anchoredId is set', async () => {
    const host = document.createElement("div");
    const client = createDatosClient(fakeApi(), "d.bpmn");
    const entry = await client.add("t1", "formularios", { tool: "jotform", nombre: "Recepción", url: "" });
    const d = deps({
      client,
      onMostrarEnDiagrama: vi.fn(async (category, e) => {
        await client.markAnchored("t1", category, e.id, "DataObjectReference_1");
      }),
    });
    await renderDatosPanel(host, d);
    (host.querySelector('[data-entry-id="' + entry.id + '"] [data-act="mostrar"]') as HTMLButtonElement).click();
    await flush();
    expect(d.onMostrarEnDiagrama).toHaveBeenCalledWith("formularios", entry);
    expect(host.querySelector('[data-entry-id="' + entry.id + '"] [data-act="mostrar"]')).toBeNull();
  });

  it("fires onChanged after a successful add and after a Quitar remove", async () => {
    const host = document.createElement("div");
    const onChanged = vi.fn();
    const d = deps({ onChanged });
    await renderDatosPanel(host, d);

    const form = host.querySelector('section[data-category="formularios"] form') as HTMLFormElement;
    (form.querySelector(".dato-add-nombre") as HTMLInputElement).value = "Recepción — alta";
    (form.querySelector(".dato-add-tool") as HTMLInputElement).value = "JotForm";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    expect(onChanged).toHaveBeenCalledTimes(1);

    (host.querySelector('[data-category="formularios"][data-entry-id] [data-act="quitar"]') as HTMLButtonElement).click();
    await flush();
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it("does not duplicate sections when rendered twice concurrently for the same element", async () => {
    const host = document.createElement("div");
    const d = deps();
    await Promise.all([renderDatosPanel(host, d), renderDatosPanel(host, d)]);
    expect(host.querySelectorAll('section[data-category="formularios"]').length).toBe(1);
    expect(host.querySelectorAll("section").length).toBe(3);
  });

  it("Quitar removes the entry and re-renders", async () => {
    const host = document.createElement("div");
    const client = createDatosClient(fakeApi(), "d.bpmn");
    const entry = await client.add("t1", "formularios", { tool: "jotform", nombre: "Recepción", url: "" });
    await renderDatosPanel(host, deps({ client }));
    (host.querySelector('[data-entry-id="' + entry.id + '"] [data-act="quitar"]') as HTMLButtonElement).click();
    await flush();
    expect(host.querySelector('[data-entry-id="' + entry.id + '"]')).toBeNull();
  });

  it("renders a .dato-error with a Reintentar button (not the empty category sections) when client.list() rejects", async () => {
    const host = document.createElement("div");
    const baseClient = createDatosClient(fakeApi(), "d.bpmn");
    const d = deps({
      client: { ...baseClient, list: vi.fn(async () => { throw new Error("real enumeration failure"); }) },
    });
    await renderDatosPanel(host, d);
    expect(host.querySelector(".dato-error")).toBeTruthy();
    expect(host.querySelector(".dato-error button")?.textContent).toBe("Reintentar");
    expect(host.querySelector("section")).toBeNull();
    expect(d.onError).toHaveBeenCalledOnce();
  });

  it("Reintentar re-invokes the render and recovers once list() succeeds", async () => {
    const host = document.createElement("div");
    const baseClient = createDatosClient(fakeApi(), "d.bpmn");
    let calls = 0;
    const d = deps({
      client: {
        ...baseClient,
        list: vi.fn(async (elementId: string) => {
          calls++;
          if (calls === 1) throw new Error("real enumeration failure");
          return baseClient.list(elementId);
        }),
      },
    });
    await renderDatosPanel(host, d);
    expect(host.querySelector(".dato-error")).toBeTruthy();

    (host.querySelector(".dato-error button") as HTMLButtonElement).click();
    await flush();

    expect(host.querySelector(".dato-error")).toBeNull();
    expect(host.querySelector('section[data-category="formularios"]')).toBeTruthy();
  });
});
