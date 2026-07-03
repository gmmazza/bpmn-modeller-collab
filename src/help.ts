import { icon } from "./icons";
import { renderMarkdown } from "./processDocs/markdownRender";
import manualMarkdown from "../docs/MANUAL.md?raw";

// All content is static (no user data) — safe to build via innerHTML.
const FUNCIONES: ReadonlyArray<readonly [string, string]> = [
  ["Árbol de archivos", "Crear, abrir, renombrar, duplicar, mover, copiar y borrar diagramas y subcarpetas desde el menú ⋯ de cada fila."],
  ["Capas de color", "Pintá los elementos por categoría (madurez, actores) y agregá anotaciones, sin modificar el .bpmn."],
  ["Propiedades", "Editá las propiedades BPMN del elemento seleccionado."],
  ["Historial", "Versiones guardadas: previsualizá o restaurá una anterior."],
  ["Exportar", "Descargá el diagrama como SVG o PNG."],
  ["Bloqueos (colaborativo)", "Check-out toma el archivo para vos; Check in lo libera. Si otra persona lo edita, se avisa el conflicto."],
  ["Paneles laterales", "Ocultá o mostrá los paneles de archivos e inspector con los botones de los extremos de la barra."],
  ["Carpeta y nombre", "Cambiá la carpeta de trabajo o tu nombre desde el menú de usuario (👤)."],
  ["Tema", "Alterná entre claro y oscuro con el botón ☀/☾."],
  ["Ajustes", "Estilo sketchy (dibujado a mano) y heatmap de simulación, en ⚙."],
];

// Keyboard shortcuts grouped. Tool/editing/view shortcuts are bpmn-js' native
// bindings (active because the keyboard is bound in createBpmnModeler); Ctrl+S
// and "d" are app-owned.
const ATAJOS: ReadonlyArray<{ group: string; rows: ReadonlyArray<readonly [string, string]> }> = [
  { group: "Herramientas", rows: [
    ["H", "Herramienta mano (paneo)"],
    ["L", "Herramienta lazo (selección por área)"],
    ["S", "Herramienta espacio (crear / quitar espacio)"],
    ["C", "Herramienta de conexión global"],
    ["E", "Editar la etiqueta del elemento"],
    ["R", "Reemplazar el elemento (menú)"],
    ["Espacio (mantener)", "Paneo temporal arrastrando con el mouse"],
  ] },
  { group: "Edición", rows: [
    ["Ctrl / ⌘ + S", "Guardar"],
    ["Ctrl / ⌘ + Z", "Deshacer"],
    ["Ctrl / ⌘ + Y   ·   Ctrl / ⌘ + Shift + Z", "Rehacer"],
    ["Ctrl / ⌘ + C  /  V  /  X", "Copiar / pegar / cortar"],
    ["Ctrl / ⌘ + D", "Duplicar"],
    ["Ctrl / ⌘ + A", "Seleccionar todo"],
    ["Supr / Backspace", "Borrar la selección"],
  ] },
  { group: "Vista y navegación", rows: [
    ["Flechas", "Mover la selección (o paneo si no hay nada seleccionado)"],
    ["Ctrl / ⌘ + (+ / =)", "Acercar"],
    ["Ctrl / ⌘ + −", "Alejar"],
    ["Ctrl / ⌘ + 0", "Zoom 100%"],
    ["Ctrl / ⌘ + F", "Buscar elementos por etiqueta"],
    ["d", "Alternar tu versión / la externa (al ver diferencias)"],
  ] },
];

function rows(pairs: ReadonlyArray<readonly [string, string]>, key = false): string {
  return pairs
    .map(([k, v]) => `<div class="help-row"><div class="help-k">${key ? `<kbd>${k}</kbd>` : k}</div><div class="help-v">${v}</div></div>`)
    .join("");
}

function shortcutGroups(): string {
  return ATAJOS
    .map((g) => `<div class="help-subh">${g.group}</div><div class="help-grid">${rows(g.rows, true)}</div>`)
    .join("");
}

