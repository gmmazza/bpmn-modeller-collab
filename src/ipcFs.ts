export interface FsApi {
  chooseFolder(): Promise<string | null>;
  getRoot(): Promise<string | null>;
  listDir(root: string, rel: string): Promise<{ name: string; kind: "file" | "directory" }[]>;
  readFile(root: string, rel: string): Promise<string>;
  writeFile(root: string, rel: string, data: string): Promise<void>;
  removeEntry(root: string, rel: string): Promise<void>;
  stat(root: string, rel: string): Promise<{ mtimeMs: number; size: number; kind: "file" | "directory" } | null>;
  mkdir(root: string, rel: string): Promise<void>;
  rename(root: string, from: string, to: string): Promise<void>;
  copyFile(root: string, from: string, to: string): Promise<void>;
  writeFileBinary(root: string, rel: string, base64: string): Promise<void>;
  readFileBinary(root: string, rel: string): Promise<string | null>;
}

declare global {
  interface Window {
    fsapi?: FsApi;
  }
}

function notFound(name: string): Error {
  const e = new Error(`NotFound: ${name}`);
  e.name = "NotFoundError";
  return e;
}

function join(a: string, b: string): string {
  return a ? `${a}/${b}` : b;
}

function makeFile(root: string, rel: string, api: FsApi): any {
  const name = rel.split("/").pop() ?? rel;
  return {
    kind: "file",
    name,
    async getFile() {
      const s = await api.stat(root, rel);
      if (!s) throw notFound(rel);
      return {
        name,
        lastModified: s.mtimeMs,
        size: s.size,
        async text() {
          return api.readFile(root, rel);
        },
      };
    },
    async createWritable() {
      let buf = "";
      return {
        async write(chunk: string) {
          buf += chunk;
        },
        async close() {
          await api.writeFile(root, rel, buf);
        },
      };
    },
  };
}

function makeDir(root: string, rel: string, api: FsApi): any {
  return {
    kind: "directory",
    name: rel.split("/").pop() ?? "",
    async *entries() {
      for (const e of await api.listDir(root, rel)) {
        const childRel = join(rel, e.name);
        yield [e.name, e.kind === "directory" ? makeDir(root, childRel, api) : makeFile(root, childRel, api)];
      }
    },
    async getFileHandle(name: string, _opts?: { create?: boolean }) {
      // Lazy: the handle is returned even when absent; getFile() throws if missing,
      // and createWritable() creates on close. Mirrors how fsClient uses the handle.
      return makeFile(root, join(rel, name), api);
    },
    async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
      const childRel = join(rel, name);
      if (opts?.create) {
        await api.mkdir(root, childRel);
      } else {
        const s = await api.stat(root, childRel);
        if (!s || s.kind !== "directory") throw notFound(childRel);
      }
      return makeDir(root, childRel, api);
    },
    async removeEntry(name: string) {
      await api.removeEntry(root, join(rel, name));
    },
  };
}

export function makeIpcDir(root: string, api: FsApi): FileSystemDirectoryHandle {
  const handle = makeDir(root, "", api) as any;
  handle.__native = {
    rename: (from: string, to: string) => api.rename(root, from, to),
    copyFile: (from: string, to: string) => api.copyFile(root, from, to),
    writeBinary: (rel: string, base64: string) => api.writeFileBinary(root, rel, base64),
    readBinary: (rel: string) => api.readFileBinary(root, rel),
  };
  return handle as unknown as FileSystemDirectoryHandle;
}
