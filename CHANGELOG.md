# Changelog

Todas las versiones notables de **BPMN compartida**. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versionado
[SemVer](https://semver.org/lang/es/).

## [0.4.0] — 2026-07-03

Versión de **experiencia de uso y documentación**: hace visible el guardado local,
robustece el deshacer, recupera el copiar-desde-historial y suma un manual de uso
ilustrado (en GitHub y dentro de la app).

### Agregado
- **Guardado local visible (Borrador→Publicar).** La barra se reorganizó en grupos
  **Local** y **Compartido**. El autoguardado es ahora un **interruptor** on/off, con
  botón **Guardar** manual e indicador *✓ Guardado local / ● Sin guardar*.
- **Copiar elementos desde una versión histórica** (en modo comparación): **clic** o
  **Shift+arrastre** para seleccionar en el panel histórico y **"📋 Copiar al actual"**
  para pegarlos en tu borrador. El arrastre normal conserva el *drag-hand* (paneo).
- **Barra de herramientas responsive**: en ventanas chicas colapsa a iconos y pliega los
  grupos secundarios en un menú **"⋯ Más"** por prioridad; nunca salta a dos líneas.
- **Manual de uso** completo (`docs/MANUAL.md`) con **capturas** y una sección de
  **casos de uso y flujos**. Integrado **dentro de la app** (Ayuda → "Abrir manual de
  uso completo") con índice lateral navegable, y enlazado desde el README.

### Corregido
- **Deshacer que se reseteaba**: al restaurar una versión del historial o copiar
  elementos desde comparación, `importXML` vaciaba el *command stack* nativo. Se agregó
  una **capa de undo por snapshots**, de modo que `Ctrl+Z` revierte esas operaciones y
  el historial de deshacer deja de perderse.

### Cambiado
- El **toggle de autoguardado** pasó de un estado apenas visible a un interruptor claro.
- El panel histórico de comparación (derecha) vuelve a permitir **selección** para
  copiar, manteniéndose de solo-lectura para edición.

## [0.3.0] — 2026-07-03

Versión mayor de **colaboración e ideas**: captura de ideas por elemento, un modelo de
colaboración optimista (Borrador→Publicar) y una experiencia de historial con
previsualización y comparación de versiones.

### Agregado
- **Modo Ideas**: capturá ideas ancladas a cada elemento del diagrama en hilos con
  descripción, comentarios y estados (5 estados, con motivo al cerrar). Badges clicables
  sobre el canvas, filtros por estado/alcance, promoción de una idea a una nota de
  *mejora* vinculada, y detección de ediciones externas/IA (badge 🤖) con registro de
  cada cambio de estado (fecha + autor). Migra las ideas v1 (`_ideas.md`) a notas.
- **Colaboración Borrador→Publicar** (modelo optimista, sin bloqueo para editar):
  editás en un borrador local privado y **Publicás** cuando querés compartir (reusa el
  flujo de guardado/conflicto). El `.lock` pasó a ser una **Reserva** consultiva con
  expiración; UX de check-out más clara, liberación por inactividad y "pedir editar".
- **Historial — previsualización y comparación de versiones**: el panel Historial usa
  **checkboxes** como selector: marcá 1 revisión para **previsualizarla** (solo lectura,
  banner + marco índigo) o 2 para **comparar** en un split sincronizado con diff a color
  (🟢 nuevo / 🔴 eliminado / 🟡 cambiado / 🔵 movido). El split es **horizontal o
  vertical** con separador arrastrable; ambos paneles son **solo lectura** (mano para
  desplazar + zoom, sincronizados en ambos sentidos). "Restaurar esta versión" y "Volver
  a la versión actual" viven en la barra de previsualización.

### Corregido
- **Solo lectura real** en previsualización y comparación: bpmn-js 18 no trae modo
  read-only, así que las revisiones y los paneles de comparación quedaban editables por
  error; ahora se impide toda edición (solo la versión "Actual" de trabajo es editable).
- **Barra de herramientas**: al envolverse en dos filas ya no empuja la página ni genera
  scroll con el cartel de estado fuera de pantalla; panel de historial localizado al
  español.

## [0.2.1] — 2026-07-01

### Corregido
- **Live preview del editor**: las listas con viñetas, las listas numeradas y las
  casillas de tareas (`- [ ]` / `- [x]`) ahora se renderizan correctamente. Antes
  las viñetas y los números desaparecían y `- [x]` se mostraba como enlace. El
  editor parsea con GFM y dibuja viñetas (•), números y checkboxes; el markdown
  crudo se revela en la línea del cursor para poder editar. También se soporta
  tachado `~~texto~~`.

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
