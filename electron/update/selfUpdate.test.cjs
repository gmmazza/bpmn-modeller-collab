// Vitest GLOBALS (no require("vitest") — it throws in this repo's vitest; precedent:
// electron/pathGuard.test.mjs, electron/terminal/commandBuilder.test.cjs).
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { buildSwapPlan, resolveSourceRoot } = require("./selfUpdate.cjs");

const WIN_OPTS = {
  installRoot: "C:\\Users\\me\\BPMN compartida-win32-x64",
  sourceDir: "C:\\Temp\\bpmn-up\\extracted\\BPMN compartida-win32-x64",
  exeName: "BPMN compartida.exe",
  pid: 4242,
  tmpDir: "C:\\Temp\\bpmn-up",
  logFile: "C:\\Temp\\bpmn-up\\selfupdate.log",
};

describe("buildSwapPlan (win32)", () => {
  const plan = buildSwapPlan("win32", WIN_OPTS);

  test("returns a powershell -File invocation", () => {
    expect(plan).toBeTruthy();
    const { file, args } = plan.argv("C:\\Temp\\bpmn-up\\bpmn-selfupdate.ps1");
    expect(file).toBe("powershell.exe");
    expect(args).toContain("-File");
    expect(args[args.length - 1]).toBe("C:\\Temp\\bpmn-up\\bpmn-selfupdate.ps1");
    expect(args).toContain("-ExecutionPolicy");
  });

  test("waits for the app PID before touching files", () => {
    expect(plan.scriptBody).toContain("$target = 4242");
    // the wait loop must come BEFORE the robocopy (files are locked until the app exits)
    const waitIdx = plan.scriptBody.indexOf("Get-Process -Id $target");
    const copyIdx = plan.scriptBody.indexOf("robocopy");
    expect(waitIdx).toBeGreaterThanOrEqual(0);
    expect(copyIdx).toBeGreaterThan(waitIdx);
  });

  test("MERGES, never mirrors — /E present, /MIR absent (preserves data/ drafts)", () => {
    expect(plan.scriptBody).toContain("/E");
    expect(plan.scriptBody).not.toContain("/MIR");
    expect(plan.scriptBody).not.toContain("/PURGE");
  });

  test("single-quotes paths with spaces (no $/backtick expansion) and relaunches from install root", () => {
    expect(plan.scriptBody).toContain("'C:\\Users\\me\\BPMN compartida-win32-x64'");
    expect(plan.scriptBody).toContain(
      "Start-Process -FilePath 'C:\\Users\\me\\BPMN compartida-win32-x64\\BPMN compartida.exe'",
    );
    // must NOT use double quotes (where PowerShell would expand $(…) / backticks)
    expect(plan.scriptBody).not.toContain('"C:\\Users');
  });

  test("cleans up the temp dir at the end", () => {
    expect(plan.scriptBody).toContain("Remove-Item -LiteralPath 'C:\\Temp\\bpmn-up' -Recurse -Force");
  });
});

describe("buildSwapPlan (unsupported platforms)", () => {
  test("darwin → null (structured TODO, not implemented)", () => {
    expect(buildSwapPlan("darwin", WIN_OPTS)).toBeNull();
  });
  test("linux → null", () => {
    expect(buildSwapPlan("linux", WIN_OPTS)).toBeNull();
  });
});

describe("resolveSourceRoot", () => {
  const EXE = "app.exe";
  let base;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "selfupd-test-"));
  });

  test("flat zip: exe at the extract root", async () => {
    fs.writeFileSync(path.join(base, EXE), "x");
    expect(await resolveSourceRoot(base, EXE)).toBe(base);
  });

  test("wrapped zip: exe inside a single top folder", async () => {
    const inner = path.join(base, "App-win32-x64");
    fs.mkdirSync(inner);
    fs.writeFileSync(path.join(inner, EXE), "x");
    expect(await resolveSourceRoot(base, EXE)).toBe(inner);
  });

  test("bad zip: no exe anywhere → null (guards against bricking the install)", async () => {
    fs.mkdirSync(path.join(base, "junk"));
    fs.writeFileSync(path.join(base, "readme.txt"), "x");
    expect(await resolveSourceRoot(base, EXE)).toBeNull();
  });
});
