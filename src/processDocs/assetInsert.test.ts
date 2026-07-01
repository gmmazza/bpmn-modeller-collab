import { describe, it, expect } from "vitest";
import { uniqueAssetName, imageMarkdown, extFromType } from "./assetInsert";

describe("assetInsert", () => {
  it("picks the first free imagen-<n>.<ext>", () => {
    expect(uniqueAssetName([], "png")).toBe("imagen-1.png");
    expect(uniqueAssetName(["imagen-1.png"], "png")).toBe("imagen-2.png");
    expect(uniqueAssetName(["imagen-1.png", "imagen-3.png"], "png")).toBe("imagen-2.png");
  });
  it("builds the image markdown pointing at assets/", () => {
    expect(imageMarkdown("imagen-1.png")).toBe("![](assets/imagen-1.png)");
  });
  it("maps mime types to extensions with a png fallback", () => {
    expect(extFromType("image/jpeg")).toBe("jpg");
    expect(extFromType("image/svg+xml")).toBe("svg");
    expect(extFromType("image/weird")).toBe("png");
  });
});
