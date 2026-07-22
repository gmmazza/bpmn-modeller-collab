# Reglas de layout — Auto-organizar

Este documento es la referencia canónica y versionada de las **12 reglas visuales** que
gobiernan el auto-layout (`Auto-organizar` en la app; motor `layoutDiagramElk`,
`src/layoutElk.ts`). Es el lugar para revisar o cambiar una regla — cuando una ronda de
refinamiento ajusta un criterio, se edita ACÁ primero.

Cada regla indica:
- **Qué garantiza** — el criterio visual en sí.
- **Prioridad** — dura (tolerancia cero), blanda (se mide y se mejora con el tiempo) o
  garantizada por construcción (el diseño del algoritmo la asegura, sin campo de métrica
  propio hoy).
- **Métrica** — el campo exacto de `MetricsReport` (`src/layoutMetrics.ts`) que la mide,
  calculado por el harness `npm run layout:qa` sobre el diagrama REAL renderizado (no sobre
  el XML crudo — ver `layout-qa/README.md`).

Las reglas están ordenadas de más a menos estrictas: primero las duras (nunca se rompen),
después la forma de los conectores, la minimización de cruces, la colocación de nodos y por
último los objetivos blandos que se afinan ronda a ronda.

---

## Reglas duras (tolerancia CERO)

### 1. Contención de carriles
**Garantiza:** los carriles (`lane`) son bandas Y duras, contiguas y sin superposición; el
orden de flujo (secuencia del proceso) sólo se expresa en X, nunca reordenando carriles.
Cada nodo permanece dentro de la banda Y de su carril autorado.

**Prioridad:** DURA.
**Métrica:** `lanes.violations` (suma de `lanes.outOfLane` + `lanes.bandOverlaps` +
`lanes.missingLaneShapes`).

### 2. Sin verticales atravesando nodos; sin superposición nodo×nodo
**Garantiza:** las verticales del ruteo corren siempre por gutters vacíos entre columnas —
nunca cruzan por dentro de un nodo ajeno a la arista. Ningún par de nodos se superpone.

**Prioridad:** DURA.
**Métrica:** `clips.vertical` (verticales que atraviesan un nodo que no es su origen/destino)
+ `overlaps.nodeNode` (parte de `overlaps.total`).

### 3. Los labels nunca se sobreimprimen
**Garantiza:** ningún label (nombre de tarea, rama de gateway, label de flujo) se superpone
con otro label ni con un nodo que no sea su dueño. Incluye el stagger de labels de gateway
(Sí/No apilados, no en el mismo punto) y la cascada de labels de boundary events con despeje
real de wrap (un label de 2 líneas mide ~28px, no los 14px que sugiere el DI autorado).

**Prioridad:** DURA.
**Métrica:** `overlaps.labelLabel` + `overlaps.labelNode` (parte de `overlaps.total`).

---

## Forma del conector

### 4. Máxima horizontalidad y rectitud POR UBICACIÓN *(regla refinada por el usuario, 2026-07-22)*
**Garantiza:** el flujo principal corre recto por el CENTRO de los nodos encadenados. La
rectitud se logra **ubicando y alineando nodos**, no esquivando obstáculos:
- Los nodos conectados en secuencia comparten la misma fila (misma Y de centro).
- La ubicación debe dejar un **corredor libre** para que la línea recta nunca necesite
  desviarse.
- Si una recta queda bloqueada por otro nodo, se **prefiere mover el nodo bloqueador** a otra
  columna/slot antes que doblar el conector.
- **Esquivar (dodge) es el último recurso**, no la estrategia por defecto.

Esta es una corrección explícita sobre versiones anteriores del criterio: la solución a un
conector torcido es replantear DÓNDE van los nodos, no inventar un routing más inteligente
alrededor de ellos.

**Prioridad:** BLANDA (ratchet).
**Métrica:** `straightness.straightPct` (% de aristas hacia-adelante, ya alineadas en Y, que
efectivamente salen como un único segmento recto de 2 waypoints), `straightness.sameRowBends`
y `straightness.dodges` (quiebres sobre esa misma población de aristas — hoy son
numéricamente iguales por definición; se mantienen como campos separados porque una futura
ronda podría relajar la tolerancia de alineación Y de uno sin el otro). Nota: la métrica sólo
considera aristas cuyo origen y destino comparten carril — en un diagrama SIN carriles esa
población queda vacía y `straightPct` da 100 de forma vacía (no significa que el diagrama ya
esté perfectamente recto).

### 5. UNA vertical, en el último momento (drop-late)
**Garantiza:** el tramo horizontal corre a la altura de la fila del ORIGEN, dentro del
carril del origen; recién cae en una única vertical en el gutter pegado al DESTINO. Salidas
hacia adelante por el lado ESTE del nodo, entradas por el OESTE; los back-edges (retornos)
salen por atrás (nunca por la cara izquierda) y entran por el OESTE, rodeando.

**Prioridad:** garantizada por CONSTRUCCIÓN (los "plan kinds" straight/gutter/subrow/return
de `renderMatrix`). No tiene campo propio en `MetricsReport` hoy — una regresión se filtraría
indirectamente a `crossings.hv` o a `clips.horizontal`. Cubierta por los tests unitarios de
ruteo.

### 6. Siempre DENTRO del carril
**Garantiza:** si una fila queda bloqueada, el ruteo abre una sub-fila fina DENTRO del mismo
carril (lo ensancha lo mínimo indispensable) — nunca sale por el hueco inter-carril.

