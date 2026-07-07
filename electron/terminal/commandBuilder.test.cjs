// Note: no `require("vitest")` here — this repo's vitest 2.1.9 ships a CJS entry
// (node_modules/vitest/index.cjs) that unconditionally throws on require(). The
// project's vitest.config.ts sets `test.globals: true`, so describe/it/expect are
// injected as globals for every test file (see electron/pathGuard.test.mjs for the
// analogous ESM precedent, which uses `import` instead of `require` for the same reason).
const { externalLaunchArgv } = require("./commandBuilder.cjs");

describe("externalLaunchArgv", () => {
  const cwd = "C:/work/proj";

  it("win32 without command: prefers Windows Terminal, then pwsh, then cmd", () => {
    const c = externalLaunchArgv("win32", cwd, null);
    expect(c[0]).toEqual({ file: "wt", args: ["-d", cwd] });
    expect(c[1]).toEqual({ file: "pwsh", args: ["-NoExit", "-WorkingDirectory", cwd] });
    expect(c[2]).toEqual({ file: "cmd.exe", args: ["/K"] });
  });

  it("win32 with command: appends the command to each candidate", () => {
    const c = externalLaunchArgv("win32", cwd, "claude");
    expect(c[0]).toEqual({ file: "wt", args: ["-d", cwd, "pwsh", "-NoExit", "-Command", "claude"] });
    expect(c[1]).toEqual({ file: "pwsh", args: ["-NoExit", "-WorkingDirectory", cwd, "-Command", "claude"] });
    expect(c[2]).toEqual({ file: "cmd.exe", args: ["/K", "claude"] });
  });

  it("win32 cmd.exe candidate never interpolates cwd into a shell string (command injection guard)", () => {
    const maliciousCwd = 'C:/a" & calc & "b';
    const c = externalLaunchArgv("win32", maliciousCwd, "x");
    const cmdExe = c.find((x) => x.file === "cmd.exe");
    expect(cmdExe.args).toEqual(["/K", "x"]);
    // cwd only appears as a standalone argv element (wt -d / pwsh -WorkingDirectory), never
    // folded into another string alongside other shell syntax.
    for (const candidate of c) {
      for (const arg of candidate.args) {
        if (arg === maliciousCwd) continue; // standalone argv element: safe, not shell-interpreted
        expect(arg).not.toContain(maliciousCwd);
      }
    }
  });

  it("darwin without command opens Terminal at cwd", () => {
    const c = externalLaunchArgv("darwin", cwd, null);
    expect(c[0]).toEqual({ file: "open", args: ["-a", "Terminal", cwd] });
  });

  it("darwin with command uses osascript do script with cd + command", () => {
    const c = externalLaunchArgv("darwin", cwd, "claude");
    expect(c[0].file).toBe("osascript");
    expect(c[0].args[0]).toBe("-e");
    expect(c[0].args[1]).toContain(cwd);
    expect(c[0].args[1]).toContain("claude");
  });

  it("darwin escapes double quotes in cwd/command so the AppleScript literal can't be broken out of", () => {
    const c = externalLaunchArgv("darwin", 'C:/a"b', "cmd");
    const script = c[0].args[1];
    expect(script).toContain('\\"'); // escaped quote present
    expect(script).not.toContain('a"b'); // raw unescaped injection absent
  });

  it("linux without command prefers gnome-terminal, then fallbacks", () => {
    const c = externalLaunchArgv("linux", cwd, null);
    expect(c[0]).toEqual({ file: "gnome-terminal", args: [`--working-directory=${cwd}`] });
    expect(c.map((x) => x.file)).toContain("x-terminal-emulator");
    expect(c.map((x) => x.file)).toContain("xterm");
  });

  it("linux with command runs it then drops to an interactive shell", () => {
    const c = externalLaunchArgv("linux", cwd, "claude");
    expect(c[0]).toEqual({
      file: "gnome-terminal",
      args: [`--working-directory=${cwd}`, "--", "bash", "-lc", "claude; exec bash"],
    });
  });

  it("treats an empty/whitespace command as no command", () => {
    expect(externalLaunchArgv("win32", cwd, "   ")).toEqual(externalLaunchArgv("win32", cwd, null));
  });
});
