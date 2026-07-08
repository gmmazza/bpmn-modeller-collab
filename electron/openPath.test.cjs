// Note: no `require("vitest")` here — this repo's vitest 2.1.9 ships a CJS entry
// (node_modules/vitest/index.cjs) that unconditionally throws on require(). The
// project's vitest.config.ts sets `test.globals: true`, so describe/it/expect are
// injected as globals for every test file (see electron/terminal/commandBuilder.test.cjs
// for the precedent).
const { isOpenableExt } = require("./openPathGuard.cjs");

describe("isOpenableExt", () => {
  it("allows documents and images", () => {
    for (const f of ["a.pdf", "b.docx", "c.PNG", "d.pptx", "e.svg", "f.md"]) {
      expect(isOpenableExt(f)).toBe(true);
    }
  });
  it("rejects executables and scripts", () => {
    for (const f of ["x.exe", "x.bat", "x.cmd", "x.ps1", "x.vbs", "x.js", "x.scr", "x.msi", "x.lnk", "x.sh", "noext"]) {
      expect(isOpenableExt(f)).toBe(false);
    }
  });
});
