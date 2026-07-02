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
  handlers: { onPreview: (id: string) => void; onRestore: (id: string) => void },
): void {
  container.innerHTML = "<h3>History</h3>";
  for (const p of points) {
    const row = document.createElement("div");
    row.className = "history-row";
    const label = document.createElement("span");
    label.textContent = `${p.modifiedTime} — ${p.authorName}${p.isExternal ? " (external)" : ""}`;
    row.appendChild(label);

    const preview = document.createElement("button");
    preview.textContent = "Preview";
    preview.dataset.preview = p.id;
    preview.addEventListener("click", () => handlers.onPreview(p.id));
    row.appendChild(preview);

    const restore = document.createElement("button");
    restore.textContent = "Restore";
    restore.dataset.restore = p.id;
    restore.addEventListener("click", () => handlers.onRestore(p.id));
    row.appendChild(restore);

    container.appendChild(row);
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

export function pickReservationDuration(nowMs: number): Promise<string | null> {
  const untilIso = (minutes: number): string => new Date(nowMs + minutes * 60_000).toISOString();
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
            const mins = raw ? Math.round(Number(raw)) : NaN;
            resolve(Number.isFinite(mins) && mins > 0 ? untilIso(mins) : null);
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
