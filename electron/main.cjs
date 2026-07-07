const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawn } = require("node:child_process");
const os = require("node:os");
const { resolveWithinRoot } = require("./pathGuard.cjs");
const { externalLaunchArgv } = require("./terminal/commandBuilder.cjs");
const { runSelfUpdate } = require("./update/selfUpdate.cjs");

// Portable build: keep ALL app state (userData → folder.json + Local Storage, i.e.
// the private "Borrador" drafts) in a `data/` folder NEXT TO the executable instead
// of %APPDATA%, so the whole app travels on a USB/copy. Must run before anything
// reads a userData path. Guarded to the packaged app so `electron:dev` doesn't
// litter the repo with a `data/` folder. Requires a writable exe location (a USB or
// a normal extract; NOT Program Files).
if (app.isPackaged) {
  app.setPath("userData", path.join(path.dirname(app.getPath("exe")), "data"));
}

// The authorized folder is owned by the MAIN process: it is set ONLY by the native
// folder dialog and persisted in userData. The renderer never gets to choose which
// root the file ops run against — so a compromised renderer (e.g. via a malicious
// .bpmn that achieves script execution) cannot read/write arbitrary paths.
let authorizedRoot = null;
let authorizedRealRoot = null; // realpath(authorizedRoot), for the symlink guard

function rootStorePath() {
  return path.join(app.getPath("userData"), "folder.json");
}

async function setRoot(p) {
  const resolved = path.resolve(p);
  authorizedRealRoot = await fs.realpath(resolved); // throws if it doesn't exist
  authorizedRoot = resolved;
  try {
    await fs.writeFile(rootStorePath(), JSON.stringify({ root: authorizedRoot }), "utf8");
  } catch {
    /* persistence is best-effort; the in-memory root still works this session */
  }
}

async function loadRoot() {
  try {
    const { root } = JSON.parse(await fs.readFile(rootStorePath(), "utf8"));
    if (root) {
      authorizedRealRoot = await fs.realpath(root); // throws if the folder is gone
      authorizedRoot = path.resolve(root);
    }
  } catch {
    /* no persisted folder, or it no longer exists → start at the folder gate */
  }
}

// Resolve a renderer-supplied relative path against the authorized root, enforcing
// BOTH the lexical guard (no ../ or absolute escape) AND a realpath check on the
// deepest existing ancestor (so a symlink inside the folder can't escape it).
// Known limitation: there is an inherent check-then-use (TOCTOU) gap between this
// realpath validation and the actual fs op. The only actor who could exploit it is a
// concurrent process swapping a dir for a symlink mid-op (not the renderer); it's
// strictly safer than a lexical-only check and out of scope for this threat model.
async function guardedPath(rel) {
  if (!authorizedRoot) throw new Error("no folder selected");
  const resolved = resolveWithinRoot(authorizedRoot, rel); // lexical first line of defense
  let cur = resolved;
  for (;;) {
    try {
      const real = await fs.realpath(cur);
      if (real !== authorizedRealRoot && !real.startsWith(authorizedRealRoot + path.sep)) {
        throw new Error(`path escapes root (symlink): ${rel}`);
      }
      return resolved;
    } catch (e) {
      if (e && e.code !== "ENOENT" && e.code !== "ENOTDIR") throw e; // a real escape/error, not "missing"
      const parent = path.dirname(cur);
      if (parent === cur) return resolved; // reached a root with nothing existing; lexical guard already passed
      cur = parent;
    }
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();

  // Surface load failures instead of leaving a silent blank window — helps when
  // the folder was copied incompletely / blocked / to an odd path.
  win.webContents.on("did-fail-load", (_e, errorCode, errorDesc, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 /* ERR_ABORTED (e.g. reload) */) return;
    const html =
      "<body style=\"font-family:Segoe UI,system-ui,sans-serif;padding:28px;color:#1f2937\">" +
      "<h2>No se pudo cargar la aplicación</h2>" +
      "<p>Error " + errorCode + ": " + errorDesc + "</p>" +
      "<p style=\"color:#6b7280;word-break:break-all\">" + validatedURL + "</p>" +
      "<p>Si copiaste la carpeta, copiala <b>completa</b> (incluida la subcarpeta " +
      "<b>resources</b>) y verificá que el antivirus no haya bloqueado los archivos.</p>" +
      "</body>";
    win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  });

  // Load via an explicit file URL (robust for paths with spaces, accents, # or %).
  const indexPath = path.join(__dirname, "..", "dist", "index.html");
  win.loadURL(pathToFileURL(indexPath).href);
}

