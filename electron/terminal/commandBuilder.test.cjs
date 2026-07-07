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
    expect(c[2].file).toBe("cmd.exe");
    expect(c[2].args[0]).toBe("/K");
    expect(c[2].args[1]).toContain(cwd);
  });

  it("win32 with command: appends the command to each candidate", () => {
    const c = externalLaunchArgv("win32", cwd, "claude");
    expect(c[0]).toEqual({ file: "wt", args: ["-d", cwd, "pwsh", "-NoExit", "-Command", "claude"] });
    expect(c[1]).toEqual({ file: "pwsh", args: ["-NoExit", "-WorkingDirectory", cwd, "-Command", "claude"] });
    expect(c[2].args[1]).toContain("claude");
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
