import type { DriveFile, RestorePoint, Revision, User } from "./types";
import { readLock, lockState, isStale } from "./lockManager";

export function renderFileList(
  container: HTMLElement,
  files: DriveFile[],
  me: User,
  handlers: { onOpen: (id: string) => void; onSteal: (id: string) => void },
): void {
  container.innerHTML = "";
  const now = Date.now();
  for (const f of files) {
    const lock = readLock(f);
    const state = lockState(lock, me);
    const row = document.createElement("div");
    row.className = "file-row";

    const name = document.createElement("button");
    name.textContent = f.name;
    name.dataset.open = f.id;
    name.addEventListener("click", () => handlers.onOpen(f.id));
    row.appendChild(name);

    if (state === "theirs") {
      const badge = document.createElement("span");
      const staleTag = isStale(lock, now) ? " (stale)" : "";
      badge.textContent = `🔒 ${lock.lockedByName ?? lock.lockedByEmail} since ${lock.lockedAt}${staleTag}`;
      row.appendChild(badge);
      const steal = document.createElement("button");
      steal.textContent = "Steal";
      steal.dataset.steal = f.id;
      steal.addEventListener("click", () => handlers.onSteal(f.id));
      row.appendChild(steal);
    } else if (state === "mine") {
      const badge = document.createElement("span");
      badge.textContent = "✏️ checked out by you";
      row.appendChild(badge);
    }
    container.appendChild(row);
  }
}

export function toRestorePoint(rev: Revision, me: User): RestorePoint {
  const email = rev.lastModifyingUser?.emailAddress ?? "";
  return {
    id: rev.id,
    modifiedTime: rev.modifiedTime,
    authorName: rev.lastModifyingUser?.displayName ?? email ?? "unknown",
    authorEmail: email,
    isExternal: email !== "" && email !== me.email,
    sizeBytes: rev.sizeBytes,
  };
}

export function renderHistoryPanel(
  container: HTMLElement,
  points: RestorePoint[],
  handlers: {
    // Each row is a compare checkbox (plus a fixed "Actual (editable)" row on top). The
    // checkbox IS the version picker: 1 revision checked → preview, 2 checked → compare.
    // Row-level Preview/Restore buttons are gone — those actions live in the preview bar.
    // `orientation` labels the compare sides: "h" (side-by-side) → izq/der, "v" (stacked)
    // → arriba/abajo.
    compare?: { selected: string[]; onToggle: (id: string, checked: boolean) => void; orientation?: "h" | "v" };
  },
): void {
  container.innerHTML = "<h3>Historial</h3>";
  const cmp = handlers.compare;
  const sel = cmp ? cmp.selected : [];
  const stacked = cmp?.orientation === "v";
  // Which side each checked id maps to: newer → left/top, older → right/bottom ("actual" newest).
  const recency = (id: string): number => (id === "actual" ? Infinity : Number(id) || 0);
  const ordered = [...sel].sort((a, b) => recency(b) - recency(a));
  // 2 checked → izq/der (or arriba/abajo when stacked); 1 revision checked → 👁; else none.
  const badgeOf = (id: string): { cls: string; text: string } | null => {
    if (sel.length === 2) {
      if (ordered[0] === id) return { cls: "izq", text: stacked ? "arriba" : "izq" };
      if (ordered[1] === id) return { cls: "der", text: stacked ? "abajo" : "der" };
      return null;
    }
    if (sel.length === 1 && sel[0] === id && id !== "actual") return { cls: "preview", text: "👁" };
    return null;
  };

  const rowHead = (id: string, text: string): HTMLElement => {
    const row = document.createElement("div");
    row.className = "history-row";
    if (cmp) {
      const checked = sel.includes(id);
      if (checked) row.classList.add("checked");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "history-check";
      cb.checked = checked;
      cb.dataset.compare = id;
      cb.addEventListener("change", () => cmp.onToggle(id, cb.checked));
      row.appendChild(cb);
      const badge = badgeOf(id);
      if (badge) {
        if (badge.cls === "preview") row.classList.add("previewing");
        const el = document.createElement("span");
        el.className = `history-side ${badge.cls}`;
        el.textContent = badge.text;
        row.appendChild(el);
      }
    }
    const label = document.createElement("span");
    label.className = "history-label";
    label.textContent = text;
    row.appendChild(label);
    return row;
  };

  // Fixed "Actual (editable)" row on top (only when comparing is available).
  if (cmp) container.appendChild(rowHead("actual", "Actual (editable)"));

  for (const p of points) {
    const who = p.isExternal ? " (externo)" : p.authorEmail ? " (vos)" : "";
    const when = (() => { const d = new Date(p.modifiedTime); return isNaN(d.getTime()) ? p.modifiedTime : d.toLocaleString(); })();
    container.appendChild(rowHead(p.id, `${when} — ${p.authorName}${who}`));
  }
}

