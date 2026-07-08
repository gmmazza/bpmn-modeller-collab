const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fsapi", {
  chooseFolder: () => ipcRenderer.invoke("fsapi:chooseFolder"),
  getRoot: () => ipcRenderer.invoke("fsapi:getRoot"),
  listDir: (root, rel) => ipcRenderer.invoke("fsapi:listDir", root, rel),
  readFile: (root, rel) => ipcRenderer.invoke("fsapi:readFile", root, rel),
  writeFile: (root, rel, data) => ipcRenderer.invoke("fsapi:writeFile", root, rel, data),
  removeEntry: (root, rel) => ipcRenderer.invoke("fsapi:removeEntry", root, rel),
  stat: (root, rel) => ipcRenderer.invoke("fsapi:stat", root, rel),
  mkdir: (root, rel) => ipcRenderer.invoke("fsapi:mkdir", root, rel),
  rename: (root, from, to) => ipcRenderer.invoke("fsapi:rename", root, from, to),
  copyFile: (root, from, to) => ipcRenderer.invoke("fsapi:copyFile", root, from, to),
  writeFileBinary: (root, rel, base64) => ipcRenderer.invoke("fsapi:writeFileBinary", root, rel, base64),
  readFileBinary: (root, rel) => ipcRenderer.invoke("fsapi:readFileBinary", root, rel),
  openPath: (root, rel) => ipcRenderer.invoke("shell:openPath", root, rel),
});

contextBridge.exposeInMainWorld("termapi", {
  openExternal: (command) => ipcRenderer.invoke("terminal:openExternal", command ?? null),
});

contextBridge.exposeInMainWorld("versionApi", {
  latestBpmnJs: () => ipcRenderer.invoke("version:latestBpmnJs"),
});
contextBridge.exposeInMainWorld("appUpdate", {
  currentVersion: () => ipcRenderer.invoke("app:version"),
  checkFeed: () => ipcRenderer.invoke("app:checkUpdate"),
  openDownload: (url) => ipcRenderer.invoke("app:openDownload", url),
  // No URL argument by design: main re-derives the asset from GitHub itself (a renderer
  // must not be able to choose what gets downloaded + executed).
  downloadAndInstall: () => ipcRenderer.invoke("app:downloadAndInstall"),
  onProgress: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on("app:updateProgress", listener);
    return () => ipcRenderer.removeListener("app:updateProgress", listener);
  },
});
