// App self-update UI (Electron only): wires the "buscar actualización" button that checks
// the release feed and, when a newer build exists, renders the install/"ver release" state.
// Extracted verbatim out of src/main.ts's renderVizSettings so both the legacy toolbar
// "Ajustes" popover and the new Configuraciones modal (src/configModal.ts) share one copy
// instead of duplicating the self-update flow. Depends only on window.appUpdate + the DOM —
// no main.ts closure.
import { evaluateUpdate } from "./appUpdate";

// `scope` restricts id lookups to a subtree (e.g. a modal pane) instead of the whole
// document, so two simultaneous copies of this markup — the toolbar popover and the
// Configuraciones modal — don't collide on ids like #app-version/#check-app/#app-upd.
// Defaults to `document`, preserving the original global-lookup behavior for existing callers.
export function wireAppUpdateSection(scope: ParentNode = document): void {
  if (!window.appUpdate) return;
  const verEl = scope.querySelector("#app-version");
  void window.appUpdate.currentVersion().then((v) => { if (verEl) verEl.textContent = "v" + v; }).catch(() => {});

  const box = scope.querySelector("#app-upd") as HTMLElement | null;
  scope.querySelector("#check-app")?.addEventListener("click", () => {
    if (!box) return;
    box.textContent = "Buscando…";
    void (async () => {
      try {
        const [current, feed] = await Promise.all([window.appUpdate!.currentVersion(), window.appUpdate!.checkFeed()]);
        const r = evaluateUpdate(current, feed);
        if (!r.updateAvailable) { box.textContent = `Estás en la última versión (v${current}) ✓`; return; }
        renderUpdateAvailable(box, r.latest, r.asset, r.url);
      } catch {
        box.textContent = "No se pudo verificar (offline o sin acceso)";
      }
    })();
  });
}

// Startup banner (used by main.ts's maybeShowUpdateBanner). Delegates the action to
// renderUpdateAvailable so the banner installs in-place exactly like Configuración → App
// (the release page is only the no-asset fallback), and adds a "Después" dismiss that
// clears the host element.
export function renderUpdateBanner(el: HTMLElement, latest: string, asset: string, releaseUrl: string): void {
  el.replaceChildren();
  const bar = document.createElement("div");
  bar.className = "appupdate-bar";
  renderUpdateAvailable(bar, latest, asset, releaseUrl);
  const later = document.createElement("button");
  later.type = "button";
  later.textContent = "Después";
  later.addEventListener("click", () => { el.replaceChildren(); });
  (bar.firstElementChild ?? bar).appendChild(later);
  el.appendChild(bar);
}

// Render the "vX available" state: an install button (in-place self-update) when the
// release has a .zip asset, otherwise a fallback that opens the release page. `asset` is
// only used to DECIDE which button to show — the actual download URL is re-derived in the
// main process (the renderer must not choose what gets downloaded + run).
export function renderUpdateAvailable(box: HTMLElement, latest: string, asset: string, releaseUrl: string): void {
  box.textContent = "";
  const line = document.createElement("div");
  line.textContent = `Versión ${latest} disponible. `;
  box.appendChild(line);

  if (!asset) {
    const open = document.createElement("button");
    open.type = "button";
    open.textContent = "Ver release";
    open.addEventListener("click", () => window.appUpdate!.openDownload(releaseUrl));
    line.appendChild(open);
    return;
  }

  const install = document.createElement("button");
  install.type = "button";
  install.textContent = "Descargar e instalar";
  const status = document.createElement("span");
  status.className = "app-upd-status";
  line.appendChild(install);
  line.appendChild(status);

  install.addEventListener("click", () => {
    install.disabled = true;
    status.textContent = " Preparando…";
    const off = window.appUpdate!.onProgress((p) => {
      if (p.phase === "download") {
        const pct = p.total ? Math.round(((p.received ?? 0) / p.total) * 100) : 0;
        status.textContent = ` Descargando… ${pct}%`;
      } else if (p.phase === "extract") {
        status.textContent = " Descomprimiendo…";
      } else if (p.phase === "swap") {
        status.textContent = " Instalando y reiniciando…";
      }
    });
    void window.appUpdate!.downloadAndInstall().catch((err: unknown) => {
      off();
      install.disabled = false;
      status.textContent = " Error: " + (err instanceof Error ? err.message : String(err));
    });
  });
}
