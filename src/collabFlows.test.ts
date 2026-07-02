// Automated coverage of the collaboration PRIMITIVES that the QA checklist exercises
// by hand across two users (docs/QA-colaboracion.md, sections B and C). Two fsClient
// instances share one in-memory folder to stand in for two people on the same synced
// drive. This pins the version-check, conflict-detection, reservation and history
// mechanics so a regression fails here instead of only in manual QA.
import { describe, it, expect } from "vitest";
import { createFsClient } from "./fsClient";
import { createFakeDir } from "./testHelpers/fakeDir";
import { readLock, lockState, isExpired, lockProps, clearProps } from "./lockManager";
import type { User } from "./types";

const XML1 = `<?xml version="1.0"?><definitions id="d1"><process id="P"/></definitions>`;
const XML2 = `<?xml version="1.0"?><definitions id="d1"><process id="P"><task id="T"/></process></definitions>`;

const ana: User = { name: "Ana", email: "Ana" };
const beto: User = { name: "Beto", email: "Beto" };

describe("collab: Publicar version-check + conflict detection (2 users, 1 file)", () => {
  it("detects a conflict when the shared head moved since I opened", async () => {
    const dir = createFakeDir();
    const A = createFsClient(dir);
    const B = createFsClient(dir);
    await A.createFile("p.bpmn", XML1);

    // Both open the file and remember its head revision.
    const aHead = (await A.getMeta("p.bpmn")).headRevisionId;
    const bHead = (await B.getMeta("p.bpmn")).headRevisionId;
    expect(bHead).toBe(aHead);

    // Ana publishes → the shared head moves.
    await A.putXml("p.bpmn", XML2, "Ana");
    const headAfterA = (await A.getMeta("p.bpmn")).headRevisionId;
    expect(headAfterA).not.toBe(aHead);

    // Beto still holds the OLD head → on publish the app compares his openHead
    // against the current head and finds them different ⇒ conflict bar (main.ts save()).
    const headSeenByB = (await B.getMeta("p.bpmn")).headRevisionId;
    expect(headSeenByB).toBe(headAfterA);
    expect(headSeenByB).not.toBe(bHead); // this inequality is exactly the conflict trigger
  });

  it("no conflict when I hold the current head (sequential publish)", async () => {
    const dir = createFakeDir();
    const A = createFsClient(dir);
    await A.createFile("p.bpmn", XML1);
    const open = (await A.getMeta("p.bpmn")).headRevisionId;
    await A.putXml("p.bpmn", XML2, "Ana");
    // Re-open (as a fresh reader would) → head advanced, and that becomes the new baseline.
    const now = (await A.getMeta("p.bpmn")).headRevisionId;
    expect(now).not.toBe(open);
    // A reader who opens AFTER the publish sees the latest and can publish with no conflict.
    expect((await A.getMeta("p.bpmn")).headRevisionId).toBe(now);
  });

  it("keeps a revision in history for spaced-out publishes", async () => {
    const dir = createFakeDir();
    // Inject a controllable clock so the two publishes are hours apart; otherwise the
    // exponential-decay pruning legitimately compresses near-simultaneous revisions.
    let clock = Date.parse("2026-07-01T00:00:00Z");
    const A = createFsClient(dir, () => clock);
    await A.createFile("p.bpmn", XML1);
    clock += 3 * 3600_000;
    await A.putXml("p.bpmn", XML2, "Ana");
    clock += 3 * 3600_000;
    await A.putXml("p.bpmn", XML1, "Beto");
    const revs = await A.listRevisions("p.bpmn");
    expect(revs.length).toBeGreaterThanOrEqual(2);
    expect(revs.map((r) => r.lastModifyingUser?.displayName)).toEqual(
      expect.arrayContaining(["Ana", "Beto"]),
    );
  });
});

describe("collab: Reserva (advisory lock) lifecycle across two users", () => {
  it("a reservation is visible to the other user as theirs, and clears on release", async () => {
    const dir = createFakeDir();
    const A = createFsClient(dir);
    const B = createFsClient(dir);
    await A.createFile("p.bpmn", XML1);

    // Ana reserves for 1h.
    const now = Date.parse("2026-07-02T10:00:00Z");
    const until = new Date(now + 3600_000).toISOString();
    await A.setLock("p.bpmn", lockProps(ana, new Date(now).toISOString(), until));

    // Beto sees it as someone else's, not expired yet.
    const lockSeenByB = readLock(await B.getMeta("p.bpmn"));
    expect(lockState(lockSeenByB, beto)).toBe("theirs");
    expect(lockSeenByB.lockedByName).toBe("Ana");
    expect(isExpired(lockSeenByB, now + 60_000)).toBe(false);
    expect(isExpired(lockSeenByB, now + 3600_001)).toBe(true); // past lockedUntil

    // Ana releases → gone for everyone.
    await A.setLock("p.bpmn", clearProps());
    const cleared = readLock(await B.getMeta("p.bpmn"));
    expect(lockState(cleared, beto)).toBe("free");
    expect(cleared.lockedByEmail).toBeUndefined();
  });

  it("a permanent reservation never expires", async () => {
    const dir = createFakeDir();
    const A = createFsClient(dir);
    await A.createFile("p.bpmn", XML1);
    await A.setLock("p.bpmn", lockProps(ana, "2026-07-02T10:00:00Z")); // no until = permanent
    const lock = readLock(await A.getMeta("p.bpmn"));
    expect(isExpired(lock, Date.parse("2030-01-01T00:00:00Z"))).toBe(false);
  });
});
