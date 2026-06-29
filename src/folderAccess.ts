const DB_NAME = "bpmn-compartida";
const STORE = "handles";
const KEY = "dir";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => {
          db.close();
          resolve(req.result as T);
        };
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
      }),
  );
}

export async function loadSavedDir(): Promise<FileSystemDirectoryHandle | null> {
  const h = await idb<FileSystemDirectoryHandle | undefined>("readonly", (s) => s.get(KEY));
  return h ?? null;
}

export async function saveDir(handle: FileSystemDirectoryHandle): Promise<void> {
  await idb("readwrite", (s) => s.put(handle, KEY));
}

export async function pickDir(): Promise<FileSystemDirectoryHandle> {
  const handle = await showDirectoryPicker({ mode: "readwrite" });
  await saveDir(handle);
  return handle;
}

export async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts = { mode: "readwrite" } as const;
  if ((await handle.queryPermission(opts)) === "granted") return true;
  return (await handle.requestPermission(opts)) === "granted";
}
