# QA de colaboración — Borrador/Publicar, Reserva, LLM

Batería de casos para verificar el modelo **Borrador → Publicar + Reserva opcional**,
el aislamiento de borradores por carpeta, la portabilidad y la vista de archivos.

**Notación:** 👤 nº de usuarios · 💻 nº de máquinas · 🤖 con LLM/agente · 🤖✅ ya cubierto
por tests automáticos.

---

## 0. Preparación (una vez)

### 0.1 Datos de prueba automáticos
```bash
npm run qa:seed            # crea ./qa-workspace
# o a una ruta concreta:
node scripts/qa-seed.mjs "C:/ruta/a/carpeta-sync/qa-workspace"
```
Genera: `Compras.bpmn` (con **reserva activa de «Otro» (2 h)** + **2 revisiones** de
historial), su `Compras.docs/` (sidecar, debe quedar **oculto**), `Ventas/B2B.bpmn` en
carpeta independiente (con una idea), `RRHH.bpmn`, y `Proyectos/` (carpeta independiente
vacía). **No** incluye `AGENTS.md` a propósito (para verificar que la app lo crea).

### 0.2 Tests automáticos (correr antes de empezar el QA manual)
```bash
npm run typecheck && npm test && npm run build
```
Deben pasar **todos**. Cubren la lógica determinística:
- `src/collabFlows.test.ts` — publicar/version-check + conflicto, reserva y vencimiento,
  historial (2👤 simulados sobre una carpeta en memoria).
- `src/draftStore.test.ts` — borrador local + **namespacing por carpeta**.
- `src/lockManager.test.ts` — reserva, `lockedUntil`, `isExpired`.
- `src/fileTree.test.ts` — la vista **oculta** `.docs`/dot-folders y muestra `.bpmn` +
  carpetas independientes.

### 0.3 Escenarios que requieren montaje manual
- **2👤 / 1 archivo:** dos personas (o dos perfiles) con la **misma** carpeta sincronizada.
- **2💻:** dos máquinas con la misma carpeta de Drive/OneDrive sincronizada.
- **🤖:** un LLM/agente con acceso de archivos a la carpeta (edita `.bpmn`/`.md` por fuera).

> Consejo de tiempos: la propagación entre máquinas = (intervalo de sync del cloud) +
> hasta **7 s** del poll de la app. No midas conflictos antes de ese margen.

---

## A. Borrador local (1👤 / 1💻)
- [ ] **A1 Autosave** — Editá un diagrama, esperá ~1 s, cerrá la app **sin** publicar. Reabrí → aparece *"Tenés un borrador sin publicar… ¿Seguir editándolo?"*; al aceptar, el canvas muestra tus cambios.
- [ ] **A2 Descartar** — Igual que A1 pero elegí *no* → carga la versión compartida y el chip *"Borrador sin publicar"* desaparece.
- [ ] **A3 Indicadores** — Al editar aparece el punto en **Publicar** + chip *"✏️ Borrador sin publicar"*; Publicar se habilita (resaltado).
- [ ] **A4 Publicar limpia** — Publicá → toast *"Publicado"*, Publicar se deshabilita, el chip de borrador desaparece.
- [ ] **A5 Ctrl+S** — Con cambios, `Ctrl+S` abre el modal de Publicar.
- [ ] **A6 Cambiar de archivo** — Editá A sin publicar, abrí B, volvé a A → A conserva su borrador (resume).
- [ ] **A7 Crash** — Editá y matá el proceso desde el Administrador de tareas. Reabrí → el borrador de la última edición confirmada (>0,8 s) está. *(Límite conocido: puede faltar el último ~1 s.)*

