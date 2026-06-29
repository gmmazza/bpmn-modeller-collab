// Minimal in-memory implementation of the FileSystemDirectoryHandle subset fsClient uses.
function notFound(name: string): Error {
  const e = new Error(`NotFoundError: ${name}`);
  e.name = "NotFoundError";
  return e;
}

function assertValidName(name: string): void {
  if (!name || name.includes("/") || name.includes("\\")) {
    throw new TypeError(`The name supplied ('${name}') is not a valid name.`);
  }
}

export function createFakeDir(): FileSystemDirectoryHandle & { _files: Map<string, { data: string; mtime: number }> } {
  const files = new Map<string, { data: string; mtime: number }>();
  const dirs = new Map<string, ReturnType<typeof createFakeDir>>();
  let clock = 1;

  function fileHandle(name: string, rec: { data: string; mtime: number }): any {
    return {
      kind: "file",
      name,
      async getFile() {
        return {
          name,
          lastModified: rec.mtime,
          size: rec.data.length,
          async text() {
            return rec.data;
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
            rec.data = buf;
            rec.mtime = ++clock;
          },
        };
      },
    };
  }

  const self: any = {
    kind: "directory",
    name: "fake",
    _files: files,
    async *entries() {
      for (const [name, rec] of files) yield [name, fileHandle(name, rec)];
      for (const [name, d] of dirs) yield [name, d];
    },
    async getFileHandle(name: string, opts?: { create?: boolean }) {
      assertValidName(name);
      let rec = files.get(name);
      if (!rec) {
        if (!opts?.create) throw notFound(name);
        rec = { data: "", mtime: ++clock };
        files.set(name, rec);
      }
      return fileHandle(name, rec);
    },
    async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
      assertValidName(name);
      let d = dirs.get(name);
      if (!d) {
        if (!opts?.create) throw notFound(name);
        d = createFakeDir();
        dirs.set(name, d);
      }
      return d;
    },
    async removeEntry(name: string) {
      files.delete(name);
      dirs.delete(name);
    },
  };
  return self;
}

export async function seedFile(dir: FileSystemDirectoryHandle, name: string, data: string): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}
