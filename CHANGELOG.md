# Changelog

Todas las versiones notables de **BPMN compartida**. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versionado
[SemVer](https://semver.org/lang/es/).

## [0.2.0] — 2026-07-01

Capa de **gestión de conocimiento de procesos** sobre el editor BPMN. El LLM vive
**fuera** de la app: todo es markdown plano que agentes CLI (Claude Code, Cowork)
editan directo, y la app recarga en vivo ante cambios externos.

### Agregado
- **Documentación ligada al BPMN**: cada diagrama gana una carpeta hermana
  `<diagrama>.docs/` con una nota markdown por elemento y una página de proceso,
  un índice `_index.md` derivado y un `AGENTS.md` de convención para agentes. El
  sidecar viaja al renombrar/mover/copiar/borrar el diagrama.
- **Editor con live preview estilo Obsidian** (CodeMirror 6): el markup se oculta
  salvo en la línea del cursor; encabezados, negrita/itálica, código, citas y
  listas se estilizan en su lugar; imágenes y video como widgets inline. Modo
  lectura aparte con render saneado.
- **Media**: pegar o soltar imágenes las guarda en `assets/` y las muestra inline
  (edición y lectura).
- **Wikilinks `[[…]]`** con autocompletado (procesos, elementos del diagrama,
  ideas) y navegación al clic; los links markdown `[texto](url)` ocultan la URL.
- **Bandeja de ideas**: capturar ideas sueltas ancladas a un paso o generales en
  `_ideas.md` con triaje `- [ ]`/`- [x]`, y post-its con conteo sobre el diagrama.
- **Manual del proceso**: recorre el flujo y arma un manual de corrido (intro +
  paso a paso), exportable a **HTML autocontenido** (imágenes incrustadas) e
  imprimible a PDF.
- **Navegación inter-proceso**: doble-clic en un Call Activity abre el subproceso
  referenciado; eventos Message/Signal saltan al diagrama vinculado.

### Panel lateral
- El inspector es **redimensible** arrastrando su borde izquierdo (ancho
  persistido); solo se muestra la pestaña activa; el editor ocupa toda la
  superficie del panel.

## [0.1.1] — 2026-06-30

### Agregado
- Chequeo de actualización in-app apuntado a los GitHub Releases del repo: la
  app compara su versión con el último release y, si hay una nueva, muestra un
  banner "Versión X disponible — Descargar". Funciona cuando el repositorio es
  público; mientras es privado el chequeo es un no-op silencioso.
- Este CHANGELOG.

## [0.1.0] — 2026-06-30

Primera versión publicada. Portable de Windows (Electron) + versión web.

### Agregado
- **Editor BPMN 2.0** sobre bpmn-js: paleta, panel de propiedades, selector de
  color, minimapa, grilla, validación en vivo (bpmnlint), simulación de tokens,
  modo *sketchy* y mapa de calor. Exportación a SVG/PNG.
- **Colaboración basada en archivos**, sin servidor: `.bpmn` en una carpeta
  sincronizada (Drive/OneDrive/red), con bloqueos por archivo (check-out /
  check-in), historial de versiones (`.history/`) y detección de cambios
  externos con vista de diferencias.
- **Gestión de archivos** con subcarpetas (crear, abrir, renombrar, duplicar,
  mover, copiar, borrar).
- **Capas de color personalizables + plantillas**: crear/editar/borrar
  dimensiones (color y anotación) y categorías por documento; borde derivado del
  relleno; plantillas compartidas en la carpeta (`.layer-templates/`, un archivo
  por plantilla, fusión sin pisar); reordenar categorías arrastrando. Los
  colores se guardan en un sidecar `<diagrama>.layers.json` sin tocar el `.bpmn`.
- **Panel Asignar**: el nombre de la capa activa como título y opción inicial
  "No definido".
- **Interfaz**: tema claro/oscuro, paneles laterales colapsables, página de
  ayuda con funciones y atajos de teclado, icono propio de la app.

### Corregido
- **Modo oscuro del diagrama** (bpmn-js no trae tema oscuro): etiquetas externas
  legibles, iconos del context pad y texto de edición de etiquetas legibles,
  conexiones aclaradas, pools/carriles en gris oscuro diferenciados de las
  tareas, y minimap tematizado.
- Empaquetado portable limpio (asar ~2.7 MB; evita el asar recursivo de varios
  GB) y carga robusta del `.exe` desde cualquier ruta.
