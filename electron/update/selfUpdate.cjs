// Portable in-place self-update (main process).
//
// A running Windows app can't overwrite its own .exe/.dll (they're locked). So we
// download + extract the new build to a temp dir, then hand off to a DETACHED helper
// script that runs AFTER the app quits: it waits for our PID to exit, copies the new
// files over the install dir (MERGE, never purge → the sibling data/ folder with the
// user's drafts survives), relaunches, and cleans up.
//
// OS seam: buildSwapPlan(platform, …) is a pure function returning the script + how to
// spawn it. Windows is implemented + tested; macOS/Linux are structured stubs (the app
// is Windows-only for now — .app/AppImage swapping differs and lands with those builds).

const path = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { spawn } = require("node:child_process");

// PowerShell SINGLE-quoted literal: inside '...' PowerShell does NOT expand $ or backticks
// (so a path containing $(…) or `… can't inject), and the only escape needed is doubling a
// literal '. Used for -Path/-LiteralPath/-FilePath and robocopy operands (all accept it).
function psQuote(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

// PURE: the swap plan for a platform. Returns { scriptName, scriptBody, argv(scriptPath) }
// or null for platforms not yet implemented. `argv` yields { file, args } for spawn().
function buildSwapPlan(platform, opts) {
  const { installRoot, sourceDir, exeName, pid, tmpDir, logFile } = opts;
  if (platform === "win32") {
    const exePath = path.join(installRoot, exeName);
    const scriptBody = [
      "$ErrorActionPreference = 'SilentlyContinue'",
      `Start-Transcript -Path ${psQuote(logFile)} -Force | Out-Null`,
      // 1. wait (up to ~30s) for the app process to exit so its files unlock.
      `$target = ${Number(pid)}`,
      "for ($i = 0; $i -lt 300; $i++) {",
      "  if (-not (Get-Process -Id $target -ErrorAction SilentlyContinue)) { break }",
      "  Start-Sleep -Milliseconds 100",
      "}",
      // 2. copy the new build over the install dir. /E = all subdirs incl. empty; NO /MIR
      //    so nothing is deleted — the runtime-created data/ folder (drafts) is preserved.
      `robocopy ${psQuote(sourceDir)} ${psQuote(installRoot)} /E /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null`,
      // 3. relaunch the (now-updated) app.
      `Start-Process -FilePath ${psQuote(exePath)}`,
      // 4. best-effort cleanup of the temp download/extract dir.
      "Start-Sleep -Milliseconds 800",
      `Remove-Item -LiteralPath ${psQuote(tmpDir)} -Recurse -Force`,
      "Stop-Transcript | Out-Null",
    ].join("\r\n");
    return {
      scriptName: "bpmn-selfupdate.ps1",
      scriptBody,
      argv: (scriptPath) => ({
        file: "powershell.exe",
        args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", scriptPath],
      }),
    };
  }
  // darwin/linux: TODO when those builds exist (.app bundle / AppImage have different
  // in-place-swap semantics). Returning null makes runSelfUpdate reject cleanly.
  return null;
}

// Find the dir inside `extractedDir` that directly contains `exeName`. The release zip
// usually wraps the build in a top folder (e.g. "BPMN compartida-win32-x64/…exe"), but
// tolerate a flat zip too. Returns null if the exe isn't found (guards a bad/partial zip
// from bricking the install).
async function resolveSourceRoot(extractedDir, exeName) {
  if (fs.existsSync(path.join(extractedDir, exeName))) return extractedDir;
  let entries;
  try {
    entries = await fsp.readdir(extractedDir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const cand = path.join(extractedDir, e.name);
    if (fs.existsSync(path.join(cand, exeName))) return cand;
  }
  return null;
}

// Stream-download `url` to `destFile`, reporting (received, total) bytes via onProgress.
async function downloadAsset(url, destFile, onProgress) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`descarga falló (HTTP ${res.status})`);
  const total = Number(res.headers.get("content-length") || 0);
  const out = fs.createWriteStream(destFile);
  const reader = res.body.getReader();
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (!out.write(Buffer.from(value))) {
        await new Promise((r) => out.once("drain", r));
      }
      if (onProgress) onProgress(received, total);
    }
  } finally {
    await new Promise((r, j) => out.end((err) => (err ? j(err) : r())));
  }
  if (received === 0) throw new Error("descarga vacía");
  return { received, total };
}

// Extract a .zip using Windows' built-in Expand-Archive (no bundled unzip dep needed).
function extractZip(zipFile, destDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `Expand-Archive -LiteralPath ${psQuote(zipFile)} -DestinationPath ${psQuote(destDir)} -Force`,
      ],
      { windowsHide: true },
    );
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`descompresión falló (código ${code})`))));
  });
}

// Orchestrate a full self-update. Downloads the asset, extracts it, verifies the new
// build contains the exe, writes + launches the detached swap script, and returns so the
// caller can app.quit(). Throws (without quitting) on any failure before the hand-off.
async function runSelfUpdate(ctx) {
  const { assetUrl, installRoot, exeName, pid, tmpDir, platform, onProgress } = ctx;
  const plan0 = buildSwapPlan(platform, { installRoot, sourceDir: "?", exeName, pid, tmpDir, logFile: "?" });
  if (!plan0) throw new Error(`auto-actualización no soportada en ${platform} todavía`);

  await fsp.rm(tmpDir, { recursive: true, force: true });
  await fsp.mkdir(tmpDir, { recursive: true });
  const zipFile = path.join(tmpDir, "update.zip");
  const extractDir = path.join(tmpDir, "extracted");

  if (onProgress) onProgress({ phase: "download", received: 0, total: 0 });
  await downloadAsset(assetUrl, zipFile, (received, total) => {
    if (onProgress) onProgress({ phase: "download", received, total });
  });

  if (onProgress) onProgress({ phase: "extract" });
  await fsp.mkdir(extractDir, { recursive: true });
  await extractZip(zipFile, extractDir);

  const sourceDir = await resolveSourceRoot(extractDir, exeName);
  if (!sourceDir) throw new Error("el paquete descargado no contiene la app (zip inválido) — no se modificó nada");

  if (onProgress) onProgress({ phase: "swap" });
  const logFile = path.join(tmpDir, "selfupdate.log");
  const plan = buildSwapPlan(platform, { installRoot, sourceDir, exeName, pid, tmpDir, logFile });
  const scriptPath = path.join(tmpDir, plan.scriptName);
  await fsp.writeFile(scriptPath, plan.scriptBody, "utf8");

  const { file, args } = plan.argv(scriptPath);
  const child = spawn(file, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  return { ok: true, sourceDir };
}

module.exports = { buildSwapPlan, resolveSourceRoot, downloadAsset, extractZip, runSelfUpdate };
