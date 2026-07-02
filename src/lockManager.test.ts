import { describe, it, expect } from "vitest";
import {
  readLock,
  lockState,
  isStale,
  isExpired,
  canCheckOut,
  lockProps,
  clearProps,
  STALE_MS,
} from "./lockManager";
import type { DriveFile, User } from "./types";

const me: User = { name: "Ana", email: "ana@x.com" };
const other: User = { name: "Bob", email: "bob@x.com" };

function fileWith(props: Record<string, string>): DriveFile {
  return {
    id: "f1",
    name: "p.bpmn",
    modifiedTime: "2026-06-23T10:00:00Z",
    version: "1",
    headRevisionId: "r1",
    appProperties: props,
  };
}

describe("lockManager", () => {
  it("reads no lock from empty appProperties", () => {
    expect(lockState(readLock(fileWith({})), me)).toBe("free");
  });

  it("recognizes my own lock", () => {
    const f = fileWith({ lockedBy: me.email, lockedByEmail: me.email, lockedAt: "2026-06-23T10:00:00Z" });
    expect(lockState(readLock(f), me)).toBe("mine");
  });

  it("recognizes someone else's lock", () => {
    const f = fileWith({ lockedBy: other.email, lockedByEmail: other.email, lockedAt: "2026-06-23T10:00:00Z" });
    expect(lockState(readLock(f), me)).toBe("theirs");
  });

  it("allows check-out when free or mine, not when theirs", () => {
    expect(canCheckOut(readLock(fileWith({})), me)).toBe(true);
    expect(canCheckOut(readLock(fileWith({ lockedByEmail: me.email })), me)).toBe(true);
    expect(canCheckOut(readLock(fileWith({ lockedByEmail: other.email })), me)).toBe(false);
  });

  it("detects stale locks past the TTL", () => {
    const lockedAt = "2026-06-23T10:00:00Z";
    const base = Date.parse(lockedAt);
    expect(isStale({ lockedAt }, base + STALE_MS - 1)).toBe(false);
    expect(isStale({ lockedAt }, base + STALE_MS + 1)).toBe(true);
    expect(isStale({}, base + STALE_MS + 1)).toBe(false);
  });

  it("builds and clears lock appProperties", () => {
    const p = lockProps(me, "2026-06-23T10:00:00Z");
    expect(p.lockedByEmail).toBe(me.email);
    expect(p.lockedAt).toBe("2026-06-23T10:00:00Z");
    // Drive deletes a key when its value is empty string
    expect(clearProps().lockedByEmail).toBe("");
  });

  it("carries a reservation expiry through lockProps and readLock", () => {
    const until = "2026-06-23T12:00:00Z";
    const p = lockProps(me, "2026-06-23T10:00:00Z", until);
    expect(p.lockedUntil).toBe(until);
    expect(readLock(fileWith(p)).lockedUntil).toBe(until);
    // A permanent reservation emits an empty lockedUntil.
    expect(lockProps(me, "2026-06-23T10:00:00Z").lockedUntil).toBe("");
    expect(clearProps().lockedUntil).toBe("");
  });

  it("treats a reservation as expired only past lockedUntil", () => {
    const lockedUntil = "2026-06-23T12:00:00Z";
    const base = Date.parse(lockedUntil);
    expect(isExpired({ lockedUntil }, base - 1)).toBe(false);
    expect(isExpired({ lockedUntil }, base + 1)).toBe(true);
    // No lockedUntil = permanent reservation, never expires.
    expect(isExpired({ lockedByEmail: me.email }, base + 1)).toBe(false);
  });
});
