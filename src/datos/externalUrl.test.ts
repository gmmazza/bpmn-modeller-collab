import { describe, it, expect, vi, afterEach } from "vitest";
import { isHttpsUrl, hasExternalUrlIpc, openExternalUrl } from "./externalUrl";

afterEach(() => {
  delete (globalThis as any).urlapi;
  vi.restoreAllMocks();
});

describe("isHttpsUrl", () => {
  it("accepts only https URLs", () => {
    expect(isHttpsUrl("https://form.jotform.com/x")).toBe(true);
    expect(isHttpsUrl("http://insecure.example")).toBe(false);
    expect(isHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpsUrl("file:///etc/passwd")).toBe(false);
    expect(isHttpsUrl("")).toBe(false);
  });
});

describe("hasExternalUrlIpc", () => {
  it("is false in the web build (no window.urlapi)", () => {
    expect(hasExternalUrlIpc()).toBe(false);
  });
  it("is true when window.urlapi.openExternal is present", () => {
    (globalThis as any).urlapi = { openExternal: async () => {} };
    expect(hasExternalUrlIpc()).toBe(true);
  });
});

describe("openExternalUrl", () => {
  it("rejects a non-https URL without calling any bridge", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    await expect(openExternalUrl("http://insecure.example")).rejects.toThrow();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("uses window.open in the web build", async () => {
    const fakeWin = {} as Window;
    const openSpy = vi.spyOn(window, "open").mockReturnValue(fakeWin);
    await openExternalUrl("https://form.jotform.com/x");
    expect(openSpy).toHaveBeenCalledWith("https://form.jotform.com/x", "_blank", "noopener");
  });

  it("throws when the browser blocks the popup", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    await expect(openExternalUrl("https://form.jotform.com/x")).rejects.toThrow();
  });

  it("delegates to window.urlapi.openExternal when present (Electron)", async () => {
    const openExternal = vi.fn(async () => {});
    (globalThis as any).urlapi = { openExternal };
    const openSpy = vi.spyOn(window, "open");
    await openExternalUrl("https://app.clickup.com/x");
    expect(openExternal).toHaveBeenCalledWith("https://app.clickup.com/x");
    expect(openSpy).not.toHaveBeenCalled();
  });
});
