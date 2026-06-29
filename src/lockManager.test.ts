import { describe, it, expect } from "vitest";
import {
  readLock,
  lockState,
  isStale,
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
});
