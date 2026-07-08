import type { Page } from "@playwright/test";

// A valid BPMN 2.0 diagram (start → task → end) so bpmn-js imports and renders it.
export const SEED_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="156" y="81" width="36" height="36"/></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

// A draft variant carrying a distinguishable task, to assert the resumed draft loaded.
export const DRAFT_BPMN = SEED_BPMN.replace(
  "<bpmn:startEvent id=\"StartEvent_1\"/>",
  "<bpmn:startEvent id=\"StartEvent_1\"/><bpmn:task id=\"Task_DRAFT\" name=\"draft\"/>",
).replace(
  "</bpmndi:BPMNPlane>",
  "<bpmndi:BPMNShape id=\"Task_DRAFT_di\" bpmnElement=\"Task_DRAFT\"><dc:Bounds x=\"260\" y=\"59\" width=\"100\" height=\"80\"/></bpmndi:BPMNShape></bpmndi:BPMNPlane>",
);

// The mocked working folder's display name → also the draft-namespace folderId (web).
export const FOLDER_NAME = "work";

// Install an in-memory File System Access mock BEFORE any app script runs, so the
// folder gate resolves to a fake folder seeded with `files` (path → contents). Also
// patches IndexedDB put/get: the real structured-clone rejects our function-bearing
// handle, so we store it in a JS map and fire onsuccess asynchronously (a synchronous
// callback would make the gate hang — see the e2e-web-app-fs-mock-harness note).
export async function installFsMock(
  page: Page,
  opts: { name?: string; files?: Record<string, string> } = {},
): Promise<void> {
  const userName = opts.name ?? "Ana";
  const files = opts.files ?? { "test.bpmn": SEED_BPMN };
  await page.addInitScript(
    ({ userName, files, folderName }) => {
      localStorage.setItem("bpmn-compartida.name", userName);
      let seq = 0;
      function makeFile(content: string) {
        let data = content;
        let mtime = Date.now() + ++seq;
        return {
          kind: "file",
          async getFile() {
            const d = data;
            const m = mtime;
            return {
              async text() { return d; },
              // fsClient's binary path (movePath/readBinary) calls File.arrayBuffer(),
              // which the earlier text-only mock didn't implement — needed once a spec
              // exercises Fuentes (source files moved/read as bytes, not just .bpmn text).
              async arrayBuffer() { return new TextEncoder().encode(d).buffer; },
              lastModified: m,
              size: d.length,
            };
          },
          async createWritable() {
            return {
              async write(x: unknown) { data = typeof x === "string" ? x : String(x); },
              async close() { mtime = Date.now() + ++seq; },
            };
          },
        };
      }
      function makeDir(name: string): any {
        const children = new Map<string, any>();
        return {
          kind: "directory",
          name,
          async getDirectoryHandle(n: string, o?: { create?: boolean }) {
            let c = children.get(n);
            if (!c) { if (!o?.create) throw new DOMException("nf", "NotFoundError"); c = makeDir(n); children.set(n, c); }
            return c;
          },
          async getFileHandle(n: string, o?: { create?: boolean }) {
            let c = children.get(n);
            if (!c) { if (!o?.create) throw new DOMException("nf", "NotFoundError"); c = makeFile(""); children.set(n, c); }
            return c;
          },
          async removeEntry(n: string) { children.delete(n); },
          async *entries() { for (const e of children) yield e; },
          async queryPermission() { return "granted"; },
          async requestPermission() { return "granted"; },
        };
      }
      const root = makeDir(folderName);
      // Seed files (supporting nested paths), synchronously enough for the gate.
      void (async () => {
        for (const [p, content] of Object.entries(files)) {
          const segs = p.split("/");
          let dir = root;
          for (let i = 0; i < segs.length - 1; i++) dir = await dir.getDirectoryHandle(segs[i], { create: true });
          const fh = await dir.getFileHandle(segs[segs.length - 1], { create: true });
          const w = await fh.createWritable();
          await w.write(content as string);
          await w.close();
        }
      })();
      (window as any).__mockRoot = root;
      (window as any).showDirectoryPicker = async () => root;

      const store = new Map<unknown, unknown>();
      const P = IDBObjectStore.prototype as any;
      P.put = function (value: unknown, key: unknown) {
        store.set(key, value);
        const req: any = { onsuccess: null, onerror: null, result: key };
        setTimeout(() => req.onsuccess && req.onsuccess({ target: req }), 0);
        return req;
      };
      P.get = function (key: unknown) {
        const req: any = { onsuccess: null, onerror: null, result: store.get(key) };
        setTimeout(() => req.onsuccess && req.onsuccess({ target: req }), 0);
        return req;
      };
    },
    { userName, files, folderName: FOLDER_NAME },
  );
}

// Read a file's current contents out of the in-memory mock (e.g. the shared .bpmn or
// a .lock sidecar). Returns null if absent.
export async function readMockFile(page: Page, relPath: string): Promise<string | null> {
  return page.evaluate(async (rel) => {
    const root = (window as any).__mockRoot;
    const segs = rel.split("/");
    try {
      let dir = root;
      for (let i = 0; i < segs.length - 1; i++) dir = await dir.getDirectoryHandle(segs[i]);
      const fh = await dir.getFileHandle(segs[segs.length - 1]);
      return await (await fh.getFile()).text();
    } catch {
      return null;
    }
  }, relPath);
}