// GitHub Releases "latest" API for this repo. The handler below maps its JSON
// (tag_name/html_url) to the { version, url } shape the renderer expects.
// NOTE: this is fetched UNAUTHENTICATED, so it only returns data while the repo
// is PUBLIC. While the repo is private GitHub answers 404 and the update check is
// a silent no-op (no banner) — it activates automatically once the repo is public.
const APP_UPDATE_FEED_URL = "https://api.github.com/repos/gmmazza/bpmn-modeller-collab/releases/latest";

ipcMain.handle("version:latestBpmnJs", async () => {
  try {
    const res = await fetch("https://registry.npmjs.org/bpmn-js/latest");
    const j = await res.json();
    return typeof j.version === "string" ? j.version : null;
  } catch {
    return null;
  }
});

ipcMain.handle("app:version", () => app.getVersion());

// Fetch the latest GitHub release → { version, url, asset }. `asset` is the first .zip's
// download URL, taken straight from GitHub's API — the ONLY trusted source for what the
// self-updater is allowed to download (see app:downloadAndInstall). Returns null on any
// failure (404 while private, offline, rate-limited).
async function fetchLatestRelease() {
  if (!APP_UPDATE_FEED_URL) return null;
  try {
    const res = await fetch(APP_UPDATE_FEED_URL, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const j = await res.json();
    const version = typeof j.tag_name === "string" ? j.tag_name.replace(/^v/, "") : null;
    if (!version) return null;
    const assets = Array.isArray(j.assets) ? j.assets : [];
    const zip = assets.find((a) => typeof a?.browser_download_url === "string" && /\.zip$/i.test(a.name || ""));
    return { version, url: typeof j.html_url === "string" ? j.html_url : "", asset: zip ? zip.browser_download_url : "" };
  } catch {
    return null;
  }
}

ipcMain.handle("app:checkUpdate", async () => fetchLatestRelease());

ipcMain.handle("app:openDownload", (_e, url) => {
  if (typeof url === "string" && /^https?:\/\//.test(url)) shell.openExternal(url);
});

// Portable in-place self-update: download the release .zip, swap the files in the current
// install folder (preserving the sibling data/ drafts) and relaunch. Only meaningful for a
// packaged build; refuses in dev (no real install dir / locked exe to replace).
//
// SECURITY: the renderer does NOT choose what we download+run. We re-fetch the release feed
// HERE and take GitHub's own asset URL, then require it to be under this repo's GitHub
// Releases download host. So a compromised renderer (e.g. via a malicious .bpmn achieving
// script execution) cannot point the updater at an attacker-controlled zip → no RCE via the
// update path. (Integrity beyond TLS-to-github is a documented follow-up: publish + verify a
// signed SHA-256, once the app has a signing anchor.)
const RELEASE_ASSET_PREFIX = "https://github.com/gmmazza/bpmn-modeller-collab/releases/download/";
ipcMain.handle("app:downloadAndInstall", async (e) => {
  if (!app.isPackaged) throw new Error("La auto-actualización solo está disponible en la app instalada (no en desarrollo)");
  const rel = await fetchLatestRelease();
  if (!rel || !rel.asset) throw new Error("No hay un paquete de actualización disponible");
  const assetUrl = rel.asset;
  if (!assetUrl.startsWith(RELEASE_ASSET_PREFIX)) {
    throw new Error("URL de descarga no confiable (no proviene de un release oficial)");
  }
  const exePath = app.getPath("exe");
  const installRoot = path.dirname(exePath);
  const win = BrowserWindow.fromWebContents(e.sender);
  await runSelfUpdate({
    assetUrl,
    installRoot,
    exeName: path.basename(exePath),
    pid: process.pid,
    tmpDir: path.join(os.tmpdir(), "bpmn-compartida-update"),
    platform: process.platform,
    onProgress: (p) => { if (win && !win.isDestroyed()) win.webContents.send("app:updateProgress", p); },
  });
  // Files downloaded + verified + detached swap script launched: quit so it can replace
  // the (now-unlocked) files and relaunch us.
  setTimeout(() => app.quit(), 200);
  return { ok: true };
});

ipcMain.handle("fsapi:chooseFolder", async (e) => {
  // Attach to the parent window so the native picker is window-modal and comes to the
  // front. Without a parent it can open BEHIND the app window on Windows, making
  // "Cambiar carpeta" look like it does nothing.
  const win = BrowserWindow.fromWebContents(e.sender);
  const opts = { properties: ["openDirectory"] };
  const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  if (r.canceled || r.filePaths.length === 0) return null;
  await setRoot(r.filePaths[0]);
  return authorizedRoot;
});

ipcMain.handle("fsapi:getRoot", () => authorizedRoot);

// Every handler IGNORES the renderer-supplied root (the leading `_root` arg, kept only
// for IPC arg-position compatibility) and uses the main-owned authorized root.
ipcMain.handle("fsapi:listDir", async (_e, _root, rel) => {
  const entries = await fs.readdir(await guardedPath(rel), { withFileTypes: true });
  return entries.map((d) => ({ name: d.name, kind: d.isDirectory() ? "directory" : "file" }));
});

ipcMain.handle("fsapi:readFile", async (_e, _root, rel) => fs.readFile(await guardedPath(rel), "utf8"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

ipcMain.handle("fsapi:writeFile", async (_e, _root, rel, data) => {
  const p = await guardedPath(rel);
  const tmp = `${p}.tmp-${process.pid}`;
  await fs.writeFile(tmp, data, "utf8");
  // Atomic-ish rename avoids the sync tool uploading a half-written file. BUT cloud-sync
  // clients (Google Drive/OneDrive) briefly hold handles on files they're syncing, so on
  // Windows the rename can fail with EPERM/EBUSY/EACCES. Retry with backoff; if it still
  // fails (target stays locked), fall back to an in-place overwrite so the write isn't lost.
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await fs.rename(tmp, p);
      return;
    } catch (e) {
      lastErr = e;
      if (e.code !== "EPERM" && e.code !== "EBUSY" && e.code !== "EACCES") break;
      await sleep(60 * 2 ** attempt); // 60,120,240,480,960ms
    }
  }
  try {
    await fs.writeFile(p, data, "utf8"); // last resort: direct overwrite
    await fs.rm(tmp, { force: true }).catch(() => {});
    return;
  } catch {
    await fs.rm(tmp, { force: true }).catch(() => {}); // don't leave a stray .tmp behind
    throw lastErr;
  }
});

ipcMain.handle("fsapi:writeFileBinary", async (_e, _root, rel, base64) => {
  const p = await guardedPath(rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, Buffer.from(base64, "base64"));
});
ipcMain.handle("fsapi:readFileBinary", async (_e, _root, rel) => {
  try {
    const buf = await fs.readFile(await guardedPath(rel));
    return buf.toString("base64");
  } catch {
    return null;
  }
});

ipcMain.handle("fsapi:removeEntry", async (_e, _root, rel) => {
  await fs.rm(await guardedPath(rel), { force: true });
});

ipcMain.handle("fsapi:stat", async (_e, _root, rel) => {
  try {
    const s = await fs.stat(await guardedPath(rel));
    return { mtimeMs: s.mtimeMs, size: s.size, kind: s.isDirectory() ? "directory" : "file" };
  } catch {
    return null;
  }
});

ipcMain.handle("fsapi:mkdir", async (_e, _root, rel) => {
  await fs.mkdir(await guardedPath(rel), { recursive: true });
});

ipcMain.handle("fsapi:rename", async (_e, _root, from, to) => {
  const dst = await guardedPath(to);
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.rename(await guardedPath(from), dst);
});

ipcMain.handle("fsapi:copyFile", async (_e, _root, from, to) => {
  const dst = await guardedPath(to);
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.copyFile(await guardedPath(from), dst);
});

// Abre la terminal del sistema en la carpeta autorizada, opcionalmente corriendo `command`.
// Intenta candidatos por-OS en orden; el primero que emite "spawn" gana. ENOENT (emulador
// ausente) llega como evento "error" → se prueba el siguiente.
ipcMain.handle("terminal:openExternal", async (_e, command) => {
  if (!authorizedRoot) throw new Error("No hay carpeta de trabajo autorizada");
  const candidates = externalLaunchArgv(process.platform, authorizedRoot, command || null);
  const trySpawn = (c) =>
    new Promise((resolve) => {
      let child;
      try {
        child = spawn(c.file, c.args, { cwd: authorizedRoot, detached: true, stdio: "ignore" });
      } catch {
        return resolve(false);
      }
      child.once("spawn", () => { child.unref(); resolve(true); });
      child.once("error", () => resolve(false));
    });
  for (const c of candidates) {
    if (await trySpawn(c)) return { ok: true, launched: c.file };
  }
  throw new Error("No se encontró una terminal para abrir");
});

// Phase B (dormant): silent auto-update. Off unless ENABLE_AUTOUPDATE=1 AND a
// GitHub Releases feed + NSIS build are published (see README). Lazy-required so
// it never loads in the normal portable build.
if (process.env.ENABLE_AUTOUPDATE === "1") {
  try {
    const { autoUpdater } = require("electron-updater");
    app.whenReady().then(() => autoUpdater.checkForUpdatesAndNotify());
  } catch (e) {
    console.error("auto-update disabled:", e);
  }
}

app.whenReady().then(async () => {
  await loadRoot();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
