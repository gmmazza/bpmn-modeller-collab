import type { TreeEntry } from "./types";
import { readLock, lockState } from "./lockManager";

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

function renderNodes(
  container: HTMLElement,
  nodes: TreeNode[],
  depth: number,
  state: { expanded: Set<string>; selectedId: string | null; me: { name: string; email: string } },
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
      const name = document.createElement("span");
      name.className = "ft-name";
      name.textContent = "📄 " + node.name;
      const chip = lockChip(node.entry, state.me);
      if (chip) name.appendChild(chip);
      name.addEventListener("click", () => h.onOpen(node.path));
      const menu = document.createElement("button");
      menu.type = "button"; menu.className = "ft-menu"; menu.textContent = "⋯";
      menu.addEventListener("click", (e) => { e.stopPropagation(); h.onMenu({ path: node.path, kind: "file" }, (e.currentTarget as HTMLElement).getBoundingClientRect()); });
      row.append(name, menu);
      row.addEventListener("contextmenu", (e) => { e.preventDefault(); h.onMenu({ path: node.path, kind: "file" }, (e.target as HTMLElement).getBoundingClientRect()); });
      container.appendChild(row);
    }
  }
}

export function renderFileTree(
  el: HTMLElement,
  entries: TreeEntry[],
  state: { expanded: Set<string>; selectedId: string | null; me: { name: string; email: string } },
  handlers: FileTreeHandlers,
): void {
  el.innerHTML = "";
  renderNodes(el, buildTree(entries), 0, state, handlers);
  addBar(el, "", handlers);
}
