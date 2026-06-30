# Changelog

Todas las versiones notables de **BPMN compartida**. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versionado
[SemVer](https://semver.org/lang/es/).

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
