import { describe, it, expect } from "vitest";
import { wikilinkAt } from "./wikilinkAt";

describe("wikilinkAt", () => {
  const t = "ver [[mi-proceso]] y [[a#b]]";
  it("returns the inner target when pos is inside a wikilink", () => {
    expect(wikilinkAt(t, 8)).toBe("mi-proceso");   // inside [[mi-proceso]]
    expect(wikilinkAt(t, 24)).toBe("a#b");          // inside [[a#b]]
  });
  it("returns null outside any wikilink", () => {
    expect(wikilinkAt(t, 0)).toBeNull();
    expect(wikilinkAt(t, 19)).toBeNull();           // between the two
  });
});
