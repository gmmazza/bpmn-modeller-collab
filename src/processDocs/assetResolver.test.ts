import { describe, it, expect, vi } from "vitest";
import { createAssetResolver } from "./assetResolver";

describe("createAssetResolver", () => {
  it("reads bytes once per ref and returns a stable blob url", async () => {
    const readAsset = vi.fn(async (name: string) => (name === "imagen-1.png" ? new Uint8Array([1, 2, 3]) : null));
    const r = createAssetResolver({ readAsset });
    const url1 = await r.resolve("assets/imagen-1.png");
    const url2 = await r.resolve("assets/imagen-1.png");
    expect(url1).toBe(url2);               // cached
    expect(readAsset).toHaveBeenCalledTimes(1);
    expect(url1?.startsWith("blob:") || url1?.startsWith("data:")).toBe(true);
    r.dispose();
  });

  it("returns null for a missing asset", async () => {
    const r = createAssetResolver({ readAsset: async () => null });
    expect(await r.resolve("assets/nope.png")).toBeNull();
  });

  it("ignores non-asset refs (http/absolute)", async () => {
    const readAsset = vi.fn(async () => new Uint8Array([1]));
    const r = createAssetResolver({ readAsset });
    expect(await r.resolve("https://x/y.png")).toBeNull();
    expect(readAsset).not.toHaveBeenCalled();
  });
});
