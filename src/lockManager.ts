import type { DriveFile, LockInfo, LockState, User } from "./types";

// Advisory staleness hint only — never enforced; informs the "steal" affordance.
export const STALE_MS = 1000 * 60 * 60 * 2; // 2 hours

export function readLock(file: DriveFile): LockInfo {
  const p = file.appProperties ?? {};
  return {
    lockedBy: p.lockedBy || undefined,
    lockedByEmail: p.lockedByEmail || undefined,
    lockedByName: p.lockedByName || undefined,
    lockedAt: p.lockedAt || undefined,
    lockedUntil: p.lockedUntil || undefined,
  };
}

// A reservation with a lockedUntil in the past is over — treat it as no lock.
export function isExpired(lock: LockInfo, nowMs: number): boolean {
  if (!lock.lockedUntil) return false; // absent = permanent reservation
  return nowMs > Date.parse(lock.lockedUntil);
}

export function lockState(lock: LockInfo, me: User): LockState {
  if (!lock.lockedByEmail) return "free";
  return lock.lockedByEmail === me.email ? "mine" : "theirs";
}

export function canCheckOut(lock: LockInfo, me: User): boolean {
  const s = lockState(lock, me);
  return s === "free" || s === "mine";
}

export function isStale(lock: LockInfo, nowMs: number, ttlMs: number = STALE_MS): boolean {
  if (!lock.lockedAt) return false;
  return nowMs - Date.parse(lock.lockedAt) > ttlMs;
}

// untilIso is the reservation expiry (RFC3339); "" means a permanent reservation.
export function lockProps(me: User, nowIso: string, untilIso = ""): Record<string, string> {
  return {
    lockedBy: me.email,
    lockedByEmail: me.email,
    lockedByName: me.name,
    lockedAt: nowIso,
    lockedUntil: untilIso,
  };
}

// Setting an appProperties value to "" instructs Drive to delete that key.
export function clearProps(): Record<string, string> {
  return { lockedBy: "", lockedByEmail: "", lockedByName: "", lockedAt: "", lockedUntil: "" };
}