export function showHelp(): void {
  if (document.getElementById("help-modal")) return; // one at a time
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "help-modal";
  overlay.innerHTML = `
    <div class="help-box" role="dialog" aria-modal="true" aria-label="Ayuda">
      <div class="help-head">
        <h2>Ayuda</h2>
        <button class="btn icon-only help-close" type="button" title="Cerrar">${icon("close")}</button>
      </div>
      <div class="help-body">
        <button class="btn primary help-manual-open" type="button">${icon("book")}<span>Abrir manual de uso completo</span></button>
        <h3>Funciones</h3>
        <div class="help-grid">${rows(FUNCIONES)}</div>
        <h3>Atajos de teclado</h3>
        ${shortcutGroups()}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = (): void => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
  }
  overlay.querySelector(".help-close")!.addEventListener("click", close);
  overlay.querySelector(".help-manual-open")!.addEventListener("click", () => { close(); showManual(); });
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", onKey);
}

// Screenshots referenced in the manual as `screenshots/NAME.png` (relative to docs/, so
// they resolve on GitHub) are bundled here too so they show INSIDE the app. Vite turns
// each into a hashed asset URL; we swap the <img src> after rendering.
const shotUrls = import.meta.glob("../docs/screenshots/*.png", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const shotByName: Record<string, string> = {};
for (const [path, url] of Object.entries(shotUrls)) {
  const name = path.split("/").pop();
  if (name) shotByName[name] = url;
}

// The full user manual (docs/MANUAL.md, bundled at build time) rendered in-app with a
// navigable table of contents built from its "## " headings. Same source as GitHub.
let manualHtmlCache: string | null = null;
function manualHtml(): string {
  if (manualHtmlCache === null) {
    manualHtmlCache = renderMarkdown(manualMarkdown).replace(
      /src="(?:\.\/)?screenshots\/([^"]+)"/g,
      (whole, name: string) => (shotByName[name] ? `src="${shotByName[name]}"` : whole),
    );
  }
  return manualHtmlCache;
}
function slugify(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "sec";
}

export function showManual(): void {
  if (document.getElementById("manual-modal")) return; // one at a time
  const overlay = document.createElement("div");
  overlay.className = "manual-overlay";
  overlay.id = "manual-modal";
  overlay.innerHTML = `
    <div class="usermanual-box" role="dialog" aria-modal="true" aria-label="Manual de uso">
      <div class="usermanual-head">
        <h2>${icon("book")}<span>Manual de uso</span></h2>
        <button class="btn icon-only usermanual-close" type="button" title="Cerrar">${icon("close")}</button>
      </div>
      <div class="usermanual-main">
        <nav class="usermanual-toc" aria-label="Índice del manual"></nav>
        <div class="usermanual-content markdown-body">${manualHtml()}</div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // Give each "## " section (rendered as <h2>) an id and build the TOC from them.
  const content = overlay.querySelector(".usermanual-content") as HTMLElement;
  const toc = overlay.querySelector(".usermanual-toc") as HTMLElement;
  const heads = Array.from(content.querySelectorAll("h2")) as HTMLElement[];
  const used = new Set<string>();
  const links: HTMLAnchorElement[] = [];
  heads.forEach((h) => {
    let id = slugify(h.textContent ?? "");
    while (used.has(id)) id += "-x";
    used.add(id);
    h.id = id;
    const a = document.createElement("a");
    a.href = `#${id}`;
    a.textContent = h.textContent ?? "";
    a.addEventListener("click", (e) => {
      e.preventDefault();
      h.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    toc.appendChild(a);
    links.push(a);
  });

  // Scroll-spy: highlight the TOC entry of the section currently in view.
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const i = heads.indexOf(en.target as HTMLElement);
      if (i < 0) return;
      links.forEach((l) => l.classList.remove("active"));
      links[i].classList.add("active");
    });
  }, { root: content, rootMargin: "0px 0px -70% 0px", threshold: 0 });
  heads.forEach((h) => spy.observe(h));
  if (links[0]) links[0].classList.add("active");

  const close = (): void => {
    spy.disconnect();
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  function onKey(e: KeyboardEvent): void { if (e.key === "Escape") close(); }
  overlay.querySelector(".usermanual-close")!.addEventListener("click", close);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", onKey);
}