## B. Publicar y conflictos (2👤, mismo archivo) 🤖✅ *(lógica en collabFlows.test)*
- [ ] **B1 Secuencial** — A publica; B abre después → B ve la versión de A (recarga limpia).
- [ ] **B2 Conflicto real** — A y B abren el mismo archivo, **ambos** editan, A publica, luego B publica → B ve la **barra de conflicto**.
- [ ] **B3 Ver diferencias** — En el conflicto, "Ver diferencias" muestra el diff (🟢/🔴/🟡); tecla `d` alterna versiones.
- [ ] **B4 Conservar lo mío** — Publica tu versión encima; en historial quedan ambas.
- [ ] **B5 Descartar** — Carga la versión del otro y **borra tu borrador** (no re-ofrece resume).
- [ ] **B6 Recarga silenciosa** — Con el archivo abierto y **sin** cambios locales, el otro publica → se recarga solo con toast *"Actualizado externamente"* (sin conflicto).

## C. Reserva (advisory) — duración, vencimiento, avisos 🤖✅ *(lógica en collabFlows.test)*
- [ ] **C1 Modal** — "Reservar" muestra 10 min / 30 min / 1 h / 2 h / 4 h / 1 día / Personalizado / Permanente + Cancelar.
- [ ] **C2 Personalizado** — Pide minutos; valor inválido/negativo/cancelar → no reserva.
- [ ] **C3 Visible al equipo (2👤)** — A reserva 1 h → B ve *"🔒 Reservado por A hasta HH:MM"* en el chip y en la fila del árbol. *(El seed ya trae una reserva de «Otro» lista para ver este estado con 1👤.)*
- [ ] **C4 Editar igual** — Con el archivo reservado por otro, **podés editar** tu borrador (no bloquea).
- [ ] **C5 Publicar sobre reserva ajena** — Intentá Publicar algo reservado por otro → modal *"Lo reservó X. ¿Publicar igual y avisarle?"*; al aceptar publica **y** le avisa.
- [ ] **C6 Solicitar turno** — "🔔 Solicitar turno" → el que reservó recibe toast *"X quiere editar — ¿le cedés?"* (el de *publish* dice *"quiere publicar"*).
- [ ] **C7 Aviso al liberarse** — El que reservó libera → el que pidió recibe *"quedó libre — ya podés editar/publicar"*.
- [ ] **C8 Vencimiento** — Reservá por **Personalizado = 1 min** y no toques nada → a ~1 min + 1 poll (7 s) se suelta sola (toast) y el otro la ve libre.
- [ ] **C9 Inactividad** — Reservá y no edites 8 min → se libera (toast) y **el borrador queda intacto**.
- [ ] **C10 Cerrar** — Reservá y hacé "Cerrar" (o cerrá la ventana) → el `.lock` desaparece.
- [ ] **C11 Reserva vencida ajena** — Con un `.lock` ajeno ya vencido, vos la ves libre y podés reservar (el modal advierte *"parece vencida"*).

## D. Multi-máquina / sincronización real (2💻, Drive/OneDrive)
- [ ] **D1 Propagación de publicación** — A (💻1) publica → B (💻2) lo ve en ≤ (sync + 7 s). Anotá el tiempo real.
- [ ] **D2 Propagación de reserva** — El `.lock` de A aparece en 💻2 tras el sync.
- [ ] **D3 Conflicto de sync del cloud** — Editá el mismo archivo offline en ambos lados y volvé a conectar → aparece la **barra amarilla** *"Archivos en conflicto de sincronización"* listándolos.
- [ ] **D4 Latencia/lock del cloud** — Publicá repetido mientras el cloud sincroniza → no se pierde el guardado (retry + fallback in-place).
- [ ] **D5 Borrador es por-máquina** — Editá sin publicar en 💻1 → en 💻2 **no** aparece ese borrador (correcto: es privado local).

## E. Namespacing por carpeta / proyecto (1💻, varias carpetas) 🤖✅ *(draftStore.test)*
- [ ] **E1 Mismo path, distinto proyecto** — Dos carpetas con `procesos/ventas.bpmn`. Dejá borrador en la A, cambiá a la B, abrí `ventas.bpmn` → **no** ofrece el borrador de A.
- [ ] **E2 Volver a A** — Regresá a la carpeta A → su borrador sigue ahí.
- [ ] **E3 Cambiar carpeta desde la app** — El botón de cambiar carpeta recablea sin recargar y los borradores quedan aislados por carpeta.

