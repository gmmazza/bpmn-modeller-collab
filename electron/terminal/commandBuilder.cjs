// Construye argv por-OS para abrir una terminal del sistema en `cwd`, opcionalmente corriendo
// `command`. Función PURA (sin I/O): devuelve una lista ORDENADA de candidatos; el handler IPC
// intenta cada uno hasta que uno arranca. darwin/linux: strings escritos, ejecución real al portar.
function externalLaunchArgv(platform, cwd, command) {
  const cmd = command && String(command).trim() ? String(command).trim() : null;
  if (platform === "win32") return win(cwd, cmd);
  if (platform === "darwin") return darwin(cwd, cmd);
  return linux(cwd, cmd);
}

// wt/pwsh/gnome-terminal reciben cwd como elemento argv discreto (spawn sin shell) → no
// inyectables; cwd es ruta absoluta (no empieza con "-"). Solo cmd.exe/osascript construían
// strings de shell → cwd ya NO se interpola ahí (cmd.exe usa el cwd que setea el spawn del
// IPC handler; osascript escapa cwd y cmd antes de insertarlos en el string de AppleScript).
function win(cwd, cmd) {
  if (!cmd) {
    return [
      { file: "wt", args: ["-d", cwd] },
      { file: "pwsh", args: ["-NoExit", "-WorkingDirectory", cwd] },
      { file: "cmd.exe", args: ["/K"] },
    ];
  }
  return [
    { file: "wt", args: ["-d", cwd, "pwsh", "-NoExit", "-Command", cmd] },
    { file: "pwsh", args: ["-NoExit", "-WorkingDirectory", cwd, "-Command", cmd] },
    { file: "cmd.exe", args: ["/K", cmd] },
  ];
}

function escapeAppleScript(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

// TODO verificar/ajustar en el build macOS real (escaping de comillas en osascript).
function darwin(cwd, cmd) {
  if (!cmd) return [{ file: "open", args: ["-a", "Terminal", cwd] }];
  const script = `tell application "Terminal" to do script "cd \\"${escapeAppleScript(cwd)}\\"; ${escapeAppleScript(cmd)}"`;
  return [{ file: "osascript", args: ["-e", script] }];
}

// TODO verificar/ajustar en el build Linux real (emuladores instalados varían).
function linux(cwd, cmd) {
  if (!cmd) {
    return [
      { file: "gnome-terminal", args: [`--working-directory=${cwd}`] },
      { file: "x-terminal-emulator", args: [] },
      { file: "xterm", args: [] },
    ];
  }
  const run = `${cmd}; exec bash`;
  return [
    { file: "gnome-terminal", args: [`--working-directory=${cwd}`, "--", "bash", "-lc", run] },
    { file: "x-terminal-emulator", args: ["-e", "bash", "-lc", run] },
    { file: "xterm", args: ["-e", "bash", "-lc", run] },
  ];
}

module.exports = { externalLaunchArgv };
