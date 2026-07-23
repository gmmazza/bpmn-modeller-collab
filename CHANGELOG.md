# Changelog

Todas las versiones notables de **BPMN compartida**. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versionado
[SemVer](https://semver.org/lang/es/).

## [0.6.6] — 2026-07-23

**Historial robusto y dual**: cada panel del split (mapa maestro y subproceso)
resuelve su propio historial; las versiones creadas fuera de la app (agentes de
IA u otras herramientas) se capturan y atribuyen; y la poda ya no borra las
versiones recientes.

### Agregado
- **Historial dual maestro/subproceso.** Con un mapa abierto, la pestaña
  Historial muestra **dos secciones apiladas** (Maestro arriba, Subproceso
  abajo), colapsables y con paridad total por panel: **vista previa**,
  **comparación lado a lado** con diff y **"Copiar al actual"** funcionan dentro
  de cada split, **simultáneos e independientes** (hasta 4 lienzos a la vez).
  El maestro gana **deshacer/rehacer** propio para restauraciones y re-layouts.
- **La barra superior sigue al panel activo.** Publicar/`Ctrl+S`,
  deshacer/rehacer, Guardar local + estado, Auto-organizar y el chip de archivo
  actúan sobre el maestro o el subproceso según el último panel clickeado.
- **Captura de versiones externas.** Un `.bpmn` creado o editado **fuera de la
  app** queda versionado automáticamente: baseline al abrirlo (con la fecha real
  del archivo), captura al detectar el cambio externo y **siempre antes de
  publicar encima** — la versión original ya no se pierde nunca.
- **Atribución por firma (exporter BPMN).** La app firma sus publicaciones
  (`exporter="BPMN compartida"`); los agentes IA firman
  `exporter="IA — <agente>"` (contrato en `AGENTS.md` v3 + skill `bpmn-design`
  + aviso del validador) y el historial atribuye **"Claude-Matias"** (agente +
  usuario); sin firma queda "(externo)".

### Corregido
- **La poda del historial borraba las versiones recientes**: publicar varias
  veces en una sesión dejaba solo la última versión. Ahora **todo lo de la
  última hora se conserva siempre**; el decaimiento aplica solo hacia atrás.
- En modo maestro, el historial **no reaccionaba** (maestro solo) o **rompía el
  layout** del split al comparar, y publicar el maestro pisaba el panel del
  subproceso. Los tres casos quedaron resueltos con el historial dual.
- Guardia de seguridad: "Mostrar en el diagrama" ya no puede sobreescribir el
  mapa maestro con el XML del subproceso cuando el foco está en el maestro.

### Cambiado
- Panel Historial rediseñado para el modo dual: cabecera por grupo con el
  **nombre del archivo resaltado** (pill verde = maestro, índigo = subproceso)
  y separador entre secciones.

## [0.6.5] — 2026-07-18

**Auto-organizar**: layout automático de diagramas (flujo horizontal, con
swimlanes y fases respetados y ruteo ortogonal de mínimos cruces), más
correcciones de visualización en el mapa maestro.

### Agregado
- **Auto-organizar (layout automático).** Botón de la barra que re-acomoda el
  diagrama con un motor de layout por capas (elkjs): flujo de izquierda a derecha
  por generaciones de flujo, **swimlanes y fases preservados** (la matriz 2-D no
  se destruye) y **ruteo ortogonal** de los conectores dentro del carril,
  minimizando cruces. Funciona en el editor y en el **mapa maestro**, es
  **deshacible** (Ctrl+Z) y conserva colores y cajas de fase. En el menú de
  opciones (▾): **"Reorganizar solo la selección"** y **"Modo rápido (backup)"**.

### Corregido
- **Resultados alternativos en el mapa maestro.** Cuando una Call Activity tiene
  varios resultados (eventos de borde de escalación), ahora se **reparten a lo
  largo del borde inferior** y sus **etiquetas se escalonan**, en vez de apilarse
  en un punto y superponerse. Aplica tanto al auto-organizar como al **alta de un
  resultado nuevo**.
- **"Reorganizar solo la selección"** ahora **preserva los carriles**: reordena en
  el eje horizontal sin sacar los nodos de su swimlane.

### Cambiado
- El auto-organizar es **horizontal**; se quitaron las variantes *vertical* y
  *árbol* (y el selector de variante).

## [0.6.0] — 2026-07-16

Gran salto de **gestión de conocimiento de procesos**: mapas en capas
(maestros + subprocesos), documentos fuente, datos y herramientas por elemento,
un lanzador de agentes de IA y una configuración unificada.

### Agregado
- **Mapas maestros y subprocesos.** Una **Call Activity** vincula un elemento a
  otro `.bpmn`; un mapa con vínculos es un **maestro** (badge 🗺). **Doble-clic**
  abre el subproceso **abajo, en un split editable y redimensionable**. En el
  árbol, los subprocesos aparecen **indentados bajo su maestro** (colapsables), y
  uno compartido por varios maestros se muestra **bajo cada uno**. Perfil BPMN
  propio y **contrato de subprocesos** con eventos "viene de / va a".
- **Fuentes.** Documentos de respaldo (PDFs, planillas, capturas, enlaces) por
  proceso o etapa, con estados **pendiente / procesada**, en el *sidecar*
  `<diagrama>.fuentes/` y su pestaña en el panel.
- **Datos y herramientas.** Registro de qué **datos** y qué **herramientas /
  sistemas** usa cada elemento (texto libre con sugerencias de la carpeta),
  **badges** en el canvas y *sidecar* `<diagrama>.datos.json`.
- **Agentes de IA (lanzador de escritorio).** Menú **IA (✨)** para lanzar
  agentes (p. ej. Claude Code) en una **terminal externa** con **presets**
  editables; instrucciones personales y visor de `AGENTS.md` en Configuraciones.
- **Ventana Configuraciones** por secciones — Visualización, IA, Generales,
  Versión y actualizaciones — que unifica nombre, carpeta, tema, autoguardado,
  ajustes de IA y el chequeo de versión.

### Cambiado
- **Modo maestro editable en el lugar**: el mapa se edita directo (sin botón
  aparte), el drill es por **doble-clic**, y el split maestro/subproceso es
  **redimensionable**. Cuando no hay subproceso abierto, el mapa ocupa **toda la
  pantalla** y la guía es un *pill* flotante.
- **Panel lateral (inspector) rediseñado** como **riel de iconos** vertical
  siempre visible (estilo *activity bar*): un clic abre/colapsa cada panel. Los
  accesos que estaban en la barra superior se movieron al riel.
- **Paneles redimensionables** (árbol de archivos y panel lateral) y árbol de
  archivos con la relación maestro→subproceso reflejada.

### Corregido
- **Fuentes**: dejaba de renderizar a veces y se **duplicaba** al abrir la
  pestaña y luego el maestro (token de generación por host + discriminación de
  `NotFoundError` en `fsClient.listDir`).
- Varias regresiones de UX (entre ellas el **resize del panel lateral** tras el
  rediseño del inspector) detectadas y corregidas en revisión.

## [0.5.1] — 2026-07-07

Endurecimiento y **puesta a punto de la auto-actualización** introducida en 0.5.0: quedó
funcionando de punta a punta (descarga → reemplazo en la carpeta → reinicio) y más segura.

### Corregido (auto-actualización en el lugar)
- **El helper de reemplazo ahora se ejecuta de verdad.** Se lanzaba con
  `spawn("powershell", ["-File", …])`, que en la práctica no corría ni sobrevivía al cierre
  de la app, así que los archivos nunca se reemplazaban. Se lanza vía `cmd /c start`, que
  desprende el proceso para que corra después de que la app cierra.
- **Reemplazo robusto frente al bloqueo del `.exe`.** El helper espera a que salga el proceso
  principal **y** todos los procesos auxiliares de Electron que corren el mismo `.exe`,
  fuerza el cierre de rezagados y reintenta la copia — así el ejecutable en uso ya no bloquea
  la actualización.
- **Carpeta temporal única por intento.** Antes reutilizaba una carpeta fija y fallaba con
  `ENOTEMPTY` cuando archivos extraídos de un intento previo quedaban bloqueados (p. ej. por
  el antivirus). Ahora cada intento usa una carpeta nueva y limpia las viejas sin bloquearse.

### Seguridad
- **La URL de descarga ya no se acepta desde el renderer.** El proceso principal vuelve a
  consultar el feed de releases y toma la URL del `.zip` de GitHub por sí mismo, exigiendo
  que provenga del host de descargas de releases de este repo. Cierra una vía de ejecución
  de código si el renderer estuviera comprometido (p. ej. por un `.bpmn` malicioso).
- **Rutas al script de PowerShell como literales entre comillas simples** (sin expansión de
  `$`/backtick), evitando inyección por nombres de carpeta anómalos en el swap del update.
- Verificación de integridad por checksum firmado del `.zip` queda como mejora pendiente
  (requiere un ancla de firma).

## [0.5.0] — 2026-07-07

Versión de **automatización e integración con IA**: una terminal para correr el CLI de
un LLM en la carpeta de trabajo, auto-actualización de la app en el lugar, y el contexto
de diseño BPMN listo para que un LLM trabaje dentro de la carpeta.

### Agregado
- **Terminal de LLM (Electron).** Un grupo en la barra abre la **terminal del sistema con
  la carpeta de trabajo como `cwd`** (⌨) o **lanza un preset** de comando (▶). Los presets
  (etiqueta + comando, p. ej. `claude`, `claude --review`, `gemini`) se definen y eligen
  desde un editor simple. Cierra el loop con el watcher: el CLI edita el `.bpmn` y la app
  recarga en vivo. Estructurado cross-platform (Windows implementado; macOS/Linux al portar).
- **Auto-actualización en el lugar (portable).** Desde **Ajustes → App → Buscar
  actualización**, cuando hay una versión nueva un botón **Descargar e instalar** baja el
  `.zip` del release, **reemplaza los archivos en la carpeta actual** (preservando `data/`
  con tus borradores) y **reinicia** — sin dejar de ser portable, sin instalador.
- **Integración del skill `bpmn-design` para IA.** Al abrir una carpeta, la app materializa
  `AGENTS.md` + `_bpmn-design/` (skill completo + resumen) para que un LLM que corra dentro
  de la carpeta diseñe/revise diagramas con contexto; con capas de equipo (`AGENTS.local.md`)
  e instrucciones personales por usuario (Ajustes → "Instrucciones personales para la IA").

### Corregido
- **Los menús Ajustes (⚙) y Más (⋯) no abrían** en la barra: `#toolbar` usaba
  `overflow: hidden` (para el reflow responsive), que recortaba los desplegables
  (`position: absolute; top: 100%`). Se cambió a `overflow: visible` — el reflow ya evita
  el desborde horizontal moviendo grupos al menú "⋯".

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
