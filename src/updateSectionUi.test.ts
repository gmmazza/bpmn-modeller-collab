// Bug-first coverage (2026-07-24): the top update banner's "Descargar" used to call
// openDownload(r.url) — opening the RELEASE PAGE (notes) — instead of the in-place
// install flow that Configuración → App uses. renderUpdateBanner must behave like
// renderUpdateAvailable: install button when the release has a .zip asset, release-page
// fallback only when it doesn't.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderUpdateBanner } from "./updateSectionUi";

function mockAppUpdate() {
  const openDownload = vi.fn();
  const downloadAndInstall = vi.fn(() => new Promise<{ ok: boolean }>(() => {}));
  const onProgress = vi.fn(() => () => {});
  (window as Window).appUpdate = {
    currentVersion: async () => "0.0.0",
    checkFeed: async () => null,
    openDownload,
    downloadAndInstall,
    onProgress,
  };
  return { openDownload, downloadAndInstall };
}

function buttons(el: HTMLElement): HTMLButtonElement[] {
  return [...el.querySelectorAll("button")];
}

describe("renderUpdateBanner", () => {
  let el: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = `<div id="appupdate"></div>`;
    el = document.getElementById("appupdate")!;
  });

  it("con asset zip: 'Descargar e instalar' dispara el update in-place, NO abre la página del release", () => {
    const { openDownload, downloadAndInstall } = mockAppUpdate();
    renderUpdateBanner(el, "9.9.9", "https://ej/BPMN-compartida-portable.zip", "https://ej/releases/v9.9.9");
    const install = buttons(el).find((b) => b.textContent === "Descargar e instalar");
    expect(install, "botón de instalación in-place presente").toBeTruthy();
    install!.click();
    expect(downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(openDownload).not.toHaveBeenCalled();
  });

  it("sin asset: fallback 'Ver release' abre la página del release", () => {
    const { openDownload, downloadAndInstall } = mockAppUpdate();
    renderUpdateBanner(el, "9.9.9", "", "https://ej/releases/v9.9.9");
    const open = buttons(el).find((b) => b.textContent === "Ver release");
    expect(open, "fallback Ver release presente").toBeTruthy();
    open!.click();
    expect(openDownload).toHaveBeenCalledWith("https://ej/releases/v9.9.9");
    expect(downloadAndInstall).not.toHaveBeenCalled();
  });

  it("'Después' descarta el banner (limpia el contenedor)", () => {
    mockAppUpdate();
    renderUpdateBanner(el, "9.9.9", "https://ej/zip.zip", "https://ej/rel");
    const later = buttons(el).find((b) => b.textContent === "Después");
    expect(later, "botón Después presente").toBeTruthy();
    later!.click();
    expect(el.innerHTML).toBe("");
  });

  it("mantiene la clase .appupdate-bar y anuncia la versión", () => {
    mockAppUpdate();
    renderUpdateBanner(el, "9.9.9", "https://ej/zip.zip", "https://ej/rel");
    expect(el.querySelector(".appupdate-bar")).toBeTruthy();
    expect(el.textContent).toContain("Versión 9.9.9 disponible");
  });
});
