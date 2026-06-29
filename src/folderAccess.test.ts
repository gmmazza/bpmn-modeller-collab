import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadSavedDir, saveDir, pickDir, ensurePermission } from "./folderAccess";

// A handle that survives IndexedDB's structured clone (no functions).
function storableHandle(name = "folder") {
  return { kind: "directory", name } as any;
}
// A handle with mocked permission methods (used only by permission tests; never persisted).
function permHandle(perm: "granted" | "prompt" | "denied" = "granted") {
  return {
    kind: "directory",
    name: "folder",
    queryPermission: vi.fn().mockResolvedValue(perm),
    requestPermission: vi.fn().mockResolvedValue("granted"),
  } as any;
}

describe("folderAccess", () => {
  beforeEach(() => {
    indexedDB.deleteDatabase("bpmn-compartida");
    vi.restoreAllMocks();
  });

  it("returns null when nothing saved", async () => {
    expect(await loadSavedDir()).toBeNull();
  });

  it("persists and reloads a handle", async () => {
    await saveDir(storableHandle());
    const got = await loadSavedDir();
    expect((got as any)?.name).toBe("folder");
  });

  it("pickDir stores the chosen handle", async () => {
    const h = storableHandle();
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(h));
    const picked = await pickDir();
    expect((picked as any).name).toBe("folder");
    expect((await loadSavedDir() as any)?.name).toBe("folder");
  });

  it("ensurePermission returns true when already granted", async () => {
    const h = permHandle("granted");
    expect(await ensurePermission(h)).toBe(true);
    expect(h.requestPermission).not.toHaveBeenCalled();
  });

  it("ensurePermission requests when prompt, then true", async () => {
    const h = permHandle("prompt");
    expect(await ensurePermission(h)).toBe(true);
    expect(h.requestPermission).toHaveBeenCalledWith({ mode: "readwrite" });
  });
});
