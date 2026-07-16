import type { TreeEntry } from "./types";
import { readLock, lockState } from "./lockManager";
import { nestSubprocesses } from "./subprocesos/nestSubprocesses";

export interface TreeNode {
  name: string;
  path: string;
  kind: "file" | "dir";
  entry?: TreeEntry;
  children: TreeNode[];
}

function ensureFolder(parent: TreeNode[], name: string, path: string): TreeNode {
  let node = parent.find((n) => n.kind === "dir" && n.name === name);
  if (!node) {
    node = { name, path, kind: "dir", children: [] };
    parent.push(node);
  }
  return node;
}

function sortNodes(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  for (const n of nodes) if (n.children.length) sortNodes(n.children);
}

// Folders tied to a .bpmn (its `<name>.docs` sidecar) and dot-prefixed infra folders
// (.history, .layer-templates, .git…) are implementation detail, not user content.
// The file view shows only .bpmn files and INDEPENDENT organizational folders.
function isSidecarSegment(seg: string): boolean {
  return seg.endsWith(".docs") || seg.startsWith(".");
}

export function visibleEntries(entries: TreeEntry[]): TreeEntry[] {
  return entries.filter((e) => !e.path.split("/").some(isSidecarSegment));
}

export function buildTree(entries: TreeEntry[]): TreeNode[] {
  const roots: TreeNode[] = [];
  // Folders first so file insertion finds parent dirs already created.
  const ordered = [...entries].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "dir" ? -1 : 1));
  for (const e of ordered) {
    const segs = e.path.split("/").filter(Boolean);
    let level = roots;
    let acc = "";
    for (let i = 0; i < segs.length; i++) {
      acc = acc ? `${acc}/${segs[i]}` : segs[i];
      const last = i === segs.length - 1;
      if (last && e.kind === "file") {
        level.push({ name: segs[i], path: e.path, kind: "file", entry: e, children: [] });
      } else {
        const folder = ensureFolder(level, segs[i], acc);
        level = folder.children;
      }
    }
  }
  sortNodes(roots);
  return roots;
}

export interface FileTreeHandlers {
  onOpen(id: string): void;
  onMenu(target: { path: string; kind: "file" | "dir" }, anchor: DOMRect): void;
  onToggle(path: string): void;
  onNewFile(parentPath: string): void;
  onNewFolder(parentPath: string): void;
}

function lockChip(entry: TreeEntry | undefined, me: { email: string }): HTMLElement | null {
  if (!entry?.appProperties) return null;
  const lock = readLock({ appProperties: entry.appProperties } as any);
  const kind = lockState(lock, { name: me.email, email: me.email } as any);
  if (kind === "mine") {
    const chip = document.createElement("span");
    chip.className = "ft-chip mine";
    chip.textContent = "✏️ vos";
    return chip;
  }
  if (kind === "theirs") {
    const chip = document.createElement("span");
    chip.className = "ft-chip theirs";
    chip.textContent = "🔒 " + (entry.appProperties.lockedByName || "otro");
    return chip;
  }
  return null;
}

// A.2 master mode (subprocesos): master files (diagrams with ≥1 linked call activity)
// get a 🗺 badge in the browser. `masters` is computed by the caller (main.ts, from the
// process registry) so this module stays a pure renderer — it never inspects XML itself.
function masterChip(entry: TreeEntry | undefined, masters: Set<string>): HTMLElement | null {
  if (!entry || !masters.has(entry.path)) return null;
  const chip = document.createElement("span");
  chip.className = "file-master-chip";
  chip.title = "Maestro";
  chip.textContent = "🗺";
  return chip;
}

// Files currently open in an editor pane (the master + the drilled stage, at most two —
// see FileTreeState.openPaths). Display-only, mirrors masterChip above.
function openChip(entry: TreeEntry | undefined, openPaths: Set<string>): HTMLElement | null {
  if (!entry || !openPaths.has(entry.path)) return null;
  const chip = document.createElement("span");
  chip.className = "ft-open-chip";
  chip.title = "Abierto";
  chip.textContent = "● abierto";
  return chip;
}

function addBar(el: HTMLElement, parentPath: string, h: FileTreeHandlers): void {
  const bar = document.createElement("div");
  bar.className = "ft-addbar";
  const f = document.createElement("button");
  f.type = "button"; f.className = "ft-add"; f.textContent = "+ archivo";
  f.addEventListener("click", () => h.onNewFile(parentPath));
  const d = document.createElement("button");
  d.type = "button"; d.className = "ft-add"; d.textContent = "+ carpeta";
  d.addEventListener("click", () => h.onNewFolder(parentPath));
  bar.append(f, d);
  el.appendChild(bar);
}

