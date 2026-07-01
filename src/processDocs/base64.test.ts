import { describe, it, expect } from "vitest";
import { bytesToBase64, base64ToBytes } from "./base64";

describe("base64", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 65, 66, 67]);
    const b64 = bytesToBase64(bytes);
    expect(typeof b64).toBe("string");
    expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(bytes));
  });

  it("round-trips a larger buffer without call-stack overflow", () => {
    const bytes = new Uint8Array(200000).map((_, i) => i % 256);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it("encodes empty input to empty output", () => {
    expect(bytesToBase64(new Uint8Array([]))).toBe("");
    expect(Array.from(base64ToBytes(""))).toEqual([]);
  });
});
