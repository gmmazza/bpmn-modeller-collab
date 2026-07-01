import { describe, it, expect } from "vitest";
import { insertImageText } from "./mediaPaste";

describe("insertImageText", () => {
  it("computes a unique name and the markdown to insert", () => {
    const r = insertImageText(["imagen-1.png"], "image/png");
    expect(r.name).toBe("imagen-2.png");
    expect(r.text).toBe("![](assets/imagen-2.png)");
  });
  it("uses the mime extension", () => {
    expect(insertImageText([], "image/jpeg").name).toBe("imagen-1.jpg");
  });
});