**Prioridad:** garantizada por CONSTRUCCIÓN (`subRowY`). Sin campo propio; un ensanche que
invada el carril vecino se vería como `lanes.bandOverlaps`.

---

## Minimización de cruces

### 7. Nesting anti-cruce
**Garantiza:** tanto los tracks verticales como los slots de entrada/salida se ordenan por la
X del extremo LEJANO de cada arista, de forma consistente entre sí. En un fan-in (varias
aristas convergiendo), el origen más cercano toma el track más interno. En un fan-out (un
nodo con varias ramas), la rama que va más lejos sale más arriba.

**Prioridad:** BLANDA — el nesting es el MECANISMO; el resultado medible es la cantidad de
cruces.
**Métrica:** `crossings.hv` / `crossings.hh` / `crossings.vv` / `crossings.total` (comparte
métrica con la regla 10 — un buen nesting se traduce directamente en menos cruces).

---

## Colocación de nodos (cohesión estructural)

### 8. X por generaciones de flujo
**Garantiza:** la posición X de cada nodo viene de su profundidad en el grafo de secuencia
(longest-path layering, DFS con guarda de ciclo), no de la X autorada por la persona. Cada
sucesor cae ESTRICTAMENTE después de su predecesor — nada se apila ni retrocede.

**Prioridad:** garantizada por CONSTRUCCIÓN (`genDfs`). Sin campo propio; un apilado
resultaría en `overlaps.nodeNode` y afectaría `cohesion.bboxArea`.

### 9. Ramas paralelas apiladas en la MISMA columna
**Garantiza:** dos nodos de la misma generación y el mismo carril (ramas paralelas de un
gateway) van en slots verticales apilados dentro de UNA sola columna fina — no en columnas
secuenciales, que forzarían a un conector a rodear al otro. La fila principal autorada ocupa
el slot 0.

**Prioridad:** garantizada por CONSTRUCCIÓN (`cells`/`slotOf`). Sin campo propio; indicador
indirecto: `overlaps.nodeNode` + `crossings.total`.

---

## Objetivos blandos (se miden y se mejoran ronda a ronda)

### 10. Cruces conector×conector
**Garantiza:** minimizar los cruces entre aristas distintas, contando por separado
horizontal×vertical, horizontal×horizontal y vertical×vertical.

**Prioridad:** BLANDA (ratchet).
**Métrica:** `crossings.hv`, `crossings.hh`, `crossings.vv`, `crossings.total`.

### 11. Clips horizontales conector×nodo
**Garantiza:** minimizar los tramos horizontales que rozan un nodo ajeno a la arista (el
equivalente vertical, regla 2, es DURO — el horizontal se tolera como trade-off de
compacidad, ver regla 12).

**Prioridad:** BLANDA (ratchet).
**Métrica:** `clips.horizontal`.

### 12. Compactación / cohesión
**Garantiza:** las bandas de carril se ciñen al nodo más alto + el padding mínimo (sin
franjas de canal infladas); la longitud media de conector se mantiene baja. El usuario eligió
explícitamente "compacto como el diagrama autorado" por sobre "cero cruces a cualquier
costo" (ver historial de rondas en la memoria `graph-layout-ordering-principles`).

**Prioridad:** BLANDA (ratchet).
**Métrica:** `cohesion.meanEdgeLength`, `cohesion.totalEdgeLength`, `cohesion.bboxArea`.

---

## Duras vs. blandas — cómo las aplica el harness

- **Duras (reglas 1, 2, 3):** tolerancia CERO, siempre. `npm run layout:qa` las compara
  contra `0` en cada corrida — **nunca contra el baseline** (el archivo también guarda estos
  campos por completitud del `MetricsReport`, pero sólo como referencia; nunca se usan como
  gate ni se "aflojan" para que pase un diagrama puntual). Cualquier valor mayor a 0 hace
  fallar la corrida completa (exit 1), sin excepciones ni por-diagrama.
- **Blandas (reglas 4, 7, 10, 11, 12):** se comparan contra `layout-qa/baseline.json`, un
  archivo committeado con un valor por diagrama. Un valor peor que el baseline es una
  regresión (exit 1); igual o mejor, pasa. El baseline sólo se actualiza deliberadamente con
  `--update-baseline`, y sólo cuando la corrida ya está en verde — nunca para esconder una
  regresión real.
- **Garantizadas por construcción (reglas 5, 6, 8, 9):** hoy no tienen un campo dedicado en
  `MetricsReport` — las asegura el diseño de `renderMatrix` y las cubre la suite de tests
  unitarios (`layoutElk.test.ts`, `layoutElkLanes.test.ts`, `layoutElkReal.test.ts`), no el
  harness geométrico. Una regresión en alguna de ellas normalmente se filtra a una de las
  métricas medidas arriba (overlaps, crossings, lanes) — el indicador indirecto está anotado
  en cada regla.

## Métricas futuras

- **Clip conector×label:** hoy `clips.*` sólo detecta un conector atravesando un NODO. Un
  conector que roza o atraviesa el texto de un LABEL (no un nodo) todavía no se mide — es una
  extensión deliberada del contrato de `MetricsReport`, diferida a una ronda futura (requiere
  coordinar el cambio de tipo antes de tocar `computeMetrics`). Ver `layout-qa/README.md`
  (sección de backlog) y `HANDOFF-autolayout.md` §4.
