import type { TreeNode } from "../fileTree";

// Within each folder level, attach every master's same-folder subprocess files as its
// children (recursively; multi-parent → cloned under each), and drop nested subs from the
// flat sibling list. Pure: consumes the masterSubs Map from masterSubsIndex; a subprocess
// with no referencing master in its folder stays flat. Cycle-guarded per branch.
export function nestSubprocesses(nodes: TreeNode[], masterSubs: Map<string, string[]>): TreeNode[] {
  return nestLevel(nodes, masterSubs);
}

function nestLevel(siblings: TreeNode[], masterSubs: Map<string, string[]>): TreeNode[] {
  const byPath = new Map<string, TreeNode>();
  for (const n of siblings) if (n.kind === "file") byPath.set(n.path, n);

  // Every sub path reachable from any master at this level (transitive, cycle-guarded) is
  // "nested" and must not also appear flat.
  const nested = new Set<string>();
  const mark = (path: string, visited: Set<string>): void => {
    for (const sub of masterSubs.get(path) ?? []) {
      if (!byPath.has(sub) || visited.has(sub)) continue;
      nested.add(sub);
      mark(sub, new Set([...visited, path]));
    }
  };
  // Skip a sibling already known nested (marked by an earlier sibling's traversal): in a
  // cycle (A<->B), marking from both ends would nest both and strand neither at top level —
  // the first sibling encountered stays the root, the rest of the cycle nests under it.
  for (const n of siblings) if (n.kind === "file" && !nested.has(n.path)) mark(n.path, new Set([n.path]));

  const build = (node: TreeNode, visited: Set<string>): TreeNode => {
    const children: TreeNode[] = [];
    for (const sub of masterSubs.get(node.path) ?? []) {
      const subNode = byPath.get(sub);
      if (!subNode || visited.has(sub)) continue;
      children.push(build({ ...subNode, children: [] }, new Set([...visited, node.path])));
    }
    return { ...node, children };
  };

  const out: TreeNode[] = [];
  for (const n of siblings) {
    if (n.kind === "dir") {
      out.push({ ...n, children: nestLevel(n.children, masterSubs) });
    } else if (nested.has(n.path)) {
      continue; // appears only nested
    } else if (masterSubs.has(n.path)) {
      out.push(build(n, new Set([n.path])));
    } else {
      out.push(n);
    }
  }
  return out;
}