## F. Portabilidad (build empaquetado)
- [ ] **F1 Datos junto al exe** — Corré el exe empaquetado (`npm run pack:win` → `release/BPMN compartida-win32-x64/`) → se crea `data/` **al lado del exe** (no en `%APPDATA%`).
- [ ] **F2 USB / otra máquina** — Copiá la carpeta del app a un USB y correla en otra máquina → arranca. Esperado: si la ruta de la carpeta de trabajo difiere, pide **elegir carpeta** una vez.
- [ ] **F3 Ubicación de solo-lectura** — Corré el exe desde `Program Files` → no debe crashear (los datos simplemente no persisten ahí).

## G. LLM / agentes (🤖, editan archivos por fuera)
- [ ] **G1 Externa + usuario limpio** — El LLM edita `Compras.bpmn` mientras lo tenés abierto **sin** cambios → recarga silenciosa con toast.
- [ ] **G2 Externa + borrador tuyo** — El LLM edita el `.bpmn` mientras tenés **borrador sin publicar** → aparece **barra de conflicto** (no te pisa en silencio).
- [ ] **G3 Respeta reserva** — Con una reserva humana activa, el agente escribe `<archivo>.bpmn.req` (`{by,name,at,"kind":"edit"}`) → te llega el aviso.
- [ ] **G4 Ideas por el LLM** — El agente agrega comentarios/cambia estado editando `Ventas/B2B.docs/ideas/idea-1.md` → la app lo reconcilia y lo atribuye a la IA (🤖), intercalado por fecha.
- [ ] **G5 AGENTS.md** — Al abrir una carpeta nueva (o el `qa-workspace`), la app crea `AGENTS.md` con la convención borrador/publicar + reservas.
- [ ] **G6 Concurrente humano+LLM** — Editás y publicás mientras el agente toca el mismo archivo → se resuelve por el flujo de conflicto/versión (sin corrupción).

## H. Regresiones (que lo nuevo no rompió lo viejo)
- [ ] **H1 Ideas compartidas** — Crear/editar ideas se guarda solo, sin reserva, y se ve en la otra máquina.
- [ ] **H2 Vista limpia** — Con el `qa-workspace`: el árbol muestra **solo** `Compras.bpmn`, `RRHH.bpmn`, la carpeta `Ventas/` (con `B2B.bpmn`) y `Proyectos/`. **No** deben verse `.docs`, `.history`, `.lock`.
- [ ] **H3 Restaurar** — En `Compras.bpmn` (tiene 2 revisiones), restaurar una la carga como **borrador** (*"Restaurado en tu borrador — Publicá para compartir"*), no publica sola.
- [ ] **H4 Renombrar/mover `.bpmn`** — Al renombrar/mover un diagrama, su `.docs` y su historial lo siguen (aunque el `.docs` esté oculto).
- [ ] **H5 Smoke general** — Capas, notas, manual, export SVG/PNG, navegación Call Activity / mensajes: todo sigue operativo.

## I. Robustez / borde
- [ ] **I1 Nombres con acentos/espacios/`#`/`%`** — Abrir, publicar, reservar, borrador y resume funcionan.
- [ ] **I2 Archivo borrado por otro** — Con un archivo abierto que otro borra/renombra → la app refresca la lista y no queda colgada.
- [ ] **I3 Doble instancia same-máquina** — Dos ventanas sobre la misma carpeta comparten el `localStorage` (misma clave de borrador). Documentá el comportamiento observado *(caso de borde conocido)*.
- [ ] **I4 Cuota de localStorage** — (difícil de forzar) Si el guardado del borrador falla, la app sigue funcionando (el compartido es la fuente de verdad).

---

## Prioridad sugerida
1. **B, C, D, G** — mayor riesgo/valor (conflictos, reservas, multi-máquina, LLM).
2. **A, E, H** — barrido rápido.
3. **F, I** — según necesidad de portabilidad y robustez.

## Registro
| Fecha | Tester | Sección | Resultado | Notas |
|-------|--------|---------|-----------|-------|
|       |        |         |           |       |
