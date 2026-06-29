import { describe, it, expect, beforeEach, vi } from "vitest";

// Web provider is mocked so the no-fsapi branch is deterministic.
vi.mock("./folderAccess", () => ({
  loadSavedDir: vi.fn(),
  pickDir: vi.fn(),
  ensurePermission: vi.fn(),
}));
import * as web from "./folderAccess";
import { loadSavedDir, pickDir } from "./folder";

function setFsApi(api: any) {
  (window as any).fsapi = api;
}

describe("folder selector", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    delete (window as any).fsapi;
  });

  it("electron: pickDir returns a dir handle from the native dialog (root owned by main)", async () => {
    setFsApi({
      chooseFolder: vi.fn().mockResolvedValue("C:/synced"),
      stat: vi.fn().mockResolvedValue({ mtimeMs: 0, size: 0, kind: "directory" }),
    });
    const dir = await pickDir();
    expect((dir as any)?.kind).toBe("directory");
  });

  it("electron: pickDir returns null when the dialog is cancelled", async () => {
    setFsApi({ chooseFolder: vi.fn().mockResolvedValue(null) });
    expect(await pickDir()).toBeNull();
  });

  it("electron: loadSavedDir uses the main-owned root and returns a dir when present", async () => {
    setFsApi({
      getRoot: vi.fn().mockResolvedValue("C:/synced"),
      stat: vi.fn().mockResolvedValue({ mtimeMs: 0, size: 0, kind: "directory" }),
    });
    const dir = await loadSavedDir();
    expect((dir as any)?.kind).toBe("directory");
  });

  it("electron: loadSavedDir returns null when main reports no root", async () => {
    setFsApi({ getRoot: vi.fn().mockResolvedValue(null) });
    expect(await loadSavedDir()).toBeNull();
  });

  it("electron: loadSavedDir returns null when the saved folder no longer exists", async () => {
    setFsApi({
      getRoot: vi.fn().mockResolvedValue("C:/gone"),
      stat: vi.fn().mockResolvedValue(null),
    });
    expect(await loadSavedDir()).toBeNull();
  });

  it("web: falls back to folderAccess when no fsapi", async () => {
    const handle = { kind: "directory", name: "web" } as any;
    (web.loadSavedDir as any).mockResolvedValue(handle);
    (web.ensurePermission as any).mockResolvedValue(true);
    expect(await loadSavedDir()).toBe(handle);
  });

  it("web: pickDir returns null when the user cancels the picker (AbortError)", async () => {
    const err = Object.assign(new Error("aborted"), { name: "AbortError" });
    (web.pickDir as any).mockRejectedValue(err);
    expect(await pickDir()).toBeNull();
  });
});
