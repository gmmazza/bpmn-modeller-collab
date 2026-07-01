import { describe, it, expect } from "vitest";
import { createFsClient } from "./fsClient";
import { createFakeDir } from "./testHelpers/fakeDir";

describe("fsClient binary", () => {
  it("round-trips binary through writeBinary/readBinary", async () => {
    const fs = createFsClient(createFakeDir());
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 255]);
    await fs.writeBinary("x.docs/assets/a.png", bytes);
    const back = await fs.readBinary("x.docs/assets/a.png");
    expect(back && Array.from(back)).toEqual(Array.from(bytes));
  });

  it("returns null reading a missing binary file", async () => {
    const fs = createFsClient(createFakeDir());
    expect(await fs.readBinary("nope.png")).toBeNull();
  });
});