export interface FileTreeState {
  expanded: Set<string>;
  selectedId: string | null;
  me: { name: string; email: string };
  // Master files (see masterChip above), keyed by TreeEntry.path. Optional so existing
  // callers/tests that don't care about the badge don't need to thread an empty set.
  masters?: Set<string>;
  // Paths currently open in an editor pane (master + drilled stage — at most two). Rows
  // matching get an "abierto" marker (see openChip above). Optional so existing
  // callers/tests that don't care don't need to thread an empty set.
  openPaths?: Set<string>;
  // Master file paths whose nested subprocess group is COLLAPSED (absent = expanded by
  // default — A.6). Only meaningful for file nodes that carry subprocess children.
  collapsedMasters?: Set<string>;
}

function renderNodes(
  container: HTMLElement,
  nodes: TreeNode[],
  depth: number,
  state: FileTreeState,
  h: FileTreeHandlers,
): void {
  for (const node of nodes) {
    const row = document.createElement("div");
    row.className = "ft-row";
    row.dataset.path = node.path;
    row.style.paddingLeft = `${depth * 14 + 6}px`;
    if (node.kind === "dir") {
      const open = state.expanded.has(node.path);
      const tog = document.createElement("span");
      tog.className = "ft-toggle";
      tog.textContent = open ? "▾" : "▸";
      tog.addEventListener("click", () => h.onToggle(node.path));
      const name = document.createElement("span");
      name.className = "ft-name ft-folder";
      name.textContent = `📁 ${node.name}`;
      name.addEventListener("click", () => h.onToggle(node.path));
      const menu = document.createElement("button");
      menu.type = "button"; menu.className = "ft-menu"; menu.textContent = "⋯";
      menu.addEventListener("click", (e) => { e.stopPropagation(); h.onMenu({ path: node.path, kind: "dir" }, (e.currentTarget as HTMLElement).getBoundingClientRect()); });
      row.append(tog, name, menu);
      row.addEventListener("contextmenu", (e) => { e.preventDefault(); h.onMenu({ path: node.path, kind: "dir" }, (e.target as HTMLElement).getBoundingClientRect()); });
      container.appendChild(row);
      if (open) {
        renderNodes(container, node.children, depth + 1, state, h);
        const sub = document.createElement("div");
        sub.style.paddingLeft = `${(depth + 1) * 14 + 6}px`;
        addBar(sub, node.path, h);
        container.appendChild(sub);
      }
    } else {
      if (node.path === state.selectedId) row.classList.add("selected");
      const hasSubs = node.children.length > 0;
      const collapsed = state.collapsedMasters?.has(node.path) ?? false;
      if (hasSubs) {
        const tog = document.createElement("span");
        tog.className = "ft-toggle";
        tog.textContent = collapsed ? "▸" : "▾";
        tog.addEventListener("click", (e) => { e.stopPropagation(); h.onToggle(node.path); });
        row.append(tog);
      }
      const name = document.createElement("span");
      name.className = "ft-name";
      name.textContent = "📄 " + node.name;
      const chip = lockChip(node.entry, state.me);
      if (chip) name.appendChild(chip);
      const master = masterChip(node.entry, state.masters ?? new Set());
      if (master) name.appendChild(master);
      const open = openChip(node.entry, state.openPaths ?? new Set());
      if (open) name.appendChild(open);
      if (state.openPaths?.has(node.path)) row.classList.add("ft-open");
      name.addEventListener("click", () => h.onOpen(node.path));
      const menu = document.createElement("button");
      menu.type = "button"; menu.className = "ft-menu"; menu.textContent = "⋯";
      menu.addEventListener("click", (e) => { e.stopPropagation(); h.onMenu({ path: node.path, kind: "file" }, (e.currentTarget as HTMLElement).getBoundingClientRect()); });
      row.append(name, menu);
      row.addEventListener("contextmenu", (e) => { e.preventDefault(); h.onMenu({ path: node.path, kind: "file" }, (e.target as HTMLElement).getBoundingClientRect()); });
      container.appendChild(row);
      if (hasSubs && !collapsed) {
        renderNodes(container, node.children, depth + 1, state, h);
      }
    }
  }
}

// Test seam: render a pre-built (possibly nested) TreeNode list at depth 0. Production
// code uses renderFileTree; tests use this to exercise renderNodes' nesting directly.
export function renderNodesInto(el: HTMLElement, nodes: TreeNode[], state: FileTreeState, handlers: FileTreeHandlers): void {
  renderNodes(el, nodes, 0, state, handlers);
}

export function renderFileTree(
  el: HTMLElement,
  entries: TreeEntry[],
  state: FileTreeState,
  handlers: FileTreeHandlers,
  masterSubs?: Map<string, string[]>,
): void {
  el.innerHTML = "";
  const tree = buildTree(visibleEntries(entries));
  const nested = masterSubs && masterSubs.size ? nestSubprocesses(tree, masterSubs) : tree;
  renderNodes(el, nested, 0, state, handlers);
  addBar(el, "", handlers);
}
