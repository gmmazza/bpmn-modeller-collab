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
});

contextBridge.exposeInMainWorld("versionApi", {
  latestBpmnJs: () => ipcRenderer.invoke("version:latestBpmnJs"),
});
contextBridge.exposeInMainWorld("appUpdate", {
  currentVersion: () => ipcRenderer.invoke("app:version"),
  checkFeed: () => ipcRenderer.invoke("app:checkUpdate"),
  openDownload: (url) => ipcRenderer.invoke("app:openDownload", url),
});