export function showToast(message: string): void {
  // Append into a fixed, viewport-anchored stack so toasts overlay the visible
  // area instead of being added to the document flow (which grew the page and
  // forced a scrollbar). Multiple toasts stack vertically.
  let stack = document.getElementById("toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "toast-stack";
    document.body.appendChild(stack);
  }
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

export function renderConflictBar(
  container: HTMLElement,
  handlers: { onDiscard: () => void; onKeepMine: () => void; onDiff?: () => void },
): void {
  container.innerHTML = "";
  const bar = document.createElement("div");
  bar.className = "conflict-bar";
  bar.textContent = "Este diagrama cambió por fuera. ";

  if (handlers.onDiff) {
    const diff = document.createElement("button");
    diff.textContent = "Ver diferencias";
    diff.dataset.diff = "1";
    diff.addEventListener("click", handlers.onDiff);
    bar.appendChild(diff);
  }

  const discard = document.createElement("button");
  discard.textContent = "Descartar lo mío y recargar";
  discard.dataset.discard = "1";
  discard.addEventListener("click", handlers.onDiscard);
  bar.appendChild(discard);

  const keep = document.createElement("button");
  keep.textContent = "Conservar lo mío";
  keep.dataset.keepMine = "1";
  keep.addEventListener("click", handlers.onKeepMine);
  bar.appendChild(keep);

  container.appendChild(bar);
}

export function renderSyncWarning(container: HTMLElement, names: string[]): void {
  container.innerHTML = "";
  if (names.length === 0) return;
  const bar = document.createElement("div");
  bar.className = "sync-warning";
  bar.textContent = `⚠ Archivos en conflicto de sincronización (resolvé a mano): ${names.join(", ")}`;
  container.appendChild(bar);
}

// Banner shown while previewing an older revision (read-only). `label` is the
// revision's date/author. Contextual per-version actions live here (not in the history
// rows): optional "Restaurar esta versión", plus "Volver a la versión actual".
export function renderPreviewBar(
  container: HTMLElement,
  label: string,
  handlers: { onExit: () => void; onRestore?: () => void },
): void {
  container.innerHTML = "";
  const bar = document.createElement("div");
  bar.className = "preview-bar";
  const msg = document.createElement("span");
  msg.className = "preview-msg";
  msg.textContent = `👁 Estás viendo una versión anterior (solo lectura)${label ? ` · ${label}` : ""}`;
  bar.appendChild(msg);
  const spacer = document.createElement("span");
  spacer.className = "preview-spacer";
  bar.appendChild(spacer);
  if (handlers.onRestore) {
    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "preview-restore";
    restore.textContent = "↩ Restaurar esta versión";
    restore.title = "Traer esta versión a tu borrador editable (después Publicá para compartirla)";
    restore.dataset.restorePreview = "1";
    restore.addEventListener("click", handlers.onRestore);
    bar.appendChild(restore);
  }
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "preview-exit";
  btn.textContent = "Volver a la versión actual";
  btn.dataset.exitPreview = "1";
  btn.addEventListener("click", handlers.onExit);
  bar.appendChild(btn);
  container.appendChild(bar);
}

// Compare-mode bar. Compare is pure visualization (both panes read-only, pan + zoom,
// no copy). The bar shows what's being compared, the colour legend, a split-orientation
// toggle, and exit. The version SELECTION lives in the History panel (checkboxes).
export function renderCompareBar(
  container: HTMLElement,
  opts: {
    leftLabel: string;
    rightLabel: string;
    orientation: "h" | "v";
    onOrientation: () => void;
    onExit: () => void;
  },
): void {
  container.innerHTML = "";
  const bar = document.createElement("div");
  bar.className = "compare-bar";

  const title = document.createElement("span");
  title.className = "compare-title";
  // Stacked (vertical split) reads top↕bottom; side-by-side reads left↔right.
  const arrow = opts.orientation === "v" ? "↕" : "↔";
  title.textContent = `Comparando: ${opts.leftLabel} ${arrow} ${opts.rightLabel}`;
  bar.appendChild(title);

  const legend = document.createElement("span");
  legend.className = "compare-legend";
  legend.textContent = "🟢 nuevo  🔴 eliminado  🟡 cambiado  🔵 movido";
  bar.appendChild(legend);

  const spacer = document.createElement("span");
  spacer.className = "compare-spacer";
  bar.appendChild(spacer);

  const orient = document.createElement("button");
  orient.type = "button";
  orient.className = "compare-orient";
  orient.textContent = opts.orientation === "h" ? "⬍ Apilar" : "⬌ Lado a lado";
  orient.title = "Cambiar la orientación del split (lado a lado / apilado)";
  orient.dataset.orient = "1";
  orient.addEventListener("click", opts.onOrientation);
  bar.appendChild(orient);

  const exit = document.createElement("button");
  exit.type = "button";
  exit.className = "compare-exit";
  exit.textContent = "Salir";
  exit.dataset.exitCompare = "1";
  exit.addEventListener("click", opts.onExit);
  bar.appendChild(exit);

  container.appendChild(bar);
}

// In-app text prompt. Electron's renderer does not support window.prompt(), so we
// render our own modal. Resolves with the trimmed value, or null on cancel/empty.
// In-app yes/no confirmation (window.confirm is unsupported in Electron's renderer).
export function confirmModal(message: string, okLabel = "Aceptar"): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <p class="modal-msg"></p>
        <div class="modal-actions">
          <button class="modal-cancel" type="button">Cancelar</button>
          <button class="modal-ok" type="button"></button>
        </div>
      </div>`;
    (overlay.querySelector(".modal-msg") as HTMLElement).textContent = message;
    (overlay.querySelector(".modal-ok") as HTMLButtonElement).textContent = okLabel;
    function done(v: boolean): void { overlay.remove(); document.removeEventListener("keydown", onKey, true); resolve(v); }
    function onKey(e: KeyboardEvent): void { if (e.key === "Escape") done(false); }
    (overlay.querySelector(".modal-ok") as HTMLButtonElement).addEventListener("click", () => done(true));
    (overlay.querySelector(".modal-cancel") as HTMLButtonElement).addEventListener("click", () => done(false));
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(overlay);
    (overlay.querySelector(".modal-ok") as HTMLButtonElement).focus();
  });
}

// Reservation-duration picker for the optional advisory "Reserva". Resolves with a
// lockedUntil RFC3339 string (or "" for a permanent reservation), or null on cancel.
// "Personalizado" asks for a number of minutes via promptText.
const RESERVE_PRESETS: Array<{ label: string; minutes: number }> = [
  { label: "10 min", minutes: 10 },
  { label: "30 min", minutes: 30 },
  { label: "1 h", minutes: 60 },
  { label: "2 h", minutes: 120 },
  { label: "4 h", minutes: 240 },
  { label: "1 día", minutes: 60 * 24 },
];

// Pure helpers (unit-tested) behind the reservation modal.
export function reservationUntilIso(nowMs: number, minutes: number): string {
  return new Date(nowMs + minutes * 60_000).toISOString();
}
// Parse the "Personalizado" free-text into whole positive minutes, or null if invalid.
export function parseReserveMinutes(raw: string | null): number | null {
  if (!raw) return null;
  const mins = Math.round(Number(raw));
  return Number.isFinite(mins) && mins > 0 ? mins : null;
}

export function pickReservationDuration(nowMs: number): Promise<string | null> {
  const untilIso = (minutes: number): string => reservationUntilIso(nowMs, minutes);
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const buttons = RESERVE_PRESETS.map(
      (p) => `<button class="modal-choice" type="button" data-min="${p.minutes}">${p.label}</button>`,
    ).join("");
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <p class="modal-msg">¿Por cuánto tiempo querés reservar este diagrama?</p>
        <div class="modal-choices">
          ${buttons}
          <button class="modal-choice" type="button" data-custom="1">Personalizado…</button>
          <button class="modal-choice" type="button" data-perm="1">Permanente</button>
        </div>
        <div class="modal-actions">
          <button class="modal-cancel" type="button">Cancelar</button>
        </div>
      </div>`;
    function close(): void {
      overlay.remove();
      document.removeEventListener("keydown", onKey, true);
    }
    function done(value: string | null): void {
      close();
      resolve(value);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") done(null);
    }
    overlay.querySelectorAll<HTMLButtonElement>(".modal-choice").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.perm) return done(""); // permanent
        if (btn.dataset.custom) {
          close();
          void promptText("¿Cuántos minutos querés reservar?", { placeholder: "p. ej. 90" }).then((raw) => {
            const mins = parseReserveMinutes(raw);
            resolve(mins !== null ? untilIso(mins) : null);
          });
          return;
        }
        done(untilIso(Number(btn.dataset.min)));
      });
    });
    (overlay.querySelector(".modal-cancel") as HTMLButtonElement).addEventListener("click", () => done(null));
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(overlay);
  });
}

export function promptText(
  message: string,
  opts: { placeholder?: string; initial?: string } = {},
): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <p class="modal-msg"></p>
        <input class="modal-input" type="text" />
        <div class="modal-actions">
          <button class="modal-cancel" type="button">Cancelar</button>
          <button class="modal-ok" type="button">Aceptar</button>
        </div>
      </div>`;
    (overlay.querySelector(".modal-msg") as HTMLElement).textContent = message;
    const input = overlay.querySelector(".modal-input") as HTMLInputElement;
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.initial) input.value = opts.initial;

    function done(value: string | null) {
      overlay.remove();
      resolve(value);
    }
    (overlay.querySelector(".modal-ok") as HTMLButtonElement).addEventListener("click", () =>
      done(input.value.trim() || null),
    );
    (overlay.querySelector(".modal-cancel") as HTMLButtonElement).addEventListener("click", () => done(null));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") done(input.value.trim() || null);
      else if (e.key === "Escape") done(null);
    });

    document.body.appendChild(overlay);
    input.focus();
  });
}
